import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

const sql = readRepo("../../../supabase/migrations/0096_lock_gated_posts.sql");

describe("0096_lock_gated_posts", () => {
  it("gates premium with is_premium and founder-only with is_founder", () => {
    assert.match(sql, /create or replace function public\.can_read_post_visibility/);
    assert.match(sql, /p_visibility = 'public'/);
    assert.match(sql, /p_visibility = 'premium'[\s\S]*public\.is_premium\(auth\.uid\(\), p_artist_slug\)/);
    assert.match(sql, /p_visibility = 'founder-only'[\s\S]*public\.is_founder\(auth\.uid\(\), p_artist_slug\)/);
    const premiumBranch = sql.slice(sql.indexOf("p_visibility = 'premium'"), sql.indexOf("p_visibility = 'founder-only'"));
    assert.doesNotMatch(premiumBranch, /is_founder/);
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
