/**
 * Per-channel consent timestamps on fans.sms_opted_in_at and
 * fans.email_opted_in_at.
 *
 * Set the timestamp only when that channel flips from not-opted-in to
 * opted-in. Opt-out leaves the timestamp in place: it is the last time the
 * fan gave consent, which matches consent_accepted_at (unsubscribe flips
 * the boolean and does not erase the earlier consent time). Fans who opted
 * in before the column existed keep a null timestamp until the next
 * false → true transition. This module does not invent a time for them.
 */

export type ChannelOptInFlags = {
  smsOptedIn: boolean;
  emailOptedIn: boolean;
};

export type ChannelOptInTimestampPatch = {
  sms_opted_in_at?: string;
  email_opted_in_at?: string;
};

export function channelOptInTimestampPatch(
  previous: ChannelOptInFlags,
  next: ChannelOptInFlags,
  now: Date = new Date(),
): ChannelOptInTimestampPatch {
  const iso = now.toISOString();
  const patch: ChannelOptInTimestampPatch = {};
  if (next.smsOptedIn === true && previous.smsOptedIn !== true) {
    patch.sms_opted_in_at = iso;
  }
  if (next.emailOptedIn === true && previous.emailOptedIn !== true) {
    patch.email_opted_in_at = iso;
  }
  return patch;
}

type PostgrestLikeError = { message?: string; code?: string } | null;

/** True when PostgREST rejects the write because 0068 is not applied yet. */
export function isMissingOptInTimestampColumn(error: PostgrestLikeError): boolean {
  if (!error) return false;
  const blob = `${error.code ?? ""} ${error.message ?? ""}`;
  return blob.includes("sms_opted_in_at") || blob.includes("email_opted_in_at");
}

export function omitOptInTimestamps<T extends Record<string, unknown>>(updates: T): T {
  const next = { ...updates };
  delete next.sms_opted_in_at;
  delete next.email_opted_in_at;
  return next;
}

export type SignupChannelFields = {
  phone: string | null;
  smsOptedIn: boolean;
};

/**
 * Fan-row patch for a brand-new signup. Previous flags are the column
 * defaults (both false). Returns null when there is nothing to store, so
 * signup still succeeds with no phone and no SMS box.
 */
export function signupChannelUpdate(
  fields: SignupChannelFields,
  now: Date = new Date(),
): Record<string, unknown> | null {
  const smsOptedIn = fields.smsOptedIn === true && !!fields.phone;
  if (!fields.phone && !smsOptedIn) return null;
  return {
    phone: fields.phone,
    sms_opted_in: smsOptedIn,
    ...channelOptInTimestampPatch(
      { smsOptedIn: false, emailOptedIn: false },
      { smsOptedIn, emailOptedIn: false },
      now,
    ),
  };
}

type FanUpdateError = { message?: string; code?: string } | null;

export type FanUpdateClient = {
  from: (table: "fans") => {
    update: (values: Record<string, unknown>) => {
      eq: (column: "id", id: string) => PromiseLike<{ error: FanUpdateError }>;
    };
  };
};

/**
 * Writes phone + SMS consent for the fan who just signed up.
 * If the timestamp columns are not in the database yet, retries with the
 * flags only so account creation is not blocked on migration 0068.
 */
export async function persistSignupChannelOptIn(
  supabase: FanUpdateClient,
  fanId: string,
  fields: SignupChannelFields,
  now: Date = new Date(),
): Promise<{ saved: boolean }> {
  const updates = signupChannelUpdate(fields, now);
  if (!updates) return { saved: true };

  try {
    const first = await supabase.from("fans").update(updates).eq("id", fanId);
    if (!first.error) return { saved: true };
    if (!isMissingOptInTimestampColumn(first.error)) {
      console.warn("signup: phone/SMS consent was not saved", first.error);
      return { saved: false };
    }

    const retry = await supabase
      .from("fans")
      .update(omitOptInTimestamps(updates))
      .eq("id", fanId);
    if (retry.error) console.warn("signup: phone/SMS consent was not saved", retry.error);
    return { saved: !retry.error };
  } catch (err) {
    console.warn("signup: phone/SMS consent was not saved", err);
    return { saved: false };
  }
}
