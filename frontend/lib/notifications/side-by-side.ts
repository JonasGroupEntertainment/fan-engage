/**
 * Run independent jobs at the same time and keep whatever each one
 * produced. No job waits for another, and a job that throws loses only
 * its own rows. Never throws. Pure: no imports.
 *
 * sendNotification uses it so the inbox write never delays or endangers
 * the push and SMS sends, and the other way round.
 */

export type SideBySideResult<Row> = { rows: Row[]; errors: unknown[] };

export async function runSideBySide<Row>(
  jobs: ReadonlyArray<() => Promise<Row[]>>,
): Promise<SideBySideResult<Row>> {
  const settled = await Promise.allSettled(
    // The wrapper turns a job that throws before its first await into a
    // rejection, so it cannot stop the jobs after it from starting.
    jobs.map(async (job) => job()),
  );
  return settled.reduce<SideBySideResult<Row>>(
    (acc, outcome) =>
      outcome.status === "fulfilled"
        ? { rows: [...acc.rows, ...outcome.value], errors: acc.errors }
        : { rows: acc.rows, errors: [...acc.errors, outcome.reason] },
    { rows: [], errors: [] },
  );
}
