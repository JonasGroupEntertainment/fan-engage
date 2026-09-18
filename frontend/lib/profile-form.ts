/**
 * Shared shapes for the /me/profile edit form.
 *
 * The server action returns a `ProfileFormState` instead of redirecting on a
 * validation error, so the client form can re-render every field from the
 * values the fan actually typed. Nothing personal ever rides in the URL.
 */

export type ProfileFormValues = {
  firstName: string;
  lastName: string;
  city: string;
  phone: string;
  interest: string;
  musicOutlet: string;
  instagramOrTiktok: string;
  avatarUrl: string;
};

export type ProfileFormError = "phone" | "save";

export type ProfileFormState =
  | { error: null; attempt: 0 }
  | {
      error: ProfileFormError;
      message: string;
      values: ProfileFormValues;
      /** Counts rejected submits. The form uses it as a key so React remounts
       *  every field with the returned values instead of the stale DB row. */
      attempt: number;
    };

export const INITIAL_PROFILE_FORM_STATE: ProfileFormState = { error: null, attempt: 0 };

export function rejectedProfileSubmit(
  prev: ProfileFormState,
  error: ProfileFormError,
  message: string,
  values: ProfileFormValues,
): ProfileFormState {
  return { error, message, values, attempt: prev.attempt + 1 };
}

export const SAVE_FAILED_MESSAGE =
  "We couldn't save your profile just now. Your edits are still here, please try again.";

const FIELD_NAMES = [
  "firstName",
  "lastName",
  "city",
  "phone",
  "interest",
  "musicOutlet",
  "instagramOrTiktok",
  "avatarUrl",
] as const satisfies ReadonlyArray<keyof ProfileFormValues>;

function readField(formData: FormData, name: string): string {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim() : "";
}

/** Reads every profile field from a submission, trimmed, blanks as "". */
export function readProfileFormValues(formData: FormData): ProfileFormValues {
  return Object.fromEntries(
    FIELD_NAMES.map((name) => [name, readField(formData, name)]),
  ) as ProfileFormValues;
}

export type FanProfileRow = {
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  phone: string | null;
  interest: string | null;
  music_outlet: string | null;
  socials: unknown;
  avatar_url: string | null;
};

/** Maps a `fans` row (or none) to the form's initial values. */
export function profileValuesFromFan(fan: FanProfileRow | null): ProfileFormValues {
  const socials = (fan?.socials ?? null) as { instagram_or_tiktok?: string | null } | null;
  return {
    firstName: fan?.first_name ?? "",
    lastName: fan?.last_name ?? "",
    city: fan?.city ?? "",
    phone: fan?.phone ?? "",
    interest: fan?.interest ?? "",
    musicOutlet: fan?.music_outlet ?? "",
    instagramOrTiktok: socials?.instagram_or_tiktok ?? "",
    avatarUrl: fan?.avatar_url ?? "",
  };
}
