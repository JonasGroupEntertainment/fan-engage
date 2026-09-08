import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "For Artists",
  description:
    "Launch a branded fan experience on Fan Engage. Reward fans, activate drops, promote events, and build direct fan relationships your label can't take from you.",
  alternates: { canonical: "/for-artists" },
  openGraph: {
    type: "website",
    url: "/for-artists",
    siteName: "Fan Engage",
    title: "Launch a fan experience your fans actually use",
    description:
      "Fan Engage helps artists build direct fan relationships, reward real engagement, and turn fan activity into drops, RSVPs, referrals, and community moments — without losing the artist's voice.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Launch a fan experience your fans actually use",
    description:
      "Direct fan relationships, real rewards, drops, RSVPs, and community — built for working artists.",
  },
};

/**
 * Public artist-acquisition landing page.
 *
 * Refreshed 2026-05-06 to address Carla/Manus audit recommendations:
 *   - Stronger benefit-led hero copy
 *   - Proof / "what's already live" section
 *   - Data ownership section (safer interim copy until legal lands)
 *   - Expanded "how launch works" walkthrough
 *   - 7-question FAQ targeting manager objections
 *   - Closing CTA reinforces application action
 *
 * Preserves the existing dark premium aesthetic and component primitives.
 * Deliberately does not invent legal terms, pricing, or performance metrics —
 * uses qualitative proof and "confirmed in onboarding" language until the
 * Artist Agreement is finalized.
 */
