"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function updateProfileAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/profile");

  const firstName = (formData.get("firstName") as string | null)?.trim() || null;
  const lastName = (formData.get("lastName") as string | null)?.trim() || null;
  const city = (formData.get("city") as string | null)?.trim() || null;
  const phone = (formData.get("phone") as string | null)?.trim() || null;
  const interest = (formData.get("interest") as string | null)?.trim() || null;
  const musicOutlet = (formData.get("musicOutlet") as string | null)?.trim() || null;
  const instagramOrTiktok = (formData.get("instagramOrTiktok") as string | null)?.trim() || null;
  const avatarUrl = (formData.get("avatarUrl") as string | null)?.trim() || null;

  const { error } = await supabase
    .from("fans")
    .update({
      first_name: firstName,
      last_name: lastName,
      city,
      phone,
      interest,
      music_outlet: musicOutlet,
      socials: { instagram_or_tiktok: instagramOrTiktok },
      avatar_url: avatarUrl,
    })
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  redirect("/me");
}
