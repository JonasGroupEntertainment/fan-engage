import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL } from "@/lib/app-url";
import {
  dueReengagementStep,
  isReengagementEmailEnabled,
  reengagementMessage,
  type ReengagementStep,
} from "@/lib/reengagement-email";
import { sendTransactionalEmail } from "@/lib/reengagement-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/reengagement-email
 *
 * Daily (vercel.json, 15:00 UTC). Sends a day-3 and a day-7 email to
 * new fans who opted in to email. Off unless REENGAGEMENT_EMAIL_ENABLED
 * is exactly "true". A disabled run sends nothing and does not read
 * the audience.
 *
 * Smoke test with ?testEmail= only after the flag is on. The address
 * is not written to the log.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 200;

type FanRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  created_at: string;
  unsubscribe_token: string | null;
  email_opted_in: boolean;
  suspended: boolean;
  is_internal: boolean;
};

export async function GET(request: Request) {
  const authErr = verifyCronAuth(request);
  if (authErr) return authErr;

  if (!isReengagementEmailEnabled()) {
    return NextResponse.json({ ok: true, enabled: false, sent: 0 });
  }

  const apiKey = process.env.MANDRILL_API_KEY;
  if (!apiKey) {
    console.warn("reengagement: transactional email is not configured; no messages sent");
    return NextResponse.json({
      ok: true,
      enabled: true,
      sent: 0,
      reason: "provider_not_configured",
    });
  }

  const now = new Date();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("fans")
    .select(
      "id, email, first_name, created_at, unsubscribe_token, email_opted_in, suspended, is_internal",
    )
    .eq("email_opted_in", true)
    .eq("suspended", false)
    .eq("is_internal", false)
    .gt("created_at", new Date(now.getTime() - 9 * DAY_MS).toISOString())
    .lte("created_at", new Date(now.getTime() - 3 * DAY_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    console.warn("reengagement: fan lookup failed");
    return NextResponse.json({ ok: false, error: "fan lookup failed" }, { status: 500 });
  }

  const testEmail = new URL(request.url).searchParams.get("testEmail")?.trim().toLowerCase() ?? "";
  let fans = (data ?? []) as FanRow[];
  if (testEmail) {
    fans = fans.filter((fan) => (fan.email ?? "").toLowerCase() === testEmail);
  }
  if (fans.length === 0) {
    return NextResponse.json({ ok: true, enabled: true, considered: 0, sent: 0, failed: 0 });
  }

  const { data: sentRows, error: sentErr } = await admin
    .from("fan_reengagement_emails")
    .select("fan_id, step")
    .in(
      "fan_id",
      fans.map((fan) => fan.id),
    );
  if (sentErr) {
    console.warn("reengagement: send log lookup failed");
    return NextResponse.json({ ok: false, error: "send log unavailable" }, { status: 500 });
  }

  const sentByFan = new Map<string, number[]>();
  for (const row of sentRows ?? []) {
    const fanId = row.fan_id as string;
    const step = row.step as number;
    const list = sentByFan.get(fanId) ?? [];
    list.push(step);
    sentByFan.set(fanId, list);
  }

  const fromEmail = process.env.MANDRILL_FROM_EMAIL ?? "no-reply@fanengage.app";
  let sent = 0;
  let failed = 0;
  let considered = 0;

  for (const fan of fans) {
    const step = dueReengagementStep(
      {
        createdAt: fan.created_at,
        emailOptedIn: fan.email_opted_in,
        suspended: fan.suspended,
        isInternal: fan.is_internal,
        email: fan.email,
        unsubscribeToken: fan.unsubscribe_token,
        sentSteps: sentByFan.get(fan.id) ?? [],
      },
      now,
    );
    if (!step || !fan.email || !fan.unsubscribe_token) continue;
    considered += 1;

    const recorded = await recordSend(admin, fan.id, step);
    if (recorded === "already") continue;
    if (recorded === "failed") {
      failed += 1;
      continue;
    }

    const message = reengagementMessage({
      step,
      firstName: fan.first_name,
      appUrl: APP_URL,
      unsubscribeToken: fan.unsubscribe_token,
    });
    const result = await sendTransactionalEmail({
      apiKey,
      to: fan.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
      fromEmail,
    });
    if (!result.ok) {
      failed += 1;
      await admin.from("fan_reengagement_emails").delete().eq("fan_id", fan.id).eq("step", step);
      continue;
    }
    sent += 1;
  }

  return NextResponse.json({ ok: true, enabled: true, considered, sent, failed });
}

type Admin = ReturnType<typeof createAdminClient>;

async function recordSend(
  admin: Admin,
  fanId: string,
  step: ReengagementStep,
): Promise<"recorded" | "already" | "failed"> {
  const { error } = await admin.from("fan_reengagement_emails").insert({
    fan_id: fanId,
    step,
  });
  if (!error) return "recorded";
  if (error.code === "23505") return "already";
  console.warn("reengagement: could not record send");
  return "failed";
}
