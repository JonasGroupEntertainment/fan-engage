"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { authEmailRedirectTo } from "@/lib/app-url";
import { signedInLoginRedirectPath } from "@/lib/session-presence";
import {
  TurnstileWidget,
  isTurnstileConfigured,
  prefetchTurnstileScript,
  turnstileFailureMessage,
  verifyTurnstileToken,
  type TurnstileLoadState,
} from "@/components/turnstile-widget";
import {
  emailReadyForMagicLink,
  magicLinkButtonLabel,
  magicLinkClickAction,
  magicLinkPersistentHelper,
  nextMagicLinkGate,
  scrollToTurnstileChallenge,
  shouldShowParentChallengeError,
} from "@/lib/turnstile-ux";

export function LoginFallback() {
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-12">
      <div className="glass-card p-8 text-center text-sm text-white/60">Loading…</div>
    </main>
  );
}

export function LoginForm({
  magicLinkEnabled,
  forgotPasswordEnabled,
}: {
  magicLinkEnabled: boolean;
  forgotPasswordEnabled: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Only allow same-origin relative paths ("//host" is protocol-relative).
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const signupHref =
    next === "/" ? "/signup" : `/signup?next=${encodeURIComponent(next)}`;

  const turnstileConfigured = isTurnstileConfigured();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Surface errors passed back by /auth/callback (e.g. a failed or
  // rate-limited magic-link exchange) — otherwise they die silently.
  const callbackError = searchParams.get("error");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "magic-sent">(
    callbackError ? "error" : "idle",
  );
  const [message, setMessage] = useState(callbackError ?? "");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const [turnstileLoadState, setTurnstileLoadState] =
    useState<TurnstileLoadState>("loading");
  const [turnstileKey, setTurnstileKey] = useState(0);
  // Don't mount Turnstile until the fan chooses magic-link — keeps the
  // password door above the fold and avoids a blank check on first paint.
  const [magicLinkOpen, setMagicLinkOpen] = useState(false);
  const pendingMagicSend = useRef(false);

  const handleTurnstileSuccess = useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileError(false);
  }, []);
  const handleTurnstileError = useCallback(() => setTurnstileError(true), []);
  const handleTurnstileExpire = useCallback(() => setTurnstileToken(null), []);
  const handleTurnstileLoadState = useCallback((state: TurnstileLoadState) => {
    setTurnstileLoadState(state);
    // Retry remounts into loading while challengeFailed was still true —
    // clear it so "Security check failed…" cannot flash under the skeleton.
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

  // Resending a magic link overwrites the previous one's PKCE verifier, so
  // the older email stops working. Lock the button for a cooldown so a
  // double-click or impatient retry can't silently invalidate a link
  // that's already on its way.
  const MAGIC_LINK_COOLDOWN_SECONDS = 45;
  const [magicLinkCooldown, setMagicLinkCooldown] = useState(0);
  const cooldownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownInterval.current) clearInterval(cooldownInterval.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      return;
    }
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return;
      const dest = signedInLoginRedirectPath({
        user,
        cookies: document.cookie.split(";").map((part) => ({
          name: part.split("=")[0]?.trim() ?? "",
        })),
        nextPath: next,
      });
      if (dest) {
        router.replace(dest);
        router.refresh();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  useEffect(() => {
    if (!magicLinkEnabled || !turnstileConfigured) return;
    prefetchTurnstileScript();
  }, [magicLinkEnabled, turnstileConfigured]);

  useEffect(() => {
    if (!magicLinkEnabled || !magicLinkOpen) return;
    const id = window.requestAnimationFrame(() => scrollToTurnstileChallenge());
    return () => window.cancelAnimationFrame(id);
  }, [magicLinkEnabled, magicLinkOpen]);

  function startMagicLinkCooldown() {
    setMagicLinkCooldown(MAGIC_LINK_COOLDOWN_SECONDS);
    if (cooldownInterval.current) clearInterval(cooldownInterval.current);
    cooldownInterval.current = setInterval(() => {
      setMagicLinkCooldown((s) => {
        if (s <= 1) {
          if (cooldownInterval.current) clearInterval(cooldownInterval.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  // Primary door: email + password. No Turnstile — least-confused path.
  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    pendingMagicSend.current = false;
    setStatus("loading");
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push(next);
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unable to sign in.");
    }
  }

  const magicGate = nextMagicLinkGate({
    configured: turnstileConfigured,
    revealed: magicLinkOpen && emailReadyForMagicLink(email),
    token: turnstileToken,
    loadState: turnstileLoadState,
  });
  const persistentHelper = magicLinkPersistentHelper({
    gate: magicGate,
    loadState: turnstileLoadState,
    challengeFailed: turnstileError,
  });
  const showParentChallengeError = shouldShowParentChallengeError({
    loadState: turnstileLoadState,
    challengeFailed: turnstileError,
  });

  async function sendMagicLink(token: string | null) {
    if (!magicLinkEnabled) return;
    setStatus("loading");
    setMessage("");

    const captcha = await verifyTurnstileToken(token);
    resetChallenge();
    if (!captcha.success) {
      pendingMagicSend.current = false;
      setStatus("error");
      setMessage(turnstileFailureMessage(captcha.error));
      requestAnimationFrame(() => scrollToTurnstileChallenge());
      return;
    }
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: authEmailRedirectTo(next),
        },
      });
      if (error) throw error;
      pendingMagicSend.current = false;
      setStatus("magic-sent");
      setMessage(
        "Magic link sent. Check your email — use the newest link; requesting another one invalidates the previous one.",
      );
      startMagicLinkCooldown();
    } catch (err) {
      pendingMagicSend.current = false;
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unable to send magic link.");
    }
  }

  // Secondary door: magic link. Turnstile only on this path.
  async function handleMagicLink() {
    if (!magicLinkEnabled) return;
    if (magicLinkCooldown > 0 || status === "loading") return;
    const action = magicLinkClickAction({
      email,
      configured: turnstileConfigured,
      revealed: magicLinkOpen,
      token: turnstileToken,
      loadState: turnstileLoadState,
    });
    if (action === "need-email") {
      setStatus("error");
      setMessage("Enter an email first.");
      return;
    }

    if (action === "reveal") {
      pendingMagicSend.current = true;
      setMagicLinkOpen(true);
      setStatus("idle");
      setMessage("");
      return;
    }

    if (action !== "send") {
      pendingMagicSend.current = true;
      // Widget / helper / button label already explain wait, retry, and
      // complete-check — don't stack a second error line on the page.
      requestAnimationFrame(() => scrollToTurnstileChallenge());
      return;
    }

    pendingMagicSend.current = false;
    await sendMagicLink(turnstileToken);
  }

  // Completing the check after the first tap should send without a second click.
  useEffect(() => {
    if (!magicLinkEnabled) return;
    if (!pendingMagicSend.current || !turnstileToken || magicLinkCooldown > 0) return;
    if (status === "loading") return;
    pendingMagicSend.current = false;
    void sendMagicLink(turnstileToken);
    // sendMagicLink is recreated each render; token is the trigger we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magicLinkEnabled, turnstileToken]);

  const magicLinkDisabled = status === "loading" || magicLinkCooldown > 0;

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="glass-card space-y-6 p-8">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-white/60">Fan Engage</p>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Welcome back
          </h1>
          <p className="text-sm text-white/70">Sign in with your email and password.</p>
          <p className="text-xs text-white/45">
            Google &amp; Apple sign-in coming soon — use email for now.
          </p>
        </div>

        <form onSubmit={handlePassword} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-white/60">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
              placeholder="you@email.com"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-white/60">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
              placeholder="••••••••"
            />
          </label>

          {forgotPasswordEnabled && (
            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-xs text-white/60 hover:text-white hover:underline">
                Forgot password?
              </Link>
            </div>
          )}

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-3 text-sm font-semibold text-white shadow-glass disabled:opacity-60"
          >
            {status === "loading" ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/*
          Magic-link MUST stay outside the password <form> as type="button".
          If it were type="submit" (or inside the form), an empty required
          password field would HTML5-block the click — BEP Guide regression.
          Email is shared via React state from the field above; no form submit.
          Hidden in production until PKCE is proven — do not leave a dead
          button that still sends OTP mail.
        */}
        {magicLinkEnabled && (
          <div className="space-y-3 border-t border-white/10 pt-5">
            <p className="text-xs text-white/50">
              Prefer a passwordless email link? We&apos;ll send it to the{" "}
              <span className="text-white/70">Email address above</span>
              {magicLinkOpen && turnstileLoadState !== "error" && !turnstileError
                ? ". Complete the security check, then send."
                : "."}{" "}
              Use the newest link — each request invalidates the previous one.
            </p>

            {turnstileConfigured && magicLinkOpen && emailReadyForMagicLink(email) && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-white/45">Security check</p>
                <TurnstileWidget
                  key={turnstileKey}
                  onSuccess={handleTurnstileSuccess}
                  onError={handleTurnstileError}
                  onExpire={handleTurnstileExpire}
                  onLoadStateChange={handleTurnstileLoadState}
                  theme="dark"
                />
                {showParentChallengeError && (
                  <p className="text-xs text-rose-300">
                    Security check failed. Retry above, or sign in with your password.
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleMagicLink()}
              disabled={magicLinkDisabled}
              className="w-full rounded-full border border-white/15 px-4 py-2.5 text-sm font-medium text-white/70 hover:bg-white/5 disabled:opacity-50"
            >
              {magicLinkButtonLabel({
                cooldown: magicLinkCooldown,
                status,
                gate: magicGate,
              })}
            </button>
          </div>
        )}

        {magicLinkEnabled && persistentHelper && status !== "error" && status !== "magic-sent" && (
          <p className="text-sm text-emerald-300">{persistentHelper}</p>
        )}
        {message && (
          <p
            className={`text-sm ${
              status === "error" ? "text-red-300" : "text-emerald-300"
            }`}
          >
            {message}
          </p>
        )}

        <p className="text-center text-sm text-white/60">
          New fan?{" "}
          <Link href={signupHref} className="text-white underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
