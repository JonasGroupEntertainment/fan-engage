import Link from "next/link";

/**
 * Soft-launch Coming soon wall for /marketplace and merch entry points.
 * Used while isMarketplaceLive() is false — not a broken empty shop.
 */
export default function MarketplaceComingSoon({
  artistName = "RaeLynn",
}: {
  artistName?: string;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-aurora/15 via-slate-900/80 to-ember/15 p-8 shadow-glass sm:p-10">
      <p className="text-xs uppercase tracking-[0.3em] text-aurora">Marketplace</p>
      <h1
        className="mt-3 text-3xl font-semibold leading-tight md:text-4xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {artistName} drops — coming soon
      </h1>
      <p className="mt-4 max-w-xl text-sm text-white/75 leading-relaxed">
        The marketplace isn&apos;t open for soft launch yet — you&apos;ll see Coming
        soon here. Create your fan profile and earn points so you&apos;re ready when{" "}
        {artistName}&apos;s merch and drops go live.
      </p>
      <ul className="mt-5 space-y-2 text-sm text-white/70">
        <li className="flex items-start gap-2">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />
          Tour merch &amp; signed items (when live)
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />
          Point redemptions &amp; fan-priority drops
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />
          Backstage-style experiences
        </li>
      </ul>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href="/artists/raelynn"
          className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-aurora to-ember px-5 py-2.5 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
        >
          Back to {artistName}
        </Link>
        <Link
          href="/rewards"
          className="inline-flex items-center justify-center rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white/80 hover:bg-white/5"
        >
          View rewards &amp; tiers
        </Link>
        <Link
          href="/signup?ref=raelynn"
          className="text-sm text-white/60 underline-offset-2 hover:text-white hover:underline"
        >
          Create account →
        </Link>
      </div>
    </section>
  );
}
