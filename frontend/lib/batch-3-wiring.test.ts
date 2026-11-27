import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fanDisplayName, fanPublicName } from "./format/fan-name.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("fanPublicName", () => {
  it("is the preferred name only, never the last name", () => {
    assert.equal(fanPublicName({ first_name: " Lyra " }), "Lyra");
    assert.equal(fanPublicName({ first_name: "Lyra", last_name: "Stone" } as never), "Lyra");
    assert.equal(fanPublicName({ first_name: "  " }), "A fan");
    assert.equal(fanPublicName(null, "Fan"), "Fan");
  });

  it("leaves the team view's full name alone", () => {
    assert.equal(fanDisplayName({ first_name: "Lyra", last_name: "Stone" }), "Lyra Stone");
  });
});

describe("public pages do not show last names", () => {
  it("leaderboard does not read or show last_name", () => {
    const source = read("./leaderboard/gather.ts");
    assert.doesNotMatch(source, /last_name/);
    assert.match(source, /fanPublicName\(/);
  });

  it("fan card and its share title use the preferred name", () => {
    const source = read("../app/me/card/page.tsx");
    assert.doesNotMatch(source, /last_name/);
    assert.match(source, /const displayName = fanPublicName\(fan, "Fan"\);/);
  });
});

describe("post links land on the post", () => {
  it("each post card carries the anchor the links point at", () => {
    assert.match(read("../app/artists/[slug]/community/post-card.tsx"), /id=\{postAnchorId\(post\.id\)\}/);
  });

  it("picked-for-you cards link to the community page, not a bare fragment", () => {
    const source = read("../components/personal/picked-for-you.tsx");
    assert.match(source, /href=\{postCommunityHref\(artistSlug, post\.id\)\}/);
    assert.doesNotMatch(source, /href=\{`#post-/);
  });
});

describe("large text", () => {
  it("the base text size follows the visitor's own setting", () => {
    const css = read("../app/globals.css");
    assert.match(css, /html \{[^}]*font-size: 112\.5%;/);
    assert.doesNotMatch(css, /font-size: 18px/);
  });

  it("the header shortens its name only when crowded", () => {
    const layout = read("../app/layout.tsx");
    assert.match(layout, /data-header-row/);
    assert.match(layout, /data-wordmark-link/);
    assert.match(layout, /<HeaderFit \/>/);
    assert.match(read("../app/globals.css"), /\[data-header-row\]\[data-crowded\] \[data-wordmark\]/);
  });

  it("long links in posts and comments wrap", () => {
    const card = read("../app/artists/[slug]/community/post-card.tsx");
    assert.equal(card.match(/whitespace-pre-wrap[^"]*\[overflow-wrap:anywhere\]/g)?.length, 2);
  });
});

describe("reset password says why it will not save", () => {
  const form = read("../app/reset-password/reset-password-form.tsx");

  it("shows both messages as the fan types, above the button", () => {
    assert.match(form, /const mismatch = confirmPassword\.length > 0 && password !== confirmPassword;/);
    assert.match(form, /const tooShort = password\.length > 0 && password\.length < 8;/);
    assert.ok(form.indexOf("data-password-mismatch") < form.indexOf("Update password"));
    assert.ok(form.indexOf("data-password-too-short") < form.indexOf("Update password"));
  });

  it("turns off the browser's silent checks and does not repeat a message", () => {
    assert.match(form, /<form onSubmit=\{handleSubmit\} noValidate/);
    assert.match(form, /message && !repeatsLiveHint/);
  });
});
