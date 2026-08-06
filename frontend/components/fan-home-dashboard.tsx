import Link from "next/link";
import WeeklyRecapTile from "@/components/weekly-recap-tile";
import type { WeeklyRecap } from "@/lib/personal-recap/types";
import PushOptInBanner from "@/components/push-opt-in-banner";
import StreakTile from "@/components/streak-tile";
import type { FanHomeData, FanHomeUpcomingEvent } from "@/lib/data/fan-home";
import { focalPointStyle } from "@/lib/images/focal-point";

// Strip-card focal point now comes from artists.hero_focal_x /
// .hero_focal_y (migration 0035), exposed on FanHomeFollowedArtist
// directly. focalPointStyle() falls back to 50/50 when not set.


/**
 * Personalized Fan Home dashboard — everything a signed-in fan sees at /
 * above the existing marketing content. All data comes from getFanHomeData()
 * so there are no client-side fetches here.
 */
export default function FanHomeDashboard({ data, streak, recap, totalPoints }: { data: FanHomeData; streak?: { currentStreakDays: number; longestStreakDays: number; pointsAwardedThisVisit: number; newMilestone: number | null; isNewToday: boolean; lastActiveDate: string | null } | null; recap?: WeeklyRecap | null; totalPoints?: number | null }) {
  const {
    fan,
    followedArtists,
    upcomingEvents,
    ctas,
    recentActivity,
    badgesInProgress,
    premiumCommunities,
    founderCommunities,
  } = data;

  // Pick the first community for the rewards link (or fallback)
  const primaryCommunity = followedArtists[0]?.slug || "raelynn";

  return (
    <section className="space-y-6">
      {/* Greeting + quick stats */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">
            Welcome back{fan.first_name ? `, ${fan.first_name.split(" ")[0]}` : ""}
          </p>
          <h1
            className="mt-2 text-3xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Your fan experience
          </h1>
        </div>
      </header>

      {/* Followed artists strip */}
      <PushOptInBanner />
      {streak && <StreakTile
        currentStreakDays={streak.currentStreakDays}
        longestStreakDays={streak.longestStreakDays}
        pointsAwardedThisVisit={streak.pointsAwardedThisVisit}
        newMilestone={streak.newMilestone}
      />}
      {recap && <WeeklyRecapTile recap={recap} firstName={data.fan?.first_name ?? null} />}
      <FollowedArtistsStrip artists={followedArtists} />

      {/* Upcoming events — top 3 from any followed artist */}
      <UpcomingEventsList events={upcomingEvents} hasFollows={followedArtists.length > 0} />

      {/* Streak card — amber fire card, only when streak >= 1 */}
      <StreakCard streak={streak} />

      {/* Daily quest — first incomplete CTA surfaced as a highlighted action */}
      <DailyQuestCard ctas={ctas} primaryCommunity={primaryCommunity} />

      {/* Monthly credit — teal card, only for premium fans with a balance */}
      <CreditBalanceCard
        creditCents={fan.monthly_credit_cents ?? 0}
        isPremium={premiumCommunities.length > 0}
      />

      {/* Active CTAs */}
      <ActiveCtasBlock ctas={ctas} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent activity */}
        <RecentActivityFeed
          posts={recentActivity}
          hasFollows={followedArtists.length > 0}
          premiumCommunities={premiumCommunities}
          founderCommunities={founderCommunities}
        />

        {/* Badges in progress */}
        <BadgesInProgressPanel items={badgesInProgress} />
      </div>

      {/* Spend your points card */}
      <SpendPointsCard
        primaryCommunity={primaryCommunity}
        points={totalPoints ?? fan.total_points}
      />
    </section>
  );
}

