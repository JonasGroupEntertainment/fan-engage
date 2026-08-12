import Link from "next/link";
import LeaderboardMiniCard from "@/components/leaderboard-mini-card";
import { LatestStrip } from "@/components/latest-strip";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { listArtists } from "@/lib/artists";
import {
  doesFanFollowArtist,
  getArtistFromDb,
} from "@/lib/data/artists";
import { getRsvpMetaForEvents } from "@/lib/data/events";
import { getCurrentFan } from "@/lib/data/fan";
import { canAccess, getViewerEntitlement } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import PremiumPaywall from "@/components/premium-paywall";
import SocialIcon from "@/components/social-icon";
import FollowButton from "./follow-button";
import { WelcomeQuest } from "@/components/welcome-quest";
import StreakTile from "@/components/streak-tile";
import DailyDropCard from "@/components/daily-drop-card";
import { touchStreak } from "@/lib/streaks/touch";
import { claimDailyDrop } from "@/lib/drops/daily-drop";
import { getCampaignGoals } from "@/lib/data/goals";
import ShareButton from "@/components/share-button";
import InlineShareButton from "@/components/inline-share-button";
import RsvpButton from "./rsvp-button";
import { ExpandableEventGrid } from "./expandable-event-grid";
import { focalPointStyle } from "@/lib/images/focal-point";


// Per-artist hero focal-point now comes from artists.hero_focal_x /
// .hero_focal_y (migration 0035), exposed on Artist via heroFocalX /
// heroFocalY. focalPointStyle() falls back to 50/50 when not set.

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  // Static-params still uses the hardcoded list so builds don't need DB creds.
  // Runtime queries the DB and falls back to the same map on error.
  return listArtists().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getArtistFromDb(slug);
  if (!artist) return { title: "Artist" };
  return {
    title: `${artist.name}`,
    description: artist.tagline,
  };
}

async function getFounderCount(communitySlug: string): Promise<{ count: number; cap: number } | null> {
  try {
    const admin = createAdminClient();
    const { data: community, error: communityError } = await admin
      .from("communities")
      .select("founder_cap")
      .eq("slug", communitySlug)
      .maybeSingle();
    if (communityError || !community) return null;

    const { count, error: countError } = await admin
      .from("fan_community_memberships")
      .select("*", { count: "exact", head: true })
      .eq("community_id", communitySlug)
      .eq("is_founder", true);
    if (countError || count === null) return null;

    return {
      count,
      cap: (community.founder_cap as number) ?? 100,
    };
  } catch {
    return null;
  }
}

