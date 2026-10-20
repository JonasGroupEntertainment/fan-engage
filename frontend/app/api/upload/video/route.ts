import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";

/**
 * POST /api/upload/video
 * Body: multipart/form-data
 *   - file: File (required, video/mp4|webm|quicktime, max 50 MB)
 *
 * Response: { url: string, path: string }
 *
 * Admin-only endpoint. Uploads go to `community-videos/{admin_user_id}/{timestamp}-{safe_filename}`.
 */
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime", // .mov
]);

function safeFilename(name: string): string {
  // Strip path pieces, keep last 40 chars, ascii-safe.
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, "-")
    .replace(/-+/g, "-")
    .slice(-40);
}

export async function POST(req: NextRequest) {
  // Admin-only gate
  const adminCtx = await getAdminContext();
  if (!adminCtx) {
    return NextResponse.json({ error: "Not authenticated as admin" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Only MP4, WebM, or MOV videos allowed" },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Video exceeds 50 MB limit" },
      { status: 400 },
    );
  }

  const path = `${adminCtx.user.id}/${Date.now()}-${safeFilename(file.name)}`;

  // Use admin client for the upload, ownership enforced by path prefix.
  const admin = createAdminClient();
  const { error: uploadErr } = await admin.storage
    .from("community-videos")
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000", // 1 year
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: publicUrl } = admin.storage
    .from("community-videos")
    .getPublicUrl(path);

  return NextResponse.json({ url: publicUrl.publicUrl, path });
}
