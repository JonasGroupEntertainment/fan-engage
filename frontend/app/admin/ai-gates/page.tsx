import { superAdminOnly } from "@/lib/admin-guard";
import { AI_FEATURES } from "@/lib/ai-gates/core";
import { listAiGateMatrix } from "@/lib/ai-gates/read";
import { AI_DRAFTER_FREE_COMMUNITIES_ENV } from "@/lib/entitlements-core";
import GateToggle from "./gate-toggle";

export const dynamic = "force-dynamic";

/**
 * /admin/ai-gates — super-admin matrix of AI features × active communities.
 * A toggle writes a row to ai_feature_gates (0091); no row = the env
 * fallback (greyed). Only ai_comment_drafter is wired today; the rest are
 * display-only until their call sites read lib/ai-gates.
 */
export default async function AdminAiGatesPage() {
  await superAdminOnly("/admin/ai-gates");
  const matrix = await listAiGateMatrix();
  const envRaw = process.env[AI_DRAFTER_FREE_COMMUNITIES_ENV] ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          AI feature gates
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-white/60">
          Per-community switches for AI features, without a redeploy. Resolution order:{" "}
          <span className="text-white/80">DB row → env fallback → off</span>. A greyed value means no row
          exists and the env is deciding. Toggling writes a row; &ldquo;use env&rdquo; removes it.
        </p>
        <p className="mt-2 text-xs text-white/50">
          <code className="rounded bg-black/40 px-1.5 py-0.5">{AI_DRAFTER_FREE_COMMUNITIES_ENV}</code> ={" "}
          <code className="rounded bg-black/40 px-1.5 py-0.5">{envRaw || "(unset)"}</code>
          {" "}— applies to the comment drafter only.
        </p>
      </div>

      {matrix.length === 0 ? (
        <section className="glass-card p-6 text-sm text-white/60">No active communities.</section>
      ) : (
        <section className="glass-card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/50">
              <tr>
                <th className="px-4 py-3">Community</th>
                {AI_FEATURES.map((f) => (
                  <th key={f.key} className="px-4 py-3">
                    <div>{f.label}</div>
                    <div className="mt-0.5 max-w-[14rem] text-[10px] font-normal normal-case tracking-normal text-white/40">
                      {f.description}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.communityId} className="border-b border-white/5 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.displayName}</p>
                    <p className="text-xs text-white/50">/{row.communityId}</p>
                  </td>
                  {AI_FEATURES.map((f) => (
                    <td key={f.key} className="px-4 py-3">
                      <GateToggle
                        feature={f.key}
                        communityId={row.communityId}
                        wired={f.wired}
                        gate={row.gates[f.key]}
                      />
                      {row.gates[f.key].updatedAt && (
                        <p className="mt-1 text-[10px] text-white/35">
                          updated {new Date(row.gates[f.key].updatedAt as string).toLocaleString("en-US")}
                        </p>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
