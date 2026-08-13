import { isMarketplaceLive } from "@/lib/marketplace-live";
import MarketplaceComingSoon from "@/components/marketplace-coming-soon";
import Link from "next/link";
import { getActiveOffers } from "@/lib/data/offers";
import { getCurrentFan, getPrimaryCommunityId } from "@/lib/data/fan";
import type { Offer, OfferCategory } from "@/lib/data/types";
import { MarketplaceEmptyState, MIN_INVENTORY } from "@/components/marketplace-empty-state";
import PreviewSignupBanner from "@/components/preview-signup-banner";

export const dynamic = "force-dynamic";

const TABS = ["Featured", "Merch", "Experiences", "Collectibles", "Fan-Exclusive"] as const;
type Tab = (typeof TABS)[number];

/** Map each tab to the OfferCategory values it should show. */
const TAB_CATEGORIES: Record<Tab, OfferCategory[] | null> = {
  Featured: null, // null = show all
  Merch: ["merch"],
  Experiences: ["experience"],
  Collectibles: ["collectible"],
  "Fan-Exclusive": ["digital", "ticket"],
};

// Static preview content used when Supabase has no offers yet — only when
// marketplace is live (NEXT_PUBLIC_MARKETPLACE_LIVE=true).
const fallbackProducts = [
  { title: "Phone Wallpaper", tier: "All tiers", pts: "250 pts", category: "Fan-Exclusive" as Tab, badge: "Digital" },
  { title: "Lyric Wallpaper", tier: "All tiers", pts: "500 pts", category: "Fan-Exclusive" as Tab, badge: "Digital" },
  { title: "Behind-the-Song Video", tier: "All tiers", pts: "1,500 pts", category: "Fan-Exclusive" as Tab, badge: "Clip" },
];

function formatPrice(o: Offer): string {
  if (o.price_points) return `${new Intl.NumberFormat("en-US").format(o.price_points)} pts`;
  if (o.price_cents != null) return `$${(o.price_cents / 100).toFixed(2)}`;
  return "—";
}

function formatTier(slug: Offer["min_tier"]): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/** Map an OfferCategory to the matching Tab name for display purposes. */
function offerCategoryToTab(cat: OfferCategory): Tab {
  switch (cat) {
    case "merch": return "Merch";
    case "experience": return "Experiences";
    case "collectible": return "Collectibles";
    case "digital":
    case "ticket": return "Fan-Exclusive";
  }
}

export const metadata = { title: "Marketplace — Coming soon" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MarketplacePage({ searchParams }: PageProps) {
  // Soft launch: marketplace not open (provider issues). Always Coming soon
  // until NEXT_PUBLIC_MARKETPLACE_LIVE=true.
  if (!isMarketplaceLive()) {
    return (
      <div className="min-h-screen bg-midnight">
        <main className="mx-auto max-w-3xl px-6 py-12">
          <MarketplaceComingSoon artistName="RaeLynn" />
        </main>
      </div>
    );
  }

  const params = await searchParams;
  const rawTab = Array.isArray(params.tab) ? params.tab[0] : (params.tab ?? "");
  const activeTab: Tab = (TABS as readonly string[]).includes(rawTab)
    ? (rawTab as Tab)
    : "Featured";

  const [dbOffers, fan, primaryCommunityId] = await Promise.all([
    getActiveOffers(),
    getCurrentFan(),
    getPrimaryCommunityId(),
  ]);
  const isSignedIn = fan !== null;
  const redeemHref = primaryCommunityId
    ? `/artists/${primaryCommunityId}/rewards`
    : "/artists";
  const usingDb = dbOffers.length >= MIN_INVENTORY;

  if (isSignedIn && !usingDb) {
    return (
      <div className="min-h-screen bg-midnight">
        <main className="mx-auto max-w-6xl px-6 py-12">
          <MarketplaceEmptyState />
        </main>
      </div>
    );
  }

  const allProducts = usingDb
    ? dbOffers.map((o) => ({
        title: o.title,
        tier: formatTier(o.min_tier),
        pts: formatPrice(o),
        category: offerCategoryToTab(o.category),
        badge: o.inventory != null && o.inventory > 0 ? `${o.inventory} left` : "New",
        slug: o.slug,
      }))
    : fallbackProducts.map((p) => ({ ...p, slug: p.title.toLowerCase().replace(/\s+/g, "-") }));

  const products =
    activeTab === "Featured"
      ? allProducts
      : allProducts.filter((p) => p.category === activeTab);

  return (
    <div className="min-h-screen bg-midnight">
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 lg:flex-row">
        <div className="flex-1 space-y-6">
          {!isSignedIn && (
            <PreviewSignupBanner
              eyebrow="🎟️ Preview"
              headline="Sign up to redeem these drops"
              body="Fans earn points by showing up — events, posts, referrals — then trade them for digital drops below. Drops are tier-locked so the people who care the most get first crack."
              bullets={[
                "Digital unlocks from your favorite artists",
                "Points-only or fan-priority pricing",
                "Tier-locked so casual visitors don't outbid fans",
              ]}
              primaryCta="Sign up to redeem →"
              nextPath="/marketplace"
              firstRewardLine="🎁 Earn your first 100 fan points the moment you sign up."
            />
          )}

          <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-purple-800/30 via-slate-900 to-midnight p-6 shadow-glass">
            <p className="text-sm uppercase tracking-wide text-white/60">Marketplace</p>
            <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              Drops tailored to your tier
            </h1>
            <p className="mt-4 text-sm text-white/70">
              Redeem points for exclusive digital drops inside the app.
            </p>
            <nav className="mt-6 flex flex-wrap gap-3" aria-label="Filter by category">
              {TABS.map((tab) => {
                const isActive = tab === activeTab;
                const href = tab === "Featured" ? "/marketplace" : `/marketplace?tab=${encodeURIComponent(tab)}`;
                return (
                  <Link
                    key={tab}
                    href={href}
                    className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                      isActive
                        ? "bg-white text-black"
                        : "border border-white/15 text-white/70 hover:bg-white/5"
                    }`}
                  >
                    {tab}
                  </Link>
                );
              })}
            </nav>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            {products.map((p) => (
              <Link
                key={p.slug}
                href={isSignedIn ? redeemHref : "/signup?next=/marketplace"}
                className="rounded-3xl border border-white/10 bg-black/30 p-5 transition hover:border-white/25"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/50">{p.tier}</p>
                    <p className="mt-1 text-base font-semibold">{p.title}</p>
                  </div>
                  <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/60">
                    {p.badge}
                  </span>
                </div>
                <p className="mt-4 text-lg font-semibold text-emerald-300">{p.pts}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
