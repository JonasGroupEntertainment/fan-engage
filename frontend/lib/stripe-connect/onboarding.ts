import "server-only";

import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe Connect onboarding helpers.
 *
 * Server-only. Never import from a client component — the Stripe singleton
 * uses STRIPE_SECRET_KEY which must not be exposed to the browser.
 *
 * All functions in this module require FEATURE_STRIPE_CONNECT to be enabled.
 * The flag lets us merge this code to main without exposing the flow to fans
 * until KYB has cleared and we've smoke-tested in test mode.
 */

const FEATURE_FLAG_ENV = "FEATURE_STRIPE_CONNECT";

function assertFeatureEnabled(): void {
    if (process.env[FEATURE_FLAG_ENV] !== "true") {
          throw new Error(
                  `Stripe Connect is gated on ${FEATURE_FLAG_ENV}=true — set the env var in Vercel before exposing this flow to users.`,
                );
    }
}

function requireConnectUrls(): { refresh: string; return: string } {
    const refresh = process.env.STRIPE_CONNECT_REFRESH_URL;
    const ret = process.env.STRIPE_CONNECT_RETURN_URL;
    if (!refresh) {
          throw new Error("STRIPE_CONNECT_REFRESH_URL is not set.");
    }
    if (!ret) {
          throw new Error("STRIPE_CONNECT_RETURN_URL is not set.");
    }
    return { refresh, return: ret };
}

export async function getOrCreateConnectAccount(opts: {
    artistSlug: string;
    contactEmail: string;
}): Promise<{ accountId: string; isNew: boolean }> {
    assertFeatureEnabled();
    const supabase = createAdminClient();

  const { data: artist, error: readErr } = await supabase
      .from("artists")
      .select("slug, stripe_account_id, name")
      .eq("slug", opts.artistSlug)
      .single();

  if (readErr || !artist) {
        throw new Error(`Artist not found: ${opts.artistSlug}`);
  }

  if (artist.stripe_account_id) {
        return { accountId: artist.stripe_account_id, isNew: false };
  }

  const stripe = getStripe();
    const account = await stripe.accounts.create({
          type: "express",
          country: "US",
          email: opts.contactEmail,
          capabilities: {
                  transfers: { requested: true },
                  card_payments: { requested: true },
          },
          business_profile: {
                  name: artist.name ?? opts.artistSlug,
                  product_description:
                            "Music fan-club platform — receives revenue share for merch sales and paid memberships.",
          },
          metadata: {
                  artist_slug: artist.slug,
                  platform: "fan-engage",
          },
    });

  const { error: updateErr } = await supabase
      .from("artists")
      .update({
              stripe_account_id: account.id,
              stripe_account_type: "express",
              stripe_account_created_at: new Date().toISOString(),
      })
      .eq("slug", opts.artistSlug);

  if (updateErr) {
        console.error("[stripe-connect] DB update failed", { artistSlug: opts.artistSlug, accountId: account.id, error: updateErr });
        throw new Error("Stripe account was created but we failed to link it to the artist row.");
  }

  return { accountId: account.id, isNew: true };
}

export async function createOnboardingLink(opts: {
    accountId: string;
}): Promise<{ url: string; expiresAt: number }> {
    assertFeatureEnabled();
    const { refresh, return: ret } = requireConnectUrls();
    const stripe = getStripe();
    const link = await stripe.accountLinks.create({
          account: opts.accountId,
          refresh_url: refresh,
          return_url: ret,
          type: "account_onboarding",
    });
    return { url: link.url, expiresAt: link.expires_at };
}

export async function refreshOnboardingLink(opts: {
    accountId: string;
}): Promise<{ url: string; expiresAt: number }> {
    return createOnboardingLink(opts);
}

export async function syncAccountStatus(opts: {
    artistSlug: string;
}): Promise<{
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
}> {
    assertFeatureEnabled();
    const supabase = createAdminClient();

  const { data: artist, error: readErr } = await supabase
      .from("artists")
      .select("stripe_account_id")
      .eq("slug", opts.artistSlug)
      .single();

  if (readErr || !artist?.stripe_account_id) {
        throw new Error(`Artist ${opts.artistSlug} has no Stripe account to sync.`);
  }

  const stripe = getStripe();
    const account = await stripe.accounts.retrieve(artist.stripe_account_id);

  const flags = {
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
  };

  const { error: updateErr } = await supabase
      .from("artists")
      .update({
              stripe_charges_enabled: flags.chargesEnabled,
              stripe_payouts_enabled: flags.payoutsEnabled,
              stripe_details_submitted: flags.detailsSubmitted,
      })
      .eq("slug", opts.artistSlug);

  if (updateErr) {
        console.error("[stripe-connect] Failed to sync account flags", {
                artistSlug: opts.artistSlug,
                accountId: artist.stripe_account_id,
                error: updateErr,
        });
  }

  return flags;
}
