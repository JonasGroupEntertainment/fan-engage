import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { getSuperFanRadarSummary } from "@/lib/data/superfan-radar";

const RADAR_HOME_URL = "https://fan-analytics-dashboard.vercel.app";
const RADAR_DASHBOARD_URL = "https://fan-analytics-dashboard.vercel.app/dashboard";

export default async function AdminSuperFansPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/super-fans");

  const summary = ctx.currentCommunityId
    ? await getSuperFanRadarSummary(ctx.currentCommunityId)
    : { connected: false as const };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Super Fans
          </h1>
          <p className="mt-2 text-sm text-white/60">
            Read-only summary from Super Fan Radar. Edits and outreach happen in that app.
          </p>
        </div>
        <a
          href={RADAR_DASHBOARD_URL}
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-xs font-semibold text-white hover:brightness-110"
        >
          Manage full Super Fan Radar dashboard →
        </a>
      </div>

      {!summary.connected ? (
        <div className="rounded-2xl border border-white/10 bg-black/40 px-6 py-10 text-center">
          <p className="text-sm text-white/70">
            Super Fan Radar isn&apos;t connected for your fan experience yet.
          </p>
          <a
            href={RADAR_HOME_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm text-aurora hover:underline"
          >
            Learn more at fan-analytics-dashboard.vercel.app →
          </a>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryTile label="Elite" value={summary.eliteCount} />
            <SummaryTile label="Core" value={summary.coreCount} />
            <SummaryTile label="Candidate" value={summary.candidateCount} />
            <SummaryTile label="Invite-ready" value={summary.inviteReadyCount} />
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-black/40 text-left text-xs uppercase tracking-wide text-white/50">
                <tr>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Platform</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3 text-right">Index</th>
                  <th className="px-4 py-3">Invite-ready</th>
                </tr>
              </thead>
              <tbody>
                {summary.topFans.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-white/50">
                      No fans scored yet.
                    </td>
                  </tr>
                )}
                {summary.topFans.map((f, i) => (
                  <tr key={`${f.username}-${i}`} className="border-t border-white/5">
                    <td className="px-4 py-3">{f.username}</td>
                    <td className="px-4 py-3 capitalize">{f.platform}</td>
                    <td className="px-4 py-3 capitalize">{f.tier.toLowerCase()}</td>
                    <td className="px-4 py-3 text-right">{f.index}</td>
                    <td className="px-4 py-3">{f.outreachOptIn ? "Yes" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
      <div className="text-xs uppercase tracking-wide text-white/50">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">
        {new Intl.NumberFormat("en-US").format(value)}
      </div>
    </div>
  );
}
