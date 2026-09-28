import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin, guardStatus } from "@/lib/admin-guard";
import { importFanRows, type ImportRowInput } from "@/lib/fans/import-fans";
import { MAX_IMPORT_ROWS_PER_REQUEST } from "@/lib/fans/import-patch";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * CSV fan import. The caller must be owner or admin of the target
 * community (or a super-admin). Existing fans only get blank fields filled.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { rows, communityId } = (body ?? {}) as { rows?: unknown; communityId?: unknown };

  const target = typeof communityId === "string" ? communityId.trim() : "";
  if (!target) {
    return NextResponse.json({ error: "Choose a community to import into." }, { status: 400 });
  }

  const guard = await authorizeAdmin({ communityId: target, minRole: "admin" });
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.reason === "signed_out" ? "Unauthorized" : "Forbidden" },
      { status: guardStatus(guard.reason) },
    );
  }

  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "rows must be an array" }, { status: 400 });
  }
  if (rows.length > MAX_IMPORT_ROWS_PER_REQUEST) {
    return NextResponse.json(
      { error: `Send at most ${MAX_IMPORT_ROWS_PER_REQUEST} rows per request.` },
      { status: 400 },
    );
  }

  const result = await importFanRows(createAdminClient(), rows as ImportRowInput[], target);
  return NextResponse.json(result);
}
