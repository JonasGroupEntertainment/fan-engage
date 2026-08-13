import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fanDataRateLimiter, getClientIp } from "@/lib/rate-limit";
import { awardPoints } from "@/lib/points/award";
import { REFERRAL_JOIN_POINTS } from "@/lib/launch-catalog";

export const runtime = "nodejs";

const POINTS_SIGNUP_BONUS = 100;

type OnboardPayload = {
  firstName?: string;
  lastName?: string;
  city?: string;
  phone?: string;
  handle?: string;
  musicOutlet?: string;
  interest?: string;
  referralCode?: string; // optional — the ref code that was passed in the invite link
  communitySlug?: string; // optional — artist/community slug the fan joined through
  smsOptedIn?: boolean;
  emailOptedIn?: boolean;
  consentAcceptedAt?: string;
  consentVersion?: string;
};

/**
 * Finalizes an onboarding submission for the currently-signed-in fan.
 * Idempotent: re-submitting updates the fan row and is a no-op for the
 * signup bonus if one has already been awarded.
 */
export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request.headers);
  const rateLimitResult = fanDataRateLimiter.check(clientIp);

  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        error: "Too many onboarding requests. Please try again later.",
        retryAfter: Math.ceil(
          (rateLimitResult.resetTime.getTime() - Date.now()) / 1000,
        ),
      },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(
            (rateLimitResult.resetTime.getTime() - Date.now()) / 1000,
          ).toString(),
          "X-RateLimit-Limit": rateLimitResult.limit.toString(),
          "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
          "X-RateLimit-Reset": rateLimitResult.resetTime.toISOString(),
        },
      },
    );
  }
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const payload = (await request.json()) as OnboardPayload;

    // 1. Update the fan's profile row (created by the auth trigger).
    //
    // The onboarding wizard's "TikTok or Instagram handle" field arrives
    // as payload.handle. We do NOT write that to fans.handle (legacy)
    // — instead we merge it into the socials jsonb column so social
    // identifiers stay in their own field. The URL slug column,
    // fans.profile_slug, is owned by the BEFORE INSERT trigger.
    let socialsMerge: Record<string, unknown> | undefined = undefined;
    if (typeof payload.handle === "string" && payload.handle.trim()) {
      const { data: existing } = await supabase
        .from("fans")
        .select("socials")
        .eq("id", user.id)
        .maybeSingle();
      socialsMerge = {
        ...((existing?.socials as Record<string, unknown> | null) ?? {}),
        instagram_or_tiktok: payload.handle.trim(),
      };
    }

    const updates: Record<string, unknown> = {
      first_name: payload.firstName ?? null,
      last_name: payload.lastName ?? null,
      city: payload.city ?? null,
      phone: payload.phone ?? null,
      music_outlet: payload.musicOutlet ?? null,
      interest: payload.interest ?? null,
      sms_opted_in: Boolean(payload.smsOptedIn),
      email_opted_in: Boolean(payload.emailOptedIn),
      consent_accepted_at: payload.consentAcceptedAt ?? new Date().toISOString(),
      consent_version: payload.consentVersion ?? null,
    };
    if (socialsMerge !== undefined) updates.socials = socialsMerge;

    const { data: fan, error: updateErr } = await supabase
      .from("fans")
      .update(updates)
      .eq("id", user.id)
      .select("id, first_name, current_tier, total_points, profile_slug")
      .single();

    if (updateErr) {
      console.error("onboard: failed to update fan", updateErr);
      return NextResponse.json(
        { error: "Unable to save profile." },
        { status: 500 },
      );
    }

    // 2a. Join the community the fan arrived through. The artist-page Join
    //     CTA passes ?ref=<artist-slug>, which the wizard forwards as both
    //     communitySlug and referralCode (invite links reuse the same param
    //     for fan referral codes). Resolve against the communities table —
    //     a miss just means the ref was a fan code, not a community.
    //     Without this row, awardPoints' membership update is a silent
    //     no-op and the fan's community total never moves.
    let communityJoined: string | null = null;
    const candidateSlug = (payload.communitySlug ?? payload.referralCode ?? "")
      .trim()
      .toLowerCase();
    if (/^[a-z0-9-]+$/.test(candidateSlug)) {
      try {
        const admin = createAdminClient();
        const { data: community } = await admin
          .from("communities")
          .select("slug")
          .eq("slug", candidateSlug)
          .maybeSingle();
        if (community) {
          await admin.from("fan_community_memberships").upsert(
            {
              fan_id: user.id,
              community_id: community.slug,
              total_points: 0,
              current_tier: "bronze",
              status: "active",
              joined_at: new Date().toISOString(),
            },
            { onConflict: "fan_id,community_id", ignoreDuplicates: true },
          );
          await admin.from("fan_artist_following").upsert(
            { fan_id: user.id, artist_slug: community.slug },
            { onConflict: "fan_id,artist_slug" },
          );
          communityJoined = community.slug;
        }
      } catch (err) {
        console.warn("onboard: community join failed", err);
      }
    }

    // 2. Handle referral code — service-role so we can look up the referrer.
    if (payload.referralCode) {
      try {
        const admin = createAdminClient();
        const { data: referrer } = await admin
          .from("fans")
          .select("id")
          .eq("referral_code", payload.referralCode)
          .maybeSingle();

        if (referrer && referrer.id !== user.id) {
          // Referrer +150 already fires here on verified join. Friend +50
          // is awarded by referrals_award_friend_points — do not also
          // credit 150 from SQL.
          await admin.from("referrals").upsert(
            {
              referrer_id: referrer.id,
              referred_id: user.id,
              referred_email: user.email ?? null,
              status: "verified",
              points_awarded: REFERRAL_JOIN_POINTS.referrer,
              verified_at: new Date().toISOString(),
              ...(communityJoined ? { community_id: communityJoined } : {}),
            },
            { onConflict: "referred_id" },
          );
          const referralRef = user.id;
          const { data: existingReferralAward } = await admin
            .from("points_ledger")
            .select("id")
            .eq("source", "referral")
            .eq("source_ref", referralRef)
            .maybeSingle();
          if (!existingReferralAward) {
            await awardPoints(admin, {
              fanId: referrer.id,
              delta: REFERRAL_JOIN_POINTS.referrer,
              source: "referral",
              sourceRef: referralRef,
              note: `Referred by ${user.email}`,
              ...(communityJoined ? { communityId: communityJoined } : {}),
            });
          }
          await admin
            .from("fans")
            .update({ referred_by: referrer.id })
            .eq("id", user.id);
        }
      } catch (err) {
        console.warn("onboard: referral handling failed", err);
        // don't block the onboarding response on referral failure
      }
    }

    // 3. Award signup bonus — idempotent via source_ref = `signup:${userId}`.
    try {
      const admin = createAdminClient();
      const sourceRef = `signup:${user.id}`;
      const { data: existing } = await admin
        .from("points_ledger")
        .select("id")
        .eq("source", "signup_bonus")
        .eq("source_ref", sourceRef)
        .maybeSingle();

      if (!existing) {
        await awardPoints(admin, {
          fanId: user.id,
          delta: POINTS_SIGNUP_BONUS,
          source: "signup_bonus",
          sourceRef: sourceRef,
          note: "Welcome to Fan Engage",
          ...(communityJoined ? { communityId: communityJoined } : {}),
        });
      }
    } catch (err) {
      console.warn("onboard: signup bonus failed", err);
      // non-fatal — profile save still succeeded
    }

    // 4. Founding Fan — first 100 fans who complete onboarding in this
    //    community. Persists founding_fan_number + founder-fan badge.
    //    Separate from paid Founding Fan pricing (claim_founder_slot).
    if (communityJoined) {
      try {
        const admin = createAdminClient();
        const { error: foundingErr } = await admin.rpc("claim_founding_fan_status", {
          p_fan_id: user.id,
          p_community_id: communityJoined,
        });
        if (foundingErr) {
          console.warn("onboard: claim_founding_fan_status failed", foundingErr);
        }
      } catch (err) {
        console.warn("onboard: founding fan claim failed", err);
      }
    }

    return NextResponse.json({ success: true, fan, communityJoined });
  } catch (err) {
    console.error("onboard route error:", err);
    return NextResponse.json(
      { error: "Unable to complete onboarding." },
      { status: 500 },
    );
  }
}

async function getTotal(
  admin: ReturnType<typeof createAdminClient>,
  fanId: string,
): Promise<number | null> {
  const { data } = await admin
    .from("fans")
    .select("total_points")
    .eq("id", fanId)
    .maybeSingle();
  return (data?.total_points as number | null) ?? 0;
}
