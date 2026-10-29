/**
 * Streak-at-risk selection (Sprint 3, item A). Pure; the cron route at
 * app/api/cron/streak-at-risk does the reads and the push.
 *
 * The streak calendar is UTC. lib/streaks/touch.ts stamps
 * fans.last_active_date with the UTC day and compares UTC days, so a
 * streak whose last_active_date is D-1 is lost at D 24:00 UTC — not at the
 * fan's local midnight. Everything here follows that:
 *
 *   - "at risk"   = current_streak_days >= AT_RISK_MIN_STREAK and
 *                   last_active_date === yesterday on the UTC calendar
 *   - "when"      = once per UTC day, during the SEND_UTC_HOUR hour (21:00
 *                   UTC: 5 PM EDT / 4 PM EST, 3–4 PM Central, 1–2 PM
 *                   Pacific — three hours before every US fan's streak
 *                   actually lapses). The cron is hourly; other hours no-op.
 *   - "copy"      = the fan's own wall-clock time of the next 00:00 UTC in
 *                   notification_preferences.timezone ("ends tonight at
 *                   7 PM" in CDT, "6 PM" in CST, "4 PM" in PST, "at
 *                   midnight" in London). A zone where that moment has
 *                   already passed is skipped (cannot happen at 21:00 UTC).
 *   - dedup       = one notification_log row per fan per UTC date.
 */

export const AT_RISK_MIN_STREAK = 3;
/** The UTC hour the hourly cron acts in. Others return early. */
export const SEND_UTC_HOUR = 21;
export const DEFAULT_TIMEZONE = "America/Chicago";
export const STREAK_AT_RISK_TYPE = "streak_at_risk";

const DAY_MS = 24 * 60 * 60 * 1000;

export type AtRiskFanRow = {
  id: string;
  email?: string | null;
  current_streak_days: number | null | undefined;
  /** YYYY-MM-DD as written by lib/streaks/touch.ts (UTC day). */
  last_active_date: string | null | undefined;
  /** notification_preferences.timezone; null/invalid falls back to the default. */
  timezone?: string | null;
};

export type AtRiskFan = {
  id: string;
  email: string | null;
  currentStreakDays: number;
  timezone: string;
  /** "tonight at 7 PM", "at midnight" — the rollover on the fan's clock. */
  endsAtLocal: string;
};

/** True when `tz` names a zone Intl can format in. */
export function isValidTimeZone(tz: string | null | undefined): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The zone to use for a fan: theirs when valid, else the default. */
export function resolveTimeZone(tz: string | null | undefined): string {
  return isValidTimeZone(tz) ? (tz as string) : DEFAULT_TIMEZONE;
}

/** YYYY-MM-DD of `now` on the UTC calendar (the streak calendar). */
export function utcDateString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Yesterday's YYYY-MM-DD on the UTC calendar. */
export function utcYesterdayString(now: Date): string {
  return new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10);
}

/** The instant the current UTC day ends — when a D-1 streak is lost. */
export function nextUtcMidnight(now: Date): Date {
  return new Date(Date.parse(`${utcDateString(now)}T00:00:00Z`) + DAY_MS);
}

/** True during the SEND_UTC_HOUR hour. */
export function isSendHourUtc(now: Date): boolean {
  return now.getUTCHours() === SEND_UTC_HOUR;
}

