import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";
import {
  initializeCommunityAction,
  assignOwnerAction,
  setCommunityActiveAction,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * Artist launch wizard — a super-admin checklist that takes a new artist
 * community from nothing to live:
 *
 *   1. Initialize  — artists row, communities row (inactive), default
 *                    rewards, pinned welcome post (all idempotent, seeded
 *                    from an approved application when one exists)
 *   2. Assign owner — grant the artist/manager the portal owner role
 *   3. Review      — hero image, campaign goals, rewards (deep links)
 *   4. Go live     — flip communities.active
 */

interface LaunchStatus {
  slug: string;
  displayName: string;
  active: boolean;
  hasArtist: boolean;
  hasHero: boolean;
  rewardsCount: number;
  goalsCount: number;
  hasWelcomePost: boolean;
  owners: string[];
  memberCount: number;
}

function Check({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className={ok ? "text-emerald-400" : "text-white/30"} aria-hidden>
        {ok ? "✓" : "○"}
      </span>
      <span className={ok ? "text-white/80" : "text-white/50"}>
        {label}
        {!ok && hint && <span className="block text-xs text-white/35">{hint}</span>}
      </span>
    </li>
  );
}

export default async function LaunchWizardPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/launch");
  if (!ctx.isSuperAdmin) redirect("/admin");

  const admin = createAdminClient();
  const { data: communities } = await admin
    .from("communities")
    .select("slug, display_name, active, hero_image")
    .order("sort_order");

  const statuses: LaunchStatus[] = await Promise.all(
    ((communities ?? []) as Array<{
      slug: string;
      display_name: string;
      active: boolean;
      hero_image: string | null;
    }>).map(async (c) => {
      const [artist, rewards, goals, welcome, ownerRows, memberCount] =
        await Promise.all([
          admin.from("artists").select("slug, hero_image").eq("slug", c.slug).maybeSingle(),
          admin.from("rewards_catalog").select("id", { count: "exact", head: true }).eq("community_id", c.slug),
          admin.from("community_goals").select("id", { count: "exact", head: true }).eq("community_id", c.slug).eq("active", true),
          admin.from("community_posts").select("id").eq("artist_slug", c.slug).eq("kind", "announcement").limit(1).maybeSingle(),
          admin.from("admin_users").select("user_id").eq("community_id", c.slug).eq("role", "owner"),
          admin.from("fan_community_memberships").select("fan_id", { count: "exact", head: true }).eq("community_id", c.slug),
        ]);

      const ownerIds = ((ownerRows.data ?? []) as Array<{ user_id: string }>).map(
        (r) => r.user_id,
      );
      const { data: ownerFans } = ownerIds.length
        ? await admin.from("fans").select("id, email").in("id", ownerIds)
        : { data: [] };

      return {
        slug: c.slug,
        displayName: c.display_name,
        active: c.active,
        hasArtist: Boolean(artist.data),
        hasHero: Boolean(c.hero_image || (artist.data?.hero_image as string | null)),
        rewardsCount: rewards.count ?? 0,
        goalsCount: goals.count ?? 0,
        hasWelcomePost: Boolean(welcome.data),
        owners: ((ownerFans ?? []) as Array<{ email: string | null }>)
          .map((f) => f.email ?? "")
          .filter(Boolean),
        memberCount: memberCount.count ?? 0,
      };
    }),
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-widest text-white/50">Admin</p>
        <h1
          className="mt-1 text-3xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Artist Launch Wizard
        </h1>
        <p className="mt-2 text-sm text-white/60">
          Take a new artist from zero to live: initialize the community,
          assign the owner, review content, then flip it on.
        </p>
      </div>

      {/* New community */}
      <div className="mb-8 rounded-2xl border border-white/10 bg-black/40 p-5">
        <h2 className="text-sm font-semibold text-white">
          Start a new community
        </h2>
        <form
          action={initializeCommunityAction}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <label className="flex-1 min-w-[220px]">
            <span className="mb-1 block text-xs text-white/50">
              Slug (lowercase, dashes — e.g. dan-marshall)
            </span>
            <input
              type="text"
              name="slug"
              required
              pattern="[a-z0-9-]+"
              placeholder="artist-slug"
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
          >
            Initialize
          </button>
        </form>
        <p className="mt-3 text-xs text-white/50">
          Idempotent — safe to re-run. If an approved application exists for
          this slug its bio, images, and socials seed automatically. The
          community starts hidden until you mark it live below.
        </p>
      </div>

      {/* Per-community checklists */}
      <div className="space-y-6">
        {statuses.map((s) => {
          const readyToLaunch =
            s.hasArtist && s.rewardsCount > 0 && s.hasWelcomePost && s.owners.length > 0;
          return (
            <div
              key={s.slug}
              className="rounded-2xl border border-white/10 bg-black/40 p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {s.displayName}
                    <span className="ml-2 text-xs text-white/50">/{s.slug}</span>
                  </h3>
                  <p className="mt-0.5 text-xs text-white/50">
                    {s.memberCount} member{s.memberCount === 1 ? "" : "s"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    s.active
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-amber-500/15 text-amber-300"
                  }`}
                >
                  {s.active ? "LIVE" : "IN SETUP"}
                </span>
              </div>

              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                <Check ok={s.hasArtist} label="Artist page created" hint="Run Initialize above with this slug" />
                <Check ok={s.hasHero} label="Hero image set" hint="Add via Admin → Artists" />
                <Check ok={s.rewardsCount > 0} label={`Rewards catalog (${s.rewardsCount})`} hint="Initialize seeds a default 4-pack" />
                <Check ok={s.hasWelcomePost} label="Pinned welcome post" hint="Initialize creates one" />
                <Check ok={s.goalsCount > 0} label={`Campaign goals (${s.goalsCount})`} hint="Optional — add rows in community_goals" />
                <Check
                  ok={s.owners.length > 0}
                  label={
                    s.owners.length > 0
                      ? `Owner: ${s.owners.join(", ")}`
                      : "Owner assigned"
                  }
                  hint="Assign below"
                />
              </ul>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                {/* Assign owner */}
                <form action={assignOwnerAction} className="flex items-end gap-2">
                  <input type="hidden" name="slug" value={s.slug} />
                  <label>
                    <span className="mb-1 block text-xs text-white/50">
                      Owner email
                    </span>
                    <input
                      type="email"
                      name="email"
                      placeholder="artist@email.com"
                      className="rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/10"
                  >
                    Assign owner
                  </button>
                </form>

                <div className="ml-auto flex items-center gap-3">
                  <Link
                    href={`/artists/${s.slug}`}
                    className="text-xs text-white/50 hover:text-white"
                  >
                    Preview page →
                  </Link>
                  <form action={setCommunityActiveAction}>
                    <input type="hidden" name="slug" value={s.slug} />
                    <input
                      type="hidden"
                      name="active"
                      value={s.active ? "false" : "true"}
                    />
                    <button
                      type="submit"
                      disabled={!s.active && !readyToLaunch}
                      className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${
                        s.active
                          ? "border border-white/20 text-white/70 hover:bg-white/10"
                          : readyToLaunch
                            ? "bg-emerald-500 text-black hover:bg-emerald-400"
                            : "cursor-not-allowed bg-white/10 text-white/30"
                      }`}
                      title={
                        !s.active && !readyToLaunch
                          ? "Complete the required checklist items first"
                          : undefined
                      }
                    >
                      {s.active ? "Take offline" : "Go live 🚀"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
