import { headers } from "next/headers";
import Link from "next/link";
import { getCurrentFan } from "@/lib/data/fan";
import {
  getMyReferrals,
  getReferralLeaderboard,
  getRecentReferralActivity,
} from "@/lib/data/referrals";
import { listArtistsFromDb } from "@/lib/data/artists";
import InviteQRCode from "@/components/invite-qr";
import CopyLinkButton from "./copy-link-button";
import NativeShareButton from "./native-share-button";
import PreviewSignupBanner from "@/components/preview-signup-banner";

const ladder = [
  { level: "1 referral", reward: "+150 pts" },
  { level: "3 referrals", reward: "Recruiter badge" },
  { level: "5 referrals", reward: "Connector badge" },
  { level: "10 referrals", reward: "Ambassador badge" },
];

async function buildInviteUrl(code: string | null | undefined): Promise<string> {
  const origin = await getAppOrigin();
  if (!code) return `${origin}/invite/your-code`;
  return `${origin}/invite/${code}`;
}

async function getAppOrigin(): Promise<string> {
  const headerList = await headers();
  const host =
    process.env.NEXT_PUBLIC_APP_URL ??
    (headerList.get("x-forwarded-host") ?? headerList.get("host"));
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  return host?.startsWith("http") ? host : `${proto}://${host}`;
}