/** Wall-clock parts of `at` in `tz`, 0–23 hours and minutes. */
export function localClock(tz: string, at: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveTimeZone(tz),
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  return {
    hour: Number.isFinite(hour) ? hour % 24 : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

/** "7 PM", "6:30 PM", "12 AM" — the kind of time a push can say. */
export function formatClock(clock: { hour: number; minute: number }): string {
  const h12 = clock.hour % 12 === 0 ? 12 : clock.hour % 12;
  const suffix = clock.hour < 12 ? "AM" : "PM";
  const minutes = clock.minute === 0 ? "" : `:${String(clock.minute).padStart(2, "0")}`;
  return `${h12}${minutes} ${suffix}`;
}

/**
 * When the streak rolls, on the fan's own clock: "tonight at 7 PM" (CDT),
 * "tonight at 6 PM" (CST), "tonight at 4 PM" (PST), "at midnight"
 * (London), "tonight at 1 AM" (Paris), "tomorrow at 5:30 AM" (Kolkata),
 * "today at 9 AM" (Tokyo). Null only when the rollover is already behind
 * `now`, which cannot happen inside the send hour.
 */
export function streakEndsAtLocal(tz: string, now: Date): string | null {
  const zone = resolveTimeZone(tz);
  const end = nextUtcMidnight(now);
  if (end.getTime() <= now.getTime()) return null;
  const endDay = end.toLocaleDateString("en-CA", { timeZone: zone });
  const nowDay = now.toLocaleDateString("en-CA", { timeZone: zone });
  const clock = localClock(zone, end);
  const time = formatClock(clock);
  if (endDay === nowDay) {
    return clock.hour >= 16 ? `tonight at ${time}` : `today at ${time}`;
  }
  if (clock.hour === 0 && clock.minute === 0) return "at midnight";
  if (clock.hour < 5) return `tonight at ${time}`;
  return `tomorrow at ${time}`;
}

/**
 * The streak is lost at the next 00:00 UTC unless the fan shows up:
 * streak long enough to matter, and last counted exactly yesterday (UTC).
 */
export function isStreakAtRisk(args: {
  currentStreakDays: number | null | undefined;
  lastActiveDate: string | null | undefined;
  now: Date;
}): boolean {
  const streak = Number(args.currentStreakDays) || 0;
  if (streak < AT_RISK_MIN_STREAK) return false;
  const last = (args.lastActiveDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(last)) return false;
  return last === utcYesterdayString(args.now);
}

/**
 * Fans to nudge on this run: at risk, it is the send hour (UTC), and the
 * rollover is still ahead of them on their own clock. Rows are grouped by
 * timezone so the local-time formatting runs once per zone. Order follows
 * `rows`, so ?testEmail slicing and the dry-run sample are stable.
 */
export function selectAtRiskFans(rows: readonly AtRiskFanRow[], now: Date): AtRiskFan[] {
  if (!isSendHourUtc(now)) return [];
  const endsAtByZone = new Map<string, string | null>();
  const out: AtRiskFan[] = [];
  for (const row of rows) {
    if (!row?.id) continue;
    if (
      !isStreakAtRisk({
        currentStreakDays: row.current_streak_days,
        lastActiveDate: row.last_active_date,
        now,
      })
    ) {
      continue;
    }
    const tz = resolveTimeZone(row.timezone);
    let endsAt = endsAtByZone.get(tz);
    if (endsAt === undefined) {
      endsAt = streakEndsAtLocal(tz, now);
      endsAtByZone.set(tz, endsAt);
    }
    if (endsAt === null) continue;
    out.push({
      id: row.id,
      email: row.email ?? null,
      currentStreakDays: Number(row.current_streak_days) || 0,
      timezone: tz,
      endsAtLocal: endsAt,
    });
  }
  return out;
}

/** Push copy. */
export function streakAtRiskCopy(
  currentStreakDays: number,
  endsAtLocal: string,
): { title: string; body: string; url: string } {
  const n = Math.max(0, Math.floor(currentStreakDays));
  return {
    title: `Your ${n}-day streak ends ${endsAtLocal}`,
    body: "Open Fan Engage and do one thing — a reaction counts.",
    url: "/",
  };
}

/**
 * Fan ids with a streak_at_risk notification_log row dated today on the
 * UTC calendar (any status: sent, suppressed or failed — one attempt per
 * fan per day). `rows` are the last ~24 hours of notification_log for the
 * type.
 */
export function sentTodayIds(
  rows: Iterable<{ fan_id: string; sent_at: string | null | undefined }>,
  now: Date,
): Set<string> {
  const today = utcDateString(now);
  const out = new Set<string>();
  for (const r of rows) {
    if (!r?.fan_id || !r.sent_at) continue;
    const ms = Date.parse(r.sent_at);
    if (Number.isNaN(ms)) continue;
    if (utcDateString(new Date(ms)) === today) out.add(r.fan_id);
  }
  return out;
}
