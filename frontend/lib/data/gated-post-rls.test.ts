import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

const sql = readRepo("../../../supabase/migrations/0096_lock_gated_posts.sql");

describe("0096_lock_gated_posts", () => {
  it("gates premium with is_premium or founding_fan_number, and founder-only with the number", () => {
    assert.match(sql, /create or replace function public\.can_read_post_visibility/);
    assert.match(sql, /p_visibility = 'public'/);
    assert.match(sql, /p_visibility = 'premium'[\s\S]*public\.is_premium\(\(select auth\.uid\(\)\), p_artist_slug\)/);
    assert.match(sql, /founding_fan_number is not null/);
    assert.match(sql, /founding_fan_number >= 1/);
    const premiumBranch = sql.slice(sql.indexOf("p_visibility = 'premium'"), sql.indexOf("p_visibility = 'founder-only'"));
    const founderBranch = sql.slice(sql.indexOf("p_visibility = 'founder-only'"), sql.indexOf("else false"));
    assert.match(premiumBranch, /founding_fan_number >= 1/);
    assert.match(founderBranch, /founding_fan_number >= 1/);
    assert.doesNotMatch(premiumBranch, /is_founder/);
    assert.doesNotMatch(founderBranch, /is_founder/);
    assert.doesNotMatch(premiumBranch, /founder_number/);
    assert.doesNotMatch(founderBranch, /founder_number/);
    assert.doesNotMatch(premiumBranch, /subscription_tier/);
    assert.doesNotMatch(founderBranch, /subscription_tier/);
  });

  it("rebuilds the public read policy and keeps the scheduled gate", () => {
    assert.match(sql, /drop policy if exists community_posts_public_read on public\.community_posts/);
    assert.match(sql, /create policy community_posts_public_read on public\.community_posts/);
    assert.match(sql, /public\.can_read_post_visibility\(visibility, artist_slug\)/);
    assert.match(sql, /scheduled_for is null or scheduled_for <= now\(\)/);
    assert.match(sql, /moderation_status in \('pending', 'safe', 'flag_review'\)/);
    assert.doesNotMatch(sql, /drop policy if exists community_posts_author_read/);
    assert.doesNotMatch(sql, /drop policy if exists community_posts_admin_read/);
  });

  it("drops the authenticated-reads-everything policies and gates child bodies", () => {
    assert.match(sql, /drop policy if exists community_comments_select on public\.community_comments/);
    assert.match(sql, /public\.community_post_visible_to_viewer\(post_id\)/);
    assert.match(sql, /create policy community_poll_options_select on public\.community_poll_options/);
    assert.match(sql, /create policy community_poll_votes_select on public\.community_poll_votes/);
    assert.match(sql, /create policy community_challenge_entries_select on public\.community_challenge_entries/);
    assert.match(sql, /fan_id = auth\.uid\(\)/);
  });

  it("stub RPC returns no body and revokes the default public grant", () => {
    const stub = sql.slice(sql.indexOf("function public.locked_community_post_stubs"));
    assert.match(stub, /title text/);
    assert.doesNotMatch(stub.slice(0, stub.indexOf("language sql")), /body text/);
    assert.match(sql, /revoke all on function public\.can_read_post_visibility\(text, text\) from public, anon, authenticated/);
    assert.match(sql, /grant execute on function public\.can_read_post_visibility\(text, text\) to anon, authenticated, service_role/);
    assert.match(sql, /revoke all on function public\.locked_community_post_stubs\(text, text, integer\) from public, anon, authenticated/);
    assert.match(sql, /grant execute on function public\.locked_community_post_stubs\(text, text, integer\) to anon, authenticated, service_role/);
    assert.doesNotMatch(sql, /grant execute on function public\.is_premium/);
  });
});

describe("fan-facing reads do not ship a gated body", () => {
  it("the community loader redacts before returning posts", () => {
    const src = readRepo("./community.ts");
    assert.match(src, /redactGatedPost/);
  });

  it("the artist hub renders a locked card instead of PostCard", () => {
    const src = readRepo("../../components/artist-hub-room.tsx");
    assert.match(src, /canReadPost/);
    assert.match(src, /FounderLockedCard/);
    assert.match(src, /PremiumPaywall/);
  });

  it("fan home loads bodies with the session client, not the service role", () => {
    const src = readRepo("./fan-home.ts");
    assert.match(src, /select\("id, artist_slug, kind, title, author_id, pinned, created_at, visibility"\)/);
    assert.doesNotMatch(
      src,
      /select\("id, artist_slug, kind, title, body, author_id, pinned, created_at, visibility"\)/,
    );
    assert.match(src, /select\("id, body, visibility"\)/);
    assert.match(src, /canReadPostInCommunity/);
    assert.match(src, /canReadBody: allowed/);
  });

  it("post viewers use the founding number, not the is_founder flag", () => {
    const readers = [
      "../../app/artists/[slug]/community/page.tsx",
      "../../components/artist-hub-room.tsx",
      "../../components/latest-strip.tsx",
      "./community.ts",
      "../drafts/draft-comment.ts",
    ];
    for (const rel of readers) {
      const src = readRepo(rel);
      assert.match(src, /postViewerFromEntitlement/, rel);
      assert.doesNotMatch(src, /isFounder: Boolean\(entitlement/, rel);
    }
    const home = readRepo("./fan-home.ts");
    assert.match(home, /isFoundingFanNumber/);
    assert.match(home, /founderCommunities: foundingFanCommunities/);
    const digest = readRepo("../digest/gather.ts");
    assert.match(digest, /founding_fan_number/);
    assert.match(digest, /isFoundingFanNumber/);
    assert.match(digest, /\.gte\("founding_fan_number", 1\)/);
    assert.doesNotMatch(digest, /is_founder/);
    const entitlement = readRepo("../entitlements.ts");
    assert.match(entitlement, /founding_fan_number/);
  });

  it("public profile, search, digest, and the drafter stay on the public or tier check", () => {
    assert.match(readRepo("./fan-profile.ts"), /\.eq\("visibility", "public"\)/);
    const search = readRepo("../search/query.ts");
    assert.match(search, /\.eq\("visibility", "public"\)/);
    assert.match(search, /community_posts\.visibility", "public"/);
    const digest = readRepo("../digest/gather.ts");
    assert.match(digest, /canReadPostInCommunity/);
    assert.match(digest, /select\("id, body"\)/);
    assert.doesNotMatch(digest, /select\("id, artist_slug, title, body, created_at, moderation_status"\)/);
    const drafter = readRepo("../drafts/draft-comment.ts");
    assert.match(drafter, /canReadPost/);
    assert.match(drafter, /createClient/);
    assert.match(drafter, /\.from\("community_posts"\)\s*\.select\("id, artist_slug, author_id, kind, title, body, visibility"\)/);
    const adminAt = drafter.indexOf("createAdminClient()");
    assert.equal(drafter.slice(adminAt).includes('from("community_posts")'), false);
  });
});
