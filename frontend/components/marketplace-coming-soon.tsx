import Link from "next/link";
import { DEFAULT_COMMUNITY_SLUG, communityPath, communitySignupHref } from "@/lib/community-default";

/**
 * Soft-launch Coming soon wall for /marketplace and merch entry points.
 * Used while isMarketplaceLive() is false — not a broken empty shop.
 * Guests get a clear digital-rewards path; physical merch stays Coming soon.
 */

export default function MarketplaceComingSoon({
  artistSlug = DEFAULT_COMMUNITY_SLUG,
  artistName,
  signedIn = false,
}: {
  /** Community whose digital rewards the CTA opens; defaults to the launch community. */
  artistSlug?: string;
  /** Display name for the "Back to …" link; falls back to a neutral label. */
  artistName?: string | null;
  signedIn?: boolean;
}) {
  const digitalRedeemHref = communityPath(artistSlug, "rewards");
  return (
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-aurora/15 via-slate-900/80 to-ember/15 p-8 shadow-glass sm:p-10">
      <p className="text-xs uppercase tracking-[0.3em] text-aurora">Marketplace</p>
      <h1
        className="mt-3 text-3xl font-semibold leading-tight md:text-4xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Digital unlocks are live — merch coming soon
      </h1>
      <p className="mt-4 max-w-xl text-sm text-white/75 leading-relaxed">
        Physical merch and signed gear stay Coming soon. Digital rewards
        (phone wallpaper, lyric wallpaper, in-app spotlight) are the live
        redeem path.
        {signedIn
          ? " Spend the points you already earned below."
          : " Join to redeem — this is not an empty shop."}
      </p>
      <ul className="mt-5 space-y-2 text-sm text-white/70">
        <li className="flex items-start gap-2">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />
          Digital unlocks — wallpaper 250 / 500 pts, more after you join
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" />
          Tour merch &amp; signed items — Coming soon
        </li>
      </ul>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href={
            signedIn
              ? digitalRedeemHref
              : communitySignupHref(artistSlug, digitalRedeemHref)
          }
          className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-aurora to-ember px-5 py-2.5 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
        >
          {signedIn ? "Redeem digital unlocks" : "Join to redeem digital unlocks"}
        </Link>
        <Link
          href="/rewards"
          className="inline-flex items-center justify-center rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white/80 hover:bg-white/5"
        >
          View rewards &amp; tiers
        </Link>
        <Link
          href={communityPath(artistSlug)}
          className="inline-flex items-center justify-center rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white/80 hover:bg-white/5"
        >
          {artistName ? `Back to ${artistName}` : "Back to the artist hub"}
        </Link>
      </div>
    </section>
  );
}
