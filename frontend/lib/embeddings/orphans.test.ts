import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { errorTextFromBody, finishDetail } from "../cron-observability.ts";
import {
  emptyBackfillSummary,
  noteIndexResult,
  noteSkippedOrphan,
} from "./backfill-summary.ts";
import {
  CONTENT_EMBEDDINGS_COMMUNITY_FK,
  isKnownCommunity,
  isMissingCommunityError,
  orphanSkipLog,
  selectEmbeddingWork,
} from "./orphans.ts";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

const FK_ERROR =
  'insert or update on table "content_embeddings" violates foreign key constraint "content_embeddings_community_id_fkey"';

describe("missing community references", () => {
  const known = new Set(["raelynn", "dan-marshall", "bailee"]);

  it("recognizes the content_embeddings community foreign key error", () => {
    assert.equal(isMissingCommunityError(FK_ERROR), true);
    assert.equal(
      FK_ERROR.includes(CONTENT_EMBEDDINGS_COMMUNITY_FK),
      true,
    );
    assert.equal(isMissingCommunityError("OpenAI 503"), false);
  });

  it("treats blank and unknown slugs as orphans and keeps real communities", () => {
    assert.equal(isKnownCommunity("raelynn", known), true);
    assert.equal(isKnownCommunity("  ", known), false);
    assert.equal(isKnownCommunity(null, known), false);

    const rows = [
      { source_table: "community_posts", source_id: "post-orphan-1", community_id: "bailee-madison" },
      { source_table: "community_posts", source_id: "post-orphan-2", community_id: "dan" },
      { source_table: "community_posts", source_id: "post-orphan-3", community_id: "konnor" },
      { source_table: "community_posts", source_id: "post-blank", community_id: "  " },
      { source_table: "community_posts", source_id: "post-live", community_id: "raelynn" },
    ];
    const { orphans, toEmbed } = selectEmbeddingWork(rows, known, 50);
    assert.deepEqual(
      orphans.map((row) => row.community_id.trim() || row.source_id),
      ["bailee-madison", "dan", "konnor", "post-blank"],
    );
    assert.deepEqual(toEmbed.map((row) => row.source_id), ["post-live"]);
  });

  it("does not let a page of orphans crowd out a valid row", () => {
    const orphans = Array.from({ length: 50 }, (_, i) => ({
      community_id: "konnor",
      source_id: `orphan-${i}`,
    }));
    const rows = [...orphans, { community_id: "raelynn", source_id: "live-post" }];
    const work = selectEmbeddingWork(rows, known, 50);
    assert.equal(work.orphans.length, 50);
    assert.deepEqual(
      work.toEmbed.map((row) => row.source_id),
      ["live-post"],
    );
  });

  it("logs a skip line that names the table, row, and missing community", () => {
    const line = orphanSkipLog({
      table: "community_posts",
      rowId: "788da2f0-35af-4d65-864c-ed59b799c1be",
      communityId: "bailee-madison",
    });
    assert.match(line, /skip orphan community_posts\/788da2f0-35af-4d65-864c-ed59b799c1be/);
    assert.match(line, /bailee-madison/);
    assert.match(line, /does not exist/);
  });
});

describe("embeddings backfill summary", () => {
  it("records orphan skips without failing the cron run", () => {
    const summary = emptyBackfillSummary();
    summary.totalCandidates = 4;
    noteSkippedOrphan(summary, {
      table: "community_posts",
      rowId: "post-bailee",
      communityId: "bailee-madison",
    });
    noteSkippedOrphan(summary, {
      table: "community_posts",
      rowId: "post-dan",
      communityId: "dan",
    });
    noteIndexResult(summary, "community_posts", "post-live", {
      status: "indexed",
      tokensEmbedded: 40,
    });
    noteIndexResult(summary, "community_posts", "post-konnor", {
      status: "skipped_orphan",
      communityId: "konnor",
    });

    assert.equal(summary.errors.length, 0);
    assert.equal(summary.processed, 2);
    assert.equal(summary.byStatus.skipped_orphan, 3);
    assert.equal(summary.byStatus.indexed, 1);
    assert.deepEqual(
      summary.skippedOrphans.map((item) => item.communityId),
      ["bailee-madison", "dan", "konnor"],
    );

    const body = { ok: true, summary };
    assert.equal(errorTextFromBody(body), null);
    assert.equal(finishDetail(body)?.skippedOrphans, 3);
    assert.equal(finishDetail(body)?.errorCount, 0);
  });

  it("still fails the run when a real embed error is recorded", () => {
    const summary = emptyBackfillSummary();
    noteSkippedOrphan(summary, {
      table: "community_posts",
      rowId: "post-dan",
      communityId: "dan",
    });
    noteIndexResult(summary, "community_posts", "post-live", {
      status: "error",
      error: "OpenAI 503",
    });
    assert.equal(errorTextFromBody({ ok: true, summary }), "OpenAI 503");
  });

  it("does not record a foreign-key failure as an item error", () => {
    const summary = emptyBackfillSummary();
    noteIndexResult(summary, "artist_events", "event-1", {
      status: "skipped_orphan",
      communityId: "konnor",
    });
    assert.equal(summary.errors.length, 0);
    assert.equal(isMissingCommunityError(FK_ERROR), true);
  });
});

describe("embeddings cron wiring", () => {
  const route = readRepo("../../app/api/cron/embeddings-backfill/route.ts");
  const indexer = readRepo("./index-row.ts");

  it("skips orphans before embedding and does not put them on summary.errors", () => {
    assert.match(route, /selectEmbeddingWork/);
    assert.match(route, /loadEmbeddingOrphans/);
    assert.match(route, /noteSkippedOrphan/);
    assert.match(route, /noteIndexResult/);
    assert.equal(route.includes("summary.errors.push"), false);
    const communityLookup = indexer.indexOf('.from("communities")');
    const embedCall = indexer.indexOf("embedText(");
    assert.ok(communityLookup !== -1 && embedCall !== -1);
    assert.ok(communityLookup < embedCall);
    assert.match(indexer, /skipped_orphan/);
  });

  it("migration 0083 omits source rows with no communities row", () => {
    const sql = readRepo(
      "../../../supabase/migrations/0083_list_unembedded_rows_skip_missing_communities.sql",
    );
    assert.match(sql, /NOT applied/);
    assert.match(sql, /Do not run this against production/);
    assert.match(sql, /join public\.communities c on c\.slug = p\.artist_slug/);
    assert.match(sql, /join public\.communities c on c\.slug = ev\.artist_slug/);
    assert.match(sql, /join public\.communities c on c\.slug = r\.community_id/);
    assert.match(sql, /grant execute on function public\.list_unembedded_rows\(integer\) to service_role/);
    assert.match(sql, /revoke all on function public\.list_unembedded_rows\(integer\)/);
  });

  it("migration 0084 proposes community foreign keys and does not apply them", () => {
    const sql = readRepo(
      "../../../supabase/migrations/0084_embedding_source_community_fkeys.sql",
    );
    assert.match(sql, /NOT applied/);
    assert.match(sql, /Do not run this against production/);
    assert.match(
      sql,
      /community_posts_artist_slug_community_fkey[\s\S]*references public\.communities\(slug\)[\s\S]*on delete restrict/,
    );
    assert.match(
      sql,
      /artist_events_artist_slug_community_fkey[\s\S]*references public\.communities\(slug\)[\s\S]*on delete restrict/,
    );
    assert.equal(sql.includes("create table"), false);
  });
});
