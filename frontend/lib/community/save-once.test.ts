import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SUBMIT_KEY_COLUMN,
  isMissingSubmitKeyColumn,
  isSubmitKeyConflict,
  parseSubmitKey,
  saveOnce,
  withSubmitKey,
  type DbError,
  type DbResult,
} from "./save-once.ts";

// Plainly made-up ids, never random-looking ones.
const SUBMIT_ID = "11111111-2222-4333-8444-555555555555";
const FIRST_POST = { id: "post-1" };
const SECOND_POST = { id: "post-2" };

const MISSING_COLUMN_POSTGREST: DbError = {
  code: "PGRST204",
  message: "Could not find the 'submit_key' column of 'community_posts' in the schema cache",
};
const MISSING_COLUMN_POSTGRES: DbError = {
  code: "42703",
  message: 'column "submit_key" of relation "community_posts" does not exist',
};
const CONFLICT: DbError = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "community_posts_author_submit_key_idx"',
  details: "Key (author_id, submit_key)=(a, b) already exists.",
};
const OTHER_ERROR: DbError = { code: "23502", message: "null value in column body" };

type Post = { id: string };
const saved = (row: Post): DbResult<Post> => ({ data: row, error: null });
const failed = (error: DbError): DbResult<Post> => ({ data: null, error });
const notFound: DbResult<Post> = { data: null, error: null };

/** A fake database: answers each insert in turn and records what was sent. */
function fakeDb(insertAnswers: DbResult<Post>[], lookupAnswer: DbResult<Post> = notFound) {
  const inserts: Array<string | null> = [];
  const lookups: string[] = [];
  const logs: string[] = [];
  const remaining = [...insertAnswers];
  return {
    inserts,
    lookups,
    logs,
    deps: {
      insert: async (key: string | null) => {
        inserts.push(key);
        const next = remaining.shift();
        if (!next) throw new Error("unexpected extra insert");
        return next;
      },
      findExisting: async (key: string) => {
        lookups.push(key);
        return lookupAnswer;
      },
      log: (message: string) => {
        logs.push(message);
      },
    },
  };
}