export default function ForArtistsPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-20 px-6 py-16">
      {/* ─── Hero ──────────────────────────────────────────────────────────── */}
      <section className="space-y-6 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">
          For Artists
        </p>
        <h1
          className="text-5xl font-semibold leading-[1.05] md:text-6xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Launch a fan experience your{" "}
          <span className="bg-gradient-to-r from-aurora via-fuchsia-400 to-ember bg-clip-text text-transparent">
            fans
          </span>{" "}
          actually use.
        </h1>
        <p className="mx-auto max-w-2xl text-base text-white/75 md:text-lg">
          Fan Engage helps artists build direct fan relationships, reward real
          engagement, and turn fan activity into drops, RSVPs, referrals, and
          community moments — without losing the artist&apos;s voice.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
          <Link
            href="/for-artists/apply"
            className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
          >
            Apply to launch your fan experience →
          </Link>
          <Link
            href="/artists"
            className="rounded-full border border-white/30 px-6 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
          >
            View live fan experiences
          </Link>
        </div>
        <p className="pt-2 text-xs text-white/50">
          No payment or contract required to apply. We respond within 48 hours.
        </p>
        <p className="text-xs text-white/45">
          Already approved?{" "}
          <Link
            href="/login"
            className="text-white/80 underline-offset-4 hover:underline"
          >
            Sign in to your admin →
          </Link>
        </p>
      </section>

      {/* ─── Overview video ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl">
        <video
          className="w-full rounded-2xl border border-white/10 shadow-glass"
          controls
          preload="metadata"
        >
          <source src="/videos/for-artists-overview.mp4" type="video/mp4" />
        </video>
      </section>

      {/* ─── Proof: what's already live ────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">
            Already live on Fan Engage
          </p>
          <h2
            className="mt-2 text-3xl font-semibold md:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Built for real artist communities.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-white/70">
            Each artist gets a branded fan experience where fans follow, earn points,
            unlock rewards, RSVP to events, and stay close to what&apos;s
            happening next. Browse the active clubs to see what your hub could
            look like.
          </p>
        </div>
        <div className="flex justify-center pt-4">
          <Link
            href="/artists"
            className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-medium text-white/85 hover:bg-white/10"
          >
            Browse all fan experiences →
          </Link>
        </div>
      </section>

      {/* ─── Featured artists (real proof) ────────────────────────────────── */}
      <section className="space-y-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">
            Featured artists
          </p>
          <h2
            className="mt-2 text-3xl font-semibold md:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Real fan experiences, real artists.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-white/70">
            A handful of the artists who built their fan experience on Fan Engage.
            Click through to see what their hub actually looks like.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              slug: "raelynn",
              name: "RaeLynn",
              tagline: "Country, heart-first. On tour with Luke Bryan.",
              accent: "#fde68a",
            },
            {
              slug: "danger-twins",
              name: "Danger Twins",
              tagline: "Pop duo. High-energy fans, high-stakes drops.",
              accent: "#f0abfc",
            },
            {
              slug: "dan-marshall",
              name: "Dan Marshall",
              tagline: "Indie singer-songwriter. Founders-only EP.",
              accent: "#a78bfa",
            },
            {
              slug: "hunter-hawkins",
              name: "Hunter Hawkins",
              tagline: "Country newcomer. Tour route built around the fans.",
              accent: "#7dd3fc",
            },
          ].map((a) => (
            <Link
              key={a.slug}
              href={`/artists/${a.slug}`}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-5 transition hover:border-white/25 hover:bg-white/5"
            >
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-1"
                style={{ backgroundColor: a.accent }}
              />
              <p className="mt-2 text-base font-semibold">{a.name}</p>
              <p className="mt-2 text-xs text-white/60 line-clamp-3">
                {a.tagline}
              </p>
              <p className="mt-4 text-xs text-white/55 transition group-hover:text-white/85">
                See their fan experience →
              </p>
            </Link>
          ))}
        </div>
        {/* TODO(kevin): when we have real testimonial quotes from these
            artists or their managers, replace the tagline strings above
            with pull-quotes. Keep slugs + names so the cards still link
            through to /artists/<slug>. */}
      </section>

      {/* ─── What artists can launch ───────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">
            What you can launch
          </p>
          <h2
            className="mt-2 text-3xl font-semibold md:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Tools your fans actually want to use.
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Drops & founder tiers",
              body: "Limited-edition merch, early-access tickets, founder-only experiences. Cap your founders at 100 and let the rest stack points toward the next tier.",
            },
            {
              title: "AI-drafted comment replies",
              body: "Your fans comment, you reply at scale. Claude drafts your tone-perfect response — keep them, edit them, ignore them.",
            },
            {
              title: "Smart event matching",
              body: "When a tour date drops, fans within driving distance get a notification with their best route. Conversion-grade.",
            },
            {
              title: "Weekly fan digest",
              body: "Every fan gets a personalized weekly recap — their points earned, their drops unlocked, what's coming next. Goes straight to their inbox.",
            },
            {
              title: "Referrals & predictions",
              body: "Fans invite fans for a points bounty. Predictions and polls earn points and create reasons to come back.",
            },
            {
              title: "Founding member moments",
              body: "Capacity-limited tiers, anniversary unlocks, leaderboards. The mechanics that turn casual listeners into people who actually show up.",
            },
          ].map((card) => (
            <div key={card.title} className="glass-card rounded-2xl p-6">
              <p className="text-sm font-semibold">{card.title}</p>
              <p className="mt-2 text-xs text-white/65">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Data ownership ────────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-aurora/15 via-black to-ember/15 p-10">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">
          Your audience, your relationship
        </p>
        <h2
          className="mt-3 text-3xl font-semibold md:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          The fans you build here stay yours.
        </h2>
        <p className="mt-5 max-w-3xl text-sm text-white/75">
          Fan Engage is built so artists strengthen direct fan relationships
          instead of renting attention from social platforms. You can see your
          fans, you can talk to them, and the contact data they share with
          you doesn&apos;t live behind someone else&apos;s ranking algorithm.
        </p>
        <p className="mt-4 max-w-3xl text-xs text-white/55">
          Final data access, export, and permission terms are confirmed during
          onboarding and reflected in the artist agreement. We&apos;ll walk
          through what you can pull, what fans control, and how email and SMS
          opt-in works before you go live.
        </p>
      </section>

      {/* ─── How launch works ──────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-amber-500/10 via-black to-aurora/10 p-10 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">
          How launch works
        </p>
        <h2
          className="mt-3 text-3xl font-semibold md:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Four steps from application to live.
        </h2>
        <ol className="mx-auto mt-8 grid max-w-4xl gap-4 text-left text-sm text-white/80 md:grid-cols-4">
          {[
            {
              n: "1. Apply",
              body: "Tell us about your music, your fans, and what you want a fan experience to look like.",
            },
            {
              n: "2. Review",
              body: "We respond within 48 hours. If you're a fit we'll schedule a call with you and your manager.",
            },
            {
              n: "3. Build",
              body: "Guided setup wizard: hero image, first drop, first community post, connect your tools.",
            },
            {
              n: "4. Launch",
              body: "Flip your hub live, invite your first founders, and watch the points start flowing.",
            },
          ].map((step) => (
            <li key={step.n} className="rounded-2xl bg-white/5 p-5">
              <span className="text-xs uppercase tracking-wide text-aurora">
                {step.n}
              </span>
              <p className="mt-2 font-medium">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ─── FAQ ───────────────────────────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">
            FAQ
          </p>
          <h2
            className="mt-2 text-3xl font-semibold md:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Manager-grade questions, answered.
          </h2>
        </div>
        <div className="space-y-3">
          {[
            {
              q: "What does Fan Engage help artists do?",
              a: "Build a branded fan experience where fans follow, earn points, unlock drops, RSVP to events, refer friends, and stay close. You get direct fan relationships, real engagement signal, and tools that turn casual listeners into people who actually show up.",
            },
            {
              q: "How long does launch take?",
              a: "Most artists go from approved application to live hub in two to four weeks, depending on assets ready (hero image, bio, first drop or perk). Our team confirms a realistic timeline during the onboarding call.",
            },
            {
              q: "Do artists own their fan data?",
              a: "Direct fan relationships stay with the artist. Final data access, export, and permission specifics are confirmed in the artist agreement at onboarding so you and your manager can review before signing anything.",
            },
            {
              q: "What does it cost?",
              a: "Pricing is reviewed with the artist team during onboarding so it can be matched to your fanbase size and goals. There's no payment or contract required to apply.",
            },
            {
              q: "Can managers, labels, or artist teams apply?",
              a: "Yes. The application asks for the artist's name and a primary contact — that contact can be the artist, a manager, or someone on the team. We loop in everyone who needs to sign off during the review call.",
            },
            {
              q: "Can we start with a small beta or founder group?",
              a: "Yes — the founder tier is capped at 100 and is designed for that. Most artists start with founders only and open the rest of the experience after the first drop or event.",
            },
            {
              q: "Who fulfills rewards and physical drops?",
              a: "Depends on the reward. Digital perks (early access, exclusive content, leaderboard placement) are handled by the platform. Physical drops are usually fulfilled by the artist's existing merch partner — we plug into the workflow you already have.",
            },
          ].map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-white/10 bg-black/30 p-5 transition hover:border-white/25"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-medium text-white/90 marker:hidden">
                <span>{item.q}</span>
                <span className="text-aurora transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-white/70">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ─── Closing CTA ───────────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-aurora/25 via-slate-900 to-ember/25 p-10 text-center md:p-16">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">
          Ready when you are
        </p>
        <h2
          className="mt-3 text-3xl font-semibold md:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Let&apos;s build your fan experience.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm text-white/75">
          Apply free in under five minutes. We respond within 48 hours and walk
          you through a launch plan that fits your team.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/for-artists/apply"
            className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
          >
            Apply to launch your fan experience →
          </Link>
          <Link
            href="/artists"
            className="rounded-full border border-white/25 px-5 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
          >
            View live fan experiences
          </Link>
        </div>
      </section>
    </main>
  );
}
