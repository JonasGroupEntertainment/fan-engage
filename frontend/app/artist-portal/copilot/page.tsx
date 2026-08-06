import { redirect } from "next/navigation";
import { getPortalContext, roleAtLeast } from "@/lib/artist-portal/access";
import { getLatestBrief, generateBrief } from "@/lib/copilot/generate";
import { refreshBriefAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CopilotPage() {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/login?next=/artist-portal/copilot");
  if (!roleAtLeast(ctx.role, "viewer")) redirect("/artist-portal");

  // First visit generates one (cooldown-aware); after that we show latest.
  const brief =
    (await getLatestBrief(ctx.communityId)) ??
    (await generateBrief(ctx.communityId));

  const pulse = brief.pulse;
  const generated = new Date(brief.generatedAt);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Copilot</h1>
          <p className="text-sm text-white/60">
            AI briefing on your community — what happened, who to watch, what
            to do next.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/50">
          <span>
            Updated{" "}
            {generated.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            {brief.fallback && " · offline summary"}
          </span>
          {roleAtLeast(ctx.role, "editor") && (
            <form action={refreshBriefAction}>
              <button
                type="submit"
                className="rounded-lg border border-white/15 px-3 py-1.5 font-medium text-white/80 hover:border-white/30 hover:text-white"
              >
                Refresh
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-aurora/30 bg-aurora/10 px-5 py-4">
        <p className="text-lg font-semibold text-white">{brief.headline}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Members" value={pulse.memberCount} />
        <Stat label="New (7d)" value={pulse.newMembers7d} />
        <Stat label="Active (7d)" value={pulse.activeFans7d} />
        <Stat label="Points (7d)" value={pulse.pointsAwarded7d} />
        <Stat label="Posts (7d)" value={pulse.posts7d} />
        <Stat label="Comments (7d)" value={pulse.comments7d} />
      </div>

      {brief.insights.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
            This week
          </h2>
          <ul className="space-y-2">
            {brief.insights.map((line, i) => (
              <li
                key={i}
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/80"
              >
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      {brief.actions.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
            Recommended actions
          </h2>
          <div className="space-y-3">
            {brief.actions.map((a, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/10 bg-black/40 p-4"
              >
                <p className="font-semibold text-white">{a.title}</p>
                <p className="mt-1 text-sm text-white/60">{a.why}</p>
                {a.suggestedPost && (
                  <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="mb-1 text-xs uppercase tracking-wide text-white/50">
                      Suggested post — copy, tweak, publish
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-white/80">
                      {a.suggestedPost}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
          Fans going quiet{" "}
          <span className="normal-case text-white/50">
            (engaged before, silent 14+ days)
          </span>
        </h2>
        {pulse.quietFans.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/60">
            No churn-risk fans right now — everyone with meaningful points has
            been active recently. 🎉
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/50">
                <tr>
                  <th className="px-4 py-2">Fan</th>
                  <th className="px-4 py-2">Points</th>
                  <th className="px-4 py-2">Quiet for</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-black/30">
                {pulse.quietFans.map((f) => (
                  <tr key={f.fanId}>
                    <td className="px-4 py-2 text-white/80">
                      {f.displayName ?? "Fan"}
                    </td>
                    <td className="px-4 py-2 text-white/60">
                      {f.totalPoints.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-amber-300/80">
                      {f.daysQuiet} days
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-white/50">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
