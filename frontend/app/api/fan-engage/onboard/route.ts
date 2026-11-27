import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fanDataRateLimiter, getClientIp } from "@/lib/rate-limit";
import { awardPoints } from "@/lib/points/award";
import { LAUNCH_COMMUNITY_ID, REFERRAL_JOIN_POINTS } from "@/lib/launch-catalog";
import { resolveOnboardCommunityId } from "@/lib/onboard-community";
import { normalizePhoneE164 } from "@/lib/phone";
import { setPreferences } from "@/lib/notifications/preferences";
import { smsEnabledFromOnboarding } from "@/lib/sms-send-gate";
import { onboardConsentUpdates } from "@/lib/consent";
import { SMS_GUARDIAN_MESSAGE, smsTextOptIn } from "@/lib/age-gate";
import {
  channelOptInTimestampPatch,
  isMissingOptInTimestampColumn,
  omitOptInTimestamps,
} from "@/lib/channel-opt-in";
import { isMissingSmsParentConsentColumn } from "@/lib/sms/policy";
import {
  emailJoinUpdates,
  isMissingMarketingConsentColumn,
  omitMarketingConsent,
  smsConsentStamp,
  type EmailConsentFields,
} from "@/lib/marketing-consent";
import { overLimitField } from "@/lib/fan-field-limits";
import {
  ONBOARD_BAD_REQUEST_ERROR,
  isJoinComplete,
  validateOnboardPayload,
} from "@/lib/onboard-payload";

export const runtime = "nodejs";

