import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  sendAnnouncementToSocial,
  type AnnouncementForSocial,
  type SocialDeps,
  type SocialPostRecord,
} from "./announce.ts";
import {
  MAX_SOCIAL_ANNOUNCEMENTS_PER_ARTIST_PER_DAY,
  type SocialAccount,
  type SocialSendRequest,
} from "./social-post.ts";
import type { PublishResult } from "./blotato.ts";

const facebook: SocialAccount = { platform: "facebook", blotatoAccountId: "98433", pageId: "123456789" };
const instagram: SocialAccount = { platform: "instagram", blotatoAccountId: "98434", pageId: null };

const EM_DASH = String.fromCharCode(8212);
const IMAGE = "https://example.supabase.co/storage/v1/object/public/community-uploads/tour.jpg";
// A made-up id in the right shape. Kept plain on purpose: a random-looking
// value on a line with the word "key" trips the secret scanner.
const SUBMIT_KEY = "11111111-2222-4333-8444-555555555555";

const announcement: AnnouncementForSocial = {
  kind: "announcement",
  communityPostId: "11111111-1111-1111-1111-111111111111",
  artistSlug: "raelynn",
  title: "Tour dates are up",
  body: "Tickets on sale Friday.",
  visibility: "public",
  imageUrl: IMAGE,
  createdBy: "22222222-2222-2222-2222-222222222222",
  isArtistAdmin: true,
  submitKey: SUBMIT_KEY,
};

function makeDeps(overrides: Partial<SocialDeps> = {}) {
  const sent: SocialSendRequest[] = [];
  const reserved: SocialPostRecord[] = [];
  const settled: SocialPostRecord[] = [];
  const steps: string[] = [];
  const deps: SocialDeps = {
    env: { SOCIAL_POSTING_ENABLED: "1", BLOTATO_API_KEY: "test-key" },
    baseUrl: "https://www.fanengagepro.com",
    storageHost: "example.supabase.co",
    now: () => new Date("2026-11-22T15:00:00.000Z"),
    listAccounts: async () => [facebook, instagram],
    findBySubmitKey: async () => [],
    countRecentAnnouncements: async () => 0,
    reserve: async (rows) => {
      steps.push("reserve");
      reserved.push(...rows);
    },
    settle: async (rows) => {
      steps.push("settle");
      settled.push(...rows);
    },
    createPublisher: () => ({
      publish: async (request): Promise<PublishResult> => {
        steps.push(`send:${request.platform}`);
        sent.push(request);
        return { ok: true, providerRef: `ref-${request.platform}` };
      },
    }),
    ...overrides,
  };
  return { deps, sent, reserved, settled, steps };
}

const shape = (rows: SocialPostRecord[]) => rows.map((r) => [r.platform, r.status, r.providerRef, r.detail]);

