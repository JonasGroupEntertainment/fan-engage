import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
    createOnboardingLink,
    getOrCreateConnectAccount,
} from "@/lib/stripe-connect/onboarding";

/**
 * POST /api/stripe/connect/start
 * Body: { artistSlug: string }
 *
 * Idempotently creates a Stripe Connect Express account for the artist (if
 * none exists), then issues a fresh Stripe-hosted onboarding link and
 * returns the URL. Caller is expected to redirect to that URL.
 *
 * Auth: signed in + super-admin OR per-artist admin.
 */
export async function POST(req: NextRequest) {
    let body: { artistSlug?: unknown };
    try {
          body = await req.json();
    } catch {
          return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
    }

  const artistSlug =
        typeof body?.artistSlug === "string" ? body.artistSlug.trim() : "";
    if (!artistSlug) {
          return NextResponse.json({ error: "artistSlug is required." }, { status: 400 });
    }

  const supabase = createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
        return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const allowed = await isAuthorizedForArtist({
        userEmail: user.email ?? "",
        artistSlug,
  });

  if (!allowed) {
        return NextResponse.json({ error: "You are not an admin for this artist." }, { status: 403 });
  }

  const admin = createAdminClient();
    const { data: artist, error: artistErr } = await admin
      .from("artists")
      .select("slug, contact_email, name")
      .eq("slug", artistSlug)
      .single();

  if (artistErr || !artist) {
        return NextResponse.json({ error: `Artist not found: ${artistSlug}` }, { status: 404 });
  }

  const contactEmail = artist.contact_email || user.email;
    if (!contactEmail) {
          return NextResponse.json(
            { error: "No contact_email on the artist row and no email on the signed-in user." },
            { status: 400 },
                );
    }

  try {
        const { accountId, isNew } = await getOrCreateConnectAccount({
                artistSlug,
                contactEmail,
        });
        const link = await createOnboardingLink({ accountId });

      return NextResponse.json({
              accountId,
              isNew,
              onboardingUrl: link.url,
              expiresAt: link.expiresAt,
      });
  } catch (err: unknown) {
        return handleStripeConnectError(err);
  }
}

async function isAuthorizedForArtist(opts: {
    userEmail: string;
    artistSlug: string;
}): Promise<boolean> {
    if (!opts.userEmail) return false;

  const superAdmins = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (superAdmins.includes(opts.userEmail.toLowerCase())) return true;

  // Per-artist admin check. Verify table name on PR review (admin_users vs.
  // whatever the existing /admin/<slug>/* routes use).
  const admin = createAdminClient();
    const { data, error } = await admin
      .from("admin_users")
      .select("artist_slug")
      .eq("email", opts.userEmail.toLowerCase())
      .eq("artist_slug", opts.artistSlug)
      .maybeSingle();

  if (error) {
        console.error("[stripe-connect/start] admin_users lookup failed", error);
        return false;
  }
    return !!data;
}

function handleStripeConnectError(err: unknown): NextResponse {
    const message = err instanceof Error ? err.message : "Unknown error.";

  if (message.includes("FEATURE_STRIPE_CONNECT")) {
        return NextResponse.json({ error: message }, { status: 503 });
  }

  if (message.toLowerCase().includes("stripe")) {
        console.error("[stripe-connect/start] Stripe error", err);
        return NextResponse.json(
          { error: `Stripe rejected the request: ${message}` },
          { status: 502 },
              );
  }

  console.error("[stripe-connect/start] Unexpected error", err);
    return NextResponse.json({ error: message }, { status: 500 });
}
