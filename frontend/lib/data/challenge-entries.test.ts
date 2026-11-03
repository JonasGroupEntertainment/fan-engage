import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { challengeEntryImageAlt } from "../community/challenge-entry-alt.ts";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const frontendRoot = join(repoRoot, "frontend");
const migrationsDir = join(repoRoot, "supabase", "migrations");

const CHAIN_METHODS = new Set([
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
  "eq",
  "neq",
  "in",
  "is",
  "order",
  "limit",
  "filter",
  "match",
  "contains",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "or",
  "not",
  "range",
  "single",
  "maybeSingle",
  "csv",
  "returns",
]);

const COLUMN_TYPES =
  /^(uuid|text|int|integer|bigint|smallint|boolean|bool|jsonb|json|timestamptz|timestamp|numeric|date|bytea)\b/i;

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function splitTopLevelCommas(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** Columns migrations actually create for community_challenge_entries. */
function challengeEntryColumns(): Set<string> {
  const columns = new Set<string>();
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = stripSqlComments(readFileSync(join(migrationsDir, file), "utf8"));
    const create = sql.match(
      /create table if not exists (?:public\.)?community_challenge_entries\s*\(([\s\S]*?)\);/i,
    );
    if (create) {
      for (const part of splitTopLevelCommas(create[1])) {
        const match = part.trim().match(/^([a-z_][a-z0-9_]*)\s+(.+)$/i);
        if (match && COLUMN_TYPES.test(match[2].trim())) columns.add(match[1].toLowerCase());
      }
    }
    for (const match of sql.matchAll(
      /alter table\s+(?:public\.)?community_challenge_entries\s+add column(?:\s+if not exists)?\s+([a-z_][a-z0-9_]*)/gi,
    )) {
      columns.add(match[1].toLowerCase());
    }
    for (const match of sql.matchAll(
      /alter table\s+(?:public\.)?community_challenge_entries\s+drop column(?:\s+if exists)?\s+([a-z_][a-z0-9_]*)/gi,
    )) {
      columns.delete(match[1].toLowerCase());
    }
  }
  return columns;
}

function walkSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walkSources(path, out);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) {
      out.push(path);
    }
  }
  return out;
}

function skipParens(source: string, openParen: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openParen; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error("unbalanced parens");
}

function readString(source: string, start: number): string | null {
  const quote = source[start];
  if (quote !== "\"" && quote !== "'" && quote !== "`") return null;
  let out = "";
  for (let i = start + 1; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") {
      out += source[i + 1] ?? "";
      i++;
      continue;
    }
    if (ch === quote) return out;
    out += ch;
  }
  return null;
}

function objectKeys(source: string, openBrace: number): string[] {
  const keys: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  for (let i = openBrace; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") {
      depth++;
      continue;
    }
    if (ch === "}") {
      depth--;
      if (depth === 0) return keys;
      continue;
    }
    if (depth === 1 && /[A-Za-z_]/.test(ch)) {
      const ident = source.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (!ident) continue;
      let j = i + ident[0].length;
      while (/\s/.test(source[j] ?? "")) j++;
      if (source[j] === ":") keys.push(ident[0]);
      i += ident[0].length - 1;
    }
  }
  throw new Error("unbalanced braces");
}

function selectColumns(list: string): string[] {
  return splitTopLevelCommas(list).flatMap((part) => {
    const trimmed = part.trim();
    if (!trimmed || trimmed === "*") return [];
    const ident = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
    if (!ident) return [];
    const rest = trimmed.slice(ident[1].length).trim();
    if (rest.startsWith("!") || rest.startsWith("(")) return [];
    return [ident[1]];
  });
}

type QueryUse = { file: string; kind: string; columns: string[] };

