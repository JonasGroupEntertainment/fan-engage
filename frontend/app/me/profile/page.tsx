import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { profileValuesFromFan } from "@/lib/profile-form";
import ProfileForm from "./profile-form";

export const metadata = { title: "Edit profile" };
export const dynamic = "force-dynamic";

export default async function EditProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/profile");

  const { data: fan } = await supabase
    .from("fans")
    .select("first_name, last_name, city, phone, interest, music_outlet, socials, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-white/60">
          Your account
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Edit profile
        </h1>
        <p className="mt-3 text-white/70">
          Update your name, contact info, interests, and avatar.
        </p>
      </header>

      <ProfileForm initialValues={profileValuesFromFan(fan)} />
    </main>
  );
}
