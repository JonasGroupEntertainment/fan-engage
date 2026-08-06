import Image from "next/image";
import Link from "next/link";
import type { LeaderboardEntry } from "@/lib/leaderboard/types";

/**
 * The non-podium list section of the leaderboard. Renders ranks 4–N
 * as compact rows. Highlights the viewer's row when present.
 */

interface LeaderboardListProps {
  entries: LeaderboardEntry[];
  viewerFanId?: string | null;
  /** Show the activity breakdown chips per row. Default true on desktop, false on mobile. */
  showBreakdown?: boolean;
}

const TIER_BADGE: Record<string, string> = {
  bronze:   "bg-amber-700/30 text-amber-300",
  silver:   "bg-slate-400/25 text-slate-200",
  gold:     "bg-yellow-500/25 text-yellow-300",
  platinum: "bg-violet-500/30 text-violet-200",
  founder:  "bg-rose-500/30 text-rose-200",
};

function RowLink({
  href,
  className,
  children,
}: {
  href: string | null;
  className: string;
  children: React.ReactNode;
}) {
  if (href) {
    return (
      <Link href={href} className={`${className} hover:opacity-80`}>
        {children}
      </Link>
    );
  }
  return <div className={className}>{children}</div>;
}

export default function LeaderboardList({
  entries,
  viewerFanId,
  showBreakdown = true,
}: LeaderboardListProps) {
  if (entries.length === 0) return null;

  return (
    <ul className="space-y-2">
      {entries.map((entry) => {
        const isViewer = viewerFanId === entry.fan_id;
        const tierBadgeClass =
          TIER_BADGE[entry.current_tier ?? ""] ?? "bg-white/10 text-white/60";

        return (
          <li
            key={entry.fan_id}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
              isViewer
                ? "border-aurora/40 bg-aurora/5"
                : "border-white/10 bg-white/3 hover:border-white/20"
            }`}
          >
            <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-white/70">
              {entry.rank}
            </span>

            <RowLink
              href={entry.profile_slug ? `/fans/${entry.profile_slug}` : null}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              {entry.avatar_url ? (
                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-white/15">
                  <Image
                    src={entry.avatar_url}
                    alt={entry.display_name}
                    fill
                    sizes="36px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
                  {entry.display_name.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-white">
                  <span className="truncate">{entry.display_name}</span>
                  {isViewer && (
                    <span className="rounded-full bg-aurora/25 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-aurora">
                      You
                    </span>
                  )}
                  {entry.current_tier && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${tierBadgeClass}`}
                    >
                      {entry.current_tier}
                    </span>
                  )}
                </p>
                {showBreakdown && (
                  <p className="mt-0.5 text-xs text-white/55">
                    {entry.reactions > 0 && `${entry.reactions} reactions`}
                    {entry.comments > 0 && ` · ${entry.comments} comments`}
                    {entry.rsvps > 0 && ` · ${entry.rsvps} RSVPs`}
                    {entry.redemptions > 0 && ` · ${entry.redemptions} redemptions`}
                  </p>
                )}
              </div>
            </RowLink>

            <div className="text-right">
              <p className="text-sm font-semibold tabular-nums text-white">
                {entry.score.toLocaleString()}
              </p>
              <p className="text-xs uppercase tracking-wide text-white/45">
                pts
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
