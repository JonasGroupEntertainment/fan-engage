import Link from "next/link";

/**
 * Threshold below which the marketplace grid is hidden in favor of a
 * "Drops coming soon" card. Bump this if you want a fuller bar before
 * the marketplace is considered real.
 */
export const MIN_INVENTORY = 1;

interface Props {
  /** Optional artist/brand display name — when present, copy is scoped. */
  scopeName?: string;
  /** Where the "Get notified" CTA should send the member. */
  notifyHref?: string;
}

export function MarketplaceEmptyState({
  scopeName,
  notifyHref = "/me/notifications",
}: Props) {
  const headline = scopeName
    ? `${scopeName} drops are coming soon`
    : "Drops are coming soon";

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-500/10 via-violet-500/5 to-amber-500/10 p-8 sm:p-10">
      <div className="max-w-xl">
        <p className="text-xs uppercase tracking-widest text-white/60">
          Marketplace
        </p>
        <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
          {headline}
        </h2>
        <p className="mt-3 text-white/70 leading-relaxed">
          We&apos;re loading the shelves. Tour merch, signed memorabilia, and
          backstage experiences will land here first — before the public
          store. Founding members get priority drops and tier-locked offers.
        </p>

        <ul className="mt-5 space-y-2 text-sm text-white/70">
          <li className="flex items-center gap-2">
            <span aria-hidden>·</span> Limited tour merch
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden>·</span> Signed CDs, vinyl, posters
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden>·</span> VIP soundcheck + meet-and-greet
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden>·</span> Member-exclusive vinyl variants
          </li>
        </ul>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href={notifyHref}
            className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white/90"
          >
            Get notified about drops
          </Link>
          <Link
            href="/rewards"
            className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/5"
          >
            View your tier
          </Link>
        </div>
      </div>
    </section>
  );
}
