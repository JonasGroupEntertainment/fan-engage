import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

function repoPath(relFromHere: string): string {
  return fileURLToPath(new URL(relFromHere, import.meta.url));
}

describe("new-post notification voice", () => {
  const src = readRepo("./notifications/triggers/new-post.ts");

  it("only artist/team-authored posts are titled 'X posted'", () => {
    assert.match(src, /from\("admin_users"\)/);
    assert.match(src, /\.in\("community_id", \[opts\.artistSlug, "\*"\]\)/);
    assert.match(src, /if \(opts\.kind === "announcement"\) return true;/);
    assert.match(src, /New in \$\{artistName\}'s community/);
    assert.match(src, /const title = newPostTitle\(artist\.name as string, fromTeam\);/);
    assert.doesNotMatch(src, /const title = `\$\{artist\.name as string\} posted`/);
  });
});

describe("/premium honours ?c=<slug>", () => {
  const page = readRepo("../app/premium/page.tsx");
  const actions = readRepo("../app/premium/actions.ts");

  it("page resolves the community from the c param, not only the hostname", () => {
    assert.match(page, /resolvePremiumCommunityId\(params\.c\)/);
    assert.doesNotMatch(page, /await getCurrentCommunityId\(\)/);
    assert.match(page, /name="community" value=\{communityId\}/);
    assert.match(page, /premiumNextPath = `\/premium\?c=\$\{encodeURIComponent\(communityId\)\}`/);
  });

  it("checkout validates c as an active community slug and carries it in the URLs", () => {
    assert.match(actions, /COMMUNITY_SLUG_RE = \/\^\[a-z0-9-\]\{1,64\}\$\//);
    assert.match(actions, /\.eq\("active", true\)/);
    assert.match(actions, /resolvePremiumCommunityId\(\s*formData\.get\("community"\)/);
    assert.match(actions, /success_url: `\$\{APP_URL\}\/premium\/welcome\?session_id=\{CHECKOUT_SESSION_ID\}&c=\$\{encodeURIComponent\(communityId\)\}`/);
    assert.match(actions, /cancel_url: `\$\{APP_URL\}\$\{await premiumPathFor\(communityId, \{ canceled: "1" \}\)\}`/);
    assert.doesNotMatch(actions, /cancel_url: `\$\{APP_URL\}\/premium\?canceled=1`/);
  });
});

describe("promised points match real awards", () => {
  it("Fan Home journey cards list only awards that exist", () => {
    const home = readRepo("../app/page.tsx");
    assert.doesNotMatch(home, /Follow your first artist/);
    assert.doesNotMatch(home, /Unlock your first badge/);
    assert.doesNotMatch(home, /\+100 pts" \}/);
    assert.match(home, /Share your first community post", points: "\+5 pts, \+25 badge"/);
    assert.match(home, /Check in today", points: "\+25 pts"/);
    assert.match(home, /REFERRAL_JOIN_POINTS\.referrer/);
  });

  it("welcome quest says +5 for a post (plus the First post badge), not +50", () => {
    const quest = readRepo("../components/welcome-quest.tsx");
    const sayHi = quest.indexOf('label: "Say hi in the community"');
    assert.ok(sayHi > -1);
    const block = quest.slice(sayHi, sayHi + 200);
    assert.match(block, /points: 5,/);
    assert.match(block, /detail: "\+25 First post badge"/);
    assert.doesNotMatch(block, /points: 50/);
  });
});

describe("founder wall prices come from the community row", () => {
  const src = readRepo("../app/artists/[slug]/founders/page.tsx");
  it("renders monthly_price_cents / annual_price_cents, never a hardcoded price", () => {
    assert.doesNotMatch(src, /\$10\/mo/);
    assert.doesNotMatch(src, /\$99\/yr/);
    assert.match(src, /select\("monthly_price_cents, annual_price_cents"\)/);
    assert.match(src, /fmtPrice\(monthly\)/);
    assert.match(src, /return null;/);
    assert.match(src, /\{priceSentence \? ` \$\{priceSentence\}` : ""\}/);
  });
});

describe("event_rsvps / fan_artist_following column names", () => {
  it("leaderboard gather filters event_rsvps on rsvp_at", () => {
    const src = readRepo("./leaderboard/gather.ts");
    // Sprint 2 dropped redemptionsPromise (redemptions no longer score);
    // the RSVP block now ends where the posts query starts.
    const rsvpBlock = src.slice(src.indexOf('from("event_rsvps")'), src.indexOf("postsThisMonthPromise"));
    assert.match(rsvpBlock, /\.gte\("rsvp_at", monthStartIso\)/);
    assert.match(rsvpBlock, /\.lt\("rsvp_at", nextMonthIso\)/);
    assert.doesNotMatch(rsvpBlock, /\.(gte|lt)\("created_at"/);
  });

  it("activity pulse counts real columns", () => {
    const src = readRepo("./data/activity-pulse.ts");
    const rsvp = src.slice(src.indexOf('from("event_rsvps")'), src.indexOf('from("community_posts")'));
    assert.match(rsvp, /\.select\("event_id", \{ count: "exact", head: true \}\)/);
    assert.match(rsvp, /\.eq\("community_id", artistSlug\)/);
    assert.match(rsvp, /\.gte\("rsvp_at", weekAgo\)/);
    assert.doesNotMatch(rsvp, /artist_slug|created_at|"id"/);
    const follow = src.slice(src.indexOf('from("fan_artist_following")'));
    assert.match(follow, /\.select\("fan_id", \{ count: "exact", head: true \}\)/);
    assert.match(follow, /\.gte\("followed_at", weekAgo\)/);
    assert.doesNotMatch(follow, /created_at|"id"/);
  });

  it("artist portal events reads event_rsvps, not fan_event_rsvps", () => {
    const src = readRepo("../app/artist-portal/events/page.tsx");
    assert.match(src, /from\("event_rsvps"\)/);
    assert.doesNotMatch(src, /fan_event_rsvps/);
  });
});

describe("internal fans never chart", () => {
  it("gather drops fans.is_internal before ranking", () => {
    const src = readRepo("./leaderboard/gather.ts");
    assert.match(src, /\.eq\("is_internal", false\)/);
    assert.match(src, /const ranked = sorted\.filter\(\(\[fanId\]\) => publicIds\.has\(fanId\)\)/);
    assert.match(src, /totalFans: ranked\.length/);
  });

  it("artist portal leaderboards inner-join fans with is_internal = false", () => {
    for (const rel of ["../app/artist-portal/leaderboard/page.tsx", "../app/artist-portal/page.tsx"]) {
      const src = readRepo(rel);
      assert.match(src, /fans!inner\([^)]*is_internal\)/, rel);
      assert.match(src, /\.eq\("fans\.is_internal", false\)/, rel);
    }
  });
});

describe("Fan Home balance + upcoming events", () => {
  const home = readRepo("../app/page.tsx");
  const fanHome = readRepo("./data/fan-home.ts");
  const artists = readRepo("./data/artists.ts");

  it("awards the streak before reading KPIs so the balance is post-award", () => {
    const streakIdx = home.indexOf("const streak = await (fan?.id ? touchStreak(fan.id)");
    const kpiIdx = home.indexOf("getCurrentFanKpis().catch");
    assert.ok(streakIdx > -1 && kpiIdx > -1);
    assert.ok(streakIdx < kpiIdx, "streak touch must complete before the KPI read starts");
    const parallel = home.slice(home.indexOf("const [kpis, featured, tiers, recap, fanHome]"), kpiIdx + 400);
    assert.doesNotMatch(parallel, /touchStreak/);
  });

  it("upcoming events include gated events the fan is entitled to", () => {
    assert.doesNotMatch(fanHome, /\.eq\("tier", "public"\)/);
    assert.match(fanHome, /export function homeEventVisible\(/);
    assert.match(fanHome, /if \(tier === "founder-only"\) return viewer\.founderCommunities\.includes\(artistSlug\)/);
    assert.match(fanHome, /return viewer\.premiumCommunities\.includes\(artistSlug\)/);
    assert.match(fanHome, /homeEventVisible\(e\.tier, e\.artist_slug, \{ premiumCommunities, founderCommunities \}\)/);
  });

  it("past = ends_at ?? starts_at on both surfaces; undated events stay listed", () => {
    assert.match(artists, /export function isPastEvent\(/);
    assert.match(artists, /const ts = e\.ends_at \?\? e\.starts_at;\n  if \(!ts\) return false;/);
    assert.match(artists, /An event with neither timestamp stays listed on purpose/);
    assert.match(fanHome, /import \{ isPastEvent \} from "@\/lib\/data\/artists"/);
    assert.match(fanHome, /\.filter\(\(row\) => !isPastEvent\(row, now\)\)/);
    assert.match(fanHome, /ends_at\.gt\.\$\{nowIso\},and\(ends_at\.is\.null,starts_at\.gt\.\$\{nowIso\}\),and\(ends_at\.is\.null,starts_at\.is\.null\)/);
    assert.doesNotMatch(fanHome, /\.not\("starts_at", "is", null\)/);
  });

  it("dedupes the greeting and quick actions; KPI is 'Next tier'", () => {
    assert.match(home, /label: "Next tier"/);
    assert.doesNotMatch(home, /Next Reward/);
    const actionsBlock = home.slice(home.indexOf("const quickActions"), home.indexOf("function formatPts"));
    assert.equal((actionsBlock.match(/href: "\/referrals"/g) ?? []).length, 1);
    assert.doesNotMatch(actionsBlock, /Share referral link/);
    assert.match(home, /!showsDashboard && fan\?\.first_name \? `Welcome back, \$\{fan\.first_name\}`/);
  });
});

describe("nav + push icons", () => {
  it("nav says Unlocks until physical merch ships", () => {
    const layout = readRepo("../app/layout.tsx");
    assert.match(layout, /\{ href: merch\.navHref, label: "Unlocks" \}/);
  });

  it("push icon + badge PNGs exist and are in the manifest", () => {
    for (const f of ["icon-192.png", "icon-512.png", "badge-72.png"]) {
      assert.ok(existsSync(repoPath(`../public/${f}`)), `public/${f} missing`);
    }
    const manifest = JSON.parse(readRepo("../public/manifest.json")) as {
      icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
    };
    const srcs = manifest.icons.map((i) => `${i.src}|${i.purpose}`);
    assert.ok(srcs.includes("/icon-192.png|any"));
    assert.ok(srcs.includes("/icon-512.png|any"));
    assert.ok(srcs.includes("/icon-512.png|maskable"));
    assert.ok(srcs.includes("/badge-72.png|monochrome"));
    assert.ok(srcs.includes("/icons/icon-512.svg|any"), "SVG icons are kept");
    const sw = readRepo("../public/sw.js");
    const push = readRepo("./notifications/push.ts");
    for (const s of [sw, push]) {
      assert.match(s, /\/icon-192\.png/);
      assert.match(s, /\/badge-72\.png/);
    }
  });
});

describe("share badge pages rewrite legacy descriptions", () => {
  for (const rel of [
    "../app/share/badge/[slug]/[badge]/page.tsx",
    "../app/share/badge/[slug]/[badge]/opengraph-image.tsx",
  ]) {
    it(`${rel} never prints badges.description raw`, () => {
      const src = readRepo(rel);
      assert.match(src, /function publicBadgeDescription\(slug: string, raw: string \| null\)/);
      assert.match(src, /publicFoundingFanDescription\(raw\)/);
      assert.match(src, /tierBadgeDescription\(slug, TIER_MIN_POINTS\[tierSlug\]\)/);
      // Either the row is rewritten at load time (page) or at use (OG image).
      assert.match(
        src,
        /description: publicBadgeDescription\(badgeSlug, |publicBadgeDescription\(params\.badge, /,
      );
    });
  }
});

describe("new-post push never leaks a gated body (Sprint 3)", () => {
  const src = readFileSync(new URL("./notifications/triggers/new-post.ts", import.meta.url), "utf8");
  it("selects visibility and excerpts only the title for non-public posts", () => {
    assert.match(src, /select\("body, title, kind, visibility"\)/);
    assert.match(src, /post\.visibility !== "public"/);
    assert.match(src, /gated \? \(post\.title \?\? ""\) : \(post\.body/);
  });
});