describe("sendAnnouncementToSocial", () => {
  it("writes pending rows first, then sends, then settles each row", async () => {
    const { deps, sent, reserved, settled, steps } = makeDeps();
    const notice = await sendAnnouncementToSocial(announcement, deps);
    assert.equal(notice.message, "Sent to Facebook and Instagram.");
    assert.deepEqual(sent.map((r) => r.platform), ["facebook", "instagram"]);
    assert.equal(steps[0], "reserve");
    assert.equal(steps[steps.length - 1], "settle");
    assert.ok(sent[0].text.endsWith("Join the community free: https://www.fanengagepro.com/signup?artist=raelynn"));
    assert.deepEqual(reserved, [
      {
        artistSlug: "raelynn",
        communityPostId: announcement.communityPostId,
        platform: "facebook",
        status: "pending",
        providerRef: null,
        detail: null,
        createdBy: announcement.createdBy,
        submitKey: SUBMIT_KEY,
      },
      {
        artistSlug: "raelynn",
        communityPostId: announcement.communityPostId,
        platform: "instagram",
        status: "pending",
        providerRef: null,
        detail: null,
        createdBy: announcement.createdBy,
        submitKey: SUBMIT_KEY,
      },
    ]);
    assert.deepEqual(shape(settled), [
      ["facebook", "sent", "ref-facebook", null],
      ["instagram", "sent", "ref-instagram", null],
    ]);
  });

  it("skips Instagram with no image, still sends Facebook, and says so", async () => {
    const { deps, sent, reserved, settled } = makeDeps();
    const notice = await sendAnnouncementToSocial({ ...announcement, imageUrl: null }, deps);
    assert.deepEqual(sent.map((r) => r.platform), ["facebook"]);
    assert.equal(
      notice.message,
      "Sent to Facebook. Instagram was skipped because it needs a photo and this announcement has none.",
    );
    assert.deepEqual(shape(reserved), [
      ["facebook", "pending", null, null],
      ["instagram", "skipped", null, "no_image"],
    ]);
    assert.deepEqual(shape(settled), [["facebook", "sent", "ref-facebook", null]]);
  });

  it("sends no image that is not on the app's own storage", async () => {
    const { deps, sent } = makeDeps();
    await sendAnnouncementToSocial({ ...announcement, imageUrl: "https://evil.example.com/a.jpg" }, deps);
    assert.deepEqual(sent.map((r) => [r.platform, r.mediaUrls]), [["facebook", []]]);
  });

  it("never sends anything that is not a staff announcement", async () => {
    for (const kind of ["post", "poll", "challenge", "comment"]) {
      const { deps, sent, reserved } = makeDeps();
      const notice = await sendAnnouncementToSocial(
        { ...announcement, kind } as unknown as AnnouncementForSocial,
        deps,
      );
      assert.equal(sent.length, 0, kind);
      assert.equal(reserved.length, 0, kind);
      assert.ok(notice.message.length > 0);
    }
  });

  it("refuses when the caller is not on the team for this artist", async () => {
    const { deps, sent } = makeDeps();
    await sendAnnouncementToSocial({ ...announcement, isArtistAdmin: false }, deps);
    assert.equal(sent.length, 0);
  });

  it("refuses alcohol wording with a plain message, even when hidden in markup", async () => {
    for (const body of ["Bourbon tasting Friday", "Bour<i></i>bon tasting", "w&#105;ne night"]) {
      const { deps, sent, reserved } = makeDeps();
      const notice = await sendAnnouncementToSocial({ ...announcement, body }, deps);
      assert.equal(sent.length, 0, body);
      assert.equal(reserved.length, 0, body);
      assert.match(notice.message, /alcohol or tobacco/);
    }
  });

  it("refuses Premium and Founders announcements", async () => {
    for (const visibility of ["premium", "founder-only", "private", ""]) {
      const { deps, sent, reserved } = makeDeps();
      const notice = await sendAnnouncementToSocial({ ...announcement, visibility }, deps);
      assert.equal(sent.length, 0, visibility);
      assert.equal(reserved.length, 0, visibility);
      assert.match(notice.message, /stay inside the community/);
    }
  });

  it("sends nothing when the switch or the key is missing", async () => {
    for (const env of [{}, { SOCIAL_POSTING_ENABLED: "1" }, { BLOTATO_API_KEY: "k" }]) {
      const { deps, sent } = makeDeps({ env });
      await sendAnnouncementToSocial(announcement, deps);
      assert.equal(sent.length, 0);
    }
  });

  it("sends nothing when no accounts are linked", async () => {
    const { deps, sent } = makeDeps({ listAccounts: async () => [] });
    const notice = await sendAnnouncementToSocial(announcement, deps);
    assert.equal(sent.length, 0);
    assert.match(notice.message, /not set up/);
  });

  it("sends nothing when the submit key is missing or malformed", async () => {
    for (const submitKey of ["", "abc", "not-a-uuid-at-all"]) {
      const { deps, sent, reserved } = makeDeps();
      const notice = await sendAnnouncementToSocial({ ...announcement, submitKey }, deps);
      assert.equal(sent.length, 0, submitKey);
      assert.equal(reserved.length, 0, submitKey);
      assert.equal(
        notice.message,
        "We could not confirm this was a single request, so it was not sent to Facebook or Instagram. Your announcement is still posted in the community.",
      );
    }
  });

  it("a retry with the same submit key sends nothing and returns the earlier outcome", async () => {
    let askedFor: string[] = [];
    const { deps, sent, reserved } = makeDeps({
      findBySubmitKey: async (artistSlug, submitKey) => {
        askedFor = [artistSlug, submitKey];
        return [
          { platform: "facebook", status: "sent", providerRef: "earlier", detail: null },
          { platform: "instagram", status: "skipped", providerRef: null, detail: "no_image" },
        ];
      },
    });
    const notice = await sendAnnouncementToSocial(
      { ...announcement, communityPostId: "33333333-3333-3333-3333-333333333333" },
      deps,
    );
    assert.deepEqual(askedFor, ["raelynn", SUBMIT_KEY]);
    assert.equal(sent.length, 0);
    assert.equal(reserved.length, 0);
    assert.equal(
      notice.message,
      "Sent to Facebook. Instagram was skipped because it needs a photo and this announcement has none.",
    );
  });

  it("sends nothing when the earlier sends cannot be checked", async () => {
    const { deps, sent } = makeDeps({ findBySubmitKey: async () => null });
    const notice = await sendAnnouncementToSocial(announcement, deps);
    assert.equal(sent.length, 0);
    assert.match(notice.message, /could not check whether this was already sent/);
  });

  it("enforces the daily limit, counting from one day back", async () => {
    let askedSince = "";
    const { deps, sent } = makeDeps({
      countRecentAnnouncements: async (_slug, sinceIso) => {
        askedSince = sinceIso;
        return MAX_SOCIAL_ANNOUNCEMENTS_PER_ARTIST_PER_DAY;
      },
    });
    const notice = await sendAnnouncementToSocial(announcement, deps);
    assert.equal(sent.length, 0);
    assert.equal(askedSince, "2026-11-21T15:00:00.000Z");
    assert.match(notice.message, /limit/);
  });

  it("sends nothing when the limit cannot be checked", async () => {
    const { deps, sent } = makeDeps({ countRecentAnnouncements: async () => null });
    await sendAnnouncementToSocial(announcement, deps);
    assert.equal(sent.length, 0);
  });

  it("sends nothing when the pending rows cannot be written, and says so", async () => {
    const { deps, sent } = makeDeps({
      reserve: async () => {
        throw new Error("db down");
      },
    });
    const notice = await sendAnnouncementToSocial(announcement, deps);
    assert.equal(sent.length, 0);
    assert.equal(
      notice.message,
      "We could not record this send, so nothing was sent to Facebook or Instagram. Your announcement is still posted in the community.",
    );
  });

  it("still reports the outcome when the rows cannot be settled", async () => {
    const { deps, sent } = makeDeps({
      settle: async () => {
        throw new Error("db down");
      },
    });
    const notice = await sendAnnouncementToSocial(announcement, deps);
    assert.equal(sent.length, 2);
    assert.equal(notice.message, "Sent to Facebook and Instagram.");
  });

  it("records a failure and keeps going with the other platform", async () => {
    const { deps, settled } = makeDeps({
      createPublisher: () => ({
        publish: async (request): Promise<PublishResult> =>
          request.platform === "facebook"
            ? { ok: false, error: "HTTP 500" }
            : { ok: true, providerRef: "ig-1" },
      }),
    });
    const notice = await sendAnnouncementToSocial(announcement, deps);
    assert.equal(
      notice.message,
      "Sent to Instagram. Facebook did not go through. Your announcement is still posted in the community.",
    );
    assert.deepEqual(shape(settled), [
      ["facebook", "failed", null, "HTTP 500"],
      ["instagram", "sent", "ig-1", null],
    ]);
  });

  it("never throws, even when a dependency does", async () => {
    const throwing: Array<Partial<SocialDeps>> = [
      { listAccounts: async () => { throw new Error("db"); } },
      { findBySubmitKey: async () => { throw new Error("db"); } },
      { countRecentAnnouncements: async () => { throw new Error("db"); } },
      { reserve: async () => { throw new Error("db"); } },
      { settle: async () => { throw new Error("db"); } },
      { createPublisher: () => ({ publish: async () => { throw new Error("net"); } }) },
    ];
    for (const override of throwing) {
      const { deps } = makeDeps(override);
      const notice = await sendAnnouncementToSocial(announcement, deps);
      assert.ok(notice.message.length > 0);
      assert.ok(!notice.message.includes(EM_DASH));
    }
  });

  it("puts only the title, body and join line in the outbound text", async () => {
    const { deps, sent } = makeDeps();
    await sendAnnouncementToSocial(announcement, deps);
    assert.equal(
      sent[0].text,
      "Tour dates are up\n\nTickets on sale Friday.\n\nJoin the community free: https://www.fanengagepro.com/signup?artist=raelynn",
    );
  });
});

