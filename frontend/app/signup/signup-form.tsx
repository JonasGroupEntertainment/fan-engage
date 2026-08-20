"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APP_URL } from "@/lib/app-url";
import {
  TurnstileWidget,
  isTurnstileConfigured,
  prefetchTurnstileScript,
  turnstileFailureMessage,
  verifyTurnstileToken,
} from "@/components/turnstile-widget";
import {
  nextSignupTurnstileGate,
  scrollToTurnstileChallenge,
  shouldShowParentChallengeError,
  signupAllowsSubmit,
  signupTurnstileButtonLabel,
  type TurnstileLoadState,
} from "@/lib/turnstile-ux";
import {
  COOKIE_CONSENT_EVENT,
  hasAcceptedCookieConsent,
} from "@/components/cookie-banner";

export type ConsentDoc = {
  slug: string;
  title: string;
  content_md: string;
};

const CONSENT_VERSION = "2026-08-01.v1";

export type ReferrerArtist = {
  slug: string;
  name: string;
  tagline: string | null;
  accentFrom: string;
  accentTo: string;
};

export function SignupForm({
  referrerName,
  referrerArtist,
  consentDocs,
  rewardsPublished,
}: {
  referrerName?: string | null;
  referrerArtist?: ReferrerArtist | null;
  consentDocs?: ConsentDoc[];
  rewardsPublished?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const community = searchParams.get("community");
  const ref = searchParams.get("ref");
  const inviteCode = searchParams.get("invite");
  // Where to send the user after a successful signup. Preserve any
  // ?ref=<artist-slug> attribution from the artist-page Join CTA so the
  // welcome flow knows which fan experience they came from.
  // Honor an explicit ?next= return path (used by the onboarding wizard and
  // preview banners when a session expires mid-flow). Only relative paths —
  // anything else would be an open redirect.
  const rawNext = searchParams.get("next");
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;
  // Always complete onboarding (signup bonus + profile). Carry ?next= as a
  // post-Finish return path — never skip the wizard.
  const onboardingParams = new URLSearchParams();
  if (ref) onboardingParams.set("ref", ref);
  if (next && !next.startsWith("/onboarding")) {
    onboardingParams.set("next", next);
  }
  const onboardingQs = onboardingParams.toString();
  const onboardingHref = onboardingQs ? `/onboarding?${onboardingQs}` : "/onboarding";
  const fromOnboardingBounce =
    next === "/onboarding" || (rawNext?.startsWith("/onboarding") ?? false);
  const loginHref =
    onboardingHref === "/onboarding"
      ? "/login"
      : `/login?next=${encodeURIComponent(onboardingHref)}`;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "confirm">("idle");
  const [message, setMessage] = useState("");
  const turnstileConfigured = isTurnstileConfigured();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const [turnstileLoadState, setTurnstileLoadState] =
    useState<TurnstileLoadState>("loading");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [consentChecked, setConsentChecked] = useState(false);
  const hasConsentDocs = !!consentDocs && consentDocs.length > 0;
  // One-shot: Turnstile is verified before the consent modal opens so the
  // ~5min token can't expire while the user scrolls ToS. createAccount
  // consumes this flag instead of re-verifying after Accept.
  const captchaVerifiedRef = useRef(false);
  const handleTurnstileSuccess = useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileError(false);
  }, []);
  const handleTurnstileError = useCallback(() => setTurnstileError(true), []);
  const handleTurnstileExpire = useCallback(() => setTurnstileToken(null), []);
  const handleTurnstileLoadState = useCallback((state: TurnstileLoadState) => {
    setTurnstileLoadState(state);
    if (state === "loading" || state === "ready") {
      setTurnstileError(false);
    }
  }, []);
  // Tokens are single-use: once verified (pass or fail) the widget must be
  // remounted to issue a fresh one, or every retry fails with a stale token.
  const resetChallenge = useCallback(() => {
    setTurnstileToken(null);
    setTurnstileLoadState("loading");
    setTurnstileKey((k) => k + 1);
  }, []);

  // Resubmitting signUp() for the same address silently resends the
  // confirmation email and regenerates its token, invalidating whatever
  // link is already in the inbox. Lock the button after a successful send
  // so a double-click or impatient retry can't do that.
  const CONFIRM_COOLDOWN_SECONDS = 45;
  const [confirmCooldown, setConfirmCooldown] = useState(0);
  const cooldownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownInterval.current) clearInterval(cooldownInterval.current);
    };
  }, []);

  useEffect(() => {
    if (turnstileConfigured) prefetchTurnstileScript();
  }, [turnstileConfigured]);

  // Invite deep-links: write fanengage_ref after cookie Accept (same gate as
  // /invite/[code]), so attribution survives invite → signup without Accept.
  useEffect(() => {
    if (typeof inviteCode !== "string" || inviteCode.length === 0) return;
    const code: string = inviteCode;
    function writeRefCookie() {
      if (!hasAcceptedCookieConsent()) return;
      const maxAge = 60 * 60 * 24 * 30;
      document.cookie = `fanengage_ref=${encodeURIComponent(code)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    }
    writeRefCookie();
    window.addEventListener(COOKIE_CONSENT_EVENT, writeRefCookie);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, writeRefCookie);
  }, [inviteCode]);

  function startConfirmCooldown() {
    setConfirmCooldown(CONFIRM_COOLDOWN_SECONDS);
    if (cooldownInterval.current) clearInterval(cooldownInterval.current);
    cooldownInterval.current = setInterval(() => {
      setConfirmCooldown((s) => {
        if (s <= 1) {
          if (cooldownInterval.current) clearInterval(cooldownInterval.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateEmail(value: string): string | null {
    if (!value.trim()) return "Email is required.";
    if (!EMAIL_RE.test(value.trim())) return "Enter a valid email address.";
    return null;
  }

  function validatePassword(value: string): string | null {
    if (!value) return "Password is required.";
    if (value.length < 8) return "Password must be at least 8 characters.";
    return null;
  }

  const turnstileGate = nextSignupTurnstileGate({
    configured: turnstileConfigured,
    token: turnstileToken,
    loadState: turnstileLoadState,
  });
  const canSubmitSignup =
    signupAllowsSubmit(turnstileGate) && (!hasConsentDocs || consentChecked);

  async function ensureCaptcha(): Promise<boolean> {
    if (captchaVerifiedRef.current) return true;
    const gate = nextSignupTurnstileGate({
      configured: turnstileConfigured,
      token: turnstileToken,
      loadState: turnstileLoadState,
    });
    if (gate === "wait-load") {
      setStatus("error");
      setMessage("Security check is still loading. Hang on a moment, then try again.");
      requestAnimationFrame(() => scrollToTurnstileChallenge());
      return false;
    }
    if (gate === "complete-check") {
      setStatus("error");
      setMessage("Complete the security check, then try again.");
      requestAnimationFrame(() => scrollToTurnstileChallenge());
      return false;
    }
    // Widget failed / unavailable, or keys unset (preview/dev): do not block
    // account creation on a missing token.
    if (gate === "fail-open" || gate === "not-configured") {
      captchaVerifiedRef.current = true;
      return true;
    }
    const captcha = await verifyTurnstileToken(turnstileToken);
    resetChallenge();
    if (!captcha.success) {
      captchaVerifiedRef.current = false;
      setStatus("error");
      setMessage(turnstileFailureMessage(captcha.error));
      requestAnimationFrame(() => scrollToTurnstileChallenge());
      return false;
    }
    captchaVerifiedRef.current = true;
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (confirmCooldown > 0) return;

    // Inline validation BEFORE we hit Supabase. Surface field-specific
    // errors so a 6-character password isn't silently rejected as a
    // generic "Unable to create account."
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    if (eErr || pErr) {
      setStatus("error");
      setMessage("");
      return;
    }

    if (hasConsentDocs && !consentChecked) {
      setStatus("error");
      setMessage("Please agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }

    // Confirmation resend already passed the gate — don't re-trap on a
    // remounted / failed widget.
    const resending = status === "confirm";
    if (!resending) {
      setStatus("loading");
      setMessage("");
      const ok = await ensureCaptcha();
      if (!ok) return;
    }
    await createAccount(hasConsentDocs ? CONSENT_VERSION : undefined);
  }

  async function createAccount(consentVersion?: string) {
    setStatus("loading");
    setMessage("");

    // Prefer the pre-consent verification; fall back to a live verify when
    // createAccount is reached without that one-shot (shouldn't happen in
    // the normal consent path, but keeps the no-docs path safe on retry).
    // Skip on confirmation resend — the account already exists.
    if (status !== "confirm" && !(await ensureCaptcha())) return;
    captchaVerifiedRef.current = false;

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${APP_URL}/auth/callback?next=${encodeURIComponent(onboardingHref)}`,
          data: consentVersion
            ? {
                consent_accepted_at: new Date().toISOString(),
                consent_version: consentVersion,
              }
            : undefined,
        },
      });
      if (error) throw error;

      // If email confirmation is OFF in Supabase, Supabase returns a session here
      // and we can push straight into onboarding.
      if (data.session) {
        router.push(onboardingHref);
        router.refresh();
        return;
      }

      // Otherwise Supabase emailed a confirmation link — prompt them to check it.
      setStatus("confirm");
      setMessage("Check your email to confirm and finish signing up.");
      startConfirmCooldown();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unable to create account.");
    }
  }

  // Contextual hero: when a visitor arrives via /signup?ref=<artist-slug>
  // and we successfully resolved that artist server-side, lead with the
  // artist's name + accent gradient + 2-3 perks instead of generic copy.
  // Falls through to the existing header below when there's no referrer.
  const showContextualHero = !!referrerArtist;
  const ctaGradient = referrerArtist
    ? `linear-gradient(90deg, ${referrerArtist.accentFrom}, ${referrerArtist.accentTo})`
    : null;

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-6 px-6 py-12">
      {showContextualHero && referrerArtist && ctaGradient && (
        <section
          className="relative overflow-hidden rounded-3xl border border-white/10 p-6"
          style={{
            backgroundImage: `linear-gradient(135deg, ${referrerArtist.accentFrom}33, #0f172a 60%, #000000)`,
          }}
        >
          <p className="text-xs uppercase tracking-[0.3em] text-white/70">
            Fan Experience
          </p>
          <h2
            className="mt-2 text-2xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Join {referrerArtist.name}&apos;s
            {" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: ctaGradient }}
            >
              fan experience
            </span>
          </h2>
          {referrerArtist.tagline && (
            <p className="mt-2 text-sm text-white/75">{referrerArtist.tagline}</p>
          )}
          <ul className="mt-4 space-y-1.5 text-sm text-white/80">
            <li className="flex items-start gap-2">
              <span aria-hidden>🎁</span>
              <span>Earn 100 fan points the moment you join</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden>🎟️</span>
              <span>Backstage moments and exclusive digital drops</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden>👋</span>
              <span>Free · 60 seconds · No credit card</span>
            </li>
          </ul>
        </section>
      )}

      <div className="glass-card space-y-6 p-8">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-white/60">Fan Engage</p>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {showContextualHero ? "Create your account" : "Join the inner circle"}
          </h1>
          {!showContextualHero && (
            <p className="text-sm text-white/70">
              Create an account to earn points, unlock rewards, and get backstage access.
            </p>
          )}
          {!showContextualHero && (
            <p className="inline-flex items-center gap-1.5 rounded-full border border-aurora/30 bg-aurora/10 px-3 py-1 text-xs font-medium text-aurora">
              🎁 Join free and earn your first 100 fan points today.
            </p>
          )}
          {referrerName && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
              <span aria-hidden>👋</span>
              <span>Invited by {referrerName}</span>
            </div>
          )}
          {community && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-aurora/40 bg-aurora/10 px-3 py-1 text-xs text-aurora">
              <span aria-hidden>·</span>
              <span>Joining via @{community}</span>
            </div>
          )}
        </div>


        {/* OAuth temporarily hidden — Google + Apple SSO buttons removed
            until the custom auth domain ships post-G.4. The Supabase
            project URL (uhovonrljcauaoctypbg.supabase.co) currently
            appears in the Google consent screen's "to continue to"
            line, which reads as phishy to real users.

            Re-enable by reverting this comment block to the original
            JSX once Supabase Pro custom auth domain is configured
            (e.g. auth.fanengage.com) and the Google OAuth client's
            redirect URIs point at the new domain. The original block
            in git history at the commit before this one. */}
        <p className="text-xs text-white/50">
          Google &amp; Apple sign-in coming soon — create your fan account with
          email for now.
        </p>

        {fromOnboardingBounce && (
          <div className="rounded-2xl border border-aurora/30 bg-aurora/10 px-4 py-3 text-sm text-white/85">
            <p className="font-medium text-white">Create your fan account first</p>
            <p className="mt-1 text-xs text-white/70">
              Nothing&apos;s lost — after you confirm your email you&apos;ll finish your
              profile (about a minute), then jump into the artist experience with your
              signup points.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-white/60">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(validateEmail(e.target.value));
              }}
              onBlur={() => setEmailError(validateEmail(email))}
              aria-invalid={!!emailError}
              className={
                "w-full rounded-2xl border bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/50 focus:outline-none " +
                (emailError
                  ? "border-rose-500/60 focus:border-rose-400"
                  : "border-white/10 focus:border-white/40")
              }
              placeholder="you@email.com"
            />
            {emailError && (
              <span className="text-xs text-rose-300">{emailError}</span>
            )}
          </label>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-white/60">Password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError(validatePassword(e.target.value));
              }}
              onBlur={() => setPasswordError(validatePassword(password))}
              aria-invalid={!!passwordError}
              className={
                "w-full rounded-2xl border bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/50 focus:outline-none " +
                (passwordError
                  ? "border-rose-500/60 focus:border-rose-400"
                  : "border-white/10 focus:border-white/40")
              }
              placeholder="at least 8 characters"
            />
            {passwordError && (
              <span className="text-xs text-rose-300">{passwordError}</span>
            )}
            {password && !passwordError && (() => {
              let score = 0;
              if (password.length >= 8) score += 1;
              if (password.length >= 12) score += 1;
              if (/[A-Z]/.test(password)) score += 1;
              if (/\d/.test(password)) score += 1;
              if (/[^A-Za-z0-9]/.test(password)) score += 1;
              const tiers = [
                { label: "Weak", color: "bg-rose-500", w: "20%" },
                { label: "Weak", color: "bg-rose-500", w: "20%" },
                { label: "Fair", color: "bg-amber-400", w: "45%" },
                { label: "Good", color: "bg-emerald-400", w: "70%" },
                { label: "Strong", color: "bg-emerald-500", w: "95%" },
                { label: "Strong", color: "bg-emerald-500", w: "100%" },
              ];
              const t = tiers[score];
              return (
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-1 flex-1 overflow-hidden rounded bg-white/10">
                    <span className={"block h-1 " + t.color} style={{ width: t.w }} />
                  </span>
                  <span className="text-xs text-white/50">{t.label}</span>
                </div>
              );
            })()}
          </label>

          {turnstileConfigured && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-white/45">Security check</p>
              <TurnstileWidget
                key={turnstileKey}
                onSuccess={handleTurnstileSuccess}
                onError={handleTurnstileError}
                onExpire={handleTurnstileExpire}
                onLoadStateChange={handleTurnstileLoadState}
                onRetry={resetChallenge}
                theme="dark"
              />
              {shouldShowParentChallengeError({
                loadState: turnstileLoadState,
                challengeFailed: turnstileError,
              }) && (
                <p className="text-xs text-rose-300">
                  Security check failed. Tap Retry above, or try again.
                </p>
              )}
              {turnstileGate === "fail-open" && (
                <p className="text-xs text-white/55">
                  Security check is unavailable. You can still create an account.
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={
              status === "loading" ||
              confirmCooldown > 0 ||
              (status !== "confirm" && !canSubmitSignup)
            }
            className="w-full rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-3 text-sm font-semibold text-white shadow-glass disabled:opacity-60"
          >
            {signupTurnstileButtonLabel({
              cooldown: confirmCooldown,
              status,
              gate: turnstileGate,
            })}
          </button>
        </form>

        {status === "confirm" && (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
            <p className="text-sm font-semibold text-emerald-200">
              Almost there — what happens next:
            </p>
            <ol className="mt-3 space-y-2 text-xs text-emerald-100/90">
              <li className="flex gap-2">
                <span className="font-mono text-emerald-300/70">1.</span>
                <span>
                  Check your email and click the confirmation link we just sent — use the
                  newest one, since requesting another invalidates it.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-mono text-emerald-300/70">2.</span>
                <span>Set up your fan profile — 60 seconds, no credit card.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-mono text-emerald-300/70">3.</span>
                <span>Earn your first 100 fan points and start unlocking rewards.</span>
              </li>
            </ol>
          </div>
        )}
        {message && status !== "confirm" && (
          <p
            className={`text-sm ${
              status === "error" ? "text-red-300" : "text-emerald-300"
            }`}
          >
            {message}
          </p>
        )}

        {hasConsentDocs ? (
          <label className="flex cursor-pointer items-start gap-2.5 text-xs text-white/70">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => {
                setConsentChecked(e.target.checked);
                if (status === "error") {
                  setStatus("idle");
                  setMessage("");
                }
              }}
              className="mt-0.5 h-4 w-4 shrink-0 accent-aurora"
            />
            <span>
              I agree to the{" "}
              <Link
                href="/terms"
                target="_blank"
                className="text-white/85 underline underline-offset-4 hover:text-white"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                target="_blank"
                className="text-white/85 underline underline-offset-4 hover:text-white"
              >
                Privacy Policy
              </Link>
              {!rewardsPublished && (
                <>
                  , including the Rewards Program Terms once published
                </>
              )}
              . We may email a weekly fan digest and product updates — you can
              manage email preferences anytime after signup.
            </span>
          </label>
        ) : (
          <p className="text-center text-xs text-white/55">
            By creating an account, you agree to our{" "}
            <Link href="/terms" className="text-white/80 underline underline-offset-4 hover:text-white">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-white/80 underline underline-offset-4 hover:text-white">
              Privacy Policy
            </Link>
            . We may email a weekly fan digest and product updates — you can
            manage email preferences anytime after signup.
          </p>
        )}
        <p className="text-center text-sm text-white/60">
          Already have an account?{" "}
          <Link href={loginHref} className="text-white underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
        <p className="text-center text-xs text-white/50">
          Are you an artist or manager?{" "}
          <Link
            href="/for-artists/apply"
            className="text-white underline-offset-4 hover:underline"
          >
            Apply to launch your fan experience →
          </Link>
        </p>
      </div>
    </main>
  );
}
