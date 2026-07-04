import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { getCommunity } from "@/lib/community";
import { countPendingRedemptions } from "@/lib/data/rewards";

const adminNav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/launch", label: "Launch Wizard" },
  { href: "/admin/artists", label: "Artists" },
  { href: "/admin/campaigns", label: "Campaigns" },
  { href: "/admin/broadcast", label: "Broadcast" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/community", label: "Community" },
  { href: "/admin/challenges", label: "Challenges" },
  { href: "/admin/offers", label: "Offers" },
  { href: "/admin/rewards", label: "Rewards" },
  { href: "/admin/redemptions", label: "Redemptions" },
  { href: "/admin/fans", label: "Fans" },
  { href: "/admin/promo-codes", label: "Promo Codes" },
  { href: "/admin/policies", label: "Policies" },
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/briefs", label: "Briefs" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin");

  // If somehow no community resolved (no communities in DB at all),
  // the admin can still use the switcher to understand the state.
  // We no longer redirect to /admin/communities on first visit — getAdminContext
  // now auto-selects the first community so currentCommunityId is always set.

  const currentCommunity = ctx.currentCommunityId
    ? await getCommunity(ctx.currentCommunityId)
    : null;

  // Count pending redemptions for badge
  let pendingCount = 0;
  if (ctx.currentCommunityId) {
    pendingCount = await countPendingRedemptions(ctx.currentCommunityId);
  }

  return (
    <div className="min-h-screen bg-midnight">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs uppercase tracking-wide text-amber-300">
              Admin
            </span>
            {currentCommunity && (
              <span
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs"
                title={`Managing ${currentCommunity.display_name}`}
              >
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${currentCommunity.accent_from}, ${currentCommunity.accent_to})`,
                  }}
                />
                <span className="font-semibold text-white">
                  {currentCommunity.display_name}
                </span>
                {(ctx.isSuperAdmin || ctx.communities.length > 1) && (
                  <Link
                    href="/admin/communities"
                    className="text-white/50 hover:text-white"
                  >
                    switch
                  </Link>
                )}
              </span>
            )}
            <span className="text-white/60">{ctx.user.email}</span>
            {ctx.isSuperAdmin && (
              <span className="rounded-full bg-aurora/20 px-2 py-0.5 text-xs uppercase tracking-wide text-aurora">
                Super-admin
              </span>
            )}
          </div>
          <Link
            href="/"
            className="text-xs text-white/60 hover:text-white"
          >
            ← Back to fan site
          </Link>
        </div>

        <nav className="mb-8 flex flex-wrap gap-2">
          {adminNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="relative inline-flex rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-white/60 hover:border-white/20 hover:text-white"
            >
              {item.label}
              {item.href === "/admin/redemptions" && pendingCount > 0 && (
                <span className="absolute right-0 top-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white translate-x-1 -translate-y-1">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <main>{children}</main>
      </div>
    </div>
  );
}