export const metadata = { title: "Referrals" };

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default async function ReferralsPage() {
  const [fan, myReferrals, leaderboard, artists, recentActivity] = await Promise.all([
    getCurrentFan(),
    getMyReferrals(),
    getReferralLeaderboard(5),
    listArtistsFromDb(),
    getRecentReferralActivity(5),
  ]);

  const isSignedIn = fan !== null;
  const origin = await getAppOrigin();
  const inviteUrl = await buildInviteUrl(fan?.referral_code);
  const myCount = myReferrals.length;
  const convertedCount = myReferrals.filter((r) => r.status === "verified").length;
  const pointsEarned = myReferrals.reduce((sum, r) => sum + (r.points_awarded ?? 0), 0);
  const inviterName = fan?.first_name ?? "me";
  const featuredArtists = artists.slice(0, 4);

  const leaderboardRows = leaderboard.map((row) => ({
    name: row.display_name,
    total: `${row.referral_count} referral${row.referral_count === 1 ? "" : "s"}`,
  }));

  const possessive = fan?.first_name ? `${fan.first_name}'s` : "your";

  return (
    <div className="min-h-screen bg-midnight">
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 lg:flex-row">
        <div className="flex-1 space-y-6">
          {!isSignedIn && (
            <PreviewSignupBanner
              eyebrow="🎟️ Preview"
              headline="Sign up to get your invite link"
              body="Members earn points every time a friend joins, but the best shares are artist-specific: invite someone into a real fan experience, not just a generic account."
              bullets={[
                "Invite friends into specific artist hubs",
                "Both fans get a clear reason to join and keep going",
                "Milestones unlock badges and bonus points",
              ]}
              primaryCta="Sign up free →"
              nextPath="/referrals"
              firstRewardLine="🎁 Join free, then invite friends into your favorite artist experience."
            />
          )}

          <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-purple-800/30 via-slate-900 to-midnight p-6 shadow-glass">
            <p className="text-sm uppercase tracking-wide text-white/60">Referrals</p>
            <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              Bring a friend in
            </h1>
            <p className="mt-4 text-sm text-white/70">
              {isSignedIn
                ? `You've invited ${myCount} fan${myCount === 1 ? "" : "s"} so far. Share an artist experience and help a friend get their first 100 points while you earn 150 after they join.`
                : "Members get personal invite links they can attach to artists, drops, shows, and badges so every share feels like a real invitation."}
            </p>
            {isSignedIn && (
              <>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <code className="flex-1 rounded-2xl bg-black/40 px-4 py-3 text-sm">{inviteUrl}</code>
                  <CopyLinkButton url={inviteUrl} />
                  <NativeShareButton
                    url={inviteUrl}
                    title="Join me on Fan Engage"
                    text={`Join me on Fan Engage. You get 100 points when you sign up, and I get 150 when you finish joining.`}
                  />
                </div>

                {myCount === 0 ? (
                  <div className="mt-6 rounded-2xl border border-dashed border-purple-500/40 bg-purple-900/20 px-5 py-4 text-sm text-white/80">
                    <span className="font-semibold text-purple-300">Start with one artist.</span>{" "}
                    Send a friend into the fan experience you would actually talk about. They get
                    100 signup points, and you get 150 points after they join.
                  </div>
                ) : (
                  <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-2xl bg-black/30 px-3 py-4">
                      <p className="text-2xl font-bold">{myCount}</p>
                      <p className="mt-1 text-xs text-white/60">Sent</p>
                    </div>
                    <div className="rounded-2xl bg-black/30 px-3 py-4">
                      <p className="text-2xl font-bold">{convertedCount}</p>
                      <p className="mt-1 text-xs text-white/60">Converted</p>
                    </div>
                    <div className="rounded-2xl bg-black/30 px-3 py-4">
                      <p className="text-2xl font-bold">{pointsEarned.toLocaleString()}</p>
                      <p className="mt-1 text-xs text-white/60">Pts earned</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="glass-card p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-wide text-white/60">
                  Artist invites
                </p>
                <h2
                  className="mt-1 text-2xl font-semibold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Share an experience, not a bare link
                </h2>
              </div>
              <p className="max-w-md text-sm text-white/60">
                These links drop a friend into the artist context first, then the signup flow carries that
                artist through onboarding.
              </p>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {featuredArtists.map((artist) => {
                const artistInviteUrl = isSignedIn && fan?.referral_code
                  ? `${origin}/invite/${fan.referral_code}?artist=${encodeURIComponent(artist.slug)}`
                  : `${origin}/signup?ref=${encodeURIComponent(artist.slug)}`;
                const shareText = `I found ${artist.name}'s Fan Experience. Join through ${inviterName} and get your first 100 points toward drops, events, and rewards.`;
                return (
                  <article
                    key={artist.slug}
                    className="rounded-2xl border border-white/10 bg-black/25 p-5"
                  >
                    <p className="text-xs uppercase tracking-wide text-white/50">
                      {artist.genres.slice(0, 2).join(" · ") || "Fan Experience"}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold">{artist.name}</h3>
                    <p className="mt-1 min-h-[2.5rem] text-sm text-white/60">
                      {artist.tagline || "Drops, rewards, events, and fan-only moments."}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {isSignedIn && <CopyLinkButton url={artistInviteUrl} />}
                      <NativeShareButton
                        url={artistInviteUrl}
                        title={`Join ${artist.name}'s Fan Experience`}
                        text={shareText}
                      />
                      <Link
                        href={`/artists/${artist.slug}`}
                        className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
                      >
                        Preview →
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            {[
              {
                title: "First 72 hours",
                body: "Follow one artist, earn a first badge, then invite one friend while the experience is fresh.",
              },
              {
                title: "Bring friends to shows",
                body: "After each RSVP, prompt fans to invite two friends into that artist's event page.",
              },
              {
                title: "Unlock together",
                body: "Use campaign goals like 100 founding fans or 50 RSVPs to make sharing feel collective.",
              },
            ].map((card) => (
              <div key={card.title} className="rounded-2xl bg-white/10 p-5">
                <p className="text-sm font-semibold">{card.title}</p>
                <p className="mt-2 text-sm text-white/65">{card.body}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <div className="glass-card p-6">
              <p className="text-sm uppercase tracking-wide text-white/60">Reward ladder</p>
              <div className="mt-4 space-y-4">
                {ladder.map((step, i) => {
                  const threshold = [1, 3, 5, 10][i];
                  const unlocked = isSignedIn && myCount >= threshold;
                  return (
                    <div
                      key={step.level}
                      className={`rounded-2xl px-4 py-3 ${
                        unlocked ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : "bg-black/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{step.level}</p>
                        {unlocked && (
                          <span className="text-xs uppercase tracking-wide text-emerald-300">
                            Unlocked
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/60">{step.reward}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="glass-card p-6">
              <p className="text-sm uppercase tracking-wide text-white/60">Top referrers</p>
              {leaderboardRows.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-6 text-center text-xs text-white/60">
                  The leaderboard will appear once fans start referring.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {leaderboardRows.map((entry, index) => (
                    <div
                      key={`${entry.name}-${index}`}
                      className="flex items-center justify-between rounded-2xl bg-black/30 px-4 py-3"
                    >
                      <span className="text-sm font-semibold">
                        #{index + 1} {entry.name}
                      </span>
                      <span className="text-xs uppercase tracking-wide text-white/60">
                        {entry.total}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="w-full max-w-sm space-y-6">
          {isSignedIn && (
            <section className="glass-card p-6">
              <p className="text-sm uppercase tracking-wide text-white/60">QR invite</p>
              <div className="mt-4">
                <InviteQRCode url={inviteUrl} />
              </div>
              <p className="mt-3 text-xs text-white/60">
                Scan to join via {possessive} invite.
              </p>
              <code className="mt-2 block break-all rounded-xl bg-black/30 px-3 py-2 text-center text-xs text-white/60">
                {inviteUrl}
              </code>
            </section>
          )}

          <section className="glass-card p-6">
            <p className="text-sm uppercase tracking-wide text-white/60">Recent activity</p>
            {isSignedIn ? (
              myReferrals.length > 0 ? (
                <ul className="mt-4 space-y-3 text-sm text-white/70">
                  {myReferrals.slice(0, 5).map((r) => (
                    <li key={r.id}>
                      • {r.referred_email ?? "Invite"} — {r.status}
                      {r.points_awarded ? ` (+${r.points_awarded} pts)` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-6 text-center text-xs text-white/60">
                  No activity yet — share your invite link to get started.
                </div>
              )
            ) : recentActivity.length > 0 ? (
              <ul className="mt-4 space-y-3 text-sm text-white/70">
                {recentActivity.map((r) => (
                  <li key={r.id}>
                    • {r.first_name} {r.status === "verified" ? "joined" : "was invited"}{" "}
                    {formatRelativeTime(r.created_at)}
                    {r.points_awarded ? ` (+${r.points_awarded} pts)` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-6 text-center text-xs text-white/60">
                No activity yet — be the first to invite a friend.
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}