export default async function ArtistPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { slug } = await params;
  const { welcome } = await searchParams;
  const [artist, fan, isFollowing, entitlement, founderData] = await Promise.all([
    getArtistFromDb(slug),
    getCurrentFan(),
    doesFanFollowArtist(slug),
    getViewerEntitlement(slug),
    getFounderCount(slug),
  ]);
  if (!artist) notFound();
  const isSignedIn = fan !== null;
  const needsProfile = isSignedIn && !fan.first_name;

  // Daily retention loop: touch the streak (idempotent per UTC day, shared
  // with Fan Home) and reveal today's variable-reward drop. Both credit
  // points into this artist's community and never block the render.
  const [streak, dailyDrop] = isSignedIn
    ? await Promise.all([
        touchStreak(fan.id, slug).catch(() => null),
        claimDailyDrop(fan.id, slug).catch(() => null),
      ])
    : [null, null];

  // RSVP meta: counts + whether the current fan has RSVPed to each event.
  // Only events with a real DB id participate; fallback hardcoded events
  // (no id) remain read-only.
  const eventIds = artist.upcoming.filter((e) => !!e.id).map((e) => e.id as string);
  const { counts: rsvpCounts, mine: myRsvps } = await getRsvpMetaForEvents(eventIds);

  const heroGradient = `linear-gradient(to bottom right, ${artist.accentFrom}66, #0f172a, #000000)`;
  const ctaGradient = `linear-gradient(to right, ${artist.accentFrom}, ${artist.accentTo})`;

  // Primary CTA adapts to the viewer's state:
  // - anonymous  → "Join the Fan Experience" → /onboarding?ref=<slug>
  // - signed in, no profile → "Complete profile" → /onboarding?ref=<slug>
  // - signed in, profile done → "Shop drops" → /marketplace
  const primaryCta = !isSignedIn
    ? { label: "Join the Fan Experience", href: `/signup?ref=${artist.slug}` }
    : needsProfile
      ? { label: "Complete your profile", href: `/onboarding?ref=${artist.slug}` }
      : { label: "Shop drops", href: "/marketplace" };

  const secondaryCta = isSignedIn
    ? { label: "My rewards", href: "/rewards" }
    : { label: "Browse marketplace drops", href: "/marketplace" };

  const headerList = await headers();
  const host =
    process.env.NEXT_PUBLIC_APP_URL ??
    (headerList.get("x-forwarded-host") ?? headerList.get("host"));
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const origin = host?.startsWith("http") ? host : `${proto}://${host}`;
  const artistShareUrl =
    isSignedIn && fan?.referral_code
      ? `${origin}/invite/${fan.referral_code}?artist=${encodeURIComponent(artist.slug)}`
      : `${origin}/artists/${artist.slug}`;

  const totalRsvps = Array.from(rsvpCounts.values()).reduce((a, b) => a + b, 0);

  // Campaign goals are admin-configured rows in community_goals; live
  // founder/RSVP counts are passed in so metric rows resolve without
  // duplicate queries. Empty array → section hidden entirely.
  const campaignGoals = await getCampaignGoals(slug, {
    founderCount: founderData?.count ?? 0,
    rsvpTotal: totalRsvps,
  });

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-12">
      {/* Hero */}
      <section
        className="relative flex flex-col justify-end overflow-hidden rounded-3xl border border-white/10 min-h-[420px] md:min-h-[520px]"
        style={!artist.heroImage ? { backgroundImage: heroGradient } : undefined}
      >
        {artist.heroImage && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={artist.heroImage}
              alt=""
              // Focal point comes from artists.hero_focal_x / .hero_focal_y.
              // Default 50/50 (centered) when not set. Tweak via Supabase
              // SQL editor or (Phase 2) the admin focal-point picker.
              style={focalPointStyle(artist)}
              className="absolute inset-0 h-full w-full object-cover"
              aria-hidden
            />
            {/* Dark gradient overlay so the title/CTAs stay legible regardless of the photo */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.15) 100%)",
              }}
              aria-hidden
            />
          </>
        )}

        {/* Content layer — sits above image + overlay, anchored to the bottom
            via the section's flex flex-col justify-end so the photo dominates
            the upper portion (faces stay clear of the CTA stack). */}
        <div className="relative p-10">
          <p className="text-xs uppercase tracking-[0.3em] text-white/70">
            {artist.genres.slice(0, 2).join(" · ")}{artist.genres.length > 2 ? " +" + (artist.genres.length - 2) : ""}
          </p>
          <h1
            className="mt-3 text-5xl font-semibold leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {artist.name}
          </h1>
          <p className="mt-3 max-w-xl text-lg text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)]">
            {artist.tagline}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={primaryCta.href}
              className="rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
              style={{ backgroundImage: ctaGradient }}
            >
              {primaryCta.label}
            </Link>
            {isSignedIn && (
              <FollowButton artistSlug={artist.slug} initialFollowing={isFollowing} />
            )}
            <ShareButton
              title={`Join ${artist.name}'s Fan Experience`}
              text={
                isSignedIn && fan?.referral_code
                  ? `I found ${artist.name}'s Fan Experience. Join through me and get your first 100 points toward drops, events, and rewards.`
                  : `${artist.name} — ${artist.tagline ?? "fan experience on Fan Engage"}`
              }
              url={artistShareUrl}
              label={isSignedIn && fan?.referral_code ? "Invite friends" : "Share"}
              variant="ghost"
            />
            <Link
              href={`/artists/${slug}/community`}
              className="rounded-full border border-white/30 bg-black/30 px-6 py-3 text-sm font-medium text-white/90 backdrop-blur hover:bg-white/10"
            >
              Community →
            </Link>
            <Link
              href={secondaryCta.href}
              className="rounded-full border border-white/30 bg-black/30 px-6 py-3 text-sm font-medium text-white/90 backdrop-blur hover:bg-white/10"
            >
              {secondaryCta.label}
            </Link>
            {artist.merchUrl && (
              <a
                href={artist.merchUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-full border border-white/30 bg-black/30 px-6 py-3 text-sm font-medium text-white/90 backdrop-blur hover:bg-white/10"
              >
                🛍 Official store ↗
              </a>
            )}
          </div>
          {!isSignedIn && (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-aurora/30 bg-aurora/10 px-3 py-1 text-xs font-medium text-aurora">
              🎁 Join free and earn your first 100 fan points today.
            </p>
          )}
          {!artist.heroImage && (
            <p className="mt-6 text-xs text-white/50">
              Hero imagery pending Box asset drop.
            </p>
          )}
        </div>
      </section>

      {/* First-visit celebration + starter quest (?welcome=1 after onboarding) */}
      {welcome === "1" && isSignedIn && (
        <WelcomeQuest
          artistName={artist.name}
          artistSlug={artist.slug}
          accentFrom={artist.accentFrom}
          accentTo={artist.accentTo}
        />
      )}

      {/* Daily loop: streak + today's drop */}
      {isSignedIn && (streak || dailyDrop) && (
        <section className="grid gap-4 md:grid-cols-[2fr_1fr]">
          {streak && (
            <StreakTile
              currentStreakDays={streak.currentStreakDays}
              longestStreakDays={streak.longestStreakDays}
              pointsAwardedThisVisit={streak.pointsAwardedThisVisit}
              newMilestone={streak.newMilestone}
            />
          )}
          {dailyDrop && <DailyDropCard drop={dailyDrop} />}
        </section>
      )}

      {/* Campaign Unlock Goals — admin-configured in community_goals */}
      {campaignGoals.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Campaign Goals</p>
          {campaignGoals.map((goal) => (
            <div key={goal.id} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/80">
                  {goal.emoji} {goal.label}
                </span>
                <span className="text-white/50 tabular-nums">
                  {Math.min(goal.current, goal.target)} / {goal.target}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.round((goal.current / goal.target) * 100))}%`,
                    backgroundImage: `linear-gradient(90deg, ${artist.accentFrom}, ${artist.accentTo})`,
                  }}
                />
              </div>
              {goal.linkHref && goal.linkLabel && (
                <Link
                  href={goal.linkHref}
                  className="text-xs text-white/50 hover:text-white/70 transition"
                >
                  {goal.linkLabel}
                </Link>
              )}
            </div>
          ))}
        </section>
      )}

      {/* About */}
      <LatestStrip slug={slug} />

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="glass-card p-8">
          <p className="text-sm uppercase tracking-wide text-white/60">About</p>
          <p className="mt-4 text-base leading-relaxed text-white/80 whitespace-pre-line">{artist.bio}</p>
        </div>
        <div className="glass-card p-8">
          <p className="text-sm uppercase tracking-wide text-white/60">Follow</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {artist.social.length === 0 ? (
              <p className="text-xs text-white/50">Social links pending.</p>
            ) : (
              artist.social.map((s) => (
                <SocialIcon key={s.label} label={s.label} href={s.href} />
              ))
            )}
          </div>
        </div>
      </section>

      {/* Upcoming */}
      <section className="glass-card p-8">
        <p className="text-sm uppercase tracking-wide text-white/60">Upcoming</p>
        <ExpandableEventGrid threshold={5}>
          {artist.upcoming.map((e) => {
            // Phase 5d: gate premium-tier events. Fallback events (no id)
            // have no DB tier; treat as public.
            const eventTier = e.tier ?? "public";
            const access = canAccess(eventTier, entitlement);
            if (!access.allowed) {
              return (
                <PremiumPaywall
                  key={e.id ?? e.title}
                  feature={e.title}
                  description="Premium fans get access to intimate listening parties, early RSVPs, and backstage-only moments."
                  communityId={slug}
                  accentFrom={artist.accentFrom}
                  accentTo={artist.accentTo}
                  reason={
                    access.reason === "signed-out"
                      ? "signed-out"
                      : access.reason === "needs-founder"
                        ? "needs-founder"
                        : "needs-premium"
                  }
                  compact
                />
              );
            }
            const eventId = e.id ?? null;
            const count = eventId ? rsvpCounts.get(eventId) ?? 0 : 0;
            const atCapacity =
              e.capacity != null && e.capacity > 0 && count >= e.capacity;
            const rsvped = eventId ? myRsvps.has(eventId) : false;
            return (
              <div
                key={eventId ?? e.title}
                className="rounded-2xl bg-black/30 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{e.title}</p>
                    <p className="text-xs text-white/60">{e.detail}</p>
                    {e.location && (
                      <p className="mt-1 text-xs text-white/60">📍 {e.location}</p>
                    )}
                    <p className="mt-3 text-xs uppercase tracking-wide text-white/50">
                      {e.date}
                    </p>
                    {eventId && (
                      <p className="mt-1 text-xs text-white/50">
                        {count}
                        {e.capacity ? ` / ${e.capacity}` : ""} RSVPed
                      </p>
                    )}
                  </div>
                  {eventId && isSignedIn && (
                    <RsvpButton
                      eventId={eventId}
                      artistSlug={artist.slug}
                      initialRsvped={rsvped}
                      atCapacity={atCapacity}
                    />
                  )}
                </div>
                {eventId && (
                  <div className="mt-3 flex items-center gap-3 text-xs">
                    <a
                      href={`/api/events/${eventId}/ics`}
                      className="text-white/60 hover:text-white"
                    >
                      📅 Add to calendar
                    </a>
                    {e.url && (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-white/60 hover:text-white"
                      >
                        Details ↗
                      </a>
                    )}
                    <InlineShareButton
                      title={e.title}
                      text={
                        isSignedIn && fan?.referral_code
                          ? `I just found ${artist.name}'s ${e.title}. Join the Fan Experience and come with me.`
                          : `${e.title} — ${e.date}${e.location ? ` · ${e.location}` : ""}. RSVP on Fan Engage.`
                      }
                      url={
                        isSignedIn && fan?.referral_code
                          ? `${origin}/invite/${fan.referral_code}?artist=${encodeURIComponent(artist.slug)}&event=${encodeURIComponent(eventId)}`
                          : `${origin}/artists/${artist.slug}`
                      }
                      label="Bring friends ↗"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </ExpandableEventGrid>
      </section>

      {/* Top fans leaderboard preview */}
      <LeaderboardMiniCard artistSlug={slug} />

      {/* Merch */}
      <section className="glass-card p-8">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm uppercase tracking-wide text-white/60">Fan Experience rewards</p>
          {artist.merchUrl && (
            <a
              href={artist.merchUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 hover:border-white/40 hover:text-white transition"
            >
              🛍 Official merch store ↗
            </a>
          )}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {artist.merch.map((m) => (
            <div key={m.title} className="rounded-2xl bg-black/30 p-5">
              <p className="text-xs uppercase tracking-wide text-white/50">{m.tier}</p>
              <p className="mt-1 text-sm font-semibold">{m.title}</p>
              <p className="mt-3 text-sm font-semibold text-emerald-300">{m.points}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
