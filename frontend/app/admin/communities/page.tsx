import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";
import type { Community } from "@/lib/community";
import { setActiveCommunityAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Super-admin community switcher. Also used by any multi-community admin
 * to pick which community they're managing for the current session.
 *
 * Single-community admins (most cases once the platform is fully staffed)
 * bypass this page — their active community is implicit and the layout
 * redirects them straight to /admin.
 */
export default async function AdminCommunitiesPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/communities");

  // Nothing to pick — send them to the dashboard.
  if (!ctx.isSuperAdmin && ctx.communities.length <= 1) {
    redirect("/admin");
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("communities")
    .select("*")
    .order("sort_order");

  const communities = (data ?? []) as Community[];
  const accessible = communities.filter(
    (c) => ctx.isSuperAdmin || ctx.communities.includes(c.slug),
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-widest text-white/50">
          Admin
        </p>
        <h1
          className="mt-1 text-3xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Pick a community to manage
        </h1>
        <p className="mt-2 text-sm text-white/60">
          {ctx.isSuperAdmin
            ? "You're a super-admin — you can administer every community. Your selection sticks for this session and can be changed here any time."
            : "You've got admin access to multiple communities. Pick one to manage."}
          {ctx.currentCommunityId && (
            <>
              {" "}
              Currently managing{" "}
              <span className="font-semibold text-white">
                {ctx.currentCommunityId}
              </span>
              .
            </>
          )}
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accessible.map((c) => {
          const isCurrent = c.slug === ctx.currentCommunityId;
          return (
            <li key={c.slug}>
              <form action={setActiveCommunityAction}>
                <input type="hidden" name="community_id" value={c.slug} />
                <button
                  type="submit"
                  className={`group relative block w-full overflow-hidden rounded-2xl border p-5 text-left transition ${
                    isCurrent
                      ? "border-aurora bg-aurora/10"
                      : c.active
                        ? "border-white/10 bg-black/30 hover:border-white/30 hover:bg-white/5"
                        : "border-white/5 bg-black/20 opacity-70 hover:opacity-90"
                  }`}
                >
                  <div
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-1"
                    style={{
                      backgroundImage: `linear-gradient(90deg, ${c.accent_from}, ${c.accent_to})`,
                    }}
                  />
                  <div className="mt-2 flex items-baseline justify-between gap-3">
                    <span className="text-xs uppercase tracking-widest text-white/50">
                      {c.type.replace("_", " ")}
                    </span>
                    {!c.active && (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                        Inactive
                      </span>
                    )}
                    {isCurrent && (
                      <span className="rounded-full bg-aurora/30 px-2 py-0.5 text-xs text-white">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-base font-semibold">
                    {c.display_name}
                  </p>
                  {c.tagline && (
                    <p className="mt-1 text-xs text-white/55 line-clamp-2">
                      {c.tagline}
                    </p>
                  )}
                  <p className="mt-4 text-xs text-white/45 transition group-hover:text-white/80">
                    Manage →
                  </p>
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
