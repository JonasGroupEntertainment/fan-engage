"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { normalizePhoneE164 } from "@/lib/phone";
import {
  readProfileFormValues,
  rejectedProfileSubmit,
  SAVE_FAILED_MESSAGE,
  type ProfileFormState,
} from "@/lib/profile-form";

const orNull = (value: string): string | null => value || null;

export async function updateProfileAction(
  prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/profile");

  const values = readProfileFormValues(formData);

  const phoneResult = normalizePhoneE164(values.phone);
  if (!phoneResult.ok) {
    return rejectedProfileSubmit(prevState, "phone", phoneResult.error, values);
  }

  // Merge into the existing socials object so other keys are preserved.
  const { data: existing } = await supabase
    .from("fans")
    .select("socials")
    .eq("id", user.id)
    .maybeSingle();
  const socials = {
    ...((existing?.socials as Record<string, unknown> | null) ?? {}),
    instagram_or_tiktok: orNull(values.instagramOrTiktok),
  };

  const { error } = await supabase
    .from("fans")
    .update({
      first_name: orNull(values.firstName),
      last_name: orNull(values.lastName),
      city: orNull(values.city),
      phone: phoneResult.phone,
      interest: orNull(values.interest),
      music_outlet: orNull(values.musicOutlet),
      socials,
      avatar_url: orNull(values.avatarUrl),
    })
    .eq("id", user.id);

  if (error) {
    console.error("[me/profile] update failed", { userId: user.id, message: error.message });
    return rejectedProfileSubmit(prevState, "save", SAVE_FAILED_MESSAGE, values);
  }

  redirect("/me");
}