describe("parseSubmitKey", () => {
  it("accepts a uuid and returns it in lower case", () => {
    assert.equal(parseSubmitKey(SUBMIT_ID), SUBMIT_ID);
    assert.equal(parseSubmitKey("AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE"), "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  });

  it("returns null for a missing or malformed value", () => {
    for (const bad of [null, undefined, "", "abc", 42, `${SUBMIT_ID}x`, " " + SUBMIT_ID, "11111111222243338444555555555555"]) {
      assert.equal(parseSubmitKey(bad), null, String(bad));
    }
  });
});

describe("withSubmitKey", () => {
  it("adds the column only when there is a key, and never changes the row passed in", () => {
    const row = { body: "hello" };
    assert.deepEqual(withSubmitKey(row, SUBMIT_ID), { body: "hello", [SUBMIT_KEY_COLUMN]: SUBMIT_ID });
    assert.deepEqual(withSubmitKey(row, null), { body: "hello" });
    assert.equal(SUBMIT_KEY_COLUMN in withSubmitKey(row, null), false);
    assert.deepEqual(row, { body: "hello" });
  });
});

describe("reading database errors", () => {
  it("spots the column not existing yet, from PostgREST or from Postgres", () => {
    assert.equal(isMissingSubmitKeyColumn(MISSING_COLUMN_POSTGREST), true);
    assert.equal(isMissingSubmitKeyColumn(MISSING_COLUMN_POSTGRES), true);
  });

  it("does not mistake another missing column, another error or no error for it", () => {
    assert.equal(isMissingSubmitKeyColumn({ code: "PGRST204", message: "Could not find the 'tags' column" }), false);
    assert.equal(isMissingSubmitKeyColumn({ code: "42703", message: 'column "tags" does not exist' }), false);
    assert.equal(isMissingSubmitKeyColumn(CONFLICT), false);
    assert.equal(isMissingSubmitKeyColumn(OTHER_ERROR), false);
    assert.equal(isMissingSubmitKeyColumn(null), false);
  });

  it("spots a repeat of the same submit, by code and by the index or column name", () => {
    assert.equal(isSubmitKeyConflict(CONFLICT), true);
    assert.equal(isSubmitKeyConflict({ code: "23505", details: "Key (author_id, submit_key)=(a, b) already exists." }), true);
  });

  it("does not treat another unique clash or another error as a repeat", () => {
    assert.equal(isSubmitKeyConflict({ code: "23505", message: 'violates unique constraint "community_posts_pkey"' }), false);
    assert.equal(isSubmitKeyConflict(MISSING_COLUMN_POSTGRES), false);
    assert.equal(isSubmitKeyConflict(OTHER_ERROR), false);
    assert.equal(isSubmitKeyConflict(null), false);
  });
});

describe("saveOnce", () => {
  it("first save: sends the key and reports a new row", async () => {
    const db = fakeDb([saved(FIRST_POST)]);
    const outcome = await saveOnce({ submitKey: SUBMIT_ID, ...db.deps });
    assert.deepEqual(outcome, { row: FIRST_POST, isRepeat: false, isGuarded: true, error: null });
    assert.deepEqual(db.inserts, [SUBMIT_ID]);
    assert.deepEqual(db.lookups, []);
    assert.deepEqual(db.logs, []);
  });

  it("repeat of the same submit: returns the first row and inserts nothing more", async () => {
    const db = fakeDb([failed(CONFLICT)], saved(FIRST_POST));
    const outcome = await saveOnce({ submitKey: SUBMIT_ID, ...db.deps });
    assert.deepEqual(outcome, { row: FIRST_POST, isRepeat: true, isGuarded: true, error: null });
    assert.deepEqual(db.inserts, [SUBMIT_ID]);
    assert.deepEqual(db.lookups, [SUBMIT_ID]);
  });

  it("a real first save followed by two retries makes one row", async () => {
    const rows: Array<{ id: string; key: string | null }> = [];
    const insert = async (key: string | null): Promise<DbResult<Post>> => {
      if (key !== null && rows.some((row) => row.key === key)) return failed(CONFLICT);
      const row = { id: `post-${rows.length + 1}`, key };
      rows.push(row);
      return saved({ id: row.id });
    };
    const findExisting = async (key: string): Promise<DbResult<Post>> => {
      const row = rows.find((candidate) => candidate.key === key);
      return row ? saved({ id: row.id }) : notFound;
    };
    const attempts = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      attempts.push(await saveOnce({ submitKey: SUBMIT_ID, insert, findExisting }));
    }
    assert.equal(rows.length, 1);
    assert.deepEqual(attempts.map((a) => a.row?.id), ["post-1", "post-1", "post-1"]);
    assert.deepEqual(attempts.map((a) => a.isRepeat), [false, true, true]);
  });

  it("before the migration: retries once without the column, saves, and says the guard is off", async () => {
    for (const missing of [MISSING_COLUMN_POSTGREST, MISSING_COLUMN_POSTGRES]) {
      const db = fakeDb([failed(missing), saved(FIRST_POST)]);
      const outcome = await saveOnce({ submitKey: SUBMIT_ID, ...db.deps });
      assert.deepEqual(outcome, { row: FIRST_POST, isRepeat: false, isGuarded: false, error: null });
      assert.deepEqual(db.inserts, [SUBMIT_ID, null]);
      assert.deepEqual(db.lookups, []);
      assert.equal(db.logs.length, 1);
      assert.match(db.logs[0], /save once guard is not active/);
    }
  });

  it("before the migration: a failure of the plain insert is reported, with no third try", async () => {
    const db = fakeDb([failed(MISSING_COLUMN_POSTGREST), failed(OTHER_ERROR)]);
    const outcome = await saveOnce({ submitKey: SUBMIT_ID, ...db.deps });
    assert.deepEqual(outcome, { row: null, isRepeat: false, isGuarded: false, error: OTHER_ERROR });
    assert.deepEqual(db.inserts, [SUBMIT_ID, null]);
  });

  it("missing or malformed id: saves as before, without the column and without the guard", async () => {
    for (const bad of [null, undefined, "", "not-a-uuid"]) {
      const db = fakeDb([saved(FIRST_POST)]);
      const outcome = await saveOnce({ submitKey: bad, ...db.deps });
      assert.deepEqual(outcome, { row: FIRST_POST, isRepeat: false, isGuarded: false, error: null });
      assert.deepEqual(db.inserts, [null]);
      assert.deepEqual(db.lookups, []);
    }
  });

  it("another insert error is passed through untouched, with no retry and no lookup", async () => {
    const db = fakeDb([failed(OTHER_ERROR)]);
    const outcome = await saveOnce({ submitKey: SUBMIT_ID, ...db.deps });
    assert.deepEqual(outcome, { row: null, isRepeat: false, isGuarded: true, error: OTHER_ERROR });
    assert.deepEqual(db.inserts, [SUBMIT_ID]);
    assert.deepEqual(db.lookups, []);
  });

  it("the id is already used outside this author and community: saves without the guard, shows nothing of the other row", async () => {
    const db = fakeDb([failed(CONFLICT), saved(SECOND_POST)], notFound);
    const outcome = await saveOnce({ submitKey: SUBMIT_ID, ...db.deps });
    assert.deepEqual(outcome, { row: SECOND_POST, isRepeat: false, isGuarded: false, error: null });
    assert.deepEqual(db.inserts, [SUBMIT_ID, null]);
    assert.deepEqual(db.lookups, [SUBMIT_ID]);
  });

  it("a repeat whose first row cannot be read: inserts nothing and reports the error", async () => {
    const db = fakeDb([failed(CONFLICT)], failed(OTHER_ERROR));
    const outcome = await saveOnce({ submitKey: SUBMIT_ID, ...db.deps });
    assert.deepEqual(outcome, { row: null, isRepeat: true, isGuarded: true, error: OTHER_ERROR });
    assert.deepEqual(db.inserts, [SUBMIT_ID]);
  });

  it("an upper case id is sent in lower case, so a retry matches the first save", async () => {
    const db = fakeDb([saved(FIRST_POST)]);
    await saveOnce({ submitKey: SUBMIT_ID.toUpperCase(), ...db.deps });
    assert.deepEqual(db.inserts, [SUBMIT_ID]);
  });
});
