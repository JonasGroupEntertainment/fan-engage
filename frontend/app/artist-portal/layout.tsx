import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QUEUE_STATUSES } from "@/lib/moderation/apply";
import {
  getPortalContext,
  canAccessPortalSurface,
  type PortalSurface,
} from "@/lib/artist-portal/access";

export default async function ArtistPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/artist-portal");

  // Any admin_users role (owner/admin/editor/viewer) grants portal access;
  // individual pages/actions gate on the specific role.
  const ctx = await getPortalContext();

  if (!ctx) {
    return (
      <div className="min-h-screen bg-midnight flex items-center justify-center px-6">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-black/40 p-8 text-center">
          <p className="text-lg font-semibold text-white/80">
            You&apos;re not on an artist team yet
          </p>
          <p className="mt-2 text-sm text-white/50">
            The artist portal is for artists and their teams. If you&apos;re an
            artist, apply to launch your community; if you&apos;re on a team,
            ask the community owner to add you from their Team page.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/for-artists/apply"
              className="inline-block rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"
            >
              Apply as an artist
            </Link>
            <Link
              href="/"
              className="inline-block rounded-lg border border-white/15 px-4 py-2 text-sm text-white/70 hover:text-white"
            >
              Back to fan site
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Fetch the community display name for the nav header.
  const { data: community } = await supabase
    .from("communities")
    .select("slug, display_name, accent_from, accent_to")
    .eq("slug", ctx.communityId)
    .maybeSingle();

  // Only show surfaces the caller's role can open (PORTAL_MIN_ROLE).
  const allNav: Array<{ href: string; label: string; surface: PortalSurface }> = [
    { href: "/artist-portal", label: "Dashboard", surface: "dashboard" },
    { href: "/artist-portal/copilot", label: "Copilot ✨", surface: "copilot" },
    { href: "/artist-portal/events", label: "Events", surface: "events" },
    { href: "/artist-portal/community", label: "Community", surface: "community" },
    { href: "/artist-portal/moderation", label: "Moderation", surface: "moderation" },
    { href: "/artist-portal/redemptions", label: "Redemptions", surface: "redemptions" },
    { href: "/artist-portal/checkin-qr", label: "Check-in QR", surface: "checkinQr" },
    { href: "/artist-portal/leaderboard", label: "Leaderboard", surface: "leaderboard" },
    { href: "/artist-portal/payouts", label: "Revenue", surface: "revenue" },
    { href: "/artist-portal/team", label: "Team", surface: "team" },
    { href: "/artist-portal/launch", label: "Launch", surface: "launch" },
    { href: "/artist-portal/brief", label: "Brief", surface: "brief" },
    { href: "/artist-portal/superfans", label: "Superfans", surface: "superfans" },
  ];
  const nav = allNav.filter((item) => canAccessPortalSurface(ctx.role, item.surface));

  // Moderation badge: rows in this community still waiting on a human
  // (pending + flag_review + auto_hide). Two head-only count queries, and
  // only for roles that can open the tab at all.
  let moderationCount = 0;
  if (canAccessPortalSurface(ctx.role, "moderation")) {
    const admin = createAdminClient();
    const [{ count: postCount }, { count: commentCount }] = await Promise.all([
      admin
        .from("community_posts")
        .select("id", { count: "exact", head: true })
        .eq("artist_slug", ctx.communityId)
        .in("moderation_status", [...QUEUE_STATUSES]),
      admin
        .from("community_comments")
        .select("id, community_posts!inner(artist_slug)", { count: "exact", head: true })
        .eq("community_posts.artist_slug", ctx.communityId)
        .in("moderation_status", [...QUEUE_STATUSES]),
    ]);
    moderationCount = (postCount ?? 0) + (commentCount ?? 0);
  }
  const navBadge: Partial<Record<string, number>> = {
    "/artist-portal/moderation": moderationCount,
  };

  return (
    <div className="min-h-screen bg-midnight">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Header bar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 sm:mb-6 sm:gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm sm:gap-3">
            <span className="rounded-full bg-purple-500/20 px-3 py-1 text-xs uppercase tracking-wide text-purple-300">
              Artist Portal
            </span>
            {community && (
              <span
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs"
              >
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${community.accent_from}, ${community.accent_to})`,
                  }}
                />
                <span className="truncate font-semibold text-white">
                  {community.display_name}
                </span>
              </span>
            )}
            <span className="hidden truncate text-white/60 sm:inline">{user.email}</span>
            <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/50">
              {ctx.role}
            </span>
          </div>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-xs text-white/60 hover:text-white"
          >
            ← Back to fan site
          </Link>
        </div>

        {/* Nav — a single horizontally-scrolling, snapping row on phones
            (bleeds to the screen edge so the last tab peeks in); wraps on
            md+ where there is room. */}
        <nav
          aria-label="Artist portal"
          className="-mx-4 mb-6 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6 md:mx-0 md:mb-8 md:flex-wrap md:overflow-visible md:px-0 md:pb-0"
        >
          {nav.map((item) => {
            const badge = navBadge[item.href] ?? 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex min-h-11 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/60 hover:border-white/20 hover:text-white transition-colors"
              >
                {item.label}
                {badge > 0 && (
                  <span
                    aria-label={`${badge} awaiting review`}
                    className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-200"
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