const POINTS_SIGNUP_BONUS = 100;

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: ONBOARD_BAD_REQUEST_ERROR }, { status: 400 });
    }
    const checked = validateOnboardPayload(body);
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error }, { status: 400 });
    }
    const payload = checked.payload;

    // Phone is optional, but anything provided must normalize to E.164 so
    // Mailchimp and phone-based lookups always see one canonical shape.
    const phoneResult = normalizePhoneE164(payload.phone);
    if (!phoneResult.ok) {
      return NextResponse.json(
        { error: phoneResult.error, field: "phone" },
        { status: 400 },
      );
    }

    // The database holds the same limits (migration 0113). Checking here
    // lets the form say which field is too long.
    const over = overLimitField({
      firstName: payload.firstName,
      lastName: payload.lastName,
      city: payload.city,
      interest: payload.interest,
      musicOutlet: payload.musicOutlet,
      instagramOrTiktok: payload.handle,
    });
    if (over) {
      return NextResponse.json({ error: over.message, field: over.field }, { status: 400 });
    }

    const consent = onboardConsentUpdates(payload, phoneResult.phone);
    if (!consent.ok) {
      return NextResponse.json(
        { error: consent.error, field: "consent" },
        { status: 400 },
      );
    }

    // 1. Update the fan's profile row (created by the auth trigger).
    //
    // The onboarding wizard's "TikTok or Instagram handle" field arrives
    // as payload.handle. We do NOT write that to fans.handle (legacy)
    // — instead we merge it into the socials jsonb column so social
    // identifiers stay in their own field. The URL slug column,
    // fans.profile_slug, is owned by the BEFORE INSERT trigger.
    let { data: existingFan, error: existingErr } = await supabase
      .from("fans")
      .select("socials, sms_opted_in, email_opted_in, birth_date, sms_parent_consent_at")
      .eq("id", user.id)
      .maybeSingle();
    const consentColumnReady = !isMissingSmsParentConsentColumn(existingErr);
    if (existingErr && !consentColumnReady) {
      const plain = await supabase
        .from("fans")
        .select("socials, sms_opted_in, email_opted_in, birth_date")
        .eq("id", user.id)
        .maybeSingle();
      existingFan = plain.data as typeof existingFan;
      existingErr = plain.error;
    }
    if (existingErr) {
      console.error("onboard: failed to read fan", existingErr);
      return NextResponse.json({ error: "Unable to save profile." }, { status: 500 });
    }

    // Texts: 18+ as before, no birth date is not blocked, 13 to 17 need a
    // separate parent tick, under 13 never. The column is migration 0108.
    const alreadyTextConsent = Boolean(
      (existingFan as { sms_parent_consent_at?: string | null } | null)?.sms_parent_consent_at,
    );
    const smsAge = smsTextOptIn({
      birthDate: existingFan?.birth_date as string | null,
      requested: consent.smsOptedIn,
      smsParentConsent: payload.smsParentConsent === true || alreadyTextConsent,
    });
    if (smsAge.rejected || (smsAge.stampConsent && !consentColumnReady)) {
      return NextResponse.json({ error: SMS_GUARDIAN_MESSAGE, field: "sms" }, { status: 400 });
    }
    const smsOptedIn = smsAge.accept;

    let socialsMerge: Record<string, unknown> | undefined = undefined;
    if (typeof payload.handle === "string" && payload.handle.trim()) {
      socialsMerge = {
        ...((existingFan?.socials as Record<string, unknown> | null) ?? {}),
        instagram_or_tiktok: payload.handle.trim(),
      };
    }

    // Marketing email: only a ticked box opts a fan in, and the tick is
    // recorded with its time and wording version (migration 0109). The
    // consent record is read on its own so a database without 0109 still
    // lets the fan finish joining.
    const emailRecord = await supabase
      .from("fans")
      .select("email_opted_in, email_consent_at, sms_consent_at")
      .eq("id", user.id)
      .maybeSingle();
    const existingEmail: EmailConsentFields = emailRecord.error
      ? { email_opted_in: existingFan?.email_opted_in === true, email_consent_at: null }
      : ((emailRecord.data as EmailConsentFields | null) ?? {});
    const hasTextRecord =
      existingFan?.sms_opted_in === true &&
      Boolean((emailRecord.data as { sms_consent_at?: string | null } | null)?.sms_consent_at);
    const now = new Date();
    const emailUpdates = emailJoinUpdates(
      payload.emailConsent === true && Boolean(user.email),
      existingEmail,
      now,
    );
    const nextEmailOptedIn =
      typeof emailUpdates.email_opted_in === "boolean"
        ? emailUpdates.email_opted_in
        : existingEmail.email_opted_in === true;
    const updates: Record<string, unknown> = {
      first_name: payload.firstName ?? null,
      last_name: payload.lastName ?? null,
      city: payload.city ?? null,
      phone: phoneResult.phone,
      music_outlet: payload.musicOutlet ?? null,
      interest: payload.interest ?? null,
      sms_opted_in: smsOptedIn,
      email_opted_in: nextEmailOptedIn,
      ...emailUpdates,
      // Texts are only accepted here when the fan ticked the box this time.
      // A fan who already has a text consent on record keeps its time when
      // they run the join form again.
      ...(smsOptedIn && !hasTextRecord ? smsConsentStamp(now) : {}),
      // Stamp the channel time only on a false → true flip. Opt-out leaves
      // the previous timestamp in place (see lib/channel-opt-in.ts).
      ...channelOptInTimestampPatch(
        {
          smsOptedIn: existingFan?.sms_opted_in === true,
          emailOptedIn: existingFan?.email_opted_in === true,
        },
        { smsOptedIn, emailOptedIn: nextEmailOptedIn },
      ),
      // Only written when the fan ticked the Terms box this time, so a
      // re-submit never blanks or back-dates an earlier consent.
      ...(consent.consent ?? {}),
      ...(smsAge.stampConsent ? { sms_parent_consent_at: new Date().toISOString() } : {}),
    };
    if (socialsMerge !== undefined) updates.socials = socialsMerge;

    let { data: fan, error: updateErr } = await supabase
      .from("fans")
      .update(updates)
      .eq("id", user.id)
      .select("id, first_name, current_tier, total_points, profile_slug")
      .single();

    // 0068 is not applied yet: the timestamp columns are unknown. Save the
    // flags that already exist so onboarding still completes.
    if (updateErr && isMissingOptInTimestampColumn(updateErr)) {
      const retry = await supabase
        .from("fans")
        .update(omitOptInTimestamps(updates))
        .eq("id", user.id)
        .select("id, first_name, current_tier, total_points, profile_slug")
        .single();
      fan = retry.data;
      updateErr = retry.error;
    }

    // 0109 is not applied yet: the consent record columns are unknown. Save
    // the rest so joining still completes. No marketing email goes to a fan
    // without a consent record, so nothing is sent on the strength of this.
    if (updateErr && isMissingMarketingConsentColumn(updateErr)) {
      const retry = await supabase
        .from("fans")
        .update(omitMarketingConsent(omitOptInTimestamps(updates)))
        .eq("id", user.id)
        .select("id, first_name, current_tier, total_points, profile_slug")
        .single();
      fan = retry.data;
      updateErr = retry.error;
    }

    if (updateErr) {
      console.error("onboard: failed to update fan", updateErr);
      return NextResponse.json(
        { error: "Unable to save profile." },
        { status: 500 },
      );
    }

    // 1b. Mirror the text opt-in onto the SMS channel toggle. The notifier
    //     reads notification_preferences.sms_enabled, which defaults off,
    //     so without this an opted-in fan never gets a text.
    try {
      await setPreferences(user.id, {
        sms_enabled: smsEnabledFromOnboarding(smsOptedIn, phoneResult.phone),
      });
    } catch (err) {
      console.warn("onboard: failed to sync SMS preference", err);
    }

    // 2a. Always join a community so the founding claim can assign
    //     a number. Artist-page Join passes ?ref=<artist-slug>; invite
    //     links reuse that param for fan codes. A miss (empty ref, fan
    //     code, lookup failure) still joins RaeLynn — without this row
    //     founding claim is a silent no-op and the counter stays frozen.
    let communityJoined: string | null = null;
    try {
      const admin = createAdminClient();
      const requested = resolveOnboardCommunityId({
        communitySlug: payload.communitySlug,
        referralCode: payload.referralCode,
      });
      const { data: community } = await admin
        .from("communities")
        .select("slug")
        .eq("slug", requested)
        .maybeSingle();
      const joinSlug = community?.slug ?? LAUNCH_COMMUNITY_ID;
      const { error: joinErr } = await admin.from("fan_community_memberships").upsert(
        {
          fan_id: user.id,
          community_id: joinSlug,
          total_points: 0,
          current_tier: "bronze",
          status: "active",
          joined_at: new Date().toISOString(),
        },
        { onConflict: "fan_id,community_id", ignoreDuplicates: true },
      );
      if (joinErr) {
        console.warn("onboard: community join failed", joinErr);
      } else {
        await admin.from("fan_artist_following").upsert(
          { fan_id: user.id, artist_slug: joinSlug },
          { onConflict: "fan_id,artist_slug" },
        );
        communityJoined = joinSlug;
      }
    } catch (err) {
      console.warn("onboard: community join failed", err);
    }

    // Welcome points, the referral reward and the founding number wait until
    // the saved record has a name and agreed Terms. The text confirmation
    // step saves earlier than that and stops here.
    const savedConsent = await supabase
      .from("fans")
      .select("first_name, consent_accepted_at")
      .eq("id", user.id)
      .maybeSingle();
    if (savedConsent.error) {
      console.warn("onboard: could not re-read the saved record", savedConsent.error);
    }
    const joinComplete = isJoinComplete(
      savedConsent.data
        ? {
            firstName: savedConsent.data.first_name as string | null,
            consentAcceptedAt: savedConsent.data.consent_accepted_at as string | null,
          }
        : {
            firstName: payload.firstName,
            consentAcceptedAt: consent.consent?.consent_accepted_at ?? null,
          },
    );
    if (!joinComplete) {
      return NextResponse.json({ success: true, fan, communityJoined, joinComplete });
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

    // 3. Founding Fan first so the welcome award hits the 1.5× writer.
    // Free first-100 join — award the gallery badge here, not only on Premium.
    if (communityJoined) {
      try {
        const admin = createAdminClient();
        const { data: foundingNumber, error: foundingErr } = await admin.rpc(
          "claim_founding_fan_status",
          {
            p_fan_id: user.id,
            p_community_id: communityJoined,
          },
        );
        if (foundingErr) {
          console.warn("onboard: claim_founding_fan_status failed", foundingErr);
        } else if (
          typeof foundingNumber === "number" &&
          foundingNumber >= 1
        ) {
          const { error: awardErr } = await admin.rpc("award_community_badge", {
            p_fan_id: user.id,
            p_slug: "founding-fan",
            p_community_id: communityJoined,
          });
          if (awardErr) {
            console.warn("onboard: founding-fan badge award failed", awardErr);
          }
        }
      } catch (err) {
        console.warn("onboard: founding fan claim failed", err);
      }
    }

    // 4. Award signup bonus — idempotent via source_ref = `signup:${userId}`.
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

    return NextResponse.json({ success: true, fan, communityJoined, joinComplete });
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
