/**
 * One-prompt-at-a-time coordination for the floating prompts in the root
 * layout (Premium upgrade modal and the install banner). The cookie banner
 * is not a slot owner: it always wins, and the other prompts wait until
 * consent is resolved before they ask for the slot.
 *
 * A prompt that wants to show calls claimPromptSlot. It only renders while
 * getActivePromptSlot() returns its own name, and it releases the slot when
 * it closes so the next prompt can take a turn.
 */

export type PromptSlotOwner = "premium" | "install";

type Listener = () => void;

let active: PromptSlotOwner | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getActivePromptSlot(): PromptSlotOwner | null {
  return active;
}

export function getServerPromptSlot(): PromptSlotOwner | null {
  return null;
}

export function subscribePromptSlot(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True when the slot is free or already held by this owner. */
export function isPromptSlotFree(
  owner: PromptSlotOwner,
  current: PromptSlotOwner | null,
): boolean {
  return current === null || current === owner;
}

/** Take the slot. Returns false when another prompt already holds it. */
export function claimPromptSlot(owner: PromptSlotOwner): boolean {
  if (!isPromptSlotFree(owner, active)) return false;
  if (active === owner) return true;
  active = owner;
  emit();
  return true;
}

/** Give the slot back. A no-op when this owner does not hold it. */
export function releasePromptSlot(owner: PromptSlotOwner): void {
  if (active !== owner) return;
  active = null;
  emit();
}

/** Test helper: clear the slot without notifying. */
export function resetPromptSlotForTests(): void {
  active = null;
}

export type CookieConsentChoice = "accept" | "decline";

/**
 * Parse the stored cookie consent value. Legacy values that are not JSON
 * still count as resolved (the banner already hid for them) but are not
 * treated as an Accept.
 */
export function parseCookieConsentChoice(
  raw: string | null | undefined,
): CookieConsentChoice | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw) as { choice?: unknown };
    if (parsed.choice === "accept") return "accept";
    if (parsed.choice === "decline") return "decline";
    return "decline";
  } catch {
    return "decline";
  }
}

/** True once the fan has answered the cookie banner either way. */
export function isCookieConsentResolved(raw: string | null | undefined): boolean {
  return raw != null;
}
