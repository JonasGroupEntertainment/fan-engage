"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PasswordInput } from "@/components/password-input";
import { useRouter, useSearchParams } from "next/navigation";
import { ensureImportedFanMembership } from "@/app/auth/ensure-membership";
import { isAuthEmailOtpType } from "@/lib/auth-callback";
import { resetPageState, type ResetPageState } from "@/lib/reset-session";
import { createClient } from "@/lib/supabase/client";

const PASSWORD_TOO_SHORT = "Password must be at least 8 characters.";
const PASSWORDS_DO_NOT_MATCH = "Passwords do not match.";

export default function ResetPasswordForm({
  forgotPasswordEnabled,
}: {
  forgotPasswordEnabled: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sessionState, setSessionState] = useState<"checking" | ResetPageState>("checking");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [message, setMessage] = useState("");
  // Recovery token from our own reset email. Kept in memory and only used on
  // submit, so a mail scanner opening the link can't burn it.
  const recoveryTokenHash = useRef<string | null>(null);
  // True once this page load itself opened a valid emailed link.
  const linkOpenedHere = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const code = searchParams.get("code");
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");

    async function boot() {
      if (recoveryTokenHash.current) {
        setSessionState("ready");
        return;
      }
      try {
        if (tokenHash && type === "recovery") {
          recoveryTokenHash.current = tokenHash;
          window.history.replaceState(null, "", "/reset-password");
          if (!cancelled) setSessionState("ready");
          return;
        }
        if (tokenHash && isAuthEmailOtpType(type)) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });
          if (error) throw error;
          linkOpenedHere.current = true;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          linkOpenedHere.current = true;
        }
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session && (code || tokenHash)) {
          window.history.replaceState(null, "", "/reset-password");
        }
        // A session from an ordinary password sign-in may not set a new
        // password here. That needs a reset link.
        const next = resetPageState({
          linkOpenedHere: linkOpenedHere.current,
          accessToken: session?.access_token ?? null,
        });
        if (next === "ready") {
          try {
            await ensureImportedFanMembership();
          } catch {
            // Setting a password still works if the membership repair cannot run.
          }
        }
        if (cancelled) return;
        setSessionState(next);
      } catch {
        if (!cancelled) setSessionState("missing");
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setStatus("error");
      setMessage(PASSWORD_TOO_SHORT);
      return;
    }
    if (password !== confirmPassword) {
      setStatus("error");
      setMessage(PASSWORDS_DO_NOT_MATCH);
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const supabase = createClient();
      if (recoveryTokenHash.current) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: recoveryTokenHash.current,
          type: "recovery",
        });
        if (verifyError) {
          setStatus("error");
          setMessage("This reset link has expired or was already used. Ask for a new one.");
          return;
        }
        recoveryTokenHash.current = null;
        linkOpenedHere.current = true;
        try {
          await ensureImportedFanMembership();
        } catch {
          // Setting a password still works if the membership repair cannot run.
        }
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const allowed = resetPageState({
        linkOpenedHere: linkOpenedHere.current,
        accessToken: session?.access_token ?? null,
      });
      if (allowed !== "ready") {
        setStatus("idle");
        setSessionState(allowed);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setStatus("done");
      setMessage("Your password has been updated. Redirecting to sign in…");
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unable to update password.");
    }
  }

  // Live checks. "Do not match" waits until the second field has something
  // in it, so it does not nag while the first one is being typed.
  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const repeatsLiveHint =
    (mismatch && message === PASSWORDS_DO_NOT_MATCH) || (tooShort && message === PASSWORD_TOO_SHORT);

  if (sessionState === "checking") {
    return (
      <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-12">
        <div className="glass-card p-8 text-center text-sm text-white/60">Loading…</div>
      </main>
    );
  }

  if (sessionState === "needs_link") {
    return (
      <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-6 px-6 py-12">
        <div className="glass-card space-y-6 p-8">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-wide text-white/60">Fan Engage</p>
            <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              Use a reset link
            </h1>
            <p className="text-sm text-white/70">
              To keep your account safe, a new password needs a reset link sent to your
              email. Ask for one, then open it in this browser.
            </p>
          </div>
          <Link
            href="/forgot-password"
            className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-3 text-sm font-semibold text-white shadow-glass"
          >
            Send me a reset link
          </Link>
          <p className="text-center text-sm text-white/60">
            <Link href="/" className="text-white underline-offset-4 hover:underline">
              Back to home
            </Link>
          </p>
        </div>
      </main>
    );
  }

  if (sessionState === "missing") {
    return (
      <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-6 px-6 py-12">
        <div className="glass-card space-y-6 p-8">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-wide text-white/60">Fan Engage</p>
            <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              Reset link expired
            </h1>
            <p className="text-sm text-white/70">
              This password reset link is invalid or has already been used. Request a new
              one and open it in the same browser.
            </p>
          </div>
          <Link
            href={forgotPasswordEnabled ? "/forgot-password" : "/login"}
            className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-3 text-sm font-semibold text-white shadow-glass"
          >
            {forgotPasswordEnabled ? "Request a new reset link" : "Back to sign in"}
          </Link>
          <p className="text-center text-sm text-white/60">
            Remember your password?{" "}
            <Link href="/login" className="text-white underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="glass-card space-y-6 p-8">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-white/60">Fan Engage</p>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Set a new password
          </h1>
          <p className="text-sm text-white/70">Choose a new password for your account.</p>
        </div>

        {/* noValidate: the browser's own checks block the button without
            saying why on a phone. The messages below say why instead. */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="new-password" className="block text-xs uppercase tracking-wide text-white/60">New password</label>
            <PasswordInput
              id="new-password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="confirm-password" className="block text-xs uppercase tracking-wide text-white/60">Confirm password</label>
            <PasswordInput
              id="confirm-password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          {/* Shown as the fan types, right under the fields and above the
              button, so the keyboard never hides them. */}
          {tooShort && (
            <p className="text-sm text-red-300" role="status" data-password-too-short>
              {PASSWORD_TOO_SHORT}
            </p>
          )}
          {mismatch && (
            <p className="text-sm text-red-300" role="status" data-password-mismatch>
              {PASSWORDS_DO_NOT_MATCH}
            </p>
          )}

          <button
            type="submit"
            disabled={status === "loading" || status === "done"}
            className="w-full rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-3 text-sm font-semibold text-white shadow-glass disabled:opacity-60"
          >
            {status === "loading" ? "Updating…" : "Update password"}
          </button>
        </form>

        {message && !repeatsLiveHint && (
          <p
            role={status === "error" ? "alert" : "status"}
            className={`text-sm ${
              status === "error" ? "text-red-300" : "text-emerald-300"
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
