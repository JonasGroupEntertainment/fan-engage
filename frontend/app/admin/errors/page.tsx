import { notFound } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { countByDay, groupAppErrors, type AppErrorListRow } from "@/lib/app-error-summary";

export const dynamic = "force-dynamic";

export const metadata = { title: "Errors · Admin" };

const DAYS = 7;

/** The last DAYS days of app_errors, newest first (capped at 2,000 rows). */
async function loadRecentErrors(): Promise<{ rows: AppErrorListRow[]; loadError: string | null }> {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data, error } = await createAdminClient()
      .from("app_errors")
      .select("created_at, source, message, path, route_path, digest")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);
    return { rows: (data as AppErrorListRow[] | null) ?? [], loadError: error ? error.message : null };
  } catch (err) {
    return { rows: [], loadError: err instanceof Error ? err.message : "Could not load errors" };
  }
}

/**
 * Errors fans' browsers and the server hit in the last 7 days
 * (app_errors, migration 0114). Kept 90 days. Owners only.
 */
export default async function AdminErrorsPage() {
  const ctx = await getAdminContext();
  if (!ctx?.isSuperAdmin) notFound();

  const { rows, loadError } = await loadRecentErrors();

  const groups = groupAppErrors(rows);
  const perDay = countByDay(rows);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Errors
        </h1>
        <p className="mt-2 text-sm text-white/70">
          Problems fans&apos; browsers and the server ran into in the last {DAYS} days. No fan
          details are stored. Errors are kept for 90 days.
        </p>
      </header>

      {loadError ? (
        <div className="glass-card rounded-2xl p-6 text-sm text-rose-300">Couldn&apos;t load errors: {loadError}</div>
      ) : groups.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center text-sm text-white/70">
          No errors in the last {DAYS} days.
        </div>
      ) : (
        <>
          <p className="text-sm text-white/80">
            {rows.length.toLocaleString("en-US")} errors in {groups.length.toLocaleString("en-US")} groups.{" "}
            {perDay.map((d) => `${d.day}: ${d.count}`).join(" · ")}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-white/60">
                <tr>
                  <th className="py-2 pr-4">Times</th>
                  <th className="py-2 pr-4">Where</th>
                  <th className="py-2 pr-4">Message</th>
                  <th className="py-2 pr-4">Last seen (UTC)</th>
                  <th className="py-2">From</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.key} className="border-t border-white/10 align-top">
                    <td className="py-2 pr-4 font-semibold">{g.count}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{g.where}</td>
                    <td className="py-2 pr-4 [overflow-wrap:anywhere]">
                      {g.message}
                      {g.lastDigest ? (
                        <span className="mt-1 block font-mono text-xs text-white/50">Reference: {g.lastDigest}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-xs">{g.lastSeen.slice(0, 16).replace("T", " ")}</td>
                    <td className="py-2 text-xs">{g.source === "client" ? "Browser" : "Server"}</td>
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
