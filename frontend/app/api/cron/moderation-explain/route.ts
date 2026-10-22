import { runCron } from "@/lib/cron-run";
/**
 * /api/cron/moderation-explain (FE)
 *
 * Generates fan-facing explanations for posts where moderation_status
 * is 'auto_hide' but moderation_user_message hasn't been written yet.
 * Capped at 10 posts per tick. Steady-state cost is zero.
 *
 * Auth: Bearer $CRON_SECRET (Vercel cron sends this automatically).
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { explainForUser } from "@/lib/moderation/explain-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_PER_TICK = 10;

interface PostRow {
  id: string;
  body: string | null;
  moderation_reason: string | null;
  moderation_categories: string[] | null;
  moderation_severity: number | null;
}

interface RunResult {
  ok: boolean;
  scanned: number;
  generated: number;
  skipped: number;
  errors: number;
  details: Array<{
    id: string;
    outcome: "generated" | "skipped" | "error";
    note?: string;
  }>;
}

export async function GET(request: Request) {
  return runCron(request, "moderation-explain", () => moderationExplain());
}

async function moderationExplain() {
  const admin = createAdminClient();

  const { data: posts, error: queryErr } = await admin
    .from("community_posts")
    .select("id, body, moderation_reason, moderation_categories, moderation_severity")
    .eq("moderation_status", "auto_hide")
    .is("moderation_user_message", null)
    .order("created_at", { ascending: false })
    .limit(MAX_PER_TICK);

  if (queryErr) {
    return NextResponse.json(
      { ok: false, error: "query_failed", detail: queryErr.message },
      { status: 500 },
    );
  }

  const result: RunResult = {
    ok: true,
    scanned: 0,
    generated: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  for (const row of (posts ?? []) as PostRow[]) {
    result.scanned += 1;

    if (!row.body || row.body.trim().length === 0) {
      result.skipped += 1;
      result.details.push({ id: row.id, outcome: "skipped", note: "empty body" });
      continue;
    }

    try {
      const message = await explainForUser({
        body: row.body,
        classifier_reason: row.moderation_reason,
        categories: row.moderation_categories ?? [],
        severity: row.moderation_severity,
      });

      // Even on empty (model failed), write a generic fallback so we don't
      // try this row again every 15 min.
      const finalMessage =
        message ||
        "Your post was hidden by our automated moderation. If you think this was a mistake, please reach out to the admin or try editing your post.";

      const { error: updateErr } = await admin
        .from("community_posts")
        .update({ moderation_user_message: finalMessage })
        .eq("id", row.id);

      if (updateErr) throw updateErr;

      result.generated += 1;
      result.details.push({ id: row.id, outcome: "generated" });
    } catch (err) {
      result.errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[cron moderation-explain] failed for", row.id, msg);
      result.details.push({ id: row.id, outcome: "error", note: msg });
    }
  }

  return NextResponse.json(result);
}
