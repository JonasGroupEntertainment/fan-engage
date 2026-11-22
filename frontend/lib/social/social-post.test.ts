import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ELLIPSIS,
  SOCIAL_DAILY_LIMIT_MESSAGE,
  SOCIAL_NOT_ALLOWED_MESSAGE,
  SOCIAL_NOT_SET_UP_MESSAGE,
  SOCIAL_AGE_21_FORM_NOTE,
  SOCIAL_REFUSAL_MESSAGES,
  alsoPostLabel,
  MAX_SOCIAL_ANNOUNCEMENTS_PER_ARTIST_PER_DAY,
  PLATFORM_TEXT_LIMITS,
  buildJoinLine,
  buildSocialText,
  decideSocialEligibility,
  describePlatforms,
  isAge21Content,
  isOverDailyLimit,
  isSocialPostingConfigured,
  isValidSubmitKey,
  offerablePlatforms,
  parseSocialAccountRows,
  parseSocialOutcomeRows,
  planSocialPosts,
  socialImageUrl,
  socialLimitWindowStartIso,
  storageHostFromEnv,
  summarizeSocialOutcomes,
  toPlainText,
  type SocialAccount,
} from "./social-post.ts";

const BASE = "https://www.fanengagepro.com";
const JOIN = "Join the community free: https://www.fanengagepro.com/signup?artist=raelynn";

const STORAGE_HOST = "example.supabase.co";
const IMAGE = "https://example.supabase.co/storage/v1/object/public/community-uploads/tour.jpg";

const facebook: SocialAccount = { platform: "facebook", blotatoAccountId: "98433", pageId: "123456789" };
const instagram: SocialAccount = { platform: "instagram", blotatoAccountId: "98434", pageId: null };

const EM_DASH = String.fromCharCode(8212);

describe("isSocialPostingConfigured", () => {
  it("needs the switch set to 1 and a key", () => {
    assert.equal(isSocialPostingConfigured({ SOCIAL_POSTING_ENABLED: "1", BLOTATO_API_KEY: "k" }), true);
  });
  it("is off when either setting is missing or the switch is not exactly 1", () => {
    assert.equal(isSocialPostingConfigured({}), false);
    assert.equal(isSocialPostingConfigured({ SOCIAL_POSTING_ENABLED: "1" }), false);
    assert.equal(isSocialPostingConfigured({ BLOTATO_API_KEY: "k" }), false);
    assert.equal(isSocialPostingConfigured({ SOCIAL_POSTING_ENABLED: "true", BLOTATO_API_KEY: "k" }), false);
    assert.equal(isSocialPostingConfigured({ SOCIAL_POSTING_ENABLED: "1", BLOTATO_API_KEY: "   " }), false);
  });
});

describe("toPlainText", () => {
  it("strips html tags and keeps line breaks", () => {
    assert.equal(toPlainText("<p>Hello <b>friends</b></p><p>See you<br>soon</p>"), "Hello friends\n\nSee you\nsoon");
  });
  it("strips markdown markup", () => {
    assert.equal(
      toPlainText("# Big news\n**Brunch** is _back_ with `biscuits`. [Menu](https://example.com/menu)"),
      "Big news\nBrunch is back with biscuits. Menu (https://example.com/menu)",
    );
  });
  it("decodes common entities and leaves plain comparisons alone", () => {
    assert.equal(toPlainText("Fish &amp; grits, 2 < 3 and 5 > 4"), "Fish & grits, 2 < 3 and 5 > 4");
  });
  it("decodes numeric and named entities", () => {
    assert.equal(toPlainText("w&#105;ne &#x26; caf&eacute; &copy; &ndash; &unknown;"), "wine & caf\u00e9 \u00a9 \u2013 &unknown;");
    assert.equal(toPlainText("bad &#99999999; ok"), "bad &#99999999; ok");
  });
  it("drops invisible characters", () => {
    assert.equal(toPlainText("be\u200ber and wi&shy;ne"), "beer and wine");
  });
  it("collapses extra blank lines and trims", () => {
    assert.equal(toPlainText("  one \r\n\r\n\r\n\r\n two  "), "one\n\ntwo");
  });
});

describe("buildJoinLine", () => {
  it("builds the join link the sign-up page understands for the artist", () => {
    assert.equal(buildJoinLine("raelynn", BASE), JOIN);
    assert.equal(buildJoinLine("raelynn", `${BASE}/`), JOIN);
  });
});

