/**
 * Backstop against double-submitted events. An event with the same title for
 * the same brand created this recently is treated as the same submission
 * arriving twice (double click, double tap, retry).
 */
export const DUPLICATE_EVENT_WINDOW_MS = 60_000;

/** ISO timestamp marking the start of the duplicate window. */
export function duplicateEventWindowStart(now: Date): string {
  return new Date(now.getTime() - DUPLICATE_EVENT_WINDOW_MS).toISOString();
}

/** Turns a whole-number form value into a capacity, or null when blank or invalid. */
export function parseCapacity(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = parseInt(trimmed, 10);
  return value > 0 ? value : null;
}
