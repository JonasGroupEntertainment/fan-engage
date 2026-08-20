import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { gatherArtistLeaderboard } from "@/lib/leaderboard/gather";
import { isPublicLeaderboardHonest } from "@/lib/leaderboard/honesty";

/**
 * Compact leaderboard preview for the artist profile page. Renders the
 * top 3 names + scores and the viewer's rank inline. Click-through to
 * the full leaderboard page.
 *
 * Server component — does its own DB read. Cheap (a single
 * gatherArtistLeaderboard call) so this is fine inline.
 *
 * Renders nothing if there's no activity at all this month — keeps
 * empty profile pages clean during the early days of a community.
 */

interface LeaderboardMiniCardProps {
  artistSlug: string;
}

export default async function LeaderboardMiniCard({
  artistSlug,
}: LeaderboardMiniCardProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const board = await gatherArtistLeaderboard({
    artistSlug,
    viewerFanId: user?.id ?? null,
    topN: 3,
  });
  if (!board || !isPublicLeaderboardHonest(board)) return null;

  return (
    <Link
      href={`/artists/${artistSlug}/leaderboard`}
      className="group block rounded-2xl border border-white/10 bg-gradient-to-br from-amber-500/10 via-violet-500/5 to-rose-500/10 p-5 transition hover:border-white/20"
    >
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/55">
            Top fans · {board.monthLabel}
          </p>
          <p className="mt-1 text-base font-semibold text-white">
            This month&apos;s leaderboard
          </p>
        </div>
        <span className="text-xs font-medium text-white/55 transition group-hover:text-white">
          See all →
        </span>
      </header>

      <ul className="mt-4 space-y-2">
        {board.top.map((entry) => (
          <li
            key={entry.fan_id}
            className="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2"
          >
            <span className="w-5 text-center text-xs font-semibold tabular-nums text-white/65">
              {entry.rank}
            </span>
            {entry.avatar_url ? (
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10">
                <Image
                  src={entry.avatar_url}
                  alt={entry.display_name}
                  fill
                  sizes="32px"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
                {entry.display_name.charAt(0).toUpperCase()}
              </div>
            )}
            <p className="flex-1 truncate text-sm text-white">
              {entry.display_name}
              {user?.id === entry.fan_id && (
                <span className="ml-1.5 rounded-full bg-aurora/25 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-aurora">
                  You
                </span>
              )}
            </p>
            <p className="text-xs font-semibold tabular-nums text-white/85">
              {entry.score.toLocaleString()}{" "}
              <span className="text-white/45">pts</span>
            </p>
          </li>
        ))}
      </ul>

      {board.viewerEntry && board.viewerEntry.rank > 3 && (
        <p className="mt-3 rounded-lg border border-aurora/20 bg-aurora/10 px-3 py-2 text-center text-xs text-white">
          You&apos;re{" "}
          <span className="font-semibold">#{board.viewerEntry.rank}</span> of{" "}
          {board.totalFans} this month ·{" "}
          {board.viewerEntry.score.toLocaleString()} pts
        </p>
      )}
    </Link>
  );
}
