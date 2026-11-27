/**
 * Groups app_errors rows for /admin/errors (migration 0114).
 * Pure: no "@/" imports, so plain `node --test` can load it.
 */

export type AppErrorListRow = {
  created_at: string;
  source: "client" | "server";
  message: string;
  path: string;
  route_path: string | null;
  digest: string | null;
};

export type AppErrorGroup = {
  key: string;
  source: "client" | "server";
  message: string;
  where: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  lastDigest: string | null;
};

/** Same message in the same place counts as one problem, newest first. */
export function groupAppErrors(rows: ReadonlyArray<AppErrorListRow>): AppErrorGroup[] {
  const groups = new Map<string, AppErrorGroup>();
  for (const row of rows) {
    const where = row.route_path ?? row.path;
    const key = `${row.source}|${where}|${row.message}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        key,
        source: row.source,
        message: row.message,
        where,
        count: 1,
        firstSeen: row.created_at,
        lastSeen: row.created_at,
        lastDigest: row.digest,
      });
      continue;
    }
    g.count += 1;
    if (row.created_at < g.firstSeen) g.firstSeen = row.created_at;
    if (row.created_at > g.lastSeen) {
      g.lastSeen = row.created_at;
      g.lastDigest = row.digest;
    }
  }
  return [...groups.values()].sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : a.lastSeen > b.lastSeen ? -1 : 0));
}

/** Rows per day (UTC date), oldest first, for the small daily count line. */
export function countByDay(rows: ReadonlyArray<Pick<AppErrorListRow, "created_at">>): Array<{ day: string; count: number }> {
  const days = new Map<string, number>();
  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    days.set(day, (days.get(day) ?? 0) + 1);
  }
  return [...days.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, count]) => ({ day, count }));
}