describe("buildSocialText", () => {
  it("puts title, body, a blank line, then the join line", () => {
    assert.equal(
      buildSocialText({ title: "Tour dates are up", body: "Tickets on sale Friday.", joinLine: JOIN, limit: 2200 }),
      `Tour dates are up\n\nTickets on sale Friday.\n\n${JOIN}`,
    );
  });
  it("works with no title", () => {
    assert.equal(
      buildSocialText({ title: "", body: "Tickets on sale Friday.", joinLine: JOIN, limit: 2200 }),
      `Tickets on sale Friday.\n\n${JOIN}`,
    );
  });
  it("truncates the body, never the join line", () => {
    const body = "word ".repeat(1000).trim();
    const text = buildSocialText({ title: "Hi", body, joinLine: JOIN, limit: PLATFORM_TEXT_LIMITS.instagram });
    assert.ok(text.length <= PLATFORM_TEXT_LIMITS.instagram);
    assert.ok(text.endsWith(`${ELLIPSIS}\n\n${JOIN}`));
    assert.ok(text.startsWith("Hi\n\nword"));
  });
  it("does not split an emoji when cutting", () => {
    const text = buildSocialText({ title: "", body: "🍗".repeat(500), joinLine: JOIN, limit: 200 });
    assert.ok(text.length <= 200);
    assert.equal(text.isWellFormed(), true);
  });
});

describe("decideSocialEligibility", () => {
  const ok = { kind: "announcement", visibility: "public", title: "New single", body: "Out this Friday" };
  it("allows a public staff announcement", () => {
    assert.deepEqual(decideSocialEligibility(ok), { ok: true });
  });
  it("refuses every other kind of post", () => {
    for (const kind of ["post", "poll", "challenge", "comment", "entry", ""]) {
      const d = decideSocialEligibility({ ...ok, kind });
      assert.equal(d.ok, false, kind);
      assert.equal(!d.ok && d.reason, "not_announcement");
    }
  });
  it("refuses Premium and Founders announcements", () => {
    for (const visibility of ["premium", "founder-only"]) {
      const d = decideSocialEligibility({ ...ok, visibility });
      assert.equal(!d.ok && d.reason, "premium_or_founders");
    }
  });
  it("refuses alcohol or tobacco wording in the title or body", () => {
    const inBody = decideSocialEligibility({ ...ok, body: "Half price margaritas tonight" });
    assert.equal(!inBody.ok && inBody.reason, "age_21");
    assert.equal(
      !inBody.ok && inBody.message,
      "This announcement mentions alcohol or tobacco, so it was not sent to Facebook or Instagram. It is still posted in the community.",
    );
    const inTitle = decideSocialEligibility({ ...ok, title: "Happy hour" });
    assert.equal(!inTitle.ok && inTitle.reason, "age_21");
    assert.equal(decideSocialEligibility({ ...ok, body: "Root beer floats" }).ok, true);
    assert.equal(
      SOCIAL_AGE_21_FORM_NOTE,
      "This announcement mentions alcohol or tobacco, so it cannot go to Facebook or Instagram.",
    );
  });
  it("catches alcohol wording hidden in markup or entities", () => {
    const dodges = [
      "Half price w<b></b>ine tonight",
      "Half price w&#105;ne tonight",
      "Half price &#x77;ine tonight",
      "Half price **w**ine tonight",
      "Half price be&shy;er tonight",
      "Half price be\u200ber tonight",
    ];
    for (const body of dodges) {
      assert.equal(isAge21Content("", body), true, body);
      assert.equal(isAge21Content(body, "Plain body"), true, body);
      const d = decideSocialEligibility({ ...ok, body });
      assert.equal(!d.ok && d.reason, "age_21", body);
    }
    assert.equal(isAge21Content("New single", "<b>Out</b> &amp; about Friday"), false);
  });
  it("gives a plain message with no em dash", () => {
    const d = decideSocialEligibility({ ...ok, visibility: "premium" });
    assert.ok(!d.ok && d.message.length > 0 && !d.message.includes(EM_DASH));
  });
});

describe("isValidSubmitKey", () => {
  it("accepts a uuid and nothing else", () => {
    assert.equal(isValidSubmitKey("11111111-2222-4333-8444-555555555555"), true);
    assert.equal(isValidSubmitKey("3F2B8C1E-9A4D-4E6F-8B7A-1C2D3E4F5A6B"), true);
    for (const bad of ["", "abc", "11111111222243338444555555555555", " 11111111-2222-4333-8444-555555555555", null, undefined, 7]) {
      assert.equal(isValidSubmitKey(bad), false, String(bad));
    }
  });
});

