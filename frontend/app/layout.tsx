import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import CookieBanner from "@/components/cookie-banner";
import Footer from "@/components/footer";
import InstallPrompt from "@/components/install-prompt";
import PremiumBadge from "@/components/premium-badge";
import AdminPill from "@/components/admin-pill";
import SearchInput from "@/components/search-input";
import UserMenu from "@/components/user-menu";
import { MobileNav } from "@/components/mobile-nav";
import { DesktopNav } from "@/components/desktop-nav";
import { createClient } from "@/lib/supabase/server";
import { getUnreadCount } from "@/lib/data/notifications";
import { getCurrentCommunityId } from "@/lib/community";
import { getEntitlement } from "@/lib/entitlements";
import { getAdminContext } from "@/lib/admin";
import { getFanProfileSlug } from "@/lib/data/fan-profile";

const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://fan-engage-pearl.vercel.app";

export const viewport: Viewport = {
  themeColor: "#7c3aed",
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Fan Engage — create a real fan experience",
    template: "%s · Fan Engage",
  },
  description:
    "The fan experience platform. Follow the artists, performers, and creators you love, earn points for every fan move, and unlock real drops, fan-only events, and behind-the-scenes access.",
  applicationName: "Fan Engage",
  keywords: [
    "fan experience",
    "fan experience",
    "artist community",
    "fan rewards",
    "fan-only events",
    "VIP access",
  ],
  manifest: "/manifest.json",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Fan Engage",
    title: "Fan Engage — create a real fan experience",
    description:
      "Follow artists, earn points, unlock real drops. The fan experience platform built for fans who actually show up — for music, performers, comedians, podcasts, and more.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fan Engage — create a real fan experience",
    description:
      "Follow the artists, performers, and creators you love. Earn points, unlock drops, show up.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fan Engage",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

const navItems = [
  { href: "/", label: "Fan Home" },
  { href: "/community", label: "Community" },
  { href: "/rewards", label: "Rewards" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/premium", label: "Premium" },
  { href: "/referrals", label: "Referrals" },
  { href: "/artists", label: "Artists" },
];

/**
 * Tries to fetch the current user via the Supabase server client. If Supabase
 * isn't configured yet (env vars missing) we degrade gracefully and render the
 * signed-out header — the site still works end-to-end.
 */
async function getCurrentUserSafe() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    const { data: fan } = await supabase
      .from("fans")
      .select("first_name, avatar_url")
      .eq("id", data.user.id)
      .maybeSingle();
    const profileSlug = await getFanProfileSlug(data.user.id).catch(() => null);
    return {
      id: data.user.id,
      email: data.user.email,
      first_name: (fan?.first_name as string | null) ?? null,
      avatar_url: (fan?.avatar_url as string | null) ?? null,
      profileSlug,
    };
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUserSafe();
  // Unread inbox count + premium entitlement are only meaningful for
  // signed-in fans. Both are wrapped so a transient DB hiccup never
  // breaks the header render.
  let unread = 0;
  let isPremium = false;
  let isFounder = false;
  let founderNumber: number | null = null;
  let isAdmin = false;
  if (user) {
    try {
      const [unreadResult, communityId, adminCtx] = await Promise.all([
        getUnreadCount().catch(() => 0),
        getCurrentCommunityId().catch(() => null),
        getAdminContext().catch(() => null),
      ]);
      unread = unreadResult;
      isAdmin = adminCtx !== null;
      if (communityId) {
        const ent = await getEntitlement(user.id, communityId).catch(() => null);
        if (ent) {
          isPremium = ent.isPremium;
          isFounder = ent.isFounder;
          founderNumber = ent.founderNumber;
        }
      }
    } catch {
      // Already defaulted above.
    }
  }

  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-midnight text-white">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-midnight/80 backdrop-blur">
          <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-aurora to-ember text-sm font-bold">
                  FE
                </span>
                <span
                  className="text-lg font-semibold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Fan Engage
                </span>
              </Link>
              <MobileNav navItems={navItems} isSignedIn={Boolean(user)} />
            </div>
            <DesktopNav navItems={navItems} />
            <div className="hidden flex-1 max-w-xs lg:block">
              <SearchInput compact placeholder="Search Fan Engage…" />
            </div>
            {user ? (
              <div className="flex items-center gap-3">
                <PremiumBadge
                  isPremium={isPremium}
                  isFounder={isFounder}
                  founderNumber={founderNumber}
                />
                <AdminPill show={isAdmin} />
                <Link
                  href="/inbox"
                  aria-label={
                    unread > 0 ? `Inbox — ${unread} unread` : "Inbox"
                  }
                  title={
                    unread > 0 ? `${unread} unread notification${unread === 1 ? "" : "s"}` : "Inbox"
                  }
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/30 text-white/80 hover:bg-white/10"
                >
                  <span aria-hidden>🔔</span>
                  {unread > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-gradient-to-r from-aurora to-ember px-1 text-xs font-semibold text-white shadow">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </Link>
                <UserMenu fan={user} isAdmin={isAdmin} unreadCount={unread} />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="hidden rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 min-[420px]:inline-flex"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup?ref=raelynn"
                  className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
                >
                  Join
                </Link>
              </div>
            )}
          </div>
        </header>
        {children}
        <Footer />
        <CookieBanner />
        <InstallPrompt />
      </body>
    </html>
  );
}
