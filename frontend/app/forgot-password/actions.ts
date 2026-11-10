"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { authRateLimitSalt } from "@/lib/auth-rate-limit-policy";
import { getClientIp } from "@/lib/rate-limit";
import { checkSharedRateLimit } from "@/lib/shared-rate-limit";
import { turnstileUpstreamFailOpen } from "@/lib/turnstile-verify-policy";
import { authEmailRedirectTo, resolveAppUrl } from "@/lib/app-url";
import { mandrillConfigured, sendMandrillBatch } from "@/lib/email/transactional";
import {
  RESET_NEUTRAL_MESSAGE,
  buildResetEmail,
  buildResetLink,
} from "@/lib/password-reset-email";

export type ResetRequestResult = { ok: boolean; message: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const RESET_LIMIT = 5;
const RESET_WINDOW_SECONDS = 15 * 60;
const APP_NAME = "Fan Engage Pro";

async function turnstilePassed(token: string | null, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body: form });
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  } catch (error) {
    console.error("[forgot-password] turnstile unavailable", error);
    return turnstileUpstreamFailOpen({
      failOpenEnv: process.env.TURNSTILE_FAIL_OPEN,
      failClosedRequest: false,
      vercelEnv: process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV,
    });
  }
}

/** True when this request may go ahead. Only a spent budget blocks it. */
async function underRateLimit(ip: string, email: string): Promise<boolean> {
  try {
    const decision = await checkSharedRateLimit({
      scope: "password-reset",
      identifier: `${ip}:${email}`,
      limit: RESET_LIMIT,
      windowSeconds: RESET_WINDOW_SECONDS,
      salt: authRateLimitSalt(process.env),
    });
    return decision.allowed || decision.reason !== "exhausted";
  } catch (error) {
    console.error("[forgot-password] rate limit unavailable", error);
    return true;
  }
}

/**
 * Sends our own reset link (/reset-password?token_hash=...) so the token is
 * only used when the person submits a new password. Mail scanners that open
 * every link can't burn it. Always answers with the same neutral message so
 * the form never reveals which emails have accounts. Never logs the email.
 */
async function sendResetLink(email: string): Promise<void> {
  const admin = createAdminClient();
  if (!mandrillConfigured()) {
    const { error } = await admin.auth.resetPasswordForEmail(email, {
      redirectTo: authEmailRedirectTo("/reset-password"),
    });
    if (error) console.warn("[forgot-password] supabase reset failed:", error.message);
    return;
  }

  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    // Usually "user not found". Stay quiet so the reply stays neutral.
    return;
  }
  const link = buildResetLink(resolveAppUrl(), tokenHash);
  const mail = buildResetEmail(APP_NAME, link);
  const result = await sendMandrillBatch(
    [{ id: "reset", email, name: "", ...mail }],
    ["password-reset"],
  );
  const failed = result.error ?? result.outcomes.find((o) => !o.ok)?.error;
  if (failed) console.warn("[forgot-password] reset email failed:", failed);
}

export async function requestPasswordResetAction(
  rawEmail: string,
  turnstileToken: string | null,
): Promise<ResetRequestResult> {
  const email = String(rawEmail ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }

  const ip = getClientIp(await headers()) ?? "unknown";
  if (!(await underRateLimit(ip, email))) {
    return { ok: false, message: "Too many requests. Try again in a few minutes." };
  }
  if (!(await turnstilePassed(turnstileToken, ip))) {
    return { ok: false, message: "Please complete the security check again." };
  }

  try {
    await sendResetLink(email);
  } catch (error) {
    console.error(
      "[forgot-password] reset request failed:",
      error instanceof Error ? error.message : "unknown error",
    );
  }
  return { ok: true, message: RESET_NEUTRAL_MESSAGE };
}
