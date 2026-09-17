import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateProfileAction } from "./actions";
import ImageUploader from "@/components/image-uploader";

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

  const instagramOrTiktok =
    (fan?.socials as { instagram_or_tiktok?: string | null } | null)?.instagram_or_tiktok ?? "";

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

      <form action={updateProfileAction} className="space-y-5">
        <label className="block text-sm text-white/80">
          <span>First name</span>
          <input
            type="text"
            name="firstName"
            defaultValue={fan?.first_name ?? ""}
            placeholder="Your first name"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
          />
        </label>

        <label className="block text-sm text-white/80">
          <span>Last name</span>
          <input
            type="text"
            name="lastName"
            defaultValue={fan?.last_name ?? ""}
            placeholder="Your last name"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
          />
        </label>

        <label className="block text-sm text-white/80">
          <span>City &amp; state</span>
          <input
            type="text"
            name="city"
            defaultValue={fan?.city ?? ""}
            placeholder="Austin, TX"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
          />
        </label>

        <label className="block text-sm text-white/80">
          <span>Phone number</span>
          <input
            type="tel"
            name="phone"
            defaultValue={fan?.phone ?? ""}
            placeholder="+1 (615) 555-0123"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-white/50">
            Recommended. Unlocks SMS perks for artist drops, events, and rewards.
          </span>
        </label>

        <label className="block text-sm text-white/80">
          <span>What are your areas of interest?</span>
          <input
            type="text"
            name="interest"
            defaultValue={fan?.interest ?? ""}
            placeholder="Rewards, VIP, Marketplace"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
          />
        </label>

        <label className="block text-sm text-white/80">
          <span>Where do you listen to music most?</span>
          <input
            type="text"
            name="musicOutlet"
            defaultValue={fan?.music_outlet ?? ""}
            placeholder="Spotify, Apple Music, TikTok…"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
          />
        </label>

        <label className="block text-sm text-white/80">
          <span>TikTok or Instagram handle</span>
          <input
            type="text"
            name="instagramOrTiktok"
            defaultValue={instagramOrTiktok}
            placeholder="@fanexperience"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
          />
        </label>

        <div className="block text-sm text-white/80">
          <span>Avatar</span>
          <div className="mt-2">
            <ImageUploader
              bucket="avatars"
              name="avatarUrl"
              initialUrl={fan?.avatar_url ?? null}
              label="Change avatar"
            />
          </div>
        </div>

        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
          >
            Save changes
          </button>
          <a
            href="/me"
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            Cancel
          </a>
        </div>
      </form>
    </main>
  );
}
