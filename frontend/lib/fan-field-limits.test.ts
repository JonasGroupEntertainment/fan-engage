import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { FAN_FIELD_LIMITS, overLimitField, tooLongMessage } from "./fan-field-limits.ts";

function read(relFromFrontend: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relFromFrontend}`, import.meta.url)), "utf8");
}

describe("fan text limits", () => {
  it("accepts text at the limit", () => {
    assert.equal(overLimitField({ firstName: "a".repeat(50), city: "b".repeat(80) }), null);
  });

  it("names the first field that is too long", () => {
    // Act
    const over = overLimitField({ firstName: "Sam", city: "c".repeat(81), interest: "d".repeat(500) });

    // Assert
    assert.deepEqual(over, { field: "city", message: tooLongMessage("city") });
  });

  it("says the limit in plain words", () => {
    assert.equal(tooLongMessage("firstName"), "First name can be up to 50 characters. Please shorten it.");
  });

  it("ignores missing values", () => {
    assert.equal(overLimitField({ firstName: null, lastName: undefined }), null);
    assert.equal(overLimitField({}), null);
  });

  it("matches the limits the database holds", () => {
    // Arrange
    const sql = read("../supabase/migrations/0113_fan_text_limits.sql");

    // Assert
    assert.ok(sql.includes(`char_length(first_name) <= ${FAN_FIELD_LIMITS.firstName}`));
    assert.ok(sql.includes(`char_length(last_name) <= ${FAN_FIELD_LIMITS.lastName}`));
    assert.ok(sql.includes(`char_length(city) <= ${FAN_FIELD_LIMITS.city}`));
    assert.ok(sql.includes(`char_length(interest) <= ${FAN_FIELD_LIMITS.interest}`));
    assert.ok(sql.includes(`char_length(music_outlet) <= ${FAN_FIELD_LIMITS.musicOutlet}`));
    assert.ok(sql.includes(`char_length(delivery_details) <= ${FAN_FIELD_LIMITS.deliveryDetails}`));
    assert.ok(sql.includes(`char_length(body) <= ${FAN_FIELD_LIMITS.challengeEntry}`));
  });
});

describe("each place a fan types this text checks the limit first", () => {
  it("the profile page", () => {
    assert.match(read("app/me/profile/actions.ts"), /const over = overLimitField\(\{/);
  });

  it("the join form's save", () => {
    assert.match(read("app/api/fan-engage/onboard/route.ts"), /const over = overLimitField\(\{/);
  });

  it("redeeming a reward", () => {
    assert.match(read("app/artists/[slug]/rewards/actions.ts"), /overLimitField\(\{ deliveryDetails \}\)/);
    assert.match(read("app/artists/[slug]/rewards/redeem-form.tsx"), /maxLength=\{FAN_FIELD_LIMITS\.deliveryDetails\}/);
  });

  it("a challenge entry", () => {
    assert.match(read("app/artists/[slug]/community/actions.ts"), /if \(body\.length > FAN_FIELD_LIMITS\.challengeEntry\) return;/);
  });
});