describe("only the announcement action can send", () => {
  const frontendRoot = fileURLToPath(new URL("../../", import.meta.url));
  const SOURCE_DIRS = ["app", "components", "lib"];
  const SKIP_DIRS = new Set(["node_modules", ".next"]);

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      if (SKIP_DIRS.has(name)) return [];
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return /\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") ? [full] : [];
    });
  }

  const files = SOURCE_DIRS.flatMap((d) => sourceFiles(join(frontendRoot, d)));
  const relative = (full: string) => full.slice(frontendRoot.length);

  it("is called from exactly one place, inside createAnnouncementAction", () => {
    const callers = files
      .filter((f) => /sendAnnouncementToSocial\(/.test(readFileSync(f, "utf8")))
      .map(relative)
      .sort();
    assert.deepEqual(callers, ["app/artists/[slug]/community/actions.ts", "lib/social/announce.ts"]);

    const actions = readFileSync(join(frontendRoot, "app/artists/[slug]/community/actions.ts"), "utf8");
    assert.equal(actions.match(/sendAnnouncementToSocial\(/g)?.length, 1);
    const start = actions.indexOf("export async function createAnnouncementAction");
    const end = actions.indexOf("export async function", start + 1);
    const callAt = actions.indexOf("sendAnnouncementToSocial(");
    assert.ok(start >= 0 && callAt > start && (end < 0 || callAt < end));
  });

  it("the form sends a fresh submit key and the action passes it on", () => {
    const formSrc = readFileSync(join(frontendRoot, "app/artists/[slug]/community/new-post-form.tsx"), "utf8");
    assert.match(formSrc, /crypto\.randomUUID\(\)/);
    assert.match(formSrc, /SUBMIT_KEY_FIELD/);
    const actions = readFileSync(join(frontendRoot, "app/artists/[slug]/community/actions.ts"), "utf8");
    assert.match(actions, /formData\.get\(SUBMIT_KEY_FIELD\)/);
    const page = readFileSync(join(frontendRoot, "app/artists/[slug]/community/page.tsx"), "utf8");
    assert.match(page, /export const maxDuration = \d+/);
  });

  it("the form does not offer the box when the wording mentions alcohol or tobacco", () => {
    const formSrc = readFileSync(join(frontendRoot, "app/artists/[slug]/community/new-post-form.tsx"), "utf8");
    assert.match(formSrc, /isAge21Content\(title, body\)/);
    assert.match(formSrc, /canOfferSocial && !isAge21/);
    assert.match(formSrc, /SOCIAL_AGE_21_FORM_NOTE/);
  });

  it("the alcohol and tobacco word list is used only by this feature", () => {
    const users = files
      .filter((f) => /from "[^"]*alcohol-terms/.test(readFileSync(f, "utf8")))
      .map(relative)
      .sort();
    assert.deepEqual(users, ["lib/social/social-post.ts"]);
  });

  it("the database side is server only", () => {
    const dataSrc = readFileSync(join(frontendRoot, "lib/data/social-accounts.ts"), "utf8");
    assert.match(dataSrc, /^import "server-only";$/m);
  });

  it("the Blotato client is used only by the social sender", () => {
    const users = files
      .filter((f) => /createBlotatoPublisher/.test(readFileSync(f, "utf8")))
      .map(relative)
      .sort();
    assert.deepEqual(users, ["lib/data/social-accounts.ts", "lib/social/blotato.ts"]);
  });
});
