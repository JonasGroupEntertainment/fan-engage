import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMAGE_SIGNATURE_BYTES, imageFileName, sniffImageType } from "@/lib/image-signature";

/**
 * POST /api/upload
 * Body: multipart/form-data
 *   - file: File (required, image/*, max 8 MB)
 *   - bucket: "community-uploads" | "avatars"
 *
 * Response: { url: string }
 *
 * Uploads go to `{bucket}/{fan_id}/{timestamp}-{safe_filename}` so the fan's
 * auth.uid() prefix satisfies the storage RLS policy.
 */
const ALLOWED_BUCKETS = new Set(["community-uploads", "avatars"]);
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

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
  // Auth check via SSR client
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const bucket = String(form.get("bucket") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, WebP, or GIF allowed" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File exceeds 8 MB limit" },
      { status: 400 },
    );
  }

  // Judge the file by its first bytes, not by the type the browser claims.
  const head = new Uint8Array(await file.slice(0, IMAGE_SIGNATURE_BYTES).arrayBuffer());
  const realType = sniffImageType(head);
  if (!realType) {
    return NextResponse.json(
      { error: "That file isn't a JPEG, PNG, WebP, or GIF image" },
      { status: 400 },
    );
  }

  // The extension comes from the detected type, not from the name sent.
  const path = `${user.id}/${Date.now()}-${imageFileName(safeFilename(file.name), realType)}`;

  // Use admin client for the upload so we bypass any RLS hiccups around
  // anon-derived JWTs in server actions. Ownership is enforced by the path
  // prefix, which we control here on the server.
  const admin = createAdminClient();
  const { error: uploadErr } = await admin.storage
    .from(bucket)
    .upload(path, file, {
      contentType: realType,
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: publicUrl } = admin.storage.from(bucket).getPublicUrl(path);

  // For avatars: persist to fans.avatar_url so the header / post list pick
  // it up without another round-trip.
  if (bucket === "avatars") {
    await admin
      .from("fans")
      .update({ avatar_url: publicUrl.publicUrl })
      .eq("id", user.id);
  }

  return NextResponse.json({ url: publicUrl.publicUrl, path });
}
