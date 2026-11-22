import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const MIGRATION = "0105_community_post_submit_key.sql";
const ACTIONS = "app/artists/[slug]/community/actions.ts";
const FORM = "app/artists/[slug]/community/new-post-form.tsx";
const WRAPPER = "lib/community/save-post-once.ts";
const PORTAL_ACTIONS = "app/artist-portal/community/actions.ts";
const PORTAL_FORM = "app/artist-portal/community/composer.tsx";
const CREATE_ACTIONS = [
  "createPostAction",
  "createPollAction",
  "createChallengeAction",
  "createAnnouncementAction",
];
const EM_DASH = String.fromCharCode(8212);

function readFrontend(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
}

function readMigration(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../supabase/migrations/${name}`, import.meta.url)),
    "utf8",
  );
}

/** Strip comment lines so assertions only see executable SQL. */
function stripComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

/** Source of one exported action, up to the next function in the file. */
function actionBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  const next = src.slice(start + 1).search(/^(export )?async function /m);
  return next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
}

describe(MIGRATION, () => {
  const raw = readMigration(MIGRATION);
  const sql = stripComments(raw);

  it("says in its header that it is not yet applied to production", () => {
    assert.match(raw.split("\n").slice(0, 5).join("\n"), /Not yet applied to production\./);
  });

  it("adds a nullable uuid column with no default, so nothing is backfilled", () => {
    assert.match(
      sql,
      /alter table public\.community_posts\s+add column if not exists submit_key uuid;/,
    );
    assert.doesNotMatch(sql, /submit_key uuid\s+(not null|default)/i);
    assert.doesNotMatch(sql, /\bdefault\b|\bupdate\b|\binsert\b/i);
  });

  it("refuses a second row from the same author with the same id, only where an id is set", () => {
    assert.match(
      sql,
      /create unique index if not exists community_posts_author_submit_key_idx\s+on public\.community_posts \(author_id, submit_key\)\s+where submit_key is not null;/,
    );
  });

  it("is re-runnable and changes nothing else", () => {
    const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
    assert.equal(statements.length, 2);
    assert.doesNotMatch(sql, /drop |alter type|create policy|grant |revoke /i);
  });

  it("has no em dash", () => {
    assert.equal(raw.includes(EM_DASH), false);
  });
});

describe("every create action of the post form saves once", () => {
  const actions = readFrontend(ACTIONS);

  for (const name of CREATE_ACTIONS) {
    it(`${name} reads the submit key and inserts through savePostOnce`, () => {
      const body = actionBody(actions, name);
      assert.match(body, /formData\.get\(SUBMIT_KEY_FIELD\)/, "reads the key");
      assert.match(body, /savePostOnce\(/, "saves through the guard");
      assert.match(body, /submitKey,?\s*\)/, "passes the key on");
      assert.doesNotMatch(body, /from\("community_posts"\)\s*\.insert\(/, "no unguarded insert");
    });
  }

  it("a repeat of a fan post is not checked, indexed, moderated, tagged or announced again", () => {
    const body = actionBody(actions, "createPostAction");
    const guardAt = body.indexOf("const created = isRepeat ? null : saved;");
    assert.ok(guardAt > 0, "follow-on work hangs off `created`, which is null on a repeat");
    for (const followOn of ["findNearestPost(", "indexRowAsync(", "moderateRowAsync(", "tagRowAsync(", "notifyNewPost("]) {
      assert.ok(body.indexOf(followOn) > guardAt, followOn);
    }
    assert.match(body, /if \(created && built\.notifyAtCreate\) \{\s+notifyNewPost\(/);
    assert.doesNotMatch(body, /if \(saved\)/);
  });

  it("a failed save of a fan post still throws, so the form shows the error", () => {
    const body = actionBody(actions, "createPostAction");
    assert.match(body, /if \(insertErr\) \{[\s\S]*?throw new Error\(/);
  });

  it("a repeat of a challenge or an announcement is not indexed, moderated or tagged again", () => {
    for (const name of ["createChallengeAction", "createAnnouncementAction"]) {
      const body = actionBody(actions, name);
      assert.match(body, /const created = isRepeat \? null : saved;/, name);
      assert.equal((body.match(/if \(created\) (index|moderate|tag)RowAsync\(/g) ?? []).length, 3, name);
    }
  });

  it("a repeat of a poll adds options only when the first try left none", () => {
    const body = actionBody(actions, "createPollAction");
    assert.match(body, /const needsOptions = !isRepeat \|\| \(await pollHasNoOptions\(admin, post\.id\)\);/);
    assert.match(body, /if \(!isRepeat\) \{\s+indexRowAsync\(/);
    assert.match(body, /if \(needsOptions\) \{\s+await admin\.from\("community_poll_options"\)\.insert\(/);
  });

  it("a repeat of an announcement reaches the social sender with the saved post and the same key", () => {
    const body = actionBody(actions, "createAnnouncementAction");
    assert.match(body, /const postId = saved\?\.id;/);
    assert.match(body, /communityPostId: postId,/);
    assert.match(body, /\n      submitKey,\n    \},\n    defaultSocialDeps\(\),/);
  });
});

describe("the artist portal composer saves once too", () => {
  const portal = readFrontend(PORTAL_ACTIONS);
  const body = actionBody(portal, "createPortalPostAction");

  it("reads the submit key and inserts through savePostOnce", () => {
    assert.match(body, /savePostOnce\(admin, built\.row, formData\.get\(SUBMIT_KEY_FIELD\)\)/);
    assert.doesNotMatch(portal, /from\("community_posts"\)\s*\.insert\(/);
  });

  it("a repeat is not run through the new post pipeline or announced again", () => {
    assert.match(
      body,
      /if \(!isRepeat\) \{\s+await runNewPostPipeline\(admin, postId, built\.row\.body\);[\s\S]*?notifyNewPost\(/,
    );
    assert.equal((body.match(/notifyNewPost\(/g) ?? []).length, 1);
    assert.doesNotMatch(body, /indexRowAsync|moderateRowAsync|tagRowAsync|findNearestPost/);
  });

  it("a repeat of a poll adds options only when the first try left none", () => {
    assert.match(
      body,
      /built\.pollOptions\.length > 0 && \(!isRepeat \|\| \(await pollHasNoOptions\(admin, postId\)\)\)/,
    );
  });

  it("the portal form sets one fresh key per press, before the retry helper runs", () => {
    const form = readFrontend(PORTAL_FORM);
    assert.equal(form.match(/newSubmitId\(\)/g)?.length, 1);
    const setAt = form.indexOf("formData.set(SUBMIT_KEY_FIELD, newSubmitId());");
    const invokeAt = form.indexOf("await invoke(");
    assert.ok(setAt > 0 && setAt < invokeAt);
    assert.equal(form.includes("randomUUID"), false);
  });
});

describe("the Supabase wrapper", () => {
  const wrapper = readFrontend(WRAPPER);

  it("looks a repeat up by the id, the author and the artist together", () => {
    assert.match(wrapper, /\.eq\(SUBMIT_KEY_COLUMN, key\)\s+\.eq\("author_id", row\.author_id\)\s+\.eq\("artist_slug", row\.artist_slug\)/);
  });

  it("inserts with the client it is given and adds the id through withSubmitKey", () => {
    assert.match(wrapper, /client\.from\(POSTS_TABLE\)\.insert\(withSubmitKey\(row, key\)\)\.select\("id"\)\.single\(\)/);
  });
});

describe("the post form", () => {
  const form = readFrontend(FORM);

  it("sets one fresh key on every press, whatever the kind and whether or not social is ticked", () => {
    assert.equal(form.match(/newSubmitId\(\)/g)?.length, 1);
    const setAt = form.indexOf("formData.set(SUBMIT_KEY_FIELD, newSubmitId());");
    const socialIfAt = form.indexOf("if (showSocialCheckbox && alsoPostToSocial) {");
    const invokeAt = form.indexOf("await invoke(");
    assert.ok(setAt > 0, "key is set");
    assert.ok(setAt < socialIfAt, "key is set outside the social branch");
    assert.ok(setAt < invokeAt, "key is set before the retry helper runs, so retries share it");
  });

  it("makes the key outside the retried call, so a retry cannot get a new one", () => {
    const invokeAt = form.indexOf("await invoke(");
    assert.equal(form.slice(invokeAt).includes("newSubmitId"), false);
  });

  it("never calls crypto.randomUUID directly, which older browsers do not have", () => {
    assert.equal(form.includes("randomUUID"), false);
  });
});
