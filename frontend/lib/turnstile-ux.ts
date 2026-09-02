export type TurnstileLoadState = "loading" | "ready" | "error";

/**
 * Widget iframe/script hang timeout. Keep this generous so a slow Cloudflare
 * load is not a false error. Script onerror retries use
 * TURNSTILE_SCRIPT_RETRY_DELAYS_MS and can surface a real network failure
 * a bit earlier; the slow-load hint at TURNSTILE_SLOW_LOAD_HINT_MS is so
 * the skeleton is not silent for the full 12s.
 */
export const TURNSTILE_LOAD_TIMEOUT_MS = 12_000;
export const TURNSTILE_SLOW_LOAD_HINT_MS = 6_000;
/**
 * Widget painted (iframe present) but never issued a token — invalid
 * hostname / site key, interactive checkbox ignored, or Cloudflare
 * error inside the iframe without error-callback. Show Retry and keep
 * Create account disabled until a token exists.
 */
export const TURNSTILE_CHALLENGE_STALL_MS = 15_000;
/** Backoff between script inject attempts (3 delays → 4 tries). Sum ≈ 11s. */
export const TURNSTILE_SCRIPT_RETRY_DELAYS_MS = [3_000, 4_000, 4_000] as const;

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

export type MagicLinkClickAction = "need-email" | MagicLinkGate;

export function emailReadyForMagicLink(email: string): boolean {
  return email.trim().length > 0;
}

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

/**
 * First-tap / click routing for the magic-link CTA.
 * Empty email must win so Turnstile is never revealed without an address.
 */
export function magicLinkClickAction(opts: {
  email: string;
  configured: boolean;
  revealed: boolean;
  token: string | null;
  loadState: TurnstileLoadState;
}): MagicLinkClickAction {
  if (!emailReadyForMagicLink(opts.email)) return "need-email";
  return nextMagicLinkGate(opts);
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

/** Click-feedback copy. Persistent on-page helper is separate (see below). */
export function magicLinkGateMessage(gate: MagicLinkGate): string | null {
  switch (gate) {
    case "reveal":
      return null;
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

/**
 * Green helper under the widget. Hidden while loading/failed so it cannot
 * sit next to the error card or flash under a retry skeleton.
 */
export function magicLinkPersistentHelper(opts: {
  gate: MagicLinkGate;
  loadState: TurnstileLoadState;
  challengeFailed: boolean;
}): string | null {
  if (opts.loadState === "error" || opts.challengeFailed) return null;
  if (opts.loadState === "loading") return null;
  if (opts.gate !== "complete-check") return null;
  return magicLinkGateMessage("complete-check");
}

/**
 * Extra page-level challenge error. The widget owns load-fail + retry.
 * While loading (including Retry), never show a leftover fail line.
 */
export function shouldShowParentChallengeError(opts: {
  loadState: TurnstileLoadState;
  challengeFailed: boolean;
}): boolean {
  if (!opts.challengeFailed) return false;
  if (opts.loadState === "loading" || opts.loadState === "error") return false;
  return true;
}

export function turnstileSlowLoadHint(elapsedHint: boolean): string {
  if (!elapsedHint) return "Security check loading…";
  return `Still loading — this can take up to ${TURNSTILE_LOAD_TIMEOUT_MS / 1000} seconds.`;
}

/** Single widget-owned fail copy (login/signup/forgot share this). */
export const TURNSTILE_WIDGET_ERROR_COPY =
  "Security check couldn't load. Check your connection, then retry.";

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

/**
 * Password signup Turnstile gate. Create stays disabled until a token
 * exists (or Turnstile is not configured). Widget errors show Retry —
 * never enable Create without a token.
 */
export type SignupTurnstileGate =
  | "not-configured"
  | "wait-load"
  | "complete-check"
  | "retry-required"
  | "ready";

export function nextSignupTurnstileGate(opts: {
  configured: boolean;
  token: string | null;
  loadState: TurnstileLoadState;
}): SignupTurnstileGate {
  if (!opts.configured) return "not-configured";
  if (opts.token) return "ready";
  if (opts.loadState === "loading") return "wait-load";
  if (opts.loadState === "error") return "retry-required";
  return "complete-check";
}

export function signupAllowsSubmit(gate: SignupTurnstileGate): boolean {
  return gate === "not-configured" || gate === "ready";
}

export function signupTurnstileButtonLabel(opts: {
  status: "idle" | "loading" | "error" | "need-signin";
  gate: SignupTurnstileGate;
}): string {
  if (opts.status === "loading") return "Creating account…";
  if (opts.status === "need-signin") {
    return "Sign in with the password you just created";
  }
  // Loading / fail / retry copy lives on the Turnstile block, not this CTA.
  return "Create account";
}
