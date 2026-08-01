import Link from "next/link";

/**
 * Marketing-grade banner shown above protected-experience pages
 * (/rewards, /marketplace, /referrals) when the visitor is anonymous.
 *
 * The pages used to redirect signed-out users to /login, which killed
 * marketing momentum. They now render their preview content with this
 * banner above so visitors immediately see (a) what they're looking at,
 * (b) why they should sign up, and (c) a single CTA to do so.
 */
export default function PreviewSignupBanner({
  eyebrow,
  headline,
  body,
  bullets,
  primaryCta = "Sign up free →",
  nextPath,
  firstRewardLine,
}: {
  eyebrow: string;
  headline: string;
  body: string;
  bullets?: string[];
  primaryCta?: string;
  nextPath?: string;
  /**
   * Optional small chip below the CTA row that surfaces the specific
   * first-reward incentive (e.g. "🎁 Earn your first 100 fan points
   * today"). Mirrors the chip on the home hero + signup form so the
   * incentive language stays consistent across the funnel.
   */
  firstRewardLine?: string;
}) {
  const signupParams = new URLSearchParams({ ref: "raelynn" });
  if (nextPath) signupParams.set("next", nextPath);
  const signupHref = `/signup?${signupParams.toString()}`;
  const loginHref = nextPath
    ? `/login?next=${encodeURIComponent(nextPath)}`
    : "/login";

  return (
    <section className="rounded-3xl border border-aurora/30 bg-gradient-to-br from-aurora/15 via-slate-900/80 to-ember/15 p-6 shadow-glass">
      <p className="text-xs uppercase tracking-[0.3em] text-aurora">
        {eyebrow}
      </p>
      <h2
        className="mt-3 text-2xl font-semibold leading-tight md:text-3xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {headline}
      </h2>
      <p className="mt-3 text-sm text-white/80">{body}</p>
      {bullets && bullets.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm text-white/75">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          href={signupHref}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-aurora to-ember px-5 py-2.5 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
        >
          {primaryCta}
        </Link>
        <Link
          href={loginHref}
          className="text-sm text-white/70 underline-offset-2 hover:text-white hover:underline"
        >
          Already a fan? Sign in
        </Link>
      </div>
      {firstRewardLine && (
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-aurora/30 bg-aurora/10 px-3 py-1 text-xs font-medium text-aurora">
          {firstRewardLine}
        </p>
      )}
    </section>
  );
}
