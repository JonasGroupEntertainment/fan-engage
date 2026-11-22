/**
 * Run `work` over `items`, at most `limit` at a time, and return the
 * results in input order. `work` should catch its own errors: a rejection
 * rejects the whole call.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const lanes = Math.min(items.length, Math.max(1, Math.floor(limit)));
  let next = 0;
  async function lane(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: lanes }, lane));
  return results;
}
