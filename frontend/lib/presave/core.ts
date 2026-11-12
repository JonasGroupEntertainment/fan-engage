/**
 * Pre-save loop — pure helpers (no Next / Supabase imports; unit-tested).
 *
 * Storage decision: a pre-save IS a `fan_actions` row with
 * kind = 'pre_save' (0005). That table already has artist_slug, title, url,
 * point_value, active, ends_at and one-per-fan completions
 * (fan_action_completions PK fan_id, action_id). 0091 adds release_date and
 * hands the award to the app so the ledger row is source = 'presave'.
 */

/** points_ledger.source for a pre-save click-through (0048 enum value). */
export const PRESAVE_POINT_SOURCE = "presave";

/** fan_actions.kind for a pre-save. */
export const PRESAVE_ACTION_KIND = "pre_save";

/** Default points when the admin leaves the field blank. */
export const PRESAVE_DEFAULT_POINTS = 50;

/** A pre-save stays live this many days after its release date. */
export const PRESAVE_GRACE_DAYS = 7;

/** Honest copy — we cannot see the DSP; the points thank the click. */
export const PRESAVE_HONEST_COPY =
  "We can't verify the save — the points are a thank-you for clicking through.";

/**
 * Dedup key for the ledger. apply_points_award() (0066) refuses a second row
 * with the same source_ref, so one fan can be paid once per campaign no
 * matter how many times the action runs.
 */
export function presaveAwardRef(actionId: string, fanId: string): string {
  return `${PRESAVE_POINT_SOURCE}:${actionId}:${fanId}`;
}

export interface PresaveLiveInput {
  active: boolean | null | undefined;
  /** fan_actions.release_date — 'YYYY-MM-DD' or null (no date gating). */
  release_date?: string | null;
  /** fan_actions.ends_at — ISO timestamp or null. */
  ends_at?: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse a date-only column as UTC midnight; null when unparseable. */
export function parseReleaseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Is the pre-save card shown? active, not past ends_at, and release_date is
 * null, in the future, or no more than PRESAVE_GRACE_DAYS in the past
 * (release day counts as day 0, so a Friday release is live through the
 * following Friday).
 */
export function isPresaveLive(row: PresaveLiveInput, now: Date = new Date()): boolean {
  if (!row.active) return false;
  if (row.ends_at) {
    const ends = new Date(row.ends_at);
    if (!Number.isNaN(ends.getTime()) && ends.getTime() <= now.getTime()) return false;
  }
  const release = parseReleaseDate(row.release_date);
  if (!release) return true;
  const cutoff = release.getTime() + PRESAVE_GRACE_DAYS * DAY_MS;
  return now.getTime() < cutoff;
}

/** "Out now" / "Out Nov 14" / "Out in 3 days" for the card. */
export function presaveReleaseLabel(
  releaseDate: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const release = parseReleaseDate(releaseDate);
  if (!release) return null;
  const diffDays = Math.ceil((release.getTime() - now.getTime()) / DAY_MS);
  if (diffDays <= 0) return "Out now";
  if (diffDays === 1) return "Out tomorrow";
  if (diffDays <= 14) return `Out in ${diffDays} days`;
  return `Out ${release.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })}`;
}

/** Clamp an admin-entered points value to something sane. */
export function normalizePresavePoints(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return PRESAVE_DEFAULT_POINTS;
  return Math.min(500, Math.floor(n));
}

/** Only http(s) links; DSP / linkfire / Apple all qualify. */
export function normalizePresaveUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed && /^https?:\/\//i.test(trimmed) ? trimmed : null;
}
