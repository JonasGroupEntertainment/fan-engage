import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAudienceEmail,
  chooseAudienceFanIds,
  parseTierFilter,
  tiersAtOrAbove,
  type AudienceMessage,
} from "./audience-email.ts";

const MESSAGE: AudienceMessage = {
  subject: "Message from RaeLynn",
  body: "New single Friday!\nSee you at the show.",
  artistName: "RaeLynn",
  reason: "follower",
};

function build(over: Partial<AudienceMessage> = {}) {
  return buildAudienceEmail({
    message: { ...MESSAGE, ...over },
    appUrl: "https://www.fanengagepro.com/",
    unsubscribeToken: "fan one",
  });
}

const EM_DASH = String.fromCharCode(8212);

describe("parseTierFilter", () => {
  it("accepts the tiers the screen offers", () => {
    assert.equal(parseTierFilter("all"), "all");
    assert.equal(parseTierFilter("gold"), "gold");
  });

  it("refuses anything else, so a bad value can never mean everyone", () => {
    assert.equal(parseTierFilter("diamond"), null);
    assert.equal(parseTierFilter(""), null);
  });
});

describe("tiersAtOrAbove", () => {
  it("returns null for all fans, meaning no tier narrowing", () => {
    assert.equal(tiersAtOrAbove("all"), null);
  });

  it("returns the picked tier and every tier above it", () => {
    assert.deepEqual(tiersAtOrAbove("gold"), ["gold", "platinum"]);
    assert.deepEqual(tiersAtOrAbove("bronze"), ["bronze", "silver", "gold", "platinum"]);
    assert.deepEqual(tiersAtOrAbove("platinum"), ["platinum"]);
  });
});

describe("chooseAudienceFanIds", () => {
  it("is every fan of the artist, once each, when nothing narrows it", () => {
    assert.deepEqual(chooseAudienceFanIds(["a", "b", "a"], null), ["a", "b"]);
  });

  it("keeps only the artist's fans who are also in the narrowing list", () => {
    assert.deepEqual(chooseAudienceFanIds(["a", "b", "c"], ["c", "a", "stranger"]), ["a", "c"]);
  });

  it("is nobody when the narrowing list is empty", () => {
    assert.deepEqual(chooseAudienceFanIds(["a", "b"], []), []);
  });
});

describe("buildAudienceEmail", () => {
  it("shows the admin's words as written, with line breaks kept and no literal tags", () => {
    const { html, text } = build();
    assert.ok(html.includes("New single Friday!\nSee you at the show."));
    assert.ok(html.includes("white-space:pre-wrap"));
    assert.ok(!html.includes("&lt;p&gt;"));
    assert.ok(!html.includes("&lt;br&gt;"));
    assert.ok(text.includes("New single Friday!\nSee you at the show."));
  });

  it("escapes the admin's text once so it cannot add markup", () => {
    const { html, text } = build({ body: `<script>alert("x")</script> Tom & Jerry's <a href="https://evil.example">win</a>` });
    assert.ok(!html.includes("<script>"));
    assert.ok(!html.includes("https://evil.example\""));
    assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; Tom &amp; Jerry&#39;s"));
    assert.ok(!html.includes("&amp;lt;"));
    assert.ok(text.includes(`<script>alert("x")</script> Tom & Jerry's`));
  });

  it("escapes the artist name and keeps the subject on one line", () => {
    const { html, subject } = build({ artistName: "<b>Rae</b>", subject: "Hello\r\nBcc: someone@example.com" });
    assert.ok(!html.includes("<b>Rae</b>"));
    assert.ok(html.includes("&lt;b&gt;Rae&lt;/b&gt;"));
    assert.equal(subject, "Hello Bcc: someone@example.com");
  });

  it("carries the fan's own unsubscribe link in both parts", () => {
    const { html, text } = build();
    const link = "https://www.fanengagepro.com/unsubscribe?token=fan%20one";
    assert.ok(html.includes(link));
    assert.ok(text.includes(link));
  });

  it("says why the fan is getting it", () => {
    assert.ok(build().text.includes("You are getting this because you follow RaeLynn on Fan Engage."));
    assert.ok(
      build({ reason: "rsvp" }).text.includes("You are getting this because you RSVPed to an event with RaeLynn on Fan Engage."),
    );
  });

  it("uses no em dashes", () => {
    const { html, text, subject } = build();
    assert.ok(![html, text, subject].some((part) => part.includes(EM_DASH)));
  });
});
