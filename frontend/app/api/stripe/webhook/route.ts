import { NextResponse } from "next/server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import {
  invoiceSubscriptionId,
  subscriptionPeriodEndIso,
} from "@/lib/stripe-moved-fields";
import {
  isStripeEventReplay,
  monthlyCreditGrantRow,
  MONTHLY_CREDIT_CENTS,
  referralLedgerOutcome,
  stripeEventCompletionPatch,
  stripeEventInsertOutcome,
  throwIfDbError,
} from "@/lib/stripe-webhook-processed";
import {
  invoiceShouldRefreshCredit,
  shouldGrantConversionPerks,
} from "@/lib/premium-trial";
import { stripeSignatureFailureWarning } from "@/lib/stripe-webhook-signature";

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
 *   customer.subscription.created  → flip membership to 'premium'.
 *                                    Referral points only if already active
 *                                    (no trial). A trial waits.
 *   customer.subscription.updated  → sync status (past_due / cancelled /
 *                                    active), period end, cancel-at-end.
 *                                    First time it becomes active after
 *                                    trialing, past_due, unpaid, or
 *                                    incomplete, grant referral points.
 *   customer.subscription.deleted  → revert to 'free', clear sub id.
 *                                    No perks if it never paid.
 *   invoice.paid                   → refresh the $5 monthly credit when
 *                                    money was collected. The first invoice
 *                                    with amount_paid > 0 also grants
 *                                    referral points.
 *   invoice.payment_failed         → tier → 'past_due' (retry grace).
 *                                    Does not grant perks.
 *
 * Founding Fan is claimed on join/onboarding, not here. This handler
 * does not grant or clear founder slots, and it does not change a
 * subscription's price.
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
    // Event type is unknown: the body failed verification. Log a fixed
    // warning only — never the secret, signature header, or payload.
    console.warn(stripeSignatureFailureWarning(err));
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
    const { error: insertErr } = await admin.from("stripe_events").insert({
      id: event.id,
      type: event.type,
      community_id: extractCommunityId(event),
      fan_id: extractFanId(event),
      payload: event as unknown as Record<string, unknown>,
    });
    // A concurrent delivery may have inserted the row first (duplicate
    // key). Anything else means we cannot track this event, so ask
    // Stripe to retry rather than processing it untracked.
    if (stripeEventInsertOutcome(insertErr) === "failed") {
      console.error("stripe/webhook: event insert failed", insertErr?.message);
      return NextResponse.json(
        { ok: false, error: "event log unavailable" },
        { status: 500 },
      );
    }
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
          event.data.previous_attributes as
            | Partial<Stripe.Subscription>
            | undefined,
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
        await handleInvoicePaid(
          event.data.object as Stripe.Invoice,
          event.id,
          admin,
        );
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
  const { fanId, communityId, billingPeriod } = parseSubMetadata(sub);
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

  const { data: prior, error: priorErr } = await admin
    .from("fan_community_memberships")
    .select("first_paid_at")
    .eq("fan_id", fanId)
    .eq("community_id", communityId)
    .maybeSingle();
  throwIfDbError({ error: priorErr }, "subscription.created membership read");

  const { error: updErr } = await admin
    .from("fan_community_memberships")
    .update(updates)
    .eq("fan_id", fanId)
    .eq("community_id", communityId);
  throwIfDbError({ error: updErr }, "subscription.created membership update");

  // A trial (and any subscription that is not yet active) holds the paid
  // perks until the first real payment. A fan who already paid once does
  // not earn them again.
  if (
    shouldGrantConversionPerks({
      event: "customer.subscription.created",
      status: sub.status,
      alreadyPaid: prior?.first_paid_at != null,
    })
  ) {
    await grantConversionPerks(fanId, admin);
  }
}

/**
 * Referral points for whoever referred this fan. Runs for an already-active
 * checkout, when a trial's first charge succeeds, and when a declined first
 * charge later succeeds. Safe to run twice: the referral ledger is unique.
 *
 * Does not claim or clear a Founding Fan slot, and does not change the
 * subscription price. The free badge is claimed on join/onboarding.
 */
async function grantConversionPerks(fanId: string, admin: SupabaseClient) {
  await awardReferralPoints(fanId, admin);
}