function FollowedArtistsStrip({
  artists,
}: {
  artists: FanHomeData["followedArtists"];
}) {
  if (artists.length === 0) {
    return (
      <div className="glass-card p-5">
        <p className="text-sm font-semibold">Follow your favorite artists</p>
        <p className="mt-2 text-xs text-white/60">
          Tap an artist, hit <span className="text-white">+ Follow</span>, and you&apos;ll get
          their posts, events, and drops here.
        </p>
        <Link
          href="/artists"
          className="mt-3 inline-flex rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
        >
          Browse artists →
        </Link>
      </div>
    );
  }
  return (
    <div className="glass-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-white/60">
          Following · {artists.length}
        </p>
        <Link href="/artists" className="text-xs text-white/60 hover:text-white">
          Add more →
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {artists.map((a) => (
          <Link
            key={a.slug}
            href={`/artists/${a.slug}`}
            className="group relative flex w-44 shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 transition hover:border-white/30 hover:-translate-y-0.5"
          >
            {/* Photo area: 3:4 portrait so the artist reads cleanly at this width. */}
            <div className="relative aspect-[3/4] w-full overflow-hidden bg-black/40">
              {a.hero_image ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.hero_image}
                    alt=""
                    style={focalPointStyle(a)}
                    className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                    aria-hidden
                  />
                </>
              ) : (
                // Fallback when no hero is uploaded yet — accent gradient stand-in.
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `linear-gradient(to bottom right, ${a.accent_from}, ${a.accent_to})`,
                  }}
                  aria-hidden
                />
              )}

              {/* Bottom-up dark gradient so the name + tagline stay readable on any photo. */}
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0) 100%)",
                }}
                aria-hidden
              />

              {/* Name + tagline overlay */}
              <div className="absolute inset-x-0 bottom-0 p-3">
                <p className="text-sm font-semibold text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.7)]">
                  {a.name}
                </p>
                {a.tagline && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-white/80 drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
                    {a.tagline}
                  </p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * Renders up to 3 upcoming public-tier events from the fan's followed
 * artists. Each row links through to the artist's events page where the
 * fan can RSVP. The `rsvped` flag drives a subtle "✓ Going" indicator so
 * RSVPed shows still feel personal.
 */
function UpcomingEventsList({
  events,
  hasFollows,
}: {
  events: FanHomeUpcomingEvent[];
  hasFollows: boolean;
}) {
  // Empty state copy depends on why the list is empty:
  //   - fan follows nobody → nudge to follow an artist
  //   - fan follows artists but none have upcoming public events → say so
  if (events.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-5">
        <p className="text-xs uppercase tracking-wide text-white/60">Upcoming</p>
        <p className="mt-3 text-sm text-white/70">
          {hasFollows
            ? "No upcoming shows from your artists yet — check back soon."
            : "Follow an artist to see their upcoming shows here."}
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-white/60">
          Upcoming · {events.length}
        </p>
      </div>
      <ul className="mt-4 space-y-3">
        {events.map((e) => (
          <li key={e.id}>
            <Link
              href={`/artists/${e.artist_slug}`}
              className="group flex items-start justify-between gap-3 rounded-xl bg-black/20 p-3 transition hover:bg-black/30"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-white/50">
                  {e.event_date ?? "Date TBD"}
                </p>
                <p className="mt-1 line-clamp-2 text-sm font-semibold text-white">
                  {e.title}
                </p>
                <p className="mt-1 text-xs text-white/60">
                  {e.artist_name ? `${e.artist_name} · ` : ""}
                  {e.location ? `📍 ${e.location}` : "Location TBA"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {e.rsvped ? (
                  <span className="inline-flex rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300">
                    ✓ Going
                  </span>
                ) : (
                  <span className="inline-flex text-xs text-white/50 group-hover:text-white/80">
                    RSVP →
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActiveCtasBlock({ ctas }: { ctas: FanHomeData["ctas"] }) {
  if (ctas.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ctas.map((cta) => (
        <Link
          key={cta.id}
          href={cta.url || "#"}
          className="glass-card group flex items-center gap-3 rounded-2xl p-4 transition hover:border-white/20"
        >
          <div className="text-xl">{cta.kind === "share" ? "📣" : "✨"}</div>
          <div>
            <p className="text-xs font-semibold">{cta.title}</p>
            <p className="text-xs text-white/60">{cta.description}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

/**
 * Renders up to 3 of the most recent community posts from the fan's
 * followed artists' communities. Each row falls back to a body excerpt
 * when `title` is null (regular `post`-kind entries don't carry a title),
 * tags the kind, and links through to the artist's community feed.
 *
 * Premium-tier post bodies are gated unless the viewer has premium membership
 * in that community; founder-only post bodies are gated unless the viewer
 * is a founder. Titles + kind chips render either way so the feed still
 * communicates "something happened" even when the body is hidden.
 */
function RecentActivityFeed({
  posts,
  hasFollows,
  premiumCommunities,
  founderCommunities,
}: {
  posts: FanHomeData["recentActivity"];
  hasFollows: boolean;
  premiumCommunities: string[];
  founderCommunities: string[];
}) {
  if (posts.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-5">
        <p className="text-xs uppercase tracking-wide text-white/60">Recent activity</p>
        <p className="mt-3 text-sm text-white/70">
          {hasFollows
            ? "Nothing new from your artists yet."
            : "Follow an artist to see their community posts here."}
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-5">
      <p className="text-xs uppercase tracking-wide text-white/60">Recent activity</p>
      <ul className="mt-4 space-y-3">
        {posts.slice(0, 5).map((post) => {
          const badge = postKindBadge(post.kind);
          // Gate body for premium / founder-only posts unless the viewer has
          // the right membership. Title + kind chip still surface either way.
          const bodyAccessible =
            post.visibility === "public" ||
            (post.visibility === "premium" &&
              premiumCommunities.includes(post.artist_slug)) ||
            (post.visibility === "founder-only" &&
              founderCommunities.includes(post.artist_slug));
          // Pick the most useful display string:
          //   1. Title if present (announcements, polls with a title, challenges)
          //   2. Body excerpt if accessible (regular posts, body-bearing types)
          //   3. Generic fallback ("New premium post" / "Founders-only post")
          const title = post.title?.trim();
          const display = title
            ? title
            : bodyAccessible
              ? truncate(post.body, 80)
              : post.visibility === "founder-only"
                ? "Founders-only post"
                : "New premium post";
          return (
            <li key={post.id} className="border-b border-white/5 pb-3 last:border-0">
              <Link
                href={`/artists/${post.artist_slug}/community`}
                className="group block"
              >
                <p className="text-xs uppercase tracking-wide text-white/50">
                  {badge.icon} {badge.label}
                  {post.pinned && (
                    <span className="ml-2 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-white/60">
                      📌 Pinned
                    </span>
                  )}
                </p>
                <p className="mt-1 line-clamp-2 text-xs font-semibold text-white group-hover:text-white">
                  {display}
                </p>
                <p className="mt-1 text-xs text-white/50">
                  {post.artist_name ?? post.artist_slug}
                  {post.author_first_name ? ` · ${post.author_first_name}` : ""}
                  {" · "}
                  {timeAgo(post.created_at)}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link
        href="/activity"
        className="mt-4 flex items-center justify-center gap-1 text-xs text-white/50 hover:text-white/80 transition"
      >
        View all activity →
      </Link>
    </div>
  );
}

/** Map community_post_kind → emoji + human label for the chip on each row. */
function postKindBadge(kind: string): { icon: string; label: string } {
  switch (kind) {
    case "announcement":
      return { icon: "📢", label: "Announcement" };
    case "poll":
      return { icon: "📊", label: "Poll" };
    case "challenge":
      return { icon: "🏆", label: "Challenge" };
    default:
      return { icon: "📝", label: "Post" };
  }
}

/** Trim a body string to ≤ N chars on a word boundary, with an ellipsis. */
function truncate(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  // Cut at the last whitespace before n so we don't slice mid-word.
  const head = t.slice(0, n);
  const lastSpace = head.lastIndexOf(" ");
  return (lastSpace > n * 0.5 ? head.slice(0, lastSpace) : head).trimEnd() + "…";
}

/**
 * Render an ISO timestamp as a coarse relative string ("2h ago", "4d ago").
 * Server-only — Fan Home is force-dynamic so this re-renders on each load
 * and there's no client hydration mismatch to worry about.
 */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const ms = Math.max(0, Date.now() - then);
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.round(day / 7);
  if (wk < 4) return `${wk}w ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.round(day / 365);
  return `${yr}y ago`;
}

function BadgesInProgressPanel({ items }: { items: FanHomeData["badgesInProgress"] }) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <p className="text-xs uppercase tracking-wide text-white/60">Badges in progress</p>
      {items.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.slice(0, 6).map((badge) => {
            const pct =
              badge.threshold > 0
                ? Math.min(
                    100,
                    Math.round((badge.progress / badge.threshold) * 100),
                  )
                : 0;
            return (
              <div
                key={badge.slug}
                className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-center transition hover:border-white/25 hover:bg-white/10"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-aurora/30 to-ember/30 text-3xl">
                  {badge.icon ?? "🏅"}
                </span>
                <span className="text-sm font-semibold leading-tight">
                  {badge.name}
                </span>
                {badge.threshold > 0 && (
                  <>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-aurora to-ember"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs uppercase tracking-wide text-white/50">
                      {badge.progress}/{badge.threshold}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-xs text-white/50">
          Keep engaging — new badges will appear here as you make progress.
        </p>
      )}
    </div>
  );
}

/**
 * Surfaces the fan's next incomplete CTA as a "Today's Quest" card.
 * Hidden entirely when all CTAs are completed or none exist.
 */
function DailyQuestCard({
  ctas,
  primaryCommunity,
}: {
  ctas: FanHomeData["ctas"];
  primaryCommunity: string;
}) {
  const quest = ctas.find((c) => !c.completed);
  if (!quest) return null;

  const kindIcon: Record<string, string> = {
    poll: "📊",
    challenge: "🏆",
    rsvp: "🎟️",
    community_post: "💬",
    referral: "🔗",
    merch: "🛍️",
    stream: "🎵",
  };
  const icon = kindIcon[quest.kind] ?? "⚡";
  const href = quest.url ?? `/artists/${quest.artist_slug}`;

  return (
    <Link
      href={href}
      className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-aurora/30 bg-gradient-to-r from-aurora/10 via-fuchsia-500/10 to-ember/10 p-5 transition hover:border-aurora/60 hover:brightness-110"
    >
      {/* glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-aurora/20 blur-3xl"
      />
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-black/30 text-2xl ring-1 ring-white/10">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-aurora">
          Today&apos;s quest
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-white">
          {quest.title}
        </p>
        {quest.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-white/60">
            {quest.description}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold text-aurora">+{quest.point_value}</p>
        <p className="text-[10px] uppercase tracking-wide text-white/50">pts</p>
      </div>
    </Link>
  );
}

/** Next milestone above `days` in the canonical streak ladder. */
function nextStreakMilestone(days: number): number {
  for (const m of [7, 30, 100, 365]) {
    if (days < m) return m;
  }
  return 365;
}

/**
 * Amber fire card showing the fan's current login/engagement streak.
 * Hidden when streak is 0 or when no streak data is available.
 */
function StreakCard({
  streak,
}: {
  streak?: { currentStreakDays: number; longestStreakDays: number; pointsAwardedThisVisit: number; newMilestone: number | null; isNewToday: boolean; lastActiveDate: string | null } | null;
}) {
  if (!streak || streak.currentStreakDays < 1) return null;
  const days = streak.currentStreakDays;
  const milestone = nextStreakMilestone(days);
  const pct = Math.min(100, Math.round((days / milestone) * 100));

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-400/10 p-5">
      {/* ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-amber-400/20 blur-3xl"
      />
      <div className="flex items-center gap-3">
        <span className="text-3xl" aria-hidden>🔥</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-300">
            Streak
          </p>
          <p className="mt-0.5 text-xl font-bold text-white">
            {days.toLocaleString()}-day streak
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-amber-300/80">next</p>
          <p className="text-sm font-bold text-amber-200">{milestone}d</p>
        </div>
      </div>
      {/* progress to next milestone */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-right text-[10px] text-amber-300/70">
        {days}/{milestone} days
      </p>
    </div>
  );
}

/**
 * Teal credit card — only visible to premium fans with a non-zero balance.
 */
function CreditBalanceCard({
  creditCents,
  isPremium,
}: {
  creditCents: number;
  isPremium: boolean;
}) {
  if (!isPremium || creditCents <= 0) return null;
  const dollars = (creditCents / 100).toFixed(2);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-teal-400/40 bg-gradient-to-r from-teal-500/10 via-cyan-500/10 to-teal-400/10 p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-teal-400/20 blur-3xl"
      />
      <div className="flex items-center gap-3">
        <span className="text-3xl" aria-hidden>💳</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-teal-300">
            Monthly credit
          </p>
          <p className="mt-0.5 text-xl font-bold text-white">${dollars}</p>
          <p className="mt-0.5 text-xs text-teal-300/70">
            Used automatically at checkout
          </p>
        </div>
      </div>
    </div>
  );
}

function SpendPointsCard({
  primaryCommunity,
  points,
}: {
  primaryCommunity: string;
  points: number;
}) {
  return (
    <div className="glass-card rounded-2xl p-5 border border-gradient-to-r from-purple-500/30 to-blue-500/30">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/60">Spend your points</p>
          <p className="mt-1 text-sm font-semibold">{points.toLocaleString()} available</p>
        </div>
        <Link
          href={`/artists/${primaryCommunity}/rewards`}
          className="inline-flex rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-2 text-xs font-medium text-white hover:opacity-90"
        >
          Browse rewards →
        </Link>
      </div>
    </div>
  );
}
