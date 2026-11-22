// Save a community post once per press of the button.
//
// The post forms retry a save when the server answers with an error, and
// the create actions are not safe to repeat, so a retry used to make the
// same post twice. The form now sends one id per press (every automatic
// retry of that press carries the same id) and the database refuses a
// second row with the same author and id (supabase/migrations/0105).
// This file holds the rule for what to do with each answer.
//
// Pure: no network, no database, and no "@/" imports, so plain
// `node --test` can load it. The caller passes in the insert and the lookup.

/** Column on community_posts that holds the per submit id. */
export const SUBMIT_KEY_COLUMN = "submit_key";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres: a unique index refused the row. */
const UNIQUE_VIOLATION_CODE = "23505";
/** Postgres: the column does not exist. */
const UNDEFINED_COLUMN_CODE = "42703";
/** PostgREST: the column is not in its picture of the table. */
const POSTGREST_UNKNOWN_COLUMN_CODE = "PGRST204";

const GUARD_NOT_ACTIVE_MESSAGE =
  "[community] save once guard is not active: community_posts.submit_key does not exist yet, saved without it";

/** The parts of a Supabase error this rule reads. */
export type DbError = { code?: string | null; message?: string | null; details?: string | null };
export type DbResult<Row> = { data: Row | null; error: DbError | null };

export type SaveOnceOutcome<Row> = {
  /** The saved row: the new one, or the first one when this was a repeat. */
  row: Row | null;
  /** True when this submit was already saved. Nothing new was written. */
  isRepeat: boolean;
  /** True when the row carries the id, so a later repeat will be refused. */
  isGuarded: boolean;
  error: DbError | null;
};

export type SaveOnceDeps<Row> = {
  /** Raw value from the form. Missing or malformed means save without the guard. */
  submitKey: unknown;
  /** Insert the row, with the id when one is given, and return it. */
  insert: (submitKey: string | null) => PromiseLike<DbResult<Row>>;
  /** The row already saved under this id, for the same author and community only. */
  findExisting: (submitKey: string) => PromiseLike<DbResult<Row>>;
  log?: (message: string) => void;
};

/** The id in lower case when it has a uuid shape, otherwise null. */
export function parseSubmitKey(raw: unknown): string | null {
  return typeof raw === "string" && UUID_PATTERN.test(raw) ? raw.toLowerCase() : null;
}

/** A copy of the row with the id added, or the row as it is when there is no id. */
export function withSubmitKey<T extends object>(
  row: T,
  submitKey: string | null,
): T & { [SUBMIT_KEY_COLUMN]?: string } {
  return submitKey === null ? { ...row } : { ...row, [SUBMIT_KEY_COLUMN]: submitKey };
}

function errorText(error: DbError): string {
  return `${error.message ?? ""} ${error.details ?? ""}`;
}

/** True when the insert failed only because the migration is not applied yet. */
export function isMissingSubmitKeyColumn(error: DbError | null | undefined): boolean {
  if (!error) return false;
  const isUnknownColumn =
    error.code === UNDEFINED_COLUMN_CODE || error.code === POSTGREST_UNKNOWN_COLUMN_CODE;
  return isUnknownColumn && errorText(error).includes(SUBMIT_KEY_COLUMN);
}

/** True when the database refused the row because this id was already saved. */
export function isSubmitKeyConflict(error: DbError | null | undefined): boolean {
  if (!error) return false;
  return error.code === UNIQUE_VIOLATION_CODE && errorText(error).includes(SUBMIT_KEY_COLUMN);
}

async function saveWithoutGuard<Row>(deps: SaveOnceDeps<Row>): Promise<SaveOnceOutcome<Row>> {
  const { data, error } = await deps.insert(null);
  return { row: data, isRepeat: false, isGuarded: false, error };
}

async function answerRepeat<Row>(
  deps: SaveOnceDeps<Row>,
  submitKey: string,
): Promise<SaveOnceOutcome<Row>> {
  const existing = await deps.findExisting(submitKey);
  if (existing.error) return { row: null, isRepeat: true, isGuarded: true, error: existing.error };
  if (existing.data) return { row: existing.data, isRepeat: true, isGuarded: true, error: null };
  // The id is in use, but not by this author in this community. Tell the
  // caller nothing about that other row and save this one without the guard.
  return saveWithoutGuard(deps);
}

/**
 * Insert a row at most once per submit id.
 *
 *   new id            the row is saved with the id
 *   same id again     nothing is written, the first row is returned (isRepeat)
 *   column missing    one more try without the id, exactly as before the guard
 *   no or bad id      saved without the id, exactly as before the guard
 *   any other error   passed back untouched
 */
export async function saveOnce<Row>(deps: SaveOnceDeps<Row>): Promise<SaveOnceOutcome<Row>> {
  const submitKey = parseSubmitKey(deps.submitKey);
  if (submitKey === null) return saveWithoutGuard(deps);

  const { data, error } = await deps.insert(submitKey);
  if (isMissingSubmitKeyColumn(error)) {
    (deps.log ?? console.warn)(GUARD_NOT_ACTIVE_MESSAGE);
    return saveWithoutGuard(deps);
  }
  if (isSubmitKeyConflict(error)) return answerRepeat(deps, submitKey);
  return { row: data, isRepeat: false, isGuarded: true, error };
}
