import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PENDING_COLUMNS,
  TOGGLE_KEYS,
  isMissingPendingColumn,
} from "../../app/me/notifications/prefs.ts";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");
}

/**
 * /me/notifications must keep working between the Sprint 3 deploy and
 * migration 0089 (notify_streak). Before 0089 the select and the upsert
 * both fail with 42703; the page retries without the column and the save
 * action strips it, like app/me/profile/page.tsx does for 0090.
 */
describe("notify_streak degrades until 0089 is applied", () => {
  it("lists notify_streak as a pending column and the form knows the key", () => {
    assert.deepEqual([...PENDING_COLUMNS], ["notify_streak"]);
    assert.ok(TOGGLE_KEYS.includes("notify_streak"));
  });

  it("recognises PostgREST's undefined-column error for that column only", () => {
    assert.equal(
      isMissingPendingColumn({ code: "42703", message: "column notification_preferences.notify_streak does not exist" }),
      "notify_streak",
    );
    assert.equal(
      isMissingPendingColumn({ code: "PGRST204", message: "Could not find the 'notify_streak' column of 'notification_preferences' in the schema cache" }),
      "notify_streak",
    );
    assert.equal(isMissingPendingColumn({ code: "42703", message: "column fans.home_region does not exist" }), null);
    assert.equal(isMissingPendingColumn({ code: "23505", message: "duplicate key" }), null);
    assert.equal(isMissingPendingColumn(null), null);
  });

  it("page.tsx retries the select without the column and passes the gap to the form", () => {
    const page = readSource("app/me/notifications/page.tsx");
    assert.match(page, /isMissingPendingColumn\(prefsRes\.error\)/);
    assert.match(page, /\.select\(prefsSelectWithout\(missing\)\)/);
    assert.match(page, /unavailable=\{unavailable\}/);
  });

  it("actions.ts strips the column from the upsert on 42703 and retries", () => {
    const actions = readSource("app/me/notifications/actions.ts");
    assert.match(actions, /isMissingPendingColumn\(error\)/);
    assert.match(actions, /const \{ \[missing\]: _skipped, \.\.\.rest \} = payload/);
    assert.match(actions, /\.\.\.rest, updated_at/);
  });

  it("the form disables the toggle with an 'available soon' hint", () => {
    const form = readSource("app/me/notifications/preferences-form.tsx");
    assert.match(form, /Available soon\./);
    assert.match(form, /disabled=\{soon\}/);
  });
});
