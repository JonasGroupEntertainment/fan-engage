import Link from "next/link";
import type { LandingStats } from "@/lib/data/landing-stats";

/**
 * Founding-fan urgency block shown to anonymous visitors below the hero.
 * First 100 fans who complete onboarding get a persisted Founding Fan
 * badge + membership number. Free first-100 join badge — not Premium.
 */
export default function FoundingFanBlock({ stats }: { stats: LandingStats }) {
  if (stats.foundingClosed || stats.foundingSpotsRemaining === 0) {
    return null;
  }

  const claimedLabel = `${stats.foundingFans.toLocaleString("en-US")} of ${stats.foundingTarget} claimed`;
  const remainingLabel =
    stats.foundingSpotsRemaining === 1
      ? "1 spot left"
      : `${stats.foundingSpotsRemaining.toLocaleString("en-US")} spots left`;

  return (
    <section className="border-y border-aurora/20 bg-gradient-to-r from-aurora/10 via-slate-900/40 to-ember/10">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-aurora/40 bg-aurora/10 px-3 py-1 text-xs uppercase tracking-widest text-aurora">
              🏅 Founding Fan
            </p>
            {/* TODO: Kevin owns the one Founding Fan definition — leave this headline. */}
            <h2
              className="mt-4 text-3xl font-semibold leading-tight md:text-4xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              First {stats.foundingTarget} fans get permanent
              <br />
              <span className="text-aurora">
                Founding Fan status.
              </span>
            </h2>
            <p className="mt-4 text-sm text-white/75">
              Join now to lock a numbered Founding Fan badge. Founding Fans
              #1–{stats.foundingTarget} earn 1.5× points — not a paid
              subscription, and not just a badge.
            </p>
          </div>

          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 p-5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold text-white">{remainingLabel}</span>
              <span className="text-white/55">{claimedLabel}</span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-aurora to-ember"
                style={{ width: `${Math.max(2, stats.foundingPctClaimed)}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-white/55">
              Status persists on your account — not a restyle-only badge.
            </p>
            <Link
              href="/signup?ref=raelynn"
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-aurora to-ember px-5 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
            >
              Claim founding status →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