function queryUses(): QueryUse[] {
  const uses: QueryUse[] = [];
  const fromRe = /\.from\(\s*["']community_challenge_entries["']\s*\)/g;
  for (const file of walkSources(frontendRoot)) {
    const source = readFileSync(file, "utf8");
    const rel = file.slice(frontendRoot.length + 1);
    for (const match of source.matchAll(fromRe)) {
      let i = (match.index ?? 0) + match[0].length;
      while (true) {
        while (/\s/.test(source[i] ?? "")) i++;
        if (source[i] !== ".") break;
        const name = source.slice(i + 1).match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
        if (!name || !CHAIN_METHODS.has(name[1])) break;
        const open = i + 1 + name[0].length - 1;
        const close = skipParens(source, open);
        const args = source.slice(open + 1, close);
        const kind = name[1];
        if (kind === "select") {
          const trimmed = args.trimStart();
          const list = readString(trimmed, 0);
          if (list === null) {
            throw new Error(`${rel}: community_challenge_entries select is not a string literal`);
          }
          uses.push({ file: rel, kind, columns: selectColumns(list) });
        } else if (kind === "insert" || kind === "update" || kind === "upsert") {
          const brace = args.indexOf("{");
          if (brace === -1) throw new Error(`${rel}: ${kind} has no object literal`);
          uses.push({ file: rel, kind, columns: objectKeys(args, brace) });
        } else if (kind === "eq" || kind === "neq" || kind === "in" || kind === "order" || kind === "is") {
          const trimmed = args.trimStart();
          const column = readString(trimmed, 0);
          if (column && /^[A-Za-z_][A-Za-z0-9_]*$/.test(column)) {
            uses.push({ file: rel, kind, columns: [column] });
          }
        }
        i = close + 1;
      }
    }
  }
  return uses;
}

describe("community_challenge_entries columns match the migrations", () => {
  const columns = challengeEntryColumns();

  it("the table is id, post_id, fan_id, body, image_url, created_at — no image_alt", () => {
    assert.deepEqual(
      [...columns].sort(),
      ["body", "created_at", "fan_id", "id", "image_url", "post_id"],
    );
  });

  it("every select, insert, update, and filter names a real column", () => {
    const uses = queryUses();
    assert.ok(uses.length >= 8, `expected the known query sites, found ${uses.length}`);
    const unknown: string[] = [];
    for (const use of uses) {
      for (const column of use.columns) {
        if (!columns.has(column)) unknown.push(`${use.file} ${use.kind}(${column})`);
      }
    }
    assert.deepEqual(unknown, []);
  });

  it("getChallengeEntries does not select image_alt and reports query failures", () => {
    const source = readFileSync(join(frontendRoot, "lib/data/community.ts"), "utf8");
    const start = source.indexOf("export async function getChallengeEntries");
    const end = source.indexOf("export async function getCommentsByPost");
    const fn = source.slice(start, end);
    assert.match(fn, /\.select\("id, post_id, fan_id, body, image_url, created_at"\)/);
    assert.doesNotMatch(fn, /image_alt/);
    assert.match(fn, /if \(isNextControlFlowError\(error\)\) throw error;/);
    assert.match(fn, /console\.error\("getChallengeEntries failed:", error\)/);
    assert.match(fn, /captureAppException\(error, \{/);
    assert.match(fn, /step: "challenge-entries"/);
    assert.doesNotMatch(fn, /catch\s*\{\s*return \[\]/);
  });

  it("ChallengeEntry does not declare an image_alt column", () => {
    const source = readFileSync(join(frontendRoot, "lib/data/types.ts"), "utf8");
    const start = source.indexOf("export interface ChallengeEntry");
    const end = source.indexOf("}", start);
    const body = source.slice(start, end);
    assert.doesNotMatch(body, /image_alt/);
    assert.match(body, /image_url: string \| null/);
    assert.match(body, /body: string \| null/);
  });

  it("entry photos use the body (or a generic label) as alt text", () => {
    for (const rel of [
      "app/artists/[slug]/community/challenge-block.tsx",
      "app/admin/challenges/page.tsx",
      "app/admin/community/page.tsx",
    ]) {
      const source = readFileSync(join(frontendRoot, rel), "utf8");
      assert.match(source, /alt=\{challengeEntryImageAlt\(/, rel);
      assert.doesNotMatch(source, /image_alt/, rel);
    }
  });
});

describe("challengeEntryImageAlt", () => {
  it("uses a generic label when the fan wrote no body", () => {
    assert.equal(challengeEntryImageAlt(null), "Challenge entry image");
    assert.equal(challengeEntryImageAlt(undefined), "Challenge entry image");
    assert.equal(challengeEntryImageAlt("   "), "Challenge entry image");
  });

  it("uses the entry body, collapsed to one line", () => {
    assert.equal(challengeEntryImageAlt("  backstage\npass  "), "backstage pass");
  });

  it("truncates a long body so the alt stays short", () => {
    const alt = challengeEntryImageAlt("a".repeat(200));
    assert.equal(alt.length, 120);
    assert.ok(alt.endsWith("…"));
  });
});
