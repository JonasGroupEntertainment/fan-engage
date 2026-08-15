export const CONSENT_SCROLL_THRESHOLD_PX = 24;

export type ScrollBox = {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
};

/**
 * True when the box is already at the end — including the no-overflow case
 * (scrollHeight <= clientHeight), where onScroll never fires.
 */
export function isScrollAtBottom(
  el: ScrollBox,
  thresholdPx = CONSENT_SCROLL_THRESHOLD_PX,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < thresholdPx;
}

/**
 * Accept is allowed once every consent doc has been seen at its end,
 * or the fan explicitly checks "I have read these terms".
 */
export function canAcceptConsent({
  docCount,
  scrolledEnd,
  acknowledged,
}: {
  docCount: number;
  scrolledEnd: Record<number, boolean>;
  acknowledged: boolean;
}): boolean {
  if (acknowledged) return true;
  if (docCount <= 0) return true;
  for (let i = 0; i < docCount; i++) {
    if (!scrolledEnd[i]) return false;
  }
  return true;
}
