export type TurnstileLoadState = "loading" | "ready" | "error";

/**
 * What the magic-link CTA should do on click.
 * Password sign-in never goes through this gate.
 */
export type MagicLinkGate =
  | "send"
  | "reveal"
  | "wait-load"
  | "retry"
  | "complete-check";

export function nextMagicLinkGate(opts: {
  configured: boolean;
  revealed: boolean;
  token: string | null;
  loadState: TurnstileLoadState;
}): MagicLinkGate {
  if (!opts.configured) return "send";
  if (!opts.revealed) return "reveal";
  if (opts.token) return "send";
  if (opts.loadState === "loading") return "wait-load";
  if (opts.loadState === "error") return "retry";
  return "complete-check";
}

export function magicLinkButtonLabel(opts: {
  cooldown: number;
  status: "idle" | "loading" | "error" | "magic-sent";
  gate: MagicLinkGate;
}): string {
  if (opts.cooldown > 0) return `Resend magic link in ${opts.cooldown}s`;
  if (opts.status === "magic-sent") return "Resend magic link";
  switch (opts.gate) {
    case "wait-load":
      return "Security check loading…";
    case "retry":
      return "Security check unavailable — retry above or use password";
    case "complete-check":
      return "Complete security check above, then email magic link";
    case "reveal":
    case "send":
      return "Email me a magic link instead";
  }
}

export function magicLinkGateMessage(gate: MagicLinkGate): string | null {
  switch (gate) {
    case "reveal":
    case "complete-check":
      return "Complete the security check, then send a magic link.";
    case "wait-load":
      return "Security check is still loading. Hang on a moment, then try again.";
    case "retry":
      return "Security check didn't load. Tap Retry, or sign in with your password.";
    case "send":
      return null;
  }
}

/** Stable id for scroll/focus. Auth pages never mount two widgets at once. */
export const TURNSTILE_CHALLENGE_ID = "turnstile-challenge";

export function scrollToTurnstileChallenge() {
  if (typeof document === "undefined") return;
  const el = document.getElementById(TURNSTILE_CHALLENGE_ID);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const focusable = el.querySelector<HTMLElement>(
    "button, [tabindex]:not([tabindex='-1'])",
  );
  (focusable ?? el).focus({ preventScroll: true });
}
