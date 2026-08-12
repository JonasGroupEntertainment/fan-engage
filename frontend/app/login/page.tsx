"use client";

import { Suspense, useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APP_URL } from "@/lib/app-url";
import {
  TurnstileWidget,
  isTurnstileConfigured,
  turnstileFailureMessage,
  verifyTurnstileToken,
} from "@/components/turnstile-widget";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-12">
      <div className="glass-card p-8 text-center text-sm text-white/60">Loading…</div>
    </main>
  );
}

function LoginForm() {
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
  const [turnstileKey, setTurnstileKey] = useState(0);
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

  // Secondary door: magic link. Turnstile only on this path.
  async function handleMagicLink() {
    if (magicLinkCooldown > 0) return;
    if (!email) {
      setStatus("error");
      setMessage("Enter an email first.");
      return;
    }
    if (turnstileConfigured && !turnstileToken) {
      setStatus("error");
      setMessage("Complete the security check below, then send a magic link.");
      return;
    }
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
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${APP_URL}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) throw error;
      setStatus("magic-sent");
      setMessage(
        "Magic link sent. Check your email — use the newest link; requesting another one invalidates the previous one.",
      );
      startMagicLinkCooldown();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unable to send magic link.");
    }
  }

  const magicLinkDisabled =
    status === "loading" ||
    magicLinkCooldown > 0 ||
    (turnstileConfigured && !turnstileToken);

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="glass-card space-y-6 p-8">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-white/60">Fan Engage</p>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Welcome back
          </h1>
          <p className="text-sm text-white/70">Sign in with your email and password.</p>
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

          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-xs text-white/60 hover:text-white hover:underline">
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-3 text-sm font-semibold text-white shadow-glass disabled:opacity-60"
          >
            {status === "loading" ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="space-y-3 border-t border-white/10 pt-5">
          <p className="text-xs text-white/50">
            Prefer a passwordless email link? Complete the security check, then we&apos;ll
            send one. Use the newest link — each request invalidates the previous one.
          </p>

          {turnstileConfigured && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-white/45">Security check</p>
              <TurnstileWidget
                key={turnstileKey}
                onSuccess={handleTurnstileSuccess}
                onError={handleTurnstileError}
                onExpire={handleTurnstileExpire}
                theme="dark"
              />
              {turnstileError && (
                <p className="text-xs text-rose-300">
                  Security check failed. Please refresh and try again.
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleMagicLink}
            disabled={magicLinkDisabled}
            className="w-full rounded-full border border-white/15 px-4 py-2.5 text-sm font-medium text-white/70 hover:bg-white/5 disabled:opacity-50"
          >
            {magicLinkCooldown > 0
              ? `Resend magic link in ${magicLinkCooldown}s`
              : status === "magic-sent"
                ? "Resend magic link"
                : turnstileConfigured && !turnstileToken
                  ? "Complete security check for magic link"
                  : "Email me a magic link instead"}
          </button>
        </div>

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
