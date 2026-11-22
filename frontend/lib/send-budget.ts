/**
 * How long an admin send (Broadcast screen, campaign builder) may run.
 *
 * The two pages export maxDuration = 300, so the platform stops the
 * action after five minutes. A send must finish well before that, with
 * time left to record what happened and show it to the admin. When the
 * budget runs out the send stops starting new messages and says so.
 *
 * Pure: no env, no Supabase, no imports.
 */

const SECOND_MS = 1000;

/** Must match the literal `maxDuration` in the two page files. */
export const ADMIN_SEND_MAX_DURATION_SECONDS = 300;

/** Time a send may spend starting messages, counted from when the action began. */
export const SEND_TIME_BUDGET_MS = 220 * SECOND_MS;

export function sendDeadline(startedAtMs: number = Date.now()): number {
  return startedAtMs + SEND_TIME_BUDGET_MS;
}

/** True once the deadline has passed. No deadline means never out of time. */
export function outOfTime(deadlineAt: number | null | undefined, nowMs: number = Date.now()): boolean {
  return deadlineAt != null && nowMs >= deadlineAt;
}
