import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authEmailRedirectTo } from "@/lib/app-url";
import { authRateLimitSalt } from "@/lib/auth-rate-limit-policy";
import {
  findAuthUserByEmail,
  handleImportedAccount,
  normalizeAccountEmail,
  type ImportedAccountAction,
} from "@/lib/imported-passwordless";
import { getClientIp } from "@/lib/rate-limit";
import { checkSharedRateLimit } from "@/lib/shared-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITS: Record<ImportedAccountAction, { limit: number; windowSeconds: number }> = {
  classify: { limit: 8, windowSeconds: 15 * 60 },
  "send-reset": { limit: 5, windowSeconds: 15 * 60 },
};

function turnstileConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim());
}

/**
 * Signup probe for the 18 Jun import cohort. The JSON outcome is
 * "set-password" only when the admin lookup shows an imported account
 * that has never signed in. Every other email gets the generic outcome.
 * The reset action calls resetPasswordForEmail with the same captcha
 * binding as /forgot-password, and only after that lookup matches.
 */
export async function POST(request: NextRequest) {
  let action: ImportedAccountAction | null = null;
  let email: string | null = null;
  let turnstileToken: string | null = null;
  try {
    const body = (await request.json()) as {
      action?: unknown;
      email?: unknown;
      turnstileToken?: unknown;
    };
    if (body.action === "classify" || body.action === "send-reset") action = body.action;
    email = normalizeAccountEmail(body.email);
    if (typeof body.turnstileToken === "string") turnstileToken = body.turnstileToken;
  } catch {
    return NextResponse.json({ outcome: "generic" }, { status: 400 });
  }

  if (!action || !email) {
    return NextResponse.json({ outcome: "generic" }, { status: 400 });
  }

  let salt: string;
  try {
    salt = authRateLimitSalt(process.env);
  } catch (error) {
    console.error("[imported-account] rate limit salt missing", error);
    return NextResponse.json({ outcome: "generic" }, { status: 503 });
  }

  const ip = getClientIp(request.headers);
  const limitFor = LIMITS[action];
  const result = await handleImportedAccount({
    action,
    email,
    turnstileToken,
    turnstileConfigured: turnstileConfigured(),
    consumeLimit: async (scope) => {
      // IP budget stops one client from walking the import list. The email
      // budget stops many clients from mailing one address.
      for (const identifier of [ip, email]) {
        const decision = await checkSharedRateLimit({
          scope,
          identifier,
          salt,
          limit: limitFor.limit,
          windowSeconds: limitFor.windowSeconds,
        });
        if (!decision.allowed) return { allowed: false, reason: decision.reason };
      }
      return { allowed: true };
    },
    findUser: (lookupEmail) => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey) throw new Error("auth lookup is not configured");
      return findAuthUserByEmail(lookupEmail, {
        fetch,
        supabaseUrl,
        serviceKey,
      });
    },
    sendReset: async (lookupEmail, captchaToken) => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anon) throw new Error("auth client is not configured");
      const supabase = createClient(supabaseUrl, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await supabase.auth.resetPasswordForEmail(lookupEmail, {
        redirectTo: authEmailRedirectTo("/reset-password"),
        ...(captchaToken ? { captchaToken } : {}),
      });
      return error?.message ?? null;
    },
  });

  return NextResponse.json(result.body, { status: result.status });
}
