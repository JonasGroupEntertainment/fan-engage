/**
 * One-time resync of fan_community_memberships.current_period_end.
 *
 * Do not run this from CI or from an agent. Kevin runs it once, after
 * the webhook deploy, against production:
 *
 *   cd frontend
 *   # dry run (prints the rows it would change; writes nothing)
 *   STRIPE_SECRET_KEY=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node --experimental-strip-types scripts/resync-stripe-current-period-end.ts
 *
 *   # write
 *   ... node --experimental-strip-types scripts/resync-stripe-current-period-end.ts --apply
 *
 * Targets memberships whose current_period_end is null and whose tier is
 * premium, past_due, or cancelled, plus any row that already has a
 * stripe_subscription_id. For a row with no subscription id, the fan's
 * stripe_customer_id is listed in Stripe and matched on
 * metadata.community_id (or the only subscription on that customer).
 *
 * Reads current_period_end from subscription items first, then the
 * legacy top-level field. Also writes subscription_tier and
 * cancel_at_period_end from that subscription. Does not grant points,
 * credits, or Founding Fan status.
 */

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { subscriptionPeriodEndIso } from "../lib/stripe-moved-fields.ts";
import { mapStripeSubscriptionStatus } from "../lib/stripe-membership-period.ts";

const APPLY = process.argv.includes("--apply");

type MembershipRow = {
  fan_id: string;
  community_id: string;
  subscription_tier: string;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const stripe = new Stripe(required("STRIPE_SECRET_KEY"), {
    apiVersion: "2026-03-25.dahlia",
    typescript: true,
  });
  const admin = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await admin
    .from("fan_community_memberships")
    .select(
      "fan_id, community_id, subscription_tier, stripe_subscription_id, current_period_end, cancel_at_period_end",
    )
    .or(
      "stripe_subscription_id.not.is.null,subscription_tier.in.(premium,past_due,cancelled)",
    );
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as MembershipRow[]).filter(
    (row) => row.current_period_end == null || row.stripe_subscription_id,
  );

  const fanIds = [...new Set(rows.map((row) => row.fan_id))];
  const customerByFan = new Map<string, string>();
  for (let i = 0; i < fanIds.length; i += 100) {
    const slice = fanIds.slice(i, i + 100);
    const { data: fans, error: fanErr } = await admin
      .from("fans")
      .select("id, stripe_customer_id")
      .in("id", slice);
    if (fanErr) throw new Error(fanErr.message);
    for (const fan of fans ?? []) {
      if (typeof fan.stripe_customer_id === "string" && fan.stripe_customer_id) {
        customerByFan.set(fan.id as string, fan.stripe_customer_id);
      }
    }
  }

  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const sub = await resolveSubscription(stripe, row, customerByFan.get(row.fan_id) ?? null);
    if (!sub) {
      skipped += 1;
      console.log(
        JSON.stringify({
          fan_id: row.fan_id,
          community_id: row.community_id,
          result: "no-subscription",
        }),
      );
      continue;
    }
    const periodEnd = subscriptionPeriodEndIso(sub);
    const patch = {
      stripe_subscription_id: sub.id,
      subscription_tier:
        sub.status === "canceled" ? "free" : mapStripeSubscriptionStatus(sub.status),
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      ...(periodEnd ? { current_period_end: periodEnd } : {}),
    };
    console.log(
      JSON.stringify({
        fan_id: row.fan_id,
        community_id: row.community_id,
        subscription_id: sub.id,
        apply: APPLY,
        ...patch,
      }),
    );
    if (!APPLY) continue;
    const { error: updErr } = await admin
      .from("fan_community_memberships")
      .update(patch)
      .eq("fan_id", row.fan_id)
      .eq("community_id", row.community_id);
    if (updErr) throw new Error(`${row.fan_id}/${row.community_id}: ${updErr.message}`);
    updated += 1;
  }

  console.log(
    JSON.stringify({
      mode: APPLY ? "apply" : "dry-run",
      considered: rows.length,
      updated,
      skipped,
    }),
  );
}

async function resolveSubscription(
  stripe: Stripe,
  row: MembershipRow,
  customerId: string | null,
): Promise<Stripe.Subscription | null> {
  if (row.stripe_subscription_id) {
    return stripe.subscriptions.retrieve(row.stripe_subscription_id);
  }
  if (!customerId) return null;
  const listed = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  const mine = listed.data.filter((sub) => {
    const community = sub.metadata?.community_id || sub.metadata?.community_slug;
    return community === row.community_id;
  });
  if (mine.length === 1) return mine[0];
  if (listed.data.length === 1) return listed.data[0];
  return null;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ source: "resync-stripe-current-period-end", error: message }));
  process.exitCode = 1;
});
