"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { normalizePhoneE164 } from "@/lib/phone";

export async function updateProfileAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/profile");

  const firstName = (formData.get("firstName") as string | null)?.trim() || null;
  const lastName = (formData.get("lastName") as string | null)?.trim() || null;
  const city = (formData.get("city") as string | null)?.trim() || null;
  const phoneResult = normalizePhoneE164(formData.get("phone") as string | null);
  if (!phoneResult.ok) redirect("/me/profile?error=phone");
  const phone = phoneResult.phone;
  const interest = (formData.get("interest") as string | null)?.trim() || null;
  const musicOutlet = (formData.get("musicOutlet") as string | null)?.trim() || null;
  const instagramOrTiktok = (formData.get("instagramOrTiktok") as string | null)?.trim() || null;
  const avatarUrl = (formData.get("avatarUrl") as string | null)?.trim() || null;

  // Merge into the existing socials object so other keys are preserved.
  const { data: existing } = await supabase
    .from("fans")
    .select("socials")
    .eq("id", user.id)
    .maybeSingle();
  const socials = {
    ...((existing?.socials as Record<string, unknown> | null) ?? {}),
    instagram_or_tiktok: instagramOrTiktok,
  };

  const { error } = await supabase
    .from("fans")
    .update({
      first_name: firstName,
      last_name: lastName,
      city,
      phone,
      interest,
      music_outlet: musicOutlet,
      socials,
      avatar_url: avatarUrl,
    })
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  redirect("/me");
}
