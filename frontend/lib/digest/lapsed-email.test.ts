import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LAPSED_SUBJECT_MAX,
  buildLapsedEmail,
  clean,
  escapeHtml,
  lapsedSubject,
} from "./lapsed-email.ts";

describe("lapsedSubject", () => {
  it("names the fan and the artist, with 'there' as the fallback name", () => {
    assert.equal(lapsedSubject("Kevin", "Artist One"), "It's been a minute, Kevin — Artist One kept going");
    assert.equal(lapsedSubject("", ""), "It's been a minute, there");
  });

  it("strips merge tags and caps the length", () => {
    assert.equal(lapsedSubject("*|FNAME|*", ""), "It's been a minute, there");
    const long = lapsedSubject("Kevin", "A".repeat(120));
    assert.ok(long.length <= LAPSED_SUBJECT_MAX);
    assert.ok(long.endsWith("…"));
  });
});

describe("buildLapsedEmail", () => {
  const content = buildLapsedEmail({
    firstName: "Kevin",
    artistSlug: "artist-one",
    artistName: "Artist <One>",
    daysSinceActivity: 21,
    baseHref: "https://www.fanengagepro.com/",
  });

  it("points the CTA at the artist's community page", () => {
    assert.equal(content.ctaPath, "/artists/artist-one/community");
    assert.equal(content.ctaHref, "https://www.fanengagepro.com/artists/artist-one/community");
    assert.ok(content.text.includes(content.ctaHref));
    assert.ok(content.html.includes(`href="${content.ctaHref}"`));
  });

  it("names the artist in the copy and escapes it in the HTML", () => {
    assert.ok(content.text.includes("Artist <One> kept posting"));
    assert.ok(content.html.includes("Artist &lt;One&gt; kept posting"));
    assert.ok(!content.html.includes("<One>"));
    assert.ok(content.text.startsWith("Hey Kevin, it's been a minute."));
  });

  it("falls back to the root when there is no artist slug", () => {
    const c = buildLapsedEmail({
      firstName: "",
      artistSlug: "",
      artistName: "",
      daysSinceActivity: 0,
      baseHref: "https://example.com",
    });
    assert.equal(c.ctaPath, "/");
    assert.equal(c.ctaHref, "https://example.com");
    assert.ok(c.text.includes("your artist kept posting"));
    assert.ok(c.text.startsWith("Hey there"));
  });
});

describe("helpers", () => {
  it("escapes html and cleans merge tags / whitespace", () => {
    assert.equal(escapeHtml(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
    assert.equal(clean("  a  *|FNAME|*  b \n c "), "a b c");
    assert.equal(clean(null), "");
  });
});
