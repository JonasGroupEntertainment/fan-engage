import { NextResponse } from "next/server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import {
  isStripeEventReplay,
  stripeEventCompletionPatch,
} from "@/lib/stripe-webhook-processed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/webhook
 *
 * Stripe delivery endpoint. Every request is verified against
 * STRIPE_WEBHOOK_SECRET. Every event_id is recorded in stripe_events
 * for idempotency — successful deliveries are replay no-ops.
 * Failed handlers leave processed_at null so Stripe retries re-run.
 *
 *   customer.subscription.created  → flip membership to 'premium',
 *                                    assign founder slot if applicable,
 *                                    award Founding Fan badge
 *   customer.subscription.updated  → sync status (past_due / cancelled /
 *                                    active), period end, cancel-at-end
 *   customer.subscription.deleted  → revert to 'free', clear sub id
 *   invoice.paid                   → extend current_period_end, refresh
 *                                    $5 monthly credit if Premium
 *   invoice.payment_failed         → tier → 'past_due' (retry grace)
 *
 * Configure the endpoint in Stripe dashboard:
 *   URL:      https://<host>/api/stripe/webhook
 *   Events:   customer.subscription.*, invoice.paid, invoice.payment_failed
 *   Secret:   copy into STRIPE_WEBHOOK_SECRET in Vercel env vars.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("stripe/webhook: STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "webhook secret not configured" },
      { status: 500 },
    );
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  // Raw body is required for signature verification — don't parse as JSON.
  const body = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("stripe/webhook: signature verification failed", msg);
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Idempotency check — have we already processed this event?
  const { data: existing } = await admin
    .from("stripe_events")
    .select("id, processed_at")
    .eq("id", event.id)
    .maybeSingle();

  if (isStripeEventReplay(existing?.processed_at)) {
    return NextResponse.json({ ok: true, replay: true });
  }

  // Record the raw event (first sight). We'll mark it processed after
  // the handler runs.
  if (!existing) {
    await admin.from("stripe_events").insert({
      id: event.id,
      type: event.type,
      community_id: extractCommunityId(event),
      fan_id: extractFanId(event),
      payload: event as unknown as Record<string, unknown>,
    });
  }

  let processError: string | null = null;
  try {
    switch (event.type) {
      case "customer.subscription.created":
        await handleSubscriptionCreated(
          event.data.object as Stripe.Subscription,
          admin,
        );
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
          admin,
        );
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
          admin,
        );
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice, admin);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(
          event.data.object as Stripe.Invoice,
          admin,
        );
        break;
      default:
        // Event recorded but we don't process it. Keeps the log useful
        // for debugging + future handler additions.
        break;
    }
  } catch (err) {
    processError = err instanceof Error ? err.message : String(err);
    console.error(`stripe/webhook: ${event.type} handler failed`, processError);
  }

  // Only stamp processed_at after a successful handler. A 500 with
  // processed_at set would make Stripe's retry a replay no-op and leave
  // a paying fan on free (A-P0-1).
  await admin
    .from("stripe_events")
    .update(stripeEventCompletionPatch(processError))
    .eq("id", event.id);

  if (processError) {
    // Return non-2xx so Stripe retries — after retry limits are hit
    // (72h) the event goes dead-letter but the row in stripe_events
    // preserves the payload for manual replay.
    return NextResponse.json({ ok: false, error: processError }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// ─── Metadata extractors ──────────────────────────────────────────────────

function extractCommunityId(event: Stripe.Event): string | null {
  const obj = event.data.object as unknown as {
    metadata?: { community_id?: string };
  };
  return obj.metadata?.community_id ?? null;
}

function extractFanId(event: Stripe.Event): string | null {
  const obj = event.data.object as unknown as {
    metadata?: { fan_id?: string };
  };
  return obj.metadata?.fan_id ?? null;
}

// ─── Event handlers ───────────────────────────────────────────────────────

async function handleSubscriptionCreated(
  sub: Stripe.Subscription,
  admin: SupabaseClient,
) {
  const { fanId, communityId, tier, billingPeriod } = parseSubMetadata(sub);
  if (!fanId || !communityId) {
    console.warn("subscription.created: missing metadata", sub.id);
    return;
  }

  const currentPeriodEnd = subPeriodEnd(sub);

  const updates: Record<string, unknown> = {
    subscription_tier: mapStripeStatus(sub.status),
    stripe_subscription_id: sub.id,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    billing_period: billingPeriod,
  };

  const { error: updErr } = await admin
    .from("fan_community_memberships")
    .update(updates)
    .eq("fan_id", fanId)
    .eq("community_id", communityId);
  if (updErr) throw new Error(`membership update failed: ${updErr.message}`);

  // Referral conversion — award 500 points to the referrer if this fan
  // was referred and their referral is still pending.
  await awardReferralPoints(fanId, admin);

  // Founder slot — only if subscription metadata marks them as a
  // potential founder. The Postgres function serializes concurrent
  // claims per community via advisory lock and returns null if the cap
  // is hit.
  if (tier === "founder") {
    const { data: slot } = await admin.rpc("claim_founder_slot", {
      p_fan_id: fanId,
      p_community_id: communityId,
    });
    if (typeof slot === "number" && slot > 0) {
      // Phase 5e: route through award_community_badge so the fan also
      // gets the +500 pts ledger entry AND the in-app notification.
      // Idempotent — ON CONFLICT DO NOTHING, returns false if already
      // earned in this community (e.g. Stripe retry after a 5xx).
      const { error: awardErr } = await admin.rpc("award_community_badge", {
        p_fan_id: fanId,
        p_slug: "founding-fan",
        p_community_id: communityId,
      });
      if (awardErr) {
        console.warn("founding-fan badge award failed", awardErr);
      }
    }
  }
}

async function handleSubscriptionUpdated(
  sub: Stripe.Subscription,
  admin: SupabaseClient,
) {
  const { fanId, communityId } = parseSubMetadata(sub);
  if (!fanId || !communityId) {
    // Metadata stripped somehow — fall back to lookup by subscription id.
    const { data: row } = await admin
      .from("fan_community_memberships")
      .select("fan_id, community_id")
      .eq("stripe_subscription_id", sub.id)
      .maybeSingle();
    if (!row) {
      console.warn("subscription.updated: no matching membership", sub.id);
      return;
    }
    // Found via sub id — fall through to the UPDATE below.
  }

  const tier = mapStripeStatus(sub.status);
  const updates: Record<string, unknown> = {
    subscription_tier: tier,
    current_period_end: subPeriodEnd(sub),
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
  };

  await admin
    .from("fan_community_memberships")
    .update(updates)
    .eq("stripe_subscription_id", sub.id);
}

async function handleSubscriptionDeleted(
  sub: Stripe.Subscription,
  admin: SupabaseClient,
) {
  // Stripe fires this when the subscription ends (after cancel_at_period_end
  // runs out, or after payment_failed retries exhaust). Revert to free.
  await admin
    .from("fan_community_memberships")
    .update({
      subscription_tier: "free",
      stripe_subscription_id: null,
      cancel_at_period_end: false,
      // Keep current_period_end as the historical end date; a future
      // resubscribe will overwrite it.
    })
    .eq("stripe_subscription_id", sub.id);
}

async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  admin: SupabaseClient,
) {
  // An invoice paid against an active subscription — the canonical
  // signal that the subscription is healthy. If the fan was past_due,
  // this flips them back to premium. Also refresh the $5 monthly credit.
  const subscriptionField = (invoice as unknown as { subscription?: string | null }).subscription;
  const subId = typeof subscriptionField === "string" ? subscriptionField : null;
  if (!subId) return; // Non-subscription invoice — ignore.

  const { data: membership } = await admin
    .from("fan_community_memberships")
    .select(
      "fan_id, community_id, subscription_tier, monthly_credit_refreshed_at",
    )
    .eq("stripe_subscription_id", subId)
    .maybeSingle();
  if (!membership) return;

  const updates: Record<string, unknown> = {
    subscription_tier: "premium",
  };

  // Monthly credit refresh — only if >25 days since last refresh (prevents
  // abuse where a user churns + re-subscribes to re-grant credit).
  const lastRefreshed = membership.monthly_credit_refreshed_at
    ? new Date(membership.monthly_credit_refreshed_at as string).getTime()
    : 0;
  const daysSince = (Date.now() - lastRefreshed) / (1000 * 60 * 60 * 24);
  if (daysSince >= 25) {
    updates.monthly_credit_cents = 500;
    updates.monthly_credit_refreshed_at = new Date().toISOString();

    await admin.from("credit_grants").insert({
      fan_id: membership.fan_id,
      community_id: membership.community_id,
      amount_cents: 500,
      reason: "monthly_refresh",
      stripe_event_id: invoice.id,
    });
  }

  await admin
    .from("fan_community_memberships")
    .update(updates)
    .eq("stripe_subscription_id", subId);
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  admin: SupabaseClient,
) {
  // Card declined — Stripe enters its retry schedule (3-4 attempts over
  // ~14 days). Flip to past_due so the UI can nudge the fan to update
  // their card, but keep access alive during the grace window. When
  // retries are exhausted, Stripe fires subscription.deleted and we
  // revert to 'free'.
  const subscriptionField = (invoice as unknown as { subscription?: string | null }).subscription;
  const subId = typeof subscriptionField === "string" ? subscriptionField : null;
  if (!subId) return;

  await admin
    .from("fan_community_memberships")
    .update({ subscription_tier: "past_due" })
    .eq("stripe_subscription_id", subId);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function parseSubMetadata(sub: Stripe.Subscription) {
  const meta = sub.metadata ?? {};
  return {
    fanId: meta.fan_id ?? null,
    communityId: meta.community_id ?? null,
    tier: (meta.tier as "standard" | "founder" | undefined) ?? "standard",
    billingPeriod:
      (meta.billing_period as "monthly" | "annual" | undefined) ?? "monthly",
  };
}

function subPeriodEnd(sub: Stripe.Subscription): string | null {
  const end = (sub as unknown as { current_period_end?: number }).current_period_end;
  return end ? new Date(end * 1000).toISOString() : null;
}

/**
 * When a referred fan goes Premium, credit 500 points to the referrer and
 * mark the referral as verified. Idempotent — a points_ledger row keyed on
 * source_ref guards against double-award on Stripe webhook replays.
 */
async function awardReferralPoints(
  fanId: string,
  admin: SupabaseClient,
): Promise<void> {
  const { data: referral } = await admin
    .from("referrals")
    .select("id, referrer_id")
    .eq("referred_id", fanId)
    .eq("status", "pending")
    .maybeSingle();

  if (!referral) return;

  const REFERRAL_POINTS = 500;
  const sourceRef = `referral_conversion:${referral.id}`;

  // Guard: skip if we already awarded points for this referral.
  const { data: existing } = await admin
    .from("points_ledger")
    .select("id")
    .eq("source_ref", sourceRef)
    .maybeSingle();

  if (!existing) {
    const { error: ledgerErr } = await admin.from("points_ledger").insert({
      fan_id: referral.referrer_id,
      delta: REFERRAL_POINTS,
      source: "referral",
      source_ref: sourceRef,
      note: "Referred fan went Premium",
    });

    if (ledgerErr) {
      console.warn("referral points_ledger insert failed", ledgerErr.message);
    } else {
      // Mirror the pattern used in award_community_badge: fetch then update.
      const { data: fanRow } = await admin
        .from("fans")
        .select("total_points")
        .eq("id", referral.referrer_id)
        .maybeSingle();

      if (fanRow !== null) {
        await admin
          .from("fans")
          .update({ total_points: (fanRow.total_points ?? 0) + REFERRAL_POINTS })
          .eq("id", referral.referrer_id);
      }
    }
  }

  // Mark converted. Use verified_at (existing schema column) — the status
  // moves to 'verified' which also triggers the award_referral_badges trigger.
  await admin
    .from("referrals")
    .update({
      status: "verified",
      points_awarded: REFERRAL_POINTS,
      verified_at: new Date().toISOString(),
    })
    .eq("id", referral.id);
}

/**
 * Map Stripe subscription.status → our enum. Stripe statuses:
 * trialing | active | past_due | canceled | unpaid | incomplete |
 * incomplete_expired | paused
 */
function mapStripeStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
    case "trialing":
      return "premium";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "cancelled";
    default:
      // 'incomplete' / 'incomplete_expired' / 'paused' — conservative
      // fallback leaves the current tier (use a sentinel and caller can
      // decide). Treat as cancelled for now.
      return "cancelled";
  }
}
