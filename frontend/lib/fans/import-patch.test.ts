import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFanImportPatch, normalizeImportEmail } from "./import-patch.ts";

describe("normalizeImportEmail", () => {
  it("trims and lower-cases valid emails", () => {
    assert.equal(normalizeImportEmail("  Fan@Example.COM "), "fan@example.com");
  });
  it("rejects missing or malformed emails", () => {
    assert.equal(normalizeImportEmail(""), null);
    assert.equal(normalizeImportEmail("not-an-email"), null);
    assert.equal(normalizeImportEmail(42), null);
  });
});

describe("buildFanImportPatch", () => {
  const row = {
    first_name: "Jo",
    phone: "(615) 555-0100",
    city: "Nashville",
    instagram: "@jo",
    tiktok: "jotok",
  };

  it("fills every field for a brand new fan and normalizes the phone", () => {
    const patch = buildFanImportPatch(null, row);
    assert.equal(patch.first_name, "Jo");
    assert.equal(patch.city, "Nashville");
    assert.equal(patch.phone, "+16155550100");
    assert.deepEqual(patch.socials, { instagram: "jo", tiktok: "jotok" });
  });

  it("never overwrites a name, phone, city or handle the fan already has", () => {
    const patch = buildFanImportPatch(
      {
        first_name: "Joanna",
        phone: "+16155559999",
        city: "Austin",
        socials: { instagram: "joanna", tiktok: "jt" },
      },
      row,
    );
    assert.deepEqual(patch, {});
  });

  it("only fills blank fields and keeps existing socials", () => {
    const patch = buildFanImportPatch(
      { first_name: "Joanna", phone: null, city: " ", socials: { instagram: "joanna" } },
      row,
    );
    assert.equal(patch.first_name, undefined);
    assert.equal(patch.phone, "+16155550100");
    assert.equal(patch.city, "Nashville");
    assert.deepEqual(patch.socials, { instagram: "joanna", tiktok: "jotok" });
  });

  it("drops an invalid phone instead of writing it", () => {
    const patch = buildFanImportPatch(null, { phone: "call me" });
    assert.equal(patch.phone, undefined);
  });
});