describe("socialImageUrl", () => {
  it("keeps an image on the app's own public storage", () => {
    assert.equal(socialImageUrl(IMAGE, STORAGE_HOST), IMAGE);
  });
  it("drops anything else", () => {
    const rejected = [
      null,
      "",
      "not a url",
      "http://example.supabase.co/storage/v1/object/public/community-uploads/a.jpg",
      "https://evil.example.com/storage/v1/object/public/community-uploads/a.jpg",
      "https://example.supabase.co.evil.com/storage/v1/object/public/a.jpg",
      "https://example.supabase.co@evil.com/storage/v1/object/public/a.jpg",
      "https://example.supabase.co/storage/v1/object/sign/community-uploads/a.jpg",
      "https://example.supabase.co/other/a.jpg",
      "https://example.supabase.co/storage/v1/object/public/../../auth/v1/a",
    ];
    for (const url of rejected) assert.equal(socialImageUrl(url, STORAGE_HOST), null, String(url));
  });
  it("drops every image when the storage host is unknown", () => {
    assert.equal(socialImageUrl(IMAGE, null), null);
    assert.equal(socialImageUrl(IMAGE, ""), null);
  });
  it("reads the storage host from the Supabase address", () => {
    assert.equal(storageHostFromEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://Example.supabase.co" }), STORAGE_HOST);
    assert.equal(storageHostFromEnv({ NEXT_PUBLIC_SUPABASE_URL: "junk" }), null);
    assert.equal(storageHostFromEnv({}), null);
  });
});

describe("parseSocialAccountRows", () => {
  it("keeps valid rows and drops anything else", () => {
    const rows = [
      { platform: "facebook", blotato_account_id: " 98433 ", page_id: "123" },
      { platform: "instagram", blotato_account_id: "98434", page_id: null },
      { platform: "tiktok", blotato_account_id: "1", page_id: null },
      { platform: "facebook", blotato_account_id: "", page_id: "9" },
      null,
      "junk",
    ];
    assert.deepEqual(parseSocialAccountRows(rows), [
      { platform: "facebook", blotatoAccountId: "98433", pageId: "123" },
      { platform: "instagram", blotatoAccountId: "98434", pageId: null },
    ]);
    assert.deepEqual(parseSocialAccountRows(null), []);
  });
});

describe("parseSocialOutcomeRows", () => {
  it("keeps valid rows, Facebook first, and drops anything else", () => {
    const rows = [
      { platform: "instagram", status: "skipped", provider_ref: null, detail: "no_image" },
      { platform: "facebook", status: "sent", provider_ref: "abc", detail: null },
      { platform: "facebook", status: "weird", provider_ref: null, detail: null },
      { platform: "x", status: "sent" },
      null,
    ];
    assert.deepEqual(parseSocialOutcomeRows(rows), [
      { platform: "facebook", status: "sent", providerRef: "abc", detail: null },
      { platform: "instagram", status: "skipped", providerRef: null, detail: "no_image" },
    ]);
    assert.deepEqual(parseSocialOutcomeRows(undefined), []);
  });
});

describe("offerablePlatforms", () => {
  it("lists platforms that can actually be sent to, Facebook first", () => {
    assert.deepEqual(offerablePlatforms([instagram, facebook]), ["facebook", "instagram"]);
    assert.deepEqual(offerablePlatforms([{ ...facebook, pageId: null }]), []);
    assert.deepEqual(offerablePlatforms([]), []);
  });
  it("names the artist and the platforms on the checkbox", () => {
    assert.equal(
      alsoPostLabel("RaeLynn", ["facebook", "instagram"]),
      "Also post this to RaeLynn's Facebook and Instagram",
    );
    assert.equal(alsoPostLabel("RaeLynn", ["facebook"]), "Also post this to RaeLynn's Facebook");
  });
  it("names them in plain words", () => {
    assert.equal(describePlatforms(["facebook", "instagram"]), "Facebook and Instagram");
    assert.equal(describePlatforms(["instagram"]), "Instagram");
  });
});

describe("planSocialPosts", () => {
  const input = {
    accounts: [instagram, facebook],
    title: "Tour dates are up",
    body: "<b>Tickets</b> on sale Friday.",
    imageUrl: IMAGE,
    storageHost: STORAGE_HOST,
    artistSlug: "raelynn",
    baseUrl: BASE,
  };
  it("sends to both with the image and the join line", () => {
    const plan = planSocialPosts(input);
    assert.deepEqual(plan, [
      {
        platform: "facebook",
        action: "send",
        request: {
          platform: "facebook",
          accountId: "98433",
          pageId: "123456789",
          text: `Tour dates are up\n\nTickets on sale Friday.\n\n${JOIN}`,
          mediaUrls: [IMAGE],
        },
      },
      {
        platform: "instagram",
        action: "send",
        request: {
          platform: "instagram",
          accountId: "98434",
          pageId: null,
          text: `Tour dates are up\n\nTickets on sale Friday.\n\n${JOIN}`,
          mediaUrls: [IMAGE],
        },
      },
    ]);
  });
  it("skips Instagram when there is no image and still sends Facebook", () => {
    const plan = planSocialPosts({ ...input, imageUrl: null });
    assert.equal(plan[0].action, "send");
    assert.deepEqual(plan[0].action === "send" && plan[0].request.mediaUrls, []);
    assert.deepEqual(plan[1], { platform: "instagram", action: "skip", reason: "no_image" });
  });
  it("treats an image that is not on the app's own storage as no image", () => {
    const plan = planSocialPosts({ ...input, imageUrl: "https://cdn.example.com/a.jpg" });
    assert.deepEqual(plan[0].action === "send" && plan[0].request.mediaUrls, []);
    assert.deepEqual(plan[1], { platform: "instagram", action: "skip", reason: "no_image" });
  });
  it("skips Facebook when no Page id is on file", () => {
    const plan = planSocialPosts({ ...input, accounts: [{ ...facebook, pageId: null }] });
    assert.deepEqual(plan, [{ platform: "facebook", action: "skip", reason: "no_page" }]);
  });
  it("uses one account per platform", () => {
    const plan = planSocialPosts({ ...input, accounts: [facebook, { ...facebook, blotatoAccountId: "2" }] });
    assert.equal(plan.length, 1);
  });
  it("respects each platform's length limit", () => {
    const plan = planSocialPosts({ ...input, body: "a ".repeat(40000) });
    for (const item of plan) {
      assert.ok(item.action === "send");
      assert.ok(item.request.text.length <= PLATFORM_TEXT_LIMITS[item.platform]);
      assert.ok(item.request.text.endsWith(JOIN));
    }
  });
});

describe("daily limit", () => {
  it("blocks at the limit", () => {
    assert.equal(isOverDailyLimit(MAX_SOCIAL_ANNOUNCEMENTS_PER_ARTIST_PER_DAY - 1), false);
    assert.equal(isOverDailyLimit(MAX_SOCIAL_ANNOUNCEMENTS_PER_ARTIST_PER_DAY), true);
  });
  it("counts back one day", () => {
    assert.equal(socialLimitWindowStartIso(new Date("2026-11-22T15:00:00.000Z")), "2026-11-21T15:00:00.000Z");
  });
});

describe("summarizeSocialOutcomes", () => {
  it("says where it went", () => {
    assert.equal(
      summarizeSocialOutcomes([
        { platform: "facebook", status: "sent", providerRef: "a", detail: null },
        { platform: "instagram", status: "sent", providerRef: "b", detail: null },
      ]),
      "Sent to Facebook and Instagram.",
    );
  });
  it("says what was skipped and why", () => {
    assert.equal(
      summarizeSocialOutcomes([
        { platform: "facebook", status: "sent", providerRef: "a", detail: null },
        { platform: "instagram", status: "skipped", providerRef: null, detail: "no_image" },
      ]),
      "Sent to Facebook. Instagram was skipped because it needs a photo and this announcement has none.",
    );
  });
  it("says what failed without leaking provider detail", () => {
    const text = summarizeSocialOutcomes([
      { platform: "facebook", status: "failed", providerRef: null, detail: "HTTP 500 secret stuff" },
    ]);
    assert.equal(text, "Facebook did not go through. Your announcement is still posted in the community.");
  });
  it("says when an earlier send has not finished", () => {
    assert.equal(
      summarizeSocialOutcomes([{ platform: "facebook", status: "pending", providerRef: null, detail: null }]),
      "Facebook may still be sending. Please check there before posting again.",
    );
  });
  it("never uses an em dash", () => {
    const text = summarizeSocialOutcomes([
      { platform: "facebook", status: "skipped", providerRef: null, detail: "no_page" },
      { platform: "instagram", status: "failed", providerRef: null, detail: "x" },
    ]);
    assert.ok(!text.includes(EM_DASH));
  });
});

describe("wording for Fan Engage Pro", () => {
  const lines = [
    SOCIAL_DAILY_LIMIT_MESSAGE,
    SOCIAL_NOT_ALLOWED_MESSAGE,
    SOCIAL_NOT_SET_UP_MESSAGE,
    ...Object.values(SOCIAL_REFUSAL_MESSAGES),
  ];
  it("says artist and community, never brand, member or club", () => {
    for (const line of lines) assert.doesNotMatch(line, /brand|member|club/i, line);
    assert.match(SOCIAL_DAILY_LIMIT_MESSAGE, /This artist has reached the limit of 3 social posts in a day/);
  });
  it("never uses an em dash", () => {
    for (const line of lines) assert.ok(!line.includes(EM_DASH), line);
  });
});
