import Link from "next/link";
import type { Artist } from "@/lib/artists";
import type { LandingStats } from "@/lib/data/landing-stats";
import FoundingFanBlock from "@/components/founding-fan-block";
import { getArtistKeyArt } from "@/lib/artist-keyart";
import { Icon, type IconName } from "@/components/icon";

/**
 * Public-facing marketing landing rendered at `/` for signed-out visitors.
 *
 * Funnel order:
 *   hero → founding-fan urgency → live proof tiles → how-it-works →
 *   feature pillars → featured artists → closing CTA.
 *
 * Signed-in fans never see this — they hit the personalized Fan Home
 * dashboard from Phase 3e instead.
 */
export default function SignedOutLanding({
  artists,
  stats,
}: {
  artists: Artist[];
  stats: LandingStats;
}) {
  const featured = artists.slice(0, 5);

  return (
    <main className="overflow-hidden">
      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative border-b border-white/5">
        {/* Ambient stage-light video loop behind the hero */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <video
            className="absolute inset-0 h-full w-full object-cover opacity-60"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
          >
            <source src="/videos/hero-aurora-loop.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-background" />
          <div className="absolute -top-24 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-br from-aurora/30 via-ember/15 to-transparent blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-[1.15fr_1fr] lg:py-28">
          <div className="flex flex-col justify-center">
            <p className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-widest text-white/70">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              The fan experience platform
            </p>
            <h1
              className="text-5xl font-semibold leading-[1.05] md:text-6xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Turn casual fans
              <br />
              <span className="bg-gradient-to-r from-aurora via-fuchsia-400 to-ember bg-clip-text text-transparent">
                into real fan experiences.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/70">
              Follow the artists you love, earn points for every fan move, and
              unlock real drops, events, and access the casuals never see.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup?ref=raelynn&next=%2Fonboarding"
                className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
              >
                Create your fan profile →
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-white/20 px-5 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
              >
                Sign in
              </Link>
            </div>
            <p className="mt-4 text-xs text-white/50">
              Free · 60 seconds · No credit card
            </p>
            <p className="mt-2 text-xs font-medium text-aurora">
              Join free and earn your first 100 fan points today.
            </p>
          </div>

          {/* Hero visual — stylized preview card stack */}
          <div className="relative hidden lg:block">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative h-[440px] w-[360px]">
                {/* Back card */}
                <div className="absolute left-8 top-12 h-[380px] w-[320px] rotate-3 rounded-3xl border border-white/10 bg-gradient-to-br from-ember/25 via-slate-900 to-aurora/25 shadow-glass">
                  <div className="p-6 text-white/70">
                    <p className="text-xs uppercase tracking-widest">
                      Next Event
                    </p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      Nashville Listening Party
                    </p>
                    <p className="mt-1 text-xs text-white/60">
                      Thu · 8pm · +25 pts for RSVP
                    </p>
                  </div>
                </div>
                {/* Front card */}
                <div className="absolute left-0 top-0 h-[380px] w-[320px] -rotate-2 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-aurora/40 via-slate-900 to-black p-6 shadow-glass">
                  <video
                    aria-hidden
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35 mix-blend-screen"
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="auto"
                  >
                    <source src="/videos/fan-profile-holo-loop.mp4" type="video/mp4" />
                  </video>
                  <div className="relative">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-widest text-white/60">
                        Fan Profile
                      </p>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">
                        Gold tier
                      </span>
                    </div>
                    <p
                      className="mt-6 text-4xl font-semibold text-white"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      11,420
                    </p>
                    <p className="text-xs text-white/50">total points</p>
                    <div className="mt-6 space-y-2">
                      <div className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2 text-xs">
                        <span className="flex items-center gap-2">
                          <Icon name="trophy" size={16} /> Challenge crasher
                        </span>
                        <span className="text-emerald-300">+250</span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2 text-xs">
                        <span className="flex items-center gap-2">
                          <Icon name="ticket" size={16} /> Austin Listening Party
                        </span>
                        <span className="text-emerald-300">+25</span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2 text-xs">
                        <span className="flex items-center gap-2">
                          <Icon name="handshake" size={16} /> Invited 3 friends
                        </span>
                        <span className="text-emerald-300">+450</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Founding-fan urgency ─────────────────────────────────────────── */}
      <FoundingFanBlock stats={stats} />

      {/* ─── Live proof tiles ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div
          className={`grid gap-3 sm:grid-cols-2 ${
            stats.foundingClosed ? "lg:grid-cols-3" : "lg:grid-cols-4"
          }`}
        >
          <ProofTile
            label={stats.activeArtists === 1 ? "Active artist" : "Active artists"}
            value={stats.activeArtists}
            icon="mic"
          />
          <ProofTile
            label={stats.activeEvents === 1 ? "Live show lined up" : "Live shows lined up"}
            value={stats.activeEvents}
            icon="ticket"
          />
          <ProofTile
            label="Founding members inducted"
            value={stats.foundingFans}
            icon="medal"
          />
          {!stats.foundingClosed && (
            <ProofTile
              label="Days to claim founding"
              value={stats.daysUntilFoundingCloses}
              icon="hourglass"
            />
          )}
        </div>
      </section>

      {/* ─── How it works ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <p className="text-xs uppercase tracking-widest text-white/50">
          How it works
        </p>
        <h2
          className="mt-2 max-w-2xl text-3xl font-semibold md:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Three steps from casual fan to fan experience.
        </h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            {
              n: "01",
              title: "Follow your artists",
              body: "Pick the artists you love. You'll get their drops, events, polls, and challenges in one feed.",
              icon: "headphones" as IconName,
            },
            {
              n: "02",
              title: "Earn points for every fan move",
              body: "RSVPing an event, voting in a poll, commenting, sharing your referral code — all of it earns points.",
              icon: "lightning" as IconName,
            },
            {
              n: "03",
              title: "Unlock real drops + access",
              body: "Signed vinyl, backstage soundchecks, VIP listening parties, limited merch. Points cash in for the real thing.",
              icon: "gift" as IconName,
            },
          ].map((step) => (
            <div
              key={step.n}
              className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-6"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-white/50">
                  {step.n}
                </span>
                <Icon name={step.icon} size={32} />
              </div>
              <h3 className="mt-6 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-white/65">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Feature pillars ──────────────────────────────────────────────── */}
      <section className="border-y border-white/5 bg-black/20">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-widest text-white/50">
                What you get
              </p>
              <h2
                className="mt-2 text-3xl font-semibold md:text-4xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                More than a mailing list.
                <br />
                A real fan experience.
              </h2>
              <p className="mt-6 max-w-md text-white/70">
                Everything in one place — events, community, rewards, and the
                stuff the casuals never see.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                {
                  title: "Tier Journey",
                  body: "Bronze → Silver → Gold → Platinum. Every action moves you up.",
                  icon: "medal" as IconName,
                },
                {
                  title: "Community Hub",
                  body: "Posts, polls, challenges — per artist, moderated, never spam.",
                  icon: "chat" as IconName,
                },
                {
                  title: "Event RSVPs",
                  body: "Capacity-limited listening parties, soundchecks, meet-ups. Reminders included.",
                  icon: "ticket" as IconName,
                },
                {
                  title: "Rewards Marketplace",
                  body: "Redeem points for signed gear, backstage access, or merch exclusives.",
                  icon: "gift" as IconName,
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="rounded-2xl border border-white/10 bg-black/30 p-5"
                >
                  <Icon name={f.icon} size={32} />
                  <h3 className="mt-3 font-semibold">{f.title}</h3>
                  <p className="mt-1 text-xs text-white/60">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Featured artists ─────────────────────────────────────────────── */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-white/50">
                Featured artists
              </p>
              <h2
                className="mt-2 text-3xl font-semibold md:text-4xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Already on Fan Engage.
              </h2>
            </div>
            <Link
              href="/artists"
              className="hidden items-center gap-1 text-sm font-medium text-white/70 hover:text-white sm:inline-flex"
            >
              See all →
            </Link>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {featured.map((a) => (
              <Link
                key={a.slug}
                href={`/artists/${a.slug}`}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-5 transition hover:border-white/25 hover:bg-white/5"
              >
                <div
                  aria-hidden
                  className="absolute inset-0 bg-cover bg-center opacity-60 transition duration-300 group-hover:opacity-80"
                  style={{ backgroundImage: `url(${getArtistKeyArt(a.slug, a.genres)})` }}
                />
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10"
                />
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-80"
                  style={{
                    backgroundImage: `linear-gradient(90deg, ${a.accentFrom}, ${a.accentTo})`,
                  }}
                />
                <div className="relative">
                  <p className="mt-2 text-base font-semibold">{a.name}</p>
                  {a.tagline && (
                    <p className="mt-1 text-xs text-white/55 line-clamp-2">
                      {a.tagline}
                    </p>
                  )}
                  <p className="mt-4 text-xs text-white/50 transition group-hover:text-white/80">
                    Visit page →
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ─── Closing CTA ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-aurora/25 via-slate-900 to-ember/25 p-10 text-center shadow-glass md:p-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_circle_at_50%_-20%,rgba(124,58,237,0.35),transparent)]"
          />
          <p className="relative text-xs uppercase tracking-widest text-white/60">
            Ready to earn your first 100 points?
          </p>
          <h2
            className="relative mt-3 text-3xl font-semibold md:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Join free in under a minute.
          </h2>
          <p className="relative mt-4 text-white/70">
            No credit card. No spam. Just your favorite artists and the perks
            they reserve for real fans.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup?ref=raelynn&next=%2Fonboarding"
              className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
            >
              Create fan profile →
            </Link>
            <Link
              href="/artists"
              className="rounded-full border border-white/25 px-5 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
            >
              Browse artists
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function ProofTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: IconName;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
      <div className="flex items-center justify-between">
        <Icon name={icon} size={28} />
        <span
          className="text-3xl font-semibold tabular-nums text-white"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {value.toLocaleString("en-US")}
        </span>
      </div>
      <p className="mt-3 text-xs uppercase tracking-wide text-white/55">
        {label}
      </p>
    </div>
  );
}