async function handleSubscriptionUpdated(
  sub: Stripe.Subscription,
  previous: Partial<Stripe.Subscription> | undefined,
  admin: SupabaseClient,
) {
  const meta = parseSubMetadata(sub);
  let fanId = meta.fanId;
  let communityId = meta.communityId;

  const { data: bySub, error: readErr } = await admin
    .from("fan_community_memberships")
    .select("fan_id, community_id, first_paid_at")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  throwIfDbError({ error: readErr }, "subscription.updated membership read");

  let row = bySub;
  if (!fanId || !communityId) {
    if (!row) {
      console.warn("subscription.updated: no matching membership", sub.id);
      return;
    }
    fanId = row.fan_id as string;
    communityId = row.community_id as string;
  } else if (!row) {
    // New subscription id not written yet (updated raced ahead of created).
    // Read the membership directly so a fan who already paid is not granted again.
    const { data: byFan, error: fanReadErr } = await admin
      .from("fan_community_memberships")
      .select("fan_id, community_id, first_paid_at")
      .eq("fan_id", fanId)
      .eq("community_id", communityId)
      .maybeSingle();
    throwIfDbError({ error: fanReadErr }, "subscription.updated membership read");
    row = byFan;
  }

  const updates: Record<string, unknown> = {
    subscription_tier: mapStripeStatus(sub.status),
    current_period_end: subPeriodEnd(sub),
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
  };

  const result = await admin
    .from("fan_community_memberships")
    .update(updates)
    .eq("stripe_subscription_id", sub.id);
  throwIfDbError(result, "subscription.updated membership update");

  // First time this subscription becomes active after a trial or a
  // failed charge. past_due → active is the dunning / card-update path
  // that trialing → active does not cover. Already-paid memberships
  // skip this so a later renewal recovery does not grant again.
  if (
    shouldGrantConversionPerks({
      event: "customer.subscription.updated",
      status: sub.status,
      previousStatus: previous?.status ?? null,
      alreadyPaid: row?.first_paid_at != null,
    })
  ) {
    await grantConversionPerks(fanId, admin);
  }
}

async function handleSubscriptionDeleted(
  sub: Stripe.Subscription,
  admin: SupabaseClient,
) {
  // Stripe fires this when the subscription ends (after cancel_at_period_end
  // runs out, or after payment_failed retries exhaust). Revert to free.
  // Do not grant paid perks here. A trial or a declined first charge that
  // ends without a successful payment keeps first_paid_at null.
  const result = await admin
    .from("fan_community_memberships")
    .update({
      subscription_tier: "free",
      stripe_subscription_id: null,
      cancel_at_period_end: false,
      // Keep current_period_end as the historical end date; a future
      // resubscribe will overwrite it.
    })
    .eq("stripe_subscription_id", sub.id);
  throwIfDbError(result, "subscription.deleted membership update");
}

