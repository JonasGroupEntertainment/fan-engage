"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APP_URL } from "@/lib/app-url";
import {
  TurnstileWidget,
  turnstileFailureMessage,
  verifyTurnstileToken,
} from "@/components/turnstile-widget";
import { ConsentModal, type ConsentDoc } from "@/components/consent-modal";

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
  // Where to send the user after a successful signup. Preserve any
  // ?ref=<artist-slug> attribution from the artist-page Join CTA so the
  // welcome flow knows which fan experience they came from.
  // Honor an explicit ?next= return path (used by the onboarding wizard and
  // preview banners when a session expires mid-flow). Only relative paths —
  // anything else would be an open redirect.
  const rawNext = searchParams.get("next");
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;
  const onboardingHref =
    next ?? (ref ? `/onboarding?ref=${encodeURIComponent(ref)}` : "/onboarding");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "confirm">("idle");
  const [message, setMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [consentOpen, setConsentOpen] = useState(false);
  const hasConsentDocs = !!consentDocs && consentDocs.length > 0;
  const handleTurnstileSuccess = useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileError(false);
  }, []);
  const handleTurnstileError = useCallback(() => setTurnstileError(true), []);
  const handleTurnstileExpire = useCallback(() => setTurnstileToken(null), []);
  // Tokens are single-use: once verified (pass or fail) the widget must be
  // remounted to issue a fresh one, or every retry fails with a stale token.
  const resetChallenge = useCallback(() => {
    setTurnstileToken(null);
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

    // Explicit, logged consent is required before an account is created.
    // Hold here and let the scroll-to-accept modal drive the actual submit.
    if (hasConsentDocs) {
      setConsentOpen(true);
      return;
    }
    await createAccount();
  }

  async function createAccount(consentVersion?: string) {
    setStatus("loading");
    setMessage("");

    const captcha = await verifyTurnstileToken(turnstileToken);
    resetChallenge();
    if (!captcha.success) {
      setStatus("error");
      setMessage(turnstileFailureMessage(captcha.error));
      return;
    }

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
              <span>Backstage moments, drops, and early ticket access</span>
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
                "w-full rounded-2xl border bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none " +
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
                "w-full rounded-2xl border bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none " +
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

          <TurnstileWidget
            key={turnstileKey}
            onSuccess={handleTurnstileSuccess}
            onError={handleTurnstileError}
            onExpire={handleTurnstileExpire}
            theme="dark"
          />
          {turnstileError && (
            <p className="text-xs text-rose-300">Security check failed. Please refresh and try again.</p>
          )}

          <button
            type="submit"
            disabled={status === "loading" || confirmCooldown > 0}
            className="w-full rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-3 text-sm font-semibold text-white shadow-glass disabled:opacity-60"
          >
            {confirmCooldown > 0
              ? `Resend confirmation email in ${confirmCooldown}s`
              : status === "loading"
                ? "Creating account…"
                : status === "confirm"
                  ? "Resend confirmation email"
                  : "Create account"}
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

        <p className="text-center text-xs text-white/40">
          By creating an account, you agree to our{" "}
          <Link href="/terms" className="underline-offset-4 hover:underline hover:text-white/60">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline-offset-4 hover:underline hover:text-white/60">
            Privacy Policy
          </Link>
          .
        </p>
        <p className="text-center text-sm text-white/60">
          Already have an account?{" "}
          <Link href="/login" className="text-white underline-offset-4 hover:underline">
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

      {hasConsentDocs && (
        <ConsentModal
          open={consentOpen}
          docs={consentDocs!}
          rewardsPublished={!!rewardsPublished}
          onCancel={() => {
            setConsentOpen(false);
            setStatus("idle");
          }}
          onAccept={(version) => {
            setConsentOpen(false);
            void createAccount(version);
          }}
        />
      )}
    </main>
  );
}
