"use client";

import { useState, useCallback, useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { signupOnboardingHref } from "@/lib/signup-destination";
import { PasswordInput } from "@/components/password-input";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { authEmailRedirectTo } from "@/lib/app-url";
import {
  TurnstileWidget,
  isTurnstileConfigured,
  prefetchTurnstileScript,
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
  IMPORTED_RESET_CHECK_MESSAGE,
  IMPORTED_RESET_FAILED_MESSAGE,
  IMPORTED_RESET_LIMIT_MESSAGE,
  IMPORTED_RESET_SENT_MESSAGE,
  IMPORTED_SET_PASSWORD_MESSAGE,
  postImportedAccount,
} from "@/lib/imported-passwordless";
import {
  SIGNUP_NOT_CREATED_MESSAGE,
  didSignupCreateUser,
  interpretSignupCreate,
  reportSignupError,
  sanitizeSignupError,
} from "@/lib/signup-outcome";
import { buildSignupAuthOptions } from "@/lib/signup-auth-options";
import { CONSENT_VERSION } from "@/lib/consent";
import { persistSignupChannelOptIn } from "@/lib/channel-opt-in";
import { tagInternalAccountOnSignup } from "@/app/signup/tag-internal-account";
import { publicSmsOptIn, type PublicSmsOptIn } from "@/lib/sms-public-opt-in";
import { PHONE_INPUT_PATTERN } from "@/lib/phone";
import { SmsConsentCopy } from "@/components/sms-consent-copy";
import {
  AGE_BLOCKED_MESSAGE,
  AGE_BLOCK_STORAGE_KEY,
  ageBand,
  parseBirthDate,
  toIsoDate,
} from "@/lib/age-gate";
import {
  COOKIE_CONSENT_EVENT,
  hasAcceptedCookieConsent,
} from "@/components/cookie-banner";

// A blocked attempt keeps the form closed for this browser session so the
// date cannot simply be changed and resubmitted.
function readAgeBlock(): boolean {
  try {
    return window.sessionStorage.getItem(AGE_BLOCK_STORAGE_KEY) === "1";
  } catch {
    // Storage can be unavailable (private mode); the database check still applies.
    return false;
  }
}

function noopSubscribe(): () => void {
  return () => {};
}

export type ConsentDoc = {
  slug: string;
  title: string;
  content_md: string;
};

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
  const onboardingHref = signupOnboardingHref(rawNext, ref);
  const fromOnboardingBounce =
    rawNext === "/onboarding" || (rawNext?.startsWith("/onboarding") ?? false);
  const loginHref =
    onboardingHref === "/onboarding"
      ? "/login"
      : `/login?next=${encodeURIComponent(onboardingHref)}`;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "error" | "need-signin" | "set-password" | "reset-sent"
  >("idle");
  const [message, setMessage] = useState("");
  const [sendingReset, setSendingReset] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const turnstileConfigured = isTurnstileConfigured();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const [turnstileLoadState, setTurnstileLoadState] =
    useState<TurnstileLoadState>("loading");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [consentChecked, setConsentChecked] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [smsConsent, setSmsConsent] = useState(false);
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [birthError, setBirthError] = useState<string | null>(null);
  const [ageBlockedNow, setAgeBlocked] = useState(false);
  const ageBlockedEarlier = useSyncExternalStore(noopSubscribe, readAgeBlock, () => false);
  const ageBlocked = ageBlockedNow || ageBlockedEarlier;
  const birthDate = parseBirthDate(birthYear, birthMonth, birthDay);
  // Texts are 18+. Until a full adult date is entered, the box stays off.
  const smsAllowed = birthDate != null && ageBand(birthDate) === "adult";
  const hasConsentDocs = !!consentDocs && consentDocs.length > 0;
  const handleTurnstileSuccess = useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileError(false);
  }, []);
  const handleTurnstileError = useCallback(() => {
    setTurnstileError(true);
  }, []);
  const handleTurnstileStall = useCallback(() => {
    setTurnstileError(true);
  }, []);
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
    if (gate === "complete-check" || gate === "retry-required") {
      setStatus("error");
      setMessage(
        gate === "retry-required"
          ? "Security check couldn't load. Tap Retry, then try again."
          : "Complete the security check, then try again.",
      );
      requestAnimationFrame(() => scrollToTurnstileChallenge());
      return false;
    }
    // Keys unset (preview/dev): no widget, no token required.
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "need-signin" || status === "set-password" || status === "reset-sent") return;

    // Inline validation BEFORE we hit Supabase. Surface field-specific
    // errors so a 6-character password isn't silently rejected as a
    // generic "Unable to create account."
    if (ageBlocked) return;
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    const bErr = birthDate ? null : "Enter a valid date of birth.";
    const sms = publicSmsOptIn(smsConsent && smsAllowed, phone);
    setEmailError(eErr);
    setPasswordError(pErr);
    setBirthError(bErr);
    setPhoneError(sms.error);
    if (eErr || pErr || bErr || sms.error || !birthDate) {
      setStatus("error");
      setMessage("");
      return;
    }

    if (hasConsentDocs && !consentChecked) {
      setStatus("error");
      setMessage("Please agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }

    // Under 13: stop here. Nothing is sent to the server and the typed
    // details are cleared from the page.
    if (ageBand(birthDate) === "under13") {
      blockForAge();
      return;
    }

    setStatus("loading");
    setMessage("");
    const ok = await ensureCaptcha();
    if (!ok) return;
    await createAccount(hasConsentDocs ? CONSENT_VERSION : undefined, sms, toIsoDate(birthDate));
  }

  function blockForAge() {
    try {
      window.sessionStorage.setItem(AGE_BLOCK_STORAGE_KEY, "1");
    } catch {
      // Ignore: the block still applies for this page view.
    }
    setEmail("");
    setPassword("");
    setPhone("");
    setSmsConsent(false);
    setBirthMonth("");
    setBirthDay("");
    setBirthYear("");
    setAgeBlocked(true);
    setStatus("idle");
    setMessage("");
  }

  async function createAccount(
    consentVersion: string | undefined,
    sms: PublicSmsOptIn,
    birthDateIso: string,
  ) {
    setStatus("loading");
    setMessage("");

    // Keep the UI gate close to the Auth call. Supabase Auth consumes the
    // token as part of signup so verification cannot be detached from use.
    if (!(await ensureCaptcha())) return;

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: buildSignupAuthOptions({
          emailRedirectTo: authEmailRedirectTo(onboardingHref),
          turnstileConfigured,
          turnstileToken,
          consentVersion,
          phone: sms.phone,
          smsOptedIn: sms.smsOptedIn,
          birthDate: birthDateIso,
        }),
      });
      resetChallenge();

      let signInError: string | null = null;
      let signInSession: unknown | null = null;
      if (!error && !data.session) {
        const { data: signedIn, error: passwordError } =
          await supabase.auth.signInWithPassword({ email, password });
        signInError = passwordError?.message ?? null;
        signInSession = signedIn.session ?? null;
      }

      const decision = interpretSignupCreate({
        signUpError: error?.message ?? null,
        user: data.user,
        session: data.session,
        signInError,
        signInSession,
      });
      if (decision.action === "stay-error") {
        if (error?.message || error?.code) {
          reportSignupError({
            message: error.message,
            code: error.code,
          });
        } else if (signInError) {
          reportSignupError({ message: signInError });
        }
        // Empty identities + failed password sign-in is the import dead end.
        // The server returns set-password only for that cohort.
        if (!error && !didSignupCreateUser(data.user)) {
          const classified = await postImportedAccount({
            email: email.trim(),
            action: "classify",
          });
          if (classified.status === 429) {
            setStatus("error");
            setMessage(IMPORTED_RESET_LIMIT_MESSAGE);
            return;
          }
          if (classified.body.outcome === "set-password") {
            setStatus("set-password");
            setMessage(IMPORTED_SET_PASSWORD_MESSAGE);
            setResetNotice(null);
            return;
          }
        }
        setStatus("error");
        setMessage(decision.message || SIGNUP_NOT_CREATED_MESSAGE);
        return;
      }

      if (data.user?.id) {
        await persistSignupChannelOptIn(supabase, data.user.id, sms);
        await tagInternalAccountOnSignup();
      }

      router.push(onboardingHref);
      router.refresh();
    } catch (err) {
      resetChallenge();
      const raw = err instanceof Error ? err.message : null;
      reportSignupError({ message: raw });
      setStatus("error");
      setMessage(sanitizeSignupError(raw));
    }
  }

  async function sendSetPasswordEmail() {
    if (sendingReset || status === "reset-sent") return;
    const gate = nextSignupTurnstileGate({
      configured: turnstileConfigured,
      token: turnstileToken,
      loadState: turnstileLoadState,
    });
    if (!signupAllowsSubmit(gate)) {
      setResetNotice(
        gate === "wait-load"
          ? "Security check is still loading. Hang on a moment, then try again."
          : IMPORTED_RESET_CHECK_MESSAGE,
      );
      requestAnimationFrame(() => scrollToTurnstileChallenge());
      return;
    }
    setSendingReset(true);
    setResetNotice(null);
    const result = await postImportedAccount({
      email: email.trim(),
      action: "send-reset",
      turnstileToken,
    });
    resetChallenge();
    setSendingReset(false);
    if (result.status === 429) {
      setResetNotice(result.body.error || IMPORTED_RESET_LIMIT_MESSAGE);
      return;
    }
    if (result.body.sent) {
      setStatus("reset-sent");
      setMessage(IMPORTED_RESET_SENT_MESSAGE);
      setResetNotice(null);
      return;
    }
    setResetNotice(result.body.error || IMPORTED_RESET_FAILED_MESSAGE);
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

        {fromOnboardingBounce && (
          <div className="rounded-2xl border border-aurora/30 bg-aurora/10 px-4 py-3 text-sm text-white/85">
            <p className="font-medium text-white">Create your fan account first</p>
            <p className="mt-1 text-xs text-white/70">
              Nothing&apos;s lost — after you sign in you&apos;ll finish your
              profile (about a minute), then jump into the artist experience with your
              signup points.
            </p>
          </div>
        )}

        {ageBlocked ? (
          <p role="status" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/75">
            {AGE_BLOCKED_MESSAGE}
          </p>
        ) : (
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
                if (status === "set-password" || status === "reset-sent") {
                  setStatus("idle");
                  setMessage("");
                  setResetNotice(null);
                  setSendingReset(false);
                }
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
          <div className="space-y-1">
            <label htmlFor="password" className="block text-xs uppercase tracking-wide text-white/60">Password</label>
            <PasswordInput
              id="password"
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
          </div>

          <fieldset className="space-y-1">
            <legend className="text-xs uppercase tracking-wide text-white/60">Date of birth</legend>
            <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-2">
              {[
                { label: "Month", value: birthMonth, set: setBirthMonth, max: 2, auto: "bday-month", ph: "MM" },
                { label: "Day", value: birthDay, set: setBirthDay, max: 2, auto: "bday-day", ph: "DD" },
                { label: "Year", value: birthYear, set: setBirthYear, max: 4, auto: "bday-year", ph: "YYYY" },
              ].map((f) => (
                <input
                  key={f.label}
                  type="text"
                  inputMode="numeric"
                  autoComplete={f.auto}
                  aria-label={`Birth ${f.label.toLowerCase()}`}
                  maxLength={f.max}
                  value={f.value}
                  onChange={(e) => {
                    f.set(e.target.value.replace(/\D/g, ""));
                    if (birthError) setBirthError(null);
                  }}
                  aria-invalid={!!birthError}
                  className={
                    "w-full rounded-2xl border bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none " +
                    (birthError
                      ? "border-rose-500/60 focus:border-rose-400"
                      : "border-white/10 focus:border-white/40")
                  }
                  placeholder={f.ph}
                />
              ))}
            </div>
            {birthError && <span className="text-xs text-rose-300">{birthError}</span>}
          </fieldset>

          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-white/60">
              Mobile phone <span className="normal-case tracking-normal text-white/40">(optional)</span>
            </span>
            <input
              type="tel"
              name="phone"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              pattern={PHONE_INPUT_PATTERN}
              onChange={(e) => {
                setPhone(e.target.value);
                if (phoneError) setPhoneError(publicSmsOptIn(smsConsent, e.target.value).error);
              }}
              onBlur={() => setPhoneError(publicSmsOptIn(smsConsent, phone).error)}
              aria-invalid={!!phoneError}
              className={
                "w-full rounded-2xl border bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/50 focus:outline-none " +
                (phoneError
                  ? "border-rose-500/60 focus:border-rose-400"
                  : "border-white/10 focus:border-white/40")
              }
              placeholder="+1 (615) 555-0123"
            />
            {phoneError ? (
              <span className="text-xs text-rose-300">{phoneError}</span>
            ) : (
              <span className="text-xs text-white/45">
                Optional. Leave it blank and you can still create your account.
              </span>
            )}
          </label>

          <label className="flex cursor-pointer items-start gap-2.5 text-xs text-white/70">
            <input
              type="checkbox"
              name="sms-consent"
              checked={smsConsent && smsAllowed}
              disabled={!smsAllowed}
              onChange={(e) => setSmsConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-aurora"
            />
            <SmsConsentCopy linkClassName="text-white/85 underline underline-offset-4 hover:text-white" />
          </label>
          {!smsAllowed && (
            <p className="text-xs text-white/45">
              Text alerts are for fans 18 and older.
            </p>
          )}
          {smsAllowed && smsConsent && !phone.trim() && (
            <p className="text-xs text-white/45">
              Add a mobile number if you want texts. The box does not opt you in without one, and you can still create your account.
            </p>
          )}

          {turnstileConfigured && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-white/45">Security check</p>
              <TurnstileWidget
                key={turnstileKey}
                onSuccess={handleTurnstileSuccess}
                onError={handleTurnstileError}
                onStall={handleTurnstileStall}
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
              {turnstileGate === "retry-required" && (
                <p className="text-xs text-white/55">
                  {status === "set-password"
                    ? "Security check is unavailable. Tap Retry — Set your password stays disabled until the check succeeds."
                    : "Security check is unavailable. Tap Retry — Create account stays disabled until the check succeeds."}
                </p>
              )}
              {turnstileGate === "complete-check" && (
                <p className="text-xs text-white/55">
                  {status === "set-password"
                    ? "Complete the security check, then set your password. If it never finishes, use Retry."
                    : "Complete the security check to enable Create account. If it never finishes, use Retry."}
                </p>
              )}
            </div>
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
            <p className="text-xs text-white/55">
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

          {status === "set-password" || status === "reset-sent" ? (
            <div className="space-y-3">
              <p role="status" className="text-sm font-medium text-emerald-200">
                {status === "reset-sent" ? message : IMPORTED_SET_PASSWORD_MESSAGE}
              </p>
              {status === "set-password" && (
                <button
                  type="button"
                  onClick={() => void sendSetPasswordEmail()}
                  disabled={sendingReset || !canSubmitSignup}
                  className="w-full rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-3 text-sm font-semibold text-white shadow-glass disabled:opacity-60"
                >
                  {sendingReset ? "Sending…" : "Set your password"}
                </button>
              )}
              {status === "set-password" && !sendingReset && !canSubmitSignup && (
                <p className="text-center text-xs text-white/50">
                  {turnstileGate === "wait-load"
                    ? "Security check is loading. Set your password enables when it succeeds."
                    : turnstileGate === "complete-check"
                      ? "Complete the security check above, then set your password."
                      : turnstileGate === "retry-required"
                        ? "Tap Retry above. Set your password stays disabled until the security check succeeds."
                        : "Agree to the Terms of Service to enable Set your password."}
                </p>
              )}
              {resetNotice && (
                <p role="alert" className="text-sm text-rose-300">{resetNotice}</p>
              )}
            </div>
          ) : status === "need-signin" ? (
            <Link
              href={loginHref}
              className="block w-full rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-3 text-center text-sm font-semibold text-white shadow-glass"
            >
              Sign in with the password you just created
            </Link>
          ) : (
            <div className="space-y-2">
              <button
                type="submit"
                disabled={status === "loading" || !canSubmitSignup}
                className="w-full rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-3 text-sm font-semibold text-white shadow-glass disabled:opacity-60"
              >
                {signupTurnstileButtonLabel({
                  status: status === "loading" ? "loading" : "idle",
                  gate: turnstileGate,
                })}
              </button>
              {status !== "loading" && !canSubmitSignup && (
                <p className="text-center text-xs text-white/50">
                  {turnstileGate === "wait-load"
                    ? "Security check is loading. Create account enables when it succeeds."
                    : turnstileGate === "complete-check"
                      ? "Complete the security check above to enable Create account."
                      : turnstileGate === "retry-required"
                        ? "Tap Retry above. Create account stays disabled until the security check succeeds."
                        : "Agree to the Terms of Service to enable Create account."}
                </p>
              )}
            </div>
          )}
        </form>
        )}

        {status === "need-signin" && (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
            <p className="text-sm font-semibold text-emerald-200">
              Sign in with the password you just created.
            </p>
          </div>
        )}
        {message && status !== "need-signin" && status !== "set-password" && status !== "reset-sent" && (
          <p
            role={status === "error" ? "alert" : "status"}
            className={`text-sm ${
              status === "error" ? "text-red-300" : "text-emerald-300"
            }`}
          >
            {message}
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
