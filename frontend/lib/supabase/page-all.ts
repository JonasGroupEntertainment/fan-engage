/**
 * Read every row of a PostgREST select, PAGE_SIZE at a time.
 *
 * Supabase caps a single select at 1,000 rows (the project's
 * `db-max-rows`) and silently truncates — `.limit(4000)` returns 1,000 with
 * no error. A cron that reads "every fan" or "every ledger row since the
 * cutoff" through one query therefore stops being correct the moment the
 * audience passes a thousand (RaeLynn alone has 1,551 members), and a
 * truncated activity table turns active fans into "lapsed" ones.
 *
 * `make(from, to)` must return a fresh builder each call (PostgREST
 * builders are single-use) that already carries its filters and a stable
 * `.order()`; this helper adds `.range(from, to)` and keeps going while a
 * page comes back full.
 *
 * Pure apart from the builders it is handed, so it is tested with a stub.
 */

export const PAGE_SIZE = 1000;

export type PageResult<Row> = {
  data: Row[] | null;
  error: { message: string } | null;
};

export type PageQuery<Row> = {
  range(from: number, to: number): PromiseLike<PageResult<Row>>;
};

export async function pageAll<Row>(
  make: () => PageQuery<Row>,
  pageSize: number = PAGE_SIZE,
): Promise<{ data: Row[]; error: null } | { data: null; error: { message: string } }> {
  const size = Math.max(1, Math.floor(pageSize));
  const out: Row[] = [];
  for (let from = 0; ; from += size) {
    const page = await make().range(from, from + size - 1);
    if (page.error) return { data: null, error: page.error };
    const rows = page.data ?? [];
    out.push(...rows);
    if (rows.length < size) return { data: out, error: null };
  }
}

/** Split `values` into arrays of at most `size` for `.in()` filters. */
export function chunk<T>(values: readonly T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += n) out.push(values.slice(i, i + n));
  return out;
}

/** Largest `.in()` list that stays well inside a URL. */
export const IN_CHUNK = 200;

/**
 * `pageAll` over an `.in(column, ids)` filter, `IN_CHUNK` ids at a time, so a
 * list of thousands of UUIDs never becomes one 414-length query string.
 */
export async function pageAllIn<Row, Id>(
  ids: readonly Id[],
  make: (idsChunk: Id[]) => PageQuery<Row>,
  opts: { chunkSize?: number; pageSize?: number } = {},
): Promise<{ data: Row[]; error: null } | { data: null; error: { message: string } }> {
  const out: Row[] = [];
  for (const part of chunk(ids, opts.chunkSize ?? IN_CHUNK)) {
    const res = await pageAll(() => make(part), opts.pageSize);
    if (res.error) return res;
    out.push(...res.data);
  }
  return { data: out, error: null };
}
