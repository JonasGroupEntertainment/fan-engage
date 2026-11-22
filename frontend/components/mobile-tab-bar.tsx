"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Phone-only bottom bar for signed-in fans: Home, Card, Rewards,
 * Community, Artists. Community is where fans earn most of their points.
 * Port of Brand Engage Pro #193. On a phone the top menu collapses into a
 * button, which left the logo as the only visible way home and hid the Fan
 * Card. Hidden from md up, where the top menu is visible.
 */

export const COMMUNITY_TAB_PATH = "/community";

/** An artist's community page, such as /artists/raelynn/community. */
export const ARTIST_COMMUNITY_PATH = /^\/artists\/[^/]+\/community(\/|$)/;

const TABS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/me/card", label: "Card", icon: "card" },
  { href: "/rewards", label: "Rewards", icon: "rewards" },
  // /community (app/community/route.ts) sends the fan to their own
  // artist's community page.
  { href: COMMUNITY_TAB_PATH, label: "Community", icon: "community" },
  { href: "/artists", label: "Artists", icon: "artists" },
] as const;

/** Flows where a bar would distract or cover the page's own buttons. */
const HIDDEN_PREFIXES = [
  "/admin",
  "/artist-portal",
  "/login",
  "/signup",
  "/onboarding",
  "/logout",
  "/signout",
  "/reset-password",
  "/forgot-password",
  "/auth",
];

export function tabBarHiddenOn(pathname: string): boolean {
  return HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isTabActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  // The Community tab lands on an artist's community page, which sits
  // under /artists.
  const onArtistCommunity = ARTIST_COMMUNITY_PATH.test(pathname);
  if (href === COMMUNITY_TAB_PATH && onArtistCommunity) return true;
  if (href === "/artists" && onArtistCommunity) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Icon({ name }: { name: (typeof TABS)[number]["icon"] }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "home") {
    return (
      <svg {...common}>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5.5 10v9.5h13V10" />
        <path d="M10 19.5v-5h4v5" />
      </svg>
    );
  }
  if (name === "card") {
    return (
      <svg {...common}>
        <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
        <path d="M3 10h18" />
        <path d="M7 14.5h4" />
      </svg>
    );
  }
  if (name === "rewards") {
    return (
      <svg {...common}>
        <rect x="4" y="10" width="16" height="10" rx="1.5" />
        <path d="M3 7h18v3H3z" />
        <path d="M12 7v13" />
        <path d="M12 7c-1.5-3-5-3-5-.8C7 7 9.5 7 12 7Zm0 0c1.5-3 5-3 5-.8C17 7 14.5 7 12 7Z" />
      </svg>
    );
  }
  if (name === "community") {
    return (
      <svg {...common}>
        <path d="M4 5.5h16v10H10l-4.5 3.5v-3.5H4z" />
        <path d="M8 9.5h8" />
        <path d="M8 12.5h5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M9 18V6l11-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </svg>
  );
}

export default function MobileTabBar() {
  const pathname = usePathname() ?? "/";
  if (tabBarHiddenOn(pathname)) return null;

  return (
    <>
      {/* Keeps the end of the page clear of the fixed bar. */}
      <div aria-hidden className="h-[4.5rem] md:hidden" />
      <nav
        aria-label="Main"
        data-tab-bar
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-midnight/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto flex max-w-md items-stretch justify-around">
          {TABS.map((tab) => {
            const active = isTabActive(tab.href, pathname);
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  // /community answers with a redirect, so there is nothing to prefetch.
                  prefetch={tab.href === COMMUNITY_TAB_PATH ? false : undefined}
                  aria-current={active ? "page" : undefined}
                  className={
                    "flex min-h-[3.75rem] flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs font-medium transition " +
                    (active ? "text-white" : "text-white/60 hover:text-white")
                  }
                >
                  <Icon name={tab.icon} />
                  <span>{tab.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
