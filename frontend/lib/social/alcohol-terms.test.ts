import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mentionsAlcohol } from "./alcohol-terms.ts";

describe("mentionsAlcohol", () => {
  it("flags alcohol wording", () => {
    for (const text of [
      "Whiskey night at the show",
      "Free beer for the first 50 fans",
      "Half price margaritas tonight",
      "Happy hour before doors",
      "BOURBON tasting",
      "Tequila shots backstage",
    ]) {
      assert.equal(mentionsAlcohol(text), true, text);
    }
  });
  it("flags tobacco wording", () => {
    for (const text of ["Cigars after the set", "Vape giveaway", "Tobacco sponsor"]) {
      assert.equal(mentionsAlcohol(text), true, text);
    }
  });
  it("leaves ordinary announcements alone", () => {
    for (const text of [
      "New single out Friday",
      "Tour dates are up. Tickets on sale Friday.",
      "Meet and greet in Nashville",
      "Winter tour begins",
      "",
    ]) {
      assert.equal(mentionsAlcohol(text), false, text);
    }
  });
  it("ignores soft drinks that contain a flagged word", () => {
    for (const text of ["Root beer floats", "Ginger ale on the bus", "Mocktails at the merch table"]) {
      assert.equal(mentionsAlcohol(text), false, text);
    }
  });
  it("still flags a real drink next to a soft drink", () => {
    assert.equal(mentionsAlcohol("Root beer and wine"), true);
  });
});
