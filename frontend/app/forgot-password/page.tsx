"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { APP_URL } from "@/lib/app-url";
import {
  TurnstileWidget,
  turnstileFailureMessage,
  verifyTurnstileToken,
} from "@/components/turnstile-widget";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "sent">("idle");
  const [message, setMessage] = useState("");
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      setStatus("error");
      setMessage("Enter your email first.");
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
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${APP_URL}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
      });
      if (error) throw error;
      setStatus("sent");
      setMessage("Check your email for a link to reset your password.");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unable to send reset link.");
    }
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="glass-card space-y-6 p-8">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-white/60">Fan Engage</p>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Reset your password
          </h1>
          <p className="text-sm text-white/70">
            Enter your email and we&apos;ll send you a link to set a new password.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-white/60">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
              placeholder="you@email.com"
            />
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
            disabled={status === "loading"}
            className="w-full rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-3 text-sm font-semibold text-white shadow-glass disabled:opacity-60"
          >
            {status === "loading" ? "Sending…" : "Send reset link"}
          </button>
        </form>

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
          Remembered your password?{" "}
          <Link href="/login" className="text-white underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
