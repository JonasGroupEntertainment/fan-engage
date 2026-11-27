import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadWeeklyNumbers } from "@/lib/weekly-numbers/load";
import type { Comparison } from "@/lib/weekly-numbers/count";
import { WEEKS_SHOWN, formatWeekLabel } from "@/lib/weekly-numbers/weeks";

export const dynamic = "force-dynamic";

export const metadata = { title: "Week by week · Admin" };

const UNKNOWN = "–";

function show(value: number | null): string {
  return value === null ? UNKNOWN : value.toLocaleString("en-US");
}

function share(value: number | null): string {
  return value === null ? "" : ` (${Math.round(value * 100)}%)`;
}

function changeText(comparison: Comparison | null): string {
  if (!comparison) return "Could not be read";
  const { current, previous, change, direction } = comparison;
  const moved =
    direction === "flat" ? "no change" : `${direction} ${Math.abs(change).toLocaleString("en-US")}`;
  return `${current.toLocaleString("en-US")}, ${moved} from ${previous.toLocaleString("en-US")}`;
}

/**
 * Week by week numbers for one artist community: is it growing, and are
 * fans coming back. Read only. Counts only, real fans only.
 */
export default async function WeeklyNumbersPage({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const ctx = await getAdminContext();
  if (!ctx) notFound();
  const { communityId } = await params;
  if (!ctx.isSuperAdmin && !ctx.communities.includes(communityId)) notFound();

  const admin = createAdminClient();
  const { data: community } = await admin
    .from("communities")
    .select("slug, display_name")
    .eq("slug", communityId)
    .maybeSingle();
  if (!community) notFound();

  const numbers = await loadWeeklyNumbers(admin, communityId);

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/admin/analytics/${communityId}`}
          className="text-sm text-white/60 underline-offset-4 hover:underline"
        >
          ← Analytics
        </Link>
        <h1
          className="mt-2 text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Week by week
        </h1>
        <p className="mt-1 text-sm text-white/60">
          {community.display_name as string}: the last {WEEKS_SHOWN} weeks, Monday to Sunday,
          Eastern time. Real fans only. Team, test and suspended accounts are left out of every
          number. Counts only, no names.
        </p>
      </header>

      {numbers.unread.length > 0 && (
        <div className="glass-card rounded-2xl p-4 text-sm text-amber-200" role="status">
          Some numbers could not be read just now and show as {UNKNOWN}:{" "}
          {numbers.unread.join(", ")}. Reload to try again.
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="glass-card rounded-2xl p-4">
          <p className="text-xs uppercase tracking-wide text-white/50">Real fans today</p>
          <p className="mt-1 text-2xl font-semibold">{show(numbers.totalFans)}</p>
        </div>
        {numbers.summary?.lines.map((line) => (
          <div key={line.label} className="glass-card rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-white/50">
              {line.label}, week of {formatWeekLabel(numbers.summary!.week)}
            </p>
            <p className="mt-1 text-sm text-white/90">{changeText(line.comparison)}</p>
          </div>
        ))}
      </section>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-white/60">
            <tr>
              <th className="py-2 pr-4">Week</th>
              <th className="py-2 pr-4">New fans</th>
              <th className="py-2 pr-4">Active fans</th>
              <th className="py-2 pr-4">Returning</th>
              <th className="py-2 pr-4">Check-ins</th>
              <th className="py-2 pr-4">Drops claimed</th>
              <th className="py-2 pr-4">Posts</th>
              <th className="py-2 pr-4">Comments</th>
              <th className="py-2 pr-4">Rewards claimed</th>
              <th className="py-2">Friends joined</th>
            </tr>
          </thead>
          <tbody>
            {numbers.rows.map((row) => (
              <tr key={row.week.index} className="border-t border-white/10 align-top">
                <td className="whitespace-nowrap py-2 pr-4">
                  {formatWeekLabel(row.week)}
                  {row.week.inProgress && (
                    <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">
                      in progress
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4">{show(row.newFans)}</td>
                <td className="py-2 pr-4">{show(row.activeFans)}</td>
                <td className="py-2 pr-4">
                  {row.returning ? `${show(row.returning.count)}${share(row.returning.share)}` : UNKNOWN}
                </td>
                <td className="py-2 pr-4">{show(row.checkIns)}</td>
                <td className="py-2 pr-4">{show(row.dropsClaimed)}</td>
                <td className="py-2 pr-4">{show(row.posts)}</td>
                <td className="py-2 pr-4">{show(row.comments)}</td>
                <td className="py-2 pr-4">{show(row.rewardsClaimed)}</td>
                <td className="py-2">{show(row.friendsJoined)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-white/50">
        Active fans did something that earned points in this community that week (a bonus, badge or
        anniversary they were given does not count). Returning fans were active and had
        already joined before the week began. Check-ins are daily check-ins. Posts and comments
        are from fans, not the team.
      </p>
    </div>
  );
}
