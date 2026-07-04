import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalContext, roleAtLeast } from "@/lib/artist-portal/access";

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
            Not an artist account
          </p>
          <p className="mt-2 text-sm text-white/50">
            This portal is only available to verified artist accounts. Contact
            your Jonas Group manager if you believe this is an error.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"
          >
            Back to fan site
          </Link>
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

  const nav = [
    { href: "/artist-portal", label: "Dashboard" },
    { href: "/artist-portal/copilot", label: "Copilot ✨" },
    { href: "/artist-portal/events", label: "Events" },
    { href: "/artist-portal/community", label: "Community" },
    { href: "/artist-portal/redemptions", label: "Redemptions" },
    { href: "/artist-portal/leaderboard", label: "Leaderboard" },
    { href: "/artist-portal/payouts", label: "Payouts" },
    ...(roleAtLeast(ctx.role, "owner")
      ? [{ href: "/artist-portal/team", label: "Team" }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-midnight">
      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* Header bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-purple-500/20 px-3 py-1 text-xs uppercase tracking-wide text-purple-300">
              Artist Portal
            </span>
            {community && (
              <span
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs"
              >
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${community.accent_from}, ${community.accent_to})`,
                  }}
                />
                <span className="font-semibold text-white">
                  {community.display_name}
                </span>
              </span>
            )}
            <span className="text-white/60">{user.email}</span>
            <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/50">
              {ctx.role}
            </span>
          </div>
          <Link href="/" className="text-xs text-white/60 hover:text-white">
            ← Back to fan site
          </Link>
        </div>

        {/* Nav */}
        <nav className="mb-8 flex flex-wrap gap-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/60 hover:border-white/20 hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main>{children}</main>
      </div>
    </div>
  );
}
