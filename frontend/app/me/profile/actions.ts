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
  const city = (formData.get("city") as string | null)?.trim() || null;
  const avatarUrl = (formData.get("avatarUrl") as string | null)?.trim() || null;

  const { error } = await supabase
    .from("fans")
    .update({ first_name: firstName, city, avatar_url: avatarUrl })
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  redirect("/me");
}