async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  eventId: string,
  admin: SupabaseClient,
) {
  // An invoice paid against an active subscription — the canonical
  // signal that the subscription is healthy. If the fan was past_due,
  // this flips them back to premium. Also refresh the $5 monthly credit.
  const subId = invoiceSubscriptionId(invoice);
  if (!subId) return; // Non-subscription invoice — ignore.

  const { data: membership, error: readErr } = await admin
    .from("fan_community_memberships")
    .select(
      "fan_id, community_id, subscription_tier, monthly_credit_refreshed_at, first_paid_at",
    )
    .eq("stripe_subscription_id", subId)
    .maybeSingle();
  throwIfDbError({ error: readErr }, "invoice.paid membership read");
  if (!membership) return;

  const alreadyPaid = membership.first_paid_at != null;
  // First invoice with money collected. Covers a clean trial conversion
  // and a charge that failed, then succeeded on retry or a new card.
  // Runs before first_paid_at is stamped so a thrown grant is retried.
  const firstRealPayment = shouldGrantConversionPerks({
    event: "invoice.paid",
    amountPaidCents: invoice.amount_paid,
    alreadyPaid,
  });
  if (firstRealPayment) {
    await grantConversionPerks(membership.fan_id as string, admin);
  }

  const nowMs = Date.now();
  const updates: Record<string, unknown> = {
    subscription_tier: "premium",
  };

  // Monthly credit refresh — only if 25 days since last refresh (prevents
  // abuse where a user churns + re-subscribes to re-grant credit).
  // A $0 invoice (the start of a free trial) does not earn the credit.
  const refreshCredit = invoiceShouldRefreshCredit(
    invoice.amount_paid,
    membership.monthly_credit_refreshed_at as string | null,
    nowMs,
  );
  if (refreshCredit) {
    updates.monthly_credit_cents = MONTHLY_CREDIT_CENTS;
    updates.monthly_credit_refreshed_at = new Date(nowMs).toISOString();
  }
  if (firstRealPayment) {
    updates.first_paid_at = new Date(nowMs).toISOString();
  }

  // Membership first: if this fails we throw and Stripe retries, and no
  // ledger row has been written yet. Perks above are idempotent.
  const result = await admin
    .from("fan_community_memberships")
    .update(updates)
    .eq("stripe_subscription_id", subId);
  throwIfDbError(result, "invoice.paid membership update");

  if (!refreshCredit) return;

  // Ledger row is an audit trail. The balance is already set above, so a
  // failed insert is logged but does not fail the event: a retry would
  // skip the refresh (refreshed_at is now recent) and could not repair it.
  const { error: grantErr } = await admin.from("credit_grants").insert(
    monthlyCreditGrantRow({
      fanId: membership.fan_id as string,
      communityId: membership.community_id as string,
      eventId,
    }),
  );
  if (grantErr) {
    console.error("invoice.paid credit_grants insert failed", grantErr.message);
  }
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  admin: SupabaseClient,
) {
  // Card declined — Stripe enters its retry schedule (3-4 attempts over
  // ~14 days). Flip to past_due so the UI can nudge the fan to update
  // their card, but keep access alive during the grace window. Do not
  // grant the credit or referral points. When a later attempt succeeds,
  // invoice.paid and past_due → active grant them once. If retries are
  // exhausted, Stripe fires subscription.deleted and we revert to 'free'
  // with nothing granted. Founding Fan is not granted or cleared here.
  const subId = invoiceSubscriptionId(invoice);
  if (!subId) return;

  const result = await admin
    .from("fan_community_memberships")
    .update({ subscription_tier: "past_due" })
    .eq("stripe_subscription_id", subId);
  throwIfDbError(result, "invoice.payment_failed membership update");
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
  // current_period_end moved onto subscription items in newer Stripe API
  // versions; the helper reads the new spot and falls back to the old one.
  return subscriptionPeriodEndIso(sub);
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
  const { data: referral, error: referralErr } = await admin
    .from("referrals")
    .select("id, referrer_id")
    .eq("referred_id", fanId)
    .eq("status", "pending")
    .maybeSingle();
  throwIfDbError({ error: referralErr }, "referral read");

  if (!referral) return;

  const REFERRAL_POINTS = 500;
  const sourceRef = `referral_conversion:${referral.id}`;

  // Guard: skip if we already awarded points for this referral.
  const { data: existing, error: existingErr } = await admin
    .from("points_ledger")
    .select("id")
    .eq("source_ref", sourceRef)
    .maybeSingle();
  throwIfDbError({ error: existingErr }, "referral ledger read");

  if (!existing) {
    const { error: ledgerErr } = await admin.from("points_ledger").insert({
      fan_id: referral.referrer_id,
      delta: REFERRAL_POINTS,
      source: "referral",
      source_ref: sourceRef,
      note: "Referred fan went Premium",
    });

    const outcome = referralLedgerOutcome(ledgerErr);
    if (outcome === "failed") {
      throw new Error(
        `referral points_ledger insert failed: ${ledgerErr?.message ?? "unknown"}`,
      );
    }
    if (outcome === "inserted") {
      // Mirror the pattern used in award_community_badge: fetch then update.
      const { data: fanRow, error: fanReadErr } = await admin
        .from("fans")
        .select("total_points")
        .eq("id", referral.referrer_id)
        .maybeSingle();
      throwIfDbError({ error: fanReadErr }, "referral fan read");

      if (fanRow !== null) {
        const { error: bumpErr } = await admin
          .from("fans")
          .update({ total_points: (fanRow.total_points ?? 0) + REFERRAL_POINTS })
          .eq("id", referral.referrer_id);
        // The ledger row is the idempotency key. A failed total bump is
        // logged; throwing would retry, see the ledger row, and skip the
        // bump again. The unique index still stops a second award.
        if (bumpErr) {
          console.warn("referral total_points update failed", bumpErr.message);
        }
      }
    }
  }

  // Mark converted. Use verified_at (existing schema column) — the status
  // moves to 'verified' which also triggers the award_referral_badges trigger.
  // Only reached after the ledger row exists, so a retry cannot pay twice
  // and a failed insert cannot mark the referral done with no points.
  const { error: verifyErr } = await admin
    .from("referrals")
    .update({
      status: "verified",
      points_awarded: REFERRAL_POINTS,
      verified_at: new Date().toISOString(),
    })
    .eq("id", referral.id);
  throwIfDbError({ error: verifyErr }, "referral verify");
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
