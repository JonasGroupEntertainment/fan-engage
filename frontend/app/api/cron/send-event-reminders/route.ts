import { runCron } from "@/lib/cron-run";
import { NextResponse } from "next/server";
import {
  loadEventsInReminderWindow,
  sendEventReminder,
} from "@/lib/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/send-event-reminders
 *
 * Scheduled via vercel.json every 15 minutes. Vercel Cron attaches an
 * Authorization: Bearer $CRON_SECRET header to every run — we reject
 * requests that don't match, so random callers can't trigger sends.
 *
 * Walks the 24h + 1h reminder windows, fires SMS + email to each event's
 * RSVPers, records an event_reminders row per fire. Wrapped in try/catch
 * so one bad event doesn't crash the cron and stall the rest.
 */
export async function GET(request: Request) {
  return runCron(request, "send-event-reminders", () => sendEventReminders());
}

async function sendEventReminders() {
  const started = Date.now();
  const kinds = ["reminder_24h", "reminder_1h"] as const;
  const results: Array<{
    kind: string;
    event_id: string;
    sms: number;
    email: number;
    error?: string;
  }> = [];

  for (const kind of kinds) {
    const events = await loadEventsInReminderWindow(kind);
    for (const event of events) {
      try {
        const r = await sendEventReminder(event, kind);
        results.push({
          kind,
          event_id: event.id,
          sms: r.smsRecipients,
          email: r.emailRecipients,
          error: r.error,
        });
      } catch (e) {
        results.push({
          kind,
          event_id: event.id,
          sms: 0,
          email: 0,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    took_ms: Date.now() - started,
    results,
  });
}
