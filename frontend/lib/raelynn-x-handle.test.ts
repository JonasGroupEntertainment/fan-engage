import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ARTISTS } from "./artists.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const migrationRel = "supabase/migrations/20260816194300_raelynn_official_x_handle.sql";
const thisTestRel = "frontend/lib/raelynn-x-handle.test.ts";

const WRONG_X = /(?:x|twitter)\.com\/@?raelynnofficial/i;
const TEXT_EXT = /\.(ts|tsx|js|jsx|sql|md|json|yml|yaml)$/;

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (
      name === "node_modules" ||
      name === ".git" ||
      name === ".next" ||
      name === "dist"
    ) {
      continue;
    }
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkFiles(full, out);
    else if (TEXT_EXT.test(name)) out.push(full);
  }
  return out;
}

describe("RaeLynn official X handle", () => {
  it("fallback artist socials point X at https://x.com/RaeLynn", () => {
    const x = ARTISTS.raelynn.social.find((s) =>
      /^(x|twitter|twitter \/ x)$/i.test(s.label),
    );
    assert.ok(x, "fallback raelynn socials must include an X entry");
    assert.equal(x.href, "https://x.com/RaeLynn");
  });

  it("does not store the unofficial X handle as a live href", () => {
    const hits: string[] = [];
    for (const file of walkFiles(repoRoot)) {
      const rel = file.slice(repoRoot.length).replace(/^\//, "");
      if (rel === migrationRel || rel === thisTestRel) continue;
      const text = readFileSync(file, "utf8");
      if (!WRONG_X.test(text)) continue;
      for (const [i, line] of text.split("\n").entries()) {
        if (!WRONG_X.test(line)) continue;
        // Allowed: a comment that the X handle was wrong.
        const isComment =
          /^\s*(\/\/|#|--|\*)/.test(line) &&
          /wrong|not her|do not use|official/i.test(line);
        if (!isComment) hits.push(`${rel}:${i + 1}:${line.trim()}`);
      }
    }
    assert.deepEqual(hits, []);
  });

  it("migration rewrites only X/Twitter raelynnofficial hrefs", () => {
    const sql = readFileSync(join(repoRoot, migrationRel), "utf8");
    assert.match(sql, /slug = 'raelynn'/);
    assert.match(sql, /https:\/\/x\.com\/RaeLynn/);
    assert.match(sql, /\(x\|twitter\)\.com\/@\?raelynnofficial/);
    assert.match(sql, /Instagram \/ TikTok \/ Facebook/);
    assert.doesNotMatch(sql, /instagram\.com\/raelynnofficial/);
    assert.doesNotMatch(sql, /tiktok\.com\/@raelynnofficial/);
    assert.doesNotMatch(sql, /facebook\.com\/.*raelynn/i);
  });
});
