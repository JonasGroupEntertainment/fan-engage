# AI Infrastructure — Embedding Pipeline (Phase 1)

The embeddings pipeline is the foundation under most of the AI roadmap in
[`FAN_ENGAGE_AI_RECOMMENDATIONS.md`](./FAN_ENGAGE_AI_RECOMMENDATIONS.md).
Once it's running, half the items in that doc become 1-week builds instead
of 3-week builds.

This document covers what shipped, how it works, and how to turn it on.

---

## What's wired up

### Database

`supabase/migrations/0024_content_embeddings.sql` adds:

- The `vector` extension (pgvector).
- A `public.content_embeddings` table — one row per embedded source row,
  keyed by `(source_table, source_id)`. Stores a `vector(1536)` column for
  OpenAI's `text-embedding-3-small` output.
- An HNSW index for sub-millisecond nearest-neighbor search at scale.
- RLS policies that mirror the parent tables: anon reads public embeddings,
  authenticated members get premium/founder embeddings if their tier
  matches, admins see everything in their community.
- `search_embeddings(query_vec, community, visibility, source_table, limit)`
  — the helper UI code calls when running semantic search.
- `list_unembedded_rows(limit)` — used by the backfill cron to find work.

Five source tables are indexed: `community_posts`, `community_comments`,
`communities`, `artist_events`, `rewards_catalog`. The `offers` table is
currently global (no `community_id`) and is excluded for V1 — adding it
later is a small follow-up migration.

### Application

`frontend/lib/embeddings/` — a small module behind a single barrel
import (`@/lib/embeddings`):

- `client.ts` — `embedText()` and `embedBatch()` wrap the OpenAI
  `/v1/embeddings` endpoint. Pinned to `text-embedding-3-small` at 1536
  dims to match the `vector(1536)` column. Auto-chunks batches >100,
  normalizes whitespace, truncates at 8000 chars. Throws `EmbeddingError`
  on auth/rate/server failures.
- `sources.ts` — the registry. Each of the 5 indexed tables gets a
  `SourceDescriptor` with `columns` (what to fetch), `buildText` (how to
  assemble embeddable text from the row), and `extractMeta` (community
  scope + visibility + source_id). Adding a new embeddable table = adding
  one entry here.
- `index-row.ts` — `indexRow(table, rowId)` is the workhorse. Fetches the
  row, builds the text, checks `content_hash` for idempotency (skips
  re-embedding if nothing changed), calls OpenAI, upserts into
  `content_embeddings`. `indexRowAsync(table, rowId)` is the
  fire-and-forget variant for inline server-action use.
- `index.ts` — barrel export. Always import from `@/lib/embeddings`.

### Background work

`frontend/app/api/cron/embeddings-backfill/route.ts` — runs every 15
minutes via Vercel Cron (entry added to `frontend/vercel.json`). Calls
`list_unembedded_rows(50)`, iterates results through `indexRow`, returns a
JSON summary. Same `Bearer $CRON_SECRET` auth pattern as the other two
cron jobs.

**Paused since 2026-11-22.** The entry was taken out of
`frontend/vercel.json` because the OpenAI account had no credits and the
job failed on every run (1,321 failures from 2026-10-23). The route is
unchanged. To switch it back on, add credits, then put the entry back
(`/api/cron/embeddings-backfill`, `*/15 * * * *`) and remove it from the
paused list in `frontend/lib/cron-observability.test.ts`. Rows written
while it was off are picked up by the first run, since the job asks for
every row that has no embedding. Inline indexing still calls OpenAI and
still fails quietly until credits are added.

### Inline indexing

`frontend/app/artists/[slug]/community/actions.ts` is patched at all 5
content-creation paths to call `indexRowAsync` fire-and-forget after
insert: `createPostAction`, `addCommentAction`, `createPollAction`,
`createChallengeAction`, `createAnnouncementAction`. New content is
embedded within seconds of being posted.

---

## Setup steps

There are three things you need to do before the pipeline activates.
None of them require a code change — just config + one SQL run + a
deploy.

### Step 1 — Run migration 0024 in the Fan Engage Supabase

Open https://supabase.com/dashboard/project/uhovonrljcauaoctypbg/sql/new

Copy-paste the entire contents of
`supabase/migrations/0024_content_embeddings.sql` and run it.

Expected: `Success. No rows returned.`

If you'd rather copy from your local clone:

```bash
cd ~/path/to/Superfan-platform
git pull origin main
cat supabase/migrations/0024_content_embeddings.sql | pbcopy
```

…then paste into the SQL editor.

Verify:

```sql
-- Should return 1 row.
select * from pg_extension where extname = 'vector';

-- Should show the table with all 5 source-table values allowed.
\d public.content_embeddings

-- Initial population — should return ~30 rows on a fresh DB
-- (5 communities + however many seeded events/posts/rewards exist).
select * from public.list_unembedded_rows(100);
```

### Step 2 — Add `OPENAI_API_KEY` to Vercel env vars

1. Open the Fan Engage Vercel project's env vars:
   https://vercel.com/jonas-group/fan-engage/settings/environment-variables
2. Click **Add New** → name it `OPENAI_API_KEY`, value = your OpenAI
   secret key (starts with `sk-…`).
3. Apply to all three environments: Production, Preview, Development.
4. Save.

### Step 3 — Redeploy

Vercel won't pick up the new env var until the next deploy. Either:

- Push any commit (the env var bakes in next build), OR
- Trigger a manual redeploy:
  https://vercel.com/jonas-group/fan-engage/deployments → top deployment →
  `…` → **Redeploy**.

After the deploy is "Ready", the next cron tick (within 15 minutes) will
backfill all the existing rows. Wait 15 minutes and verify via the steps
below.

---

## Verifying it works

### Check the cron summary

Hit the cron endpoint manually with your `CRON_SECRET`:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://fan-engage-pearl.vercel.app/api/cron/embeddings-backfill
```

Expected response (after first run):

```json
{
  "ok": true,
  "summary": {
    "totalCandidates": 30,
    "processed": 30,
    "byStatus": { "indexed": 30 },
    "byTable": {
      "communities": 5,
      "community_posts": 18,
      "rewards_catalog": 4,
      "artist_events": 3
    },
    "errors": [],
    "durationMs": 4218
  }
}
```

A second run within a few minutes should show `"skipped_unchanged"` for
all of them — that's the `content_hash` idempotency working.

### Spot-check the data

```sql
-- Count by source table
select source_table, count(*)
from public.content_embeddings
group by 1 order by 2 desc;

-- Sample a row to confirm the vector landed
select source_table, source_id, community_id, visibility,
       length(content_hash) as hash_len,
       array_length(embedding::float[], 1) as dim_count
from public.content_embeddings limit 3;
-- dim_count should be 1536 for every row.
```

### End-to-end smoke test

Create a post in any community feed (e.g.
`/artists/raelynn/community`). Within ~5 seconds — the time it takes
fire-and-forget indexing to complete an OpenAI roundtrip — the post
should have an embedding row:

```sql
select * from public.content_embeddings
where source_table = 'community_posts'
order by embedded_at desc limit 1;
```

---

## Operational notes

### Costs

OpenAI `text-embedding-3-small` is **\$0.02 per 1M tokens** (≈ \$0.00000002
per token). At Fan Engage's expected scale, embedding cost is a rounding
error:

| Workload | Tokens | Cost |
|----------|--------|------|
| Initial backfill (30 rows × 80 tokens avg) | 2,400 | \$0.0001 |
| 1,000 new posts/month | 80,000 | \$0.002 |
| Full re-embed if we change models (50,000 historical rows) | 4,000,000 | \$0.08 |

Even pessimistic projections (10× the volume) keep this under \$1/month.

### When embeddings might get stale

The pipeline does **not** re-embed on UPDATE today. If a post body is
edited or a community's bio changes, the existing embedding stays in place
until either:

- The next time `indexRow()` is called for that row (e.g. via a future
  UPDATE-aware trigger we haven't built), or
- We add a "force re-embed" admin button that calls `indexRow()` directly.

The `content_hash` column makes this safe — when re-embedding does
happen, a no-op-update will be skipped automatically.

### Rate limiting

OpenAI's `/v1/embeddings` endpoint allows 3,000 RPM for tier-1 accounts,
500,000 TPM. The backfill cron processes 50 rows/run × 4 runs/hour = 200
rows/hour, well below any limit. Inline indexing is one row at a time per
post create.

If we ever hit a rate limit, the cron-route 503s and Vercel retries on the
next tick — same pattern as the other crons.

### Failure modes to know about

- **`OPENAI_API_KEY` missing in env** — every embed call returns a 503.
  The cron route surfaces this clearly: `"OPENAI_API_KEY not configured.
  Skipping backfill until the env var is set in Vercel."`
- **OpenAI 429 (rate limit)** — `EmbeddingError` is raised. The cron
  catches it, marks that row as errored in the summary, continues with
  the rest. Next cron tick retries.
- **OpenAI 5xx** — same as 429.
- **pgvector extension not enabled** — INSERT into `content_embeddings`
  fails with `type "vector" does not exist`. Step 1 of setup handles
  this.

All of these are recoverable; nothing requires code changes to fix.

---

## What's next (Phase 2)

With the pipeline live, the following recs from
`FAN_ENGAGE_AI_RECOMMENDATIONS.md` become small builds:

- **#6 Semantic search** — UI surface + a single API route that calls
  `search_embeddings()`. Maybe a week.
- **#10 Reward recommendations** — single hero card on `/rewards`. A few
  days.
- **#8 Smart event match notifications** — score events against
  members' RSVP history using embeddings. ~1.5 weeks.

The next obvious foundational add (per the roadmap) is recommendation
\#2 — post moderation classifier — because the cost of *not* having it
scales with member volume and it doesn't share dependencies with #1.

---

*Last updated: April 2026 (Phase 1 of the AI roadmap)*

---

# Phase 2 — Moderation Classifier (recommendation #2)

The moderation classifier shipped in Phase 2 puts every new post and
comment through Anthropic Claude Haiku 4.5 to get a structured safety
classification (`safe` / `flag_review` / `auto_hide`) with severity,
categories, and reason. RLS hides `auto_hide` rows from public view;
flagged rows show up in `/admin/moderation` for human review.

## What's wired up

### Database

`supabase/migrations/0025_moderation.sql` adds:

- `moderation_status`, `moderation_severity`, `moderation_categories`,
  `moderation_reason`, `moderation_self_harm`, `moderation_classified_at`,
  `moderation_model`, `moderation_prompt_version` columns on both
  `community_posts` and `community_comments`.
- Updated RLS so `auto_hide` rows only show to author + community admins.
  `pending` rows stay visible during the brief window before
  classification — small risk window for not silently breaking new posts
  if the moderation pipeline is briefly down.
- `moderation_decisions` table — append-only audit log of every
  classification (AI + admin overrides), keyed by `(source_table,
  source_id)`.
- `list_pending_moderation(limit)` helper — used by the backfill cron.
- `apply_moderation_decision(...)` helper — atomically updates the source
  row's moderation columns AND appends to the audit log in one
  transaction. All moderation writes (AI + admin) route through this so
  the audit log can never drift from the source's actual status.

### Application

`frontend/lib/moderation/` — three modules behind a barrel index:

- `client.ts` — `classifyContent(text, context)` wraps Anthropic's
  `/v1/messages` endpoint with a versioned moderation prompt
  (`PROMPT_VERSION`). Pinned to `claude-haiku-4-5` for cost + speed.
  Self-harm is an independent flag — severity drives the routing
  decision but self-harm posts are NEVER auto-hidden.
- `moderate-row.ts` — `moderateRow(table, rowId)` is the workhorse.
  Fetches the row, classifies, applies the decision via
  `apply_moderation_decision()`. `moderateRowAsync` is the
  fire-and-forget variant. `applyAdminOverride()` is the admin path.
- `index.ts` — barrel export.

### Background work

`frontend/app/api/cron/moderation-backfill/route.ts` — runs every 15
minutes via Vercel Cron. Same `Bearer $CRON_SECRET` auth pattern as the
other cron jobs. `BATCH_SIZE=25` per tick to stay under the 60-second
function budget at 1-2 sec per Anthropic call.

### Inline trigger

`frontend/app/artists/[slug]/community/actions.ts` — same 5 server
actions where `indexRowAsync` is wired now also call `moderateRowAsync`
fire-and-forget. Both run in parallel.

### Admin UI

`frontend/app/admin/moderation/page.tsx` — server component that lists
flagged posts + comments with severity, category chips, AI reasoning,
and three action buttons (Approve / Hide / Re-queue). Self-harm content
is marked with a violet badge and an explicit don't-hide warning.
Linked from the admin nav (`/admin/layout.tsx`) as "Moderation".

## Setup steps for Phase 2

### Step 1 — Run migration 0025 in Supabase

Open https://supabase.com/dashboard/project/uhovonrljcauaoctypbg/sql/new
and paste the contents of `supabase/migrations/0025_moderation.sql`.

Verify:

```sql
\d public.community_posts        -- should show moderation_* columns
select count(*) from public.moderation_decisions;  -- 0 on first run
select count(*) from public.list_pending_moderation(5);
```

### Step 2 — Add `ANTHROPIC_API_KEY` to Vercel

https://vercel.com/jonas-group/fan-engage/settings/environment-variables
→ Add New → name `ANTHROPIC_API_KEY`, value = your `sk-ant-...` key,
applied to all three environments.

### Step 3 — Redeploy

Push any commit (the env var bakes in next build), or click Redeploy on
the latest deployment.

After the next cron tick (within 15 min of redeploy), all the existing
`pending` posts get classified. Watch `/admin/moderation` — most of the
seeded content should classify as `safe` and never appear there. Any
that surface are exactly the rows worth a human eye.

## Verifying it works

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://fan-engage-pearl.vercel.app/api/cron/moderation-backfill
```

Expected response after first run:

```json
{
  "ok": true,
  "summary": {
    "totalCandidates": 18,
    "processed": 18,
    "byStatus": { "classified": 18 },
    "byTable": { "community_posts": 12, "community_comments": 6 },
    "byClassification": { "safe": 17, "flag_review": 1 },
    "selfHarmFlagged": 0,
    "errors": [],
    "durationMs": 28341
  }
}
```

Then in SQL:

```sql
select moderation_status, count(*)
from public.community_posts group by 1;

-- Recent admin decisions
select decided_by, new_status, count(*)
from public.moderation_decisions
where created_at > now() - interval '1 day'
group by 1, 2;
```

## Operational notes

### Costs

Claude Haiku 4.5: $0.25/M input, $1.25/M output. Per classification:
~200 input + ~150 output tokens = ~$0.0001. Steady-state cost at 1k
posts/month = $0.10/month.

### Self-harm policy

The classifier flags self-harm independently from the routing decision.
Per `FAN_ENGAGE_AI_RECOMMENDATIONS.md`, self-harm posts:

- **Stay visible.** They're help-seeking. Hiding them is harmful.
- Get the violet `Self-harm signal` badge in the admin queue.
- **Should be checked on by an admin or community moderator** — surface
  crisis resources to the author rather than removing the post.

A future commit will wire a "Send crisis resources" button into the
admin queue card that DMs the author a vetted list of helplines (988
Suicide & Crisis Lifeline, NAMI HelpLine, etc.). For now: admins
manually outreach.

### When to re-classify

Bump `PROMPT_VERSION` in `frontend/lib/moderation/client.ts` whenever
the prompt changes meaningfully. Then run a one-off SQL update to mark
older rows as `pending` so the cron picks them back up:

```sql
update public.community_posts
set moderation_status = 'pending'
where moderation_prompt_version != 'v2';  -- new version
```

### Failure modes

- **`ANTHROPIC_API_KEY` missing** — every classify call returns 503;
  `pending` rows pile up. Admin queue stays empty.
- **Anthropic 429 / 5xx** — `ModerationError` raised; cron records the
  error in the per-row summary, marks the row as still `pending`, and
  next cron tick retries.
- **Classifier returns malformed JSON** — strict parser rejects it,
  raises `ModerationError`. We never silently default to "safe".

All recoverable; nothing requires code changes.

---

# Phase 3 — AI-drafted comment replies (recommendation #3)

The drafter shipped in Phase 3 adds a "✨ Draft a reply" button to every
comment composer. Clicking it returns 3 short reply options (each ≤ 25
words) tuned to the post, the user's prior comment style, and the
community's vibe. Picking one fills the textarea — still editable.
Posting persists `draft_used = true` so we can A/B test the engagement
lift.

## What's wired up

### Database

`supabase/migrations/0026_draft_used.sql` adds:

- `community_comments.draft_used boolean default false`
- A partial index on `(created_at desc) where draft_used = true` for
  cheap "how many drafted comments did we get last week" queries.

### Application

`frontend/lib/drafts/`:

- `client.ts` — `generateCommentDrafts(input)` wraps Claude Haiku 4.5
  with a strict, versioned prompt (`DRAFT_PROMPT_VERSION = 'v1'`).
  Returns exactly 3 distinct drafts, ≤ 25 words each. `temperature: 0.7`
  for variety. Defensive JSON parser strips fence wrapping and
  validates the shape.
- `draft-comment.ts` — `draftComment({postId, userId})` is the
  server-side workhorse. Loads the post + community + last 10 prior
  comments by the same user (for style transfer) and calls the
  classifier. Has a `draftCommentWithoutJoin` fallback for when the
  multi-table `.select(...)` shape doesn't match supabase-js's type
  inference.
- `index.ts` — barrel.

`frontend/app/api/ai/draft-comment/route.ts`:

- POST `{ postId }` → `{ drafts: [...3 strings] }`.
- Auth-gated (401 if not signed in). `userId` comes from the session,
  not the body.
- Returns 503 if `ANTHROPIC_API_KEY` is missing.
- No-cache headers — every click is fresh.

### Client UI

`frontend/app/artists/[slug]/community/comment-composer.tsx`:

- "use client" component that owns drafter state.
- ✨ button → POST → loading state → 3 clickable chips render in a
  panel above the textarea.
- Click a chip → textarea fills, `draft_used` flips to `'1'`. Still
  editable.
- Click ✨ again → regenerate (no caching).
- Submit button uses `useFormStatus()` to disable during the pending
  server action.
- After submit, all state resets.

`frontend/app/artists/[slug]/community/post-card.tsx`:

- The inline `<form action={addCommentAction}>` is replaced with
  `<CommentComposer postId artistSlug />`.

`frontend/app/artists/[slug]/community/actions.ts` (`addCommentAction`):

- Reads the new `draft_used` hidden input and persists it on the row.

## Setup steps for Phase 3

Only one new step (the API key + redeploy from Phase 2 already covered
the runtime needs):

### Run migration 0026 in Supabase

Open https://supabase.com/dashboard/project/uhovonrljcauaoctypbg/sql/new
and paste the contents of `supabase/migrations/0026_draft_used.sql`.

That's it. No new env var required (uses the existing
`ANTHROPIC_API_KEY` that Phase 2 needed). No redeploy strictly required
either — but a fresh deploy makes the new endpoint + composer visible
right away.

## Verifying it works

1. Sign in as a fan.
2. Visit any artist's community feed (`/artists/raelynn/community`).
3. Scroll to a post with comments visible. Click `✨` next to the
   textarea.
4. Within 1-2 seconds, 3 reply drafts appear in chip form.
5. Click one → textarea fills.
6. Edit if you like, click `Post`.
7. The new comment row in `community_comments` has `draft_used = true`.

Spot-check via SQL:

```sql
select id, body, draft_used, created_at
from public.community_comments
order by created_at desc
limit 5;
```

## A/B analysis (once you have data)

The success criterion in `FAN_ENGAGE_AI_RECOMMENDATIONS.md` is a +30%
comment volume lift on posts where the drafter is shown. Once a couple
weeks of usage have accumulated:

```sql
-- Comment volume by drafter usage
select draft_used, count(*) as comments,
       avg(length(body)) as avg_chars
from public.community_comments
where created_at > now() - interval '14 days'
group by 1;

-- Drafter conversion rate (proxy: % of comments that originated as drafts)
select 100.0 * count(*) filter (where draft_used) / nullif(count(*), 0) as drafter_share_pct
from public.community_comments
where created_at > now() - interval '14 days';
```

If `drafter_share_pct` is below ~10% the button isn't getting used
(consider making it more prominent). Above ~40% means people love it
(consider ranking drafts better, adding a "regenerate" sub-button per
chip, etc.).

## Operational notes

### Costs

Claude Haiku 4.5 at $0.25/M input + $1.25/M output. Per click:
~250 input + ~200 output tokens = ~$0.0003. 10k clicks/month = $3.
Trivial.

### Failure modes

- **`ANTHROPIC_API_KEY` missing** — endpoint returns 503; UI shows
  inline error in rose-300 text. User can still write organically.
- **Anthropic 429 / 5xx** — `DraftError` raised; same UI behavior. No
  retry today; if rate limits become a problem, add a 1s exponential
  backoff in the route.
- **Classifier returns malformed JSON** — strict parser rejects it,
  same inline error. We never serve bogus drafts.

### Why no rate limiting yet

V1 trusts Anthropic's tier-1 rate limit (50 RPM, plenty for our user
base). If we see abuse (one user spamming the ✨ button), add a small
Redis-backed limiter at the route. Until then it's premature
optimization.

---

# Phase 4 — Weekly digest emails (recommendation #4)

The digest cron shipped in Phase 4 sends every active opted-in fan a
personalized weekly email — top posts, upcoming events, a reward they
can afford, and an AI-generated "vibe of the week" line per
community. Sundays 09:00 UTC.

## What's wired up

### Database

`supabase/migrations/0027_digest.sql` adds:

- `fans.digest_subscribed boolean default true` — per-fan opt-out for
  the digest specifically (additional to `email_opted_in`).
- `fans.last_digest_sent_at timestamptz` — bookkeeping for the cron's
  6-day safety window so retries / partial sends never double-deliver.
- `digest_log` table — one row per `(fan_id, week_start)`. Captures
  rendered HTML, text fallback, Mailchimp campaign id, AI summary
  count, and `payload_post_ids[]` for impression analytics.
- `list_digest_recipients(limit)` helper — returns active opted-in
  fans whose last digest is >6 days old.

### Application

`frontend/lib/digest/`:

- `types.ts` — shared types (DigestRecipient, DigestPostHighlight,
  DigestEvent, DigestRewardSuggestion, DigestCommunityBlock,
  DigestPayload).
- `gather.ts` — `gatherDigestPayload(recipient)` walks the fan's
  followed artists (top 3 most-recently-followed), pulls top posts
  from the last 7 days ranked by reactions+comments, upcoming events
  they haven't RSVP'd to, and a reward suggestion (most aspirational
  affordable). Filters out `auto_hide` moderation rows so toxic
  content never features.
- `summarize.ts` — `summarizeAllCommunities(payload)` calls Claude
  Haiku 4.5 once per community block to generate a 12-22 word
  newsroom-dry vibe summary. Has a fallback path that ships the
  digest even if `ANTHROPIC_API_KEY` is missing.
- `render.ts` — `renderDigestPayload(payload)` returns
  `{ html, text }`. Email-safe HTML (inline styles, no fonts/images)
  meant for the Mailchimp `DIGESTHTML` merge field. Every link
  carries UTM params for click-through measurement.
- `send.ts` — `prepareDigestForFan(recipient)` runs the full
  gather→summarize→render pipeline + PUTs the merge fields into
  Mailchimp. `fireDigestCampaign(count)` creates + sends ONE
  campaign that templates `*|DIGESTHTML|*` — Mailchimp inlines
  each recipient's merge values. `recordDigestSent(...)` upserts the
  audit row.
- `index.ts` — barrel.

`frontend/app/api/cron/weekly-digest/route.ts` — the scheduled GET.

`frontend/vercel.json` — `0 9 * * 0` cron entry.

## Setup steps for Phase 4

There are three things you need to do before the weekly digest fires:

### Step 1 — Run migration 0027 in Supabase

Open https://supabase.com/dashboard/project/uhovonrljcauaoctypbg/sql/new
and paste the contents of `supabase/migrations/0027_digest.sql`.

Verify:

```sql
\d public.digest_log
select count(*) from public.list_digest_recipients(500);
```

### Step 2 — Add custom merge fields in Mailchimp

The digest pipeline writes per-fan rendered HTML into a Mailchimp
custom merge field called `DIGESTHTML`, plus a plain-text fallback
in `DIGESTTEXT`. These don't exist in the audience by default —
you have to create them once.

1. Open https://us21.admin.mailchimp.com/audience/settings/merge-fields/
   (replace `us21` with your actual server prefix; the same one in
   `MAILCHIMP_SERVER_PREFIX`).
2. Click **Add a field** → **Text** field.
   - **Field label**: `Digest HTML Block`
   - **Field tag**: `DIGESTHTML`
   - **Visible**: unchecked (don't show it in subscriber profiles)
   - **Required**: unchecked
   - **Default value**: leave empty
   - **Click "Save changes"**
3. Repeat for `DIGESTTEXT`:
   - **Field label**: `Digest Text Fallback`
   - **Field tag**: `DIGESTTEXT`
   - same settings as above
4. Mailchimp's default text-field max length is 80 characters. The
   digest HTML can be up to 6,000 chars. **Increase both fields'
   max length to 6000** in the field's edit modal (look for the
   "Max length" input — Mailchimp may not show this for default
   text fields, in which case you'll need to use a "Long text" type
   if available, or split the rendered HTML into multiple smaller
   merge fields. For initial testing, 1500-character digests fit
   in the default 80-char limit only if your audience has the
   higher-tier setting; check your Mailchimp plan).

If Mailchimp's UI doesn't let you raise the merge-field max above
255 for your tier, the V1 fallback is to use multiple structured
merge fields (`DIGEST_VIBE_1`, `DIGEST_TOP_POST_1_TITLE`, etc.)
and a richer template. That's a follow-up; ship the simple version
first and see if it bumps against the limit.


**Note on merge-tag character limit:** Mailchimp caps merge tags at
**10 characters** — that's why we use `DIGESTHTML` and `DIGESTTEXT`
instead of the more-descriptive `DIGEST_BLOCK` / `DIGEST_TEXT` we'd
otherwise prefer. If you change tag names, also update the merge-field
references in `frontend/lib/digest/send.ts` (search for `DIGESTHTML`
and `DIGESTTEXT`) so the runtime values match.

### Step 3 — (Optional) Set up a Mailchimp template

The cron's `fireDigestCampaign()` ships a default minimal template
inline. You can replace it with a branded template in the Mailchimp
dashboard:

1. Templates → Create template
2. Use a layout that has a content block
3. In the content area, drop `*|FNAME|*` and `*|DIGESTHTML|*` merge
   tags
4. Save the template name. (For V1 we don't reference a saved
   template — `cron-route.ts` posts the HTML inline. To use a saved
   template later, modify `fireDigestCampaign()` to set
   `template.id` instead of posting `content.html`.)

## Verifying it works

Run the cron manually once you've completed Steps 1 and 2:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://fan-engage-pearl.vercel.app/api/cron/weekly-digest
```

Expected response on the first run:

```json
{
  "ok": true,
  "aiAvailable": true,
  "summary": {
    "totalCandidates": 12,
    "prepared": 8,
    "preparedWithMailchimp": 8,
    "skipped": 4,
    "errors": [],
    "campaignId": "abc123def456",
    "campaignError": null,
    "weekStart": "2026-04-27",
    "durationMs": 31420
  }
}
```

`skipped` covers fans who follow no artists or have no fresh content
this week — that's correct behavior, not an error.

Then in SQL:

```sql
select status, count(*) from public.digest_log group by 1;

-- Most-recent run details
select fan_id, status, ai_summary_count, array_length(payload_communities, 1) as communities,
       array_length(payload_post_ids, 1) as posts,
       length(html_body) as html_chars, mailchimp_campaign_id
from public.digest_log
order by sent_at desc limit 10;
```

## Operational notes

### Costs

Anthropic Claude Haiku 4.5 at $0.25/M input + $1.25/M output. Per
fan: ~3 community-summary calls × ~250 input + ~50 output tokens =
~$0.0003. At 200 active fans: $0.06/week = $3/year.

Mailchimp: PUTs to the audience are free; the campaign send falls
under your existing plan's monthly send limit.

### Function-timeout caveat

The cron processes recipients sequentially. Per-fan latency is
gather (~200ms) + summarize (~3s for 3 Anthropic calls) + Mailchimp
PUT (~200ms) ≈ **3.5s per fan**. On Vercel Hobby's 60s function
timeout that's ~15 fans per cron run; if you have more than that,
the run times out and remaining fans roll into next Sunday's run
(they're picked up because `last_digest_sent_at` is still null).

If/when the audience grows past 15 fans:

- Upgrade Vercel project to Pro (300s function timeout) — covers
  ~85 fans per run.
- Or switch to per-fan Vercel queue jobs (Inngest, Upstash Q, or
  Vercel's own queue).
- Or batch the Anthropic summarize calls (one prompt covering all
  3 communities for a fan, which cuts 3 calls down to 1) — easy
  win, ~3× speedup, ~5x faster runs.

### Self-harm + auto-hide content

The gather step explicitly filters `moderation_status` to
`('pending', 'safe', 'flag_review')` — so `auto_hide` posts NEVER
show up in a digest. Same for `community_comments` when computing
comment counts. This is the same content-safety guarantee the live
feed has, applied to the email channel.

### Failure modes

- **`MAILCHIMP_*` env vars missing** — the cron still gathers,
  summarizes, and renders for each fan; the digest_log row gets
  status `'rendered'` (not sent). You can inspect the HTML body
  in the audit table even before Mailchimp is set up. Useful for
  staging tests.
- **`ANTHROPIC_API_KEY` missing** — fallback summaries kick in
  ("RaeLynn this week: 2 top posts and 1 upcoming event."). Less
  magical but still ships.
- **Mailchimp campaign create fails** — every prepared fan still
  has their merge fields set; next Sunday's run will overwrite
  them and try again. Worst case, fans get next week's email a
  week late.
- **Audience contains fans not in `fans` table** — Mailchimp PUT
  doesn't care; we always upsert the merge fields by email hash.

---

# Phase 5 — Auto-tagging community posts (recommendation #5)

The tagging classifier shipped in Phase 5 puts every new post through
Claude Haiku 4.5 to assign 1-4 tags from a closed vocabulary
(`live_show`, `merch_drop`, `studio_session`, etc.). Tags surface as
clickable filter chips on the community feed and become the substrate
for future recommendation, search, and analytics features.

## What's wired up

### Database

`supabase/migrations/0028_post_tags.sql` adds:

- `community_posts.tags text[] not null default '{}'`
- `community_posts.tagged_at timestamptz` — null = pending
- `community_posts.tag_model + tag_prompt_version` — re-classification
  provenance, mirrors moderation columns
- **GIN index on `tags`** for fast `@>` (contains) and `&&` (overlaps)
  queries used by the filter chips
- Partial btree index on `(created_at desc) where tagged_at is null`
  for the backfill cron's "find work" query
- `list_untagged_posts(limit)` — backfill cron's work-finder. Filters
  out auto_hide moderation rows
- `list_top_tags_for_community(slug, limit)` — most-used tags per
  community with counts. Powers the filter chip render (security
  invoker; respects RLS on community_posts)

### Application

`frontend/lib/tagging/`:

- `client.ts` — `classifyTags(input)` wraps Claude Haiku 4.5.
  CANONICAL_TAGS is a 21-string closed vocabulary (20 + `other`).
  Versioned via `TAG_PROMPT_VERSION`. Defensive parser validates
  every returned tag against the vocabulary, dedupes, caps at 4.
- `tag-row.ts` — `tagRow(postId)` workhorse: fetches post + artist
  genres for context, calls classifier, updates row. Skips
  auto_hide. `tagRowAsync` is the fire-and-forget variant.
- `index.ts` — barrel.

### Inline trigger

`frontend/app/artists/[slug]/community/actions.ts` — same 4
community_posts insert paths where `indexRowAsync` and
`moderateRowAsync` are wired now also call `tagRowAsync`. All three
run in parallel as fire-and-forget. Comments are **not** tagged.

### Background work

`frontend/app/api/cron/tags-backfill/route.ts` — every 15 min,
classifies posts with `tagged_at is null`. Same auth + 503 patterns.
BATCH_SIZE=30 keeps each tick under Vercel's 60s function timeout.

### UI surface

`frontend/app/artists/[slug]/community/page.tsx`:

- Reads `?tag=foo` from searchParams → server-side filters posts via
  the GIN index
- Parallel-fetches the top 10 tags for the community

`frontend/app/artists/[slug]/community/tag-filter-chips.tsx`:

- `"use client"` component. Click a chip → URL updates → page
  re-fetches with the filter applied. "All" chip clears.
- Pretty-labels snake_case canonical tags ("live_show" → "Live Shows")
- Hidden entirely if the artist has no tagged posts yet

## Setup steps for Phase 5

Just one — run the migration. No new env vars needed since
`ANTHROPIC_API_KEY` from Phase 2 covers it.

### Run migration 0028 in Supabase

Open https://supabase.com/dashboard/project/uhovonrljcauaoctypbg/sql/new
and paste the contents of `supabase/migrations/0028_post_tags.sql`.

Verify:

```sql
\d public.community_posts        -- should show tags + tagged_at + tag_* columns

select * from public.list_untagged_posts(5);
select * from public.list_top_tags_for_community('raelynn', 10);
```

After the migration runs, the `*/15 * * * *` `tags-backfill` cron will
classify all existing posts within 15-30 minutes of the next deploy.
A typical first-run summary:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://fan-engage-pearl.vercel.app/api/cron/tags-backfill
```

```json
{
  "ok": true,
  "summary": {
    "totalCandidates": 9,
    "processed": 9,
    "byStatus": { "tagged": 9 },
    "errors": [],
    "durationMs": 13420
  }
}
```

## Verifying the UI

After tags land, visit any artist's community feed:

1. https://fan-engage-pearl.vercel.app/artists/raelynn/community
2. Filter chips appear at the top showing the most-used tags + counts
3. Click a chip → URL becomes `?tag=live_show` → only matching posts
4. Click "All" to clear

Spot-check via SQL:

```sql
-- Tag distribution per community
select artist_slug, t.tag, count(*)
from public.community_posts p, unnest(p.tags) as t(tag)
where p.tagged_at is not null
group by 1, 2
order by 1, count(*) desc;
```

## Operational notes

### Costs

Claude Haiku 4.5 at $0.25/M input + $1.25/M output. Per post:
~150 input + ~50 output tokens = ~$0.0001. 1k posts/month = $0.10.

### When to bump TAG_PROMPT_VERSION

Bump the constant in `frontend/lib/tagging/client.ts` whenever:

- The closed vocabulary changes (added, removed, or renamed tags)
- The system prompt changes meaningfully (e.g. new examples)
- The classifier model is upgraded

After bumping, mark stale rows for re-classification:

```sql
update public.community_posts
set tagged_at = null
where tag_prompt_version != 'v2';  -- new version
```

The backfill cron picks them up within 15 min and re-tags.

### Self-harm + auto_hide content

Posts with `moderation_status = 'auto_hide'` are excluded from
`list_untagged_posts` and `list_top_tags_for_community`, so toxic
content never gets tags assigned and never appears in filter chip
counts.

### Failure modes

- **`ANTHROPIC_API_KEY` missing** — every classify call returns 503;
  `tagged_at` stays null. Filter chips render with whatever's already
  tagged. Filter still works on tagged posts; untagged posts just
  don't match any tag filter.
- **Anthropic 429 / 5xx** — `TagError` raised; row stays
  `tagged_at = null`; next cron tick retries.
- **Classifier returns invalid tag** — defensive parser rejects it,
  falls back to ['other']. Never persists garbage tags.

---

## Phase 6 — Semantic Search

Global search across the platform, powered by the same embeddings
infrastructure stood up in Phase 1. Replaces no prior text search —
this is the first search surface in Fan Engage.

### What it indexes

Every row that gets embedded into `content_embeddings` is searchable:

- `community_posts` — post titles + bodies
- `community_comments` — comment bodies
- `communities` — display name, tagline, bio (via md5(slug) source_id)
- `artist_events` — event titles + details
- `rewards_catalog` — reward titles + descriptions

Rows with `moderation_status = 'auto_hide'` and inactive events /
rewards are filtered out at the source-fetch stage — they never
appear in results even if their embedding row still exists.

### Pipeline

```
GET /search?q=<query>
   │
   ▼
search(query)  ─►  OpenAI embedText(query)        // 1536-dim vector
                ─► Postgres search_embeddings RPC // top-30 by cosine
                ─► distance ≤ 0.85 filter         // drop noise
                ─► batched fetch per source_table // parallel
                ─► drop auto_hide / inactive
                ─► group + cap 8/group
                ─► SearchResults
```

### Files

- `lib/search/types.ts` — SearchHit, SearchHitData, SearchResults,
  SearchSourceTable.
- `lib/search/query.ts` — `search(query)` workhorse +
  `fetchAllSourceRows` parallel batched fetcher.
- `lib/search/index.ts` — barrel export.
- `app/api/search/route.ts` — public GET endpoint (no auth gate;
  the RPC visibility filter handles privacy).
- `app/search/page.tsx` — server-component results page; calls
  `search()` directly.
- `components/search-input.tsx` — reusable client input used both
  on the results page and in the global header (compact variant).

### Tunables

In `lib/search/query.ts`:

- `RAW_LIMIT = 30` — candidate hits pulled from pgvector before
  grouping. Bump if hit groups feel sparse for niche queries.
- `PER_GROUP_LIMIT = 8` — max hits surfaced per source_table on the
  results page.
- `MIN_QUERY_LENGTH = 2` — single-letter queries are rejected
  without burning an OpenAI call.
- `MAX_DISTANCE = 0.85` — cosine distance threshold above which
  hits are dropped as noise. Tighten (e.g. 0.65) if results feel
  off-topic; loosen if too many "no results".

### Where it surfaces

- **Desktop header** (`lg:` breakpoint and up) — compact inline
  search input between nav and user controls.
- **User menu** — `Search` link under `My rewards` for mobile users
  whose viewport hides the inline header search.
- **`/search?q=…`** direct URL.

### Costs

OpenAI text-embedding-3-small at $0.02 / 1M tokens. Per query:
~10 tokens = $0.0000002. A million queries/month = ~$0.20.
The `search_embeddings` RPC is local Postgres + pgvector — free.

### Failure modes

- **`OPENAI_API_KEY` missing** — `/api/search` returns 503; the
  results page shows a "temporarily unavailable" banner.
- **OpenAI 429 / 5xx** — `EmbeddingError` bubbles up; same banner.
- **Empty / 1-char query** — UI shows the friendly prompt; no
  network call.
- **Source row deleted between embedding + query** — counted as
  `missingSourceRows` in the response and silently dropped from
  results.

### Future (V2) — LLM rerank

The current pipeline is pure cosine similarity. The recs doc (#6)
called out a top-50 → Claude rerank → top-10 step for higher
precision on long-tail queries. Adding it later is one new file
(`lib/search/rerank.ts`) and one extra await in `search()`. We
held off until we can compare pure-vector quality against rerank
quality on real production queries.

### Future — typeahead / suggestions

Today's input does nothing on each keystroke — submit on Enter
fires the search. A typeahead variant could:

- Debounce keystrokes 150ms.
- Hit `/api/search` with a small `&limit=5`.
- Render a dropdown with the top hits.

The pieces are all there; we just need to add a `?limit=N`
parameter to the route + workhorse and a small dropdown UI on top
of `<SearchInput>`.

---

## Phase 8 — Smart event-match notifications

When a new event is created, score the artist's followers on geo
proximity, past RSVP rate, recent engagement, and tier; cap at the
top 25%; let an admin review the candidate list and click Send.
This is recommendation #8 from `FAN_ENGAGE_AI_RECOMMENDATIONS.md`.

### Important design choice — no auto-send

The recs doc warns that bad SMS targeting causes fatigue + opt-outs.
We don't auto-send. Every notification batch goes through the admin
preview UI at:

```
/admin/artists/[slug]/events/[id]/match
```

Admin reviews the ranked candidate list with full score-component
breakdown, then clicks Send. The pre-compute cron just makes the
preview load fast; it doesn't fire anything.

### Score function

```
total = 0.4 * geo + 0.3 * past_rsvp_rate + 0.2 * engagement + 0.1 * tier_weight
```

All four components clamped to [0, 1]. Total clamped to [0, 1]. Cap
at the top 25% by score, then drop anyone below an absolute 0.15
floor (prevents spamming when the follower pool is small).

| Component | Source | v1 algorithm |
|-----------|--------|--------------|
| `geo` | `fans.city` × `artist_events.location` | string substring match (1.0), state-token match (0.5), else 0 |
| `past_rsvp_rate` | `event_rsvps` joined to past `artist_events` of this artist | RSVPs / total past events, capped at 1.0 |
| `engagement` | `community_comments` last 30 days on this artist's posts | count / 5, capped at 1.0 |
| `tier_weight` | `fans.current_tier` | founder=1.0, platinum=.85, gold=.7, silver=.5, bronze=.25 |

### Files

- `lib/event-matching/score.ts` — pure scoring functions.
- `lib/event-matching/match-event.ts` — `matchEvent(eventId)` workhorse.
- `lib/event-matching/send.ts` — `sendEventMatchNotifications(eventId)`.
- `lib/event-matching/index.ts` — barrel.
- `app/admin/artists/[slug]/events/[id]/match/page.tsx` — preview UI.
- `app/admin/artists/[slug]/events/[id]/match/actions.ts` — server
  actions (`rescoreEventAction`, `sendEventMatchAction`).
- `app/api/cron/event-match-prepare/route.ts` — pre-compute cron.
- `supabase/migrations/0029_event_match.sql` — schema.

### Notification channels

1. **In-app notifications** — always written, regardless of SMS
   opt-in. Idempotent via `notifications.dedup_key =
   'event-match:<event_id>:<fan_id>'`.
2. **SMS** — only if Mailchimp Transactional SMS is configured AND
   `fans.sms_opted_in = true` AND `fans.phone` is non-empty AND the
   fan is 18+ when a birth date is on file. Event-match texts are
   promotional, so they also wait on `MAILCHIMP_SMS_PROMOTIONAL_ENABLED`.
   Includes the 10DLC-required "Reply STOP to opt out" footer.

If Mailchimp isn't configured, in-app notifications still fire — SMS is
treated as best-effort enrichment. The send is logged and does not throw.

### Costs

Zero AI cost for v1. The recs doc mentions an optional Claude step to
rewrite SMS bodies per fan ("Hey Sarah, you'd love this one") — that's
deferred until we have data to validate it's worth the per-message
spend. Current SMS cost is Mailchimp's per-message fee.

### Tunables

In `lib/event-matching/score.ts`:

- `SCORE_WEIGHTS` — the 0.4/0.3/0.2/0.1 split. Bump engagement weight
  if the audience is mostly online-only; bump geo for in-person
  artists.
- `CANDIDATE_TOP_PERCENT = 0.25` — recs doc says 25%. Lower for
  fatigued audiences, higher for sparse engagement.
- `CANDIDATE_MIN_SCORE = 0.15` — absolute floor. Set to 0 if you want
  to always notify the top N regardless of how cold the signal is.

### Failure modes

- **No followers** — `matchEvent()` returns gracefully with 0
  candidates; admin sees an empty table.
- **No past events for this artist** — `past_rsvp_rate` is 0 for
  everyone; engagement + tier carry the score.
- **Mailchimp not configured, or promotional SMS still disabled** —
  `sendEventMatchNotifications()` still writes in-app rows; SMS
  counters are 0.
- **Mailchimp rate-limited** — per-send try/catch records the failure
  in `event_match_log.errors[]` but doesn't stop the loop. Throttle
  is 250ms between sends.
- **Re-clicked Send** — already-sent rows are skipped; in-app
  notification dedup_key prevents inbox duplicates even on
  partial-failure retries.

### Future (V2)

- **Real geocoding** — geocode `fans.city` + `artist_events.location`
  into lat/lng, replace string match with sigmoid-over-miles. Saved
  in the post-launch checklist.
- **Engagement decay** — weight recent reactions higher than
  3-week-old comments via exponential decay. Drop-in change in
  `loadEngagementSignal`.
- **Per-fan SMS rewrite** — Claude Haiku call to personalize the
  SMS body. Should not ship until we have an A/B baseline.
- **Push notifications** — third channel alongside in-app + SMS.
  Requires PWA push setup.

---

## Phase 10 — Reward recommendations

Surface a single hero card at the top of `/artists/[slug]/rewards`
matching the recs doc's #10 ("Based on your tier, your points, and
what fans like you redeemed, you'd love this"). Score 3.0 — the
highest-rated rec in the doc — with effort 1.

### Algorithm

1. **Affinity path** — `recommend_rewards_for_fan()` Postgres function
   sums (1 - cosine_distance) between every past-redeemed reward
   embedding and every candidate reward embedding. Highest sum wins.
2. **Filters in SQL** — community match, active=true, point_cost ≤
   fan.total_points, tier eligibility via `is_premium()` /
   `is_founder()` helpers, no redemption of that reward in the last
   30 days.
3. **Cold start** — fan with zero past redemptions returns 0 RPC
   rows. The TS wrapper falls back to:
   - Most-redeemed eligible reward in the last 30 days
     (`reason='cold_start_popular'`), OR
   - Cheapest eligible reward if the platform is truly cold
     (`reason='cold_start_cheapest'`).

Zero AI cost: pure pgvector arithmetic against existing reward
embeddings (Phase 1). One RPC + a couple of small SELECTs per page
view.

### Files

- `supabase/migrations/0030_reward_recs.sql` — the RPC.
- `lib/recs/rewards.ts` — TS wrapper + cold-start fallback.
- `lib/recs/index.ts` — barrel.
- `app/artists/[slug]/rewards/recommended-reward-card.tsx` — hero card.
- `app/artists/[slug]/rewards/page.tsx` — wires the rec into the
  parallel data load + renders the card before the catalog grid.

### Why this scope (and what's deferred)

The recs doc names two surfaces — `/rewards` and `/marketplace`.
Mapping them to actual code:

- `/artists/[slug]/rewards` uses `rewards_catalog` — already embedded
  in Phase 1. Shipped.
- `/marketplace` uses a separate `offers` table — NOT in the embedding
  pipeline. Deferred to Phase 10.5: extend the embedding indexer to
  cover offers, then add an analogous hero card. ~1 day of work
  whenever marketplace traffic grows enough to matter.

The recs doc's per-fan logic is the same on both sides. The work
ahead of 10.5 is purely plumbing.

### Tunables

In `0030_reward_recs.sql`:

- `limit 20` on `past_redemptions` — caps the fan's history we score
  against. Bump if power users redeem heavily and the recommendation
  feels stale; lower if the cross-join gets slow.
- `30 days` recency penalty — adjust if reward catalog turnover is
  slower (e.g., merch drops every 6 months → bump to 90 days).

In `lib/recs/rewards.ts`:

- Cold-start window (`30 days` for popularity ranking) — same logic.

### Failure modes

- **RPC error** — logged and treated as cold-start; the page still
  loads.
- **No eligible rewards** — `recommendReward()` returns null and the
  hero card just doesn't render. Static catalog below is unchanged.
- **Reward embedding missing** — Phase 1 backfill cron should keep
  this near zero. If a freshly-created reward hasn't been embedded
  yet, it just won't show up as a candidate until the next 15-min
  cron tick.

### Future (V2)

- **Reaction-based cold start** — for fans with reactions but no
  redemptions, use the centroid of post embeddings they've reacted
  to as the affinity vector. Expected meaningful for casual fans
  who haven't redeemed yet but are clearly engaged.
- **Marketplace integration (Phase 10.5)** — extend Phase 1 to embed
  `offers`, then plug the same hero-card pattern into
  `app/marketplace/page.tsx`. Cross-community since marketplace is
  platform-wide; ranking should weight the fan's home community
  rewards above unrelated offers.
- **Multi-rec carousel** — instead of one hero, show top-3. Worth it
  once the catalog has 20+ active rewards per community, otherwise
  the carousel feels redundant.
- **Click-through telemetry** — log when a fan clicks "View reward"
  vs "Hide" so we can A/B different score weightings.

---

## Phase 12 — Image-aware post captions

When a fan uploads a photo to a community post, AI suggests 3
captions in different tones (observational / enthusiastic /
curious-question). Fan picks one or types their own. Recs doc #12,
Score 2.0 — light version of Phase 3 (drafted comments) but for
images.

### Algorithm

1. Fan attaches an image — `<ImageUploader />` writes the URL into
   the form.
2. `<CaptionSuggester />` renders next to the upload preview with a
   ✨ Suggest captions button.
3. Click → POST `/api/ai/caption-image` with
   `{ imageUrl, partialBody, artistSlug }`.
4. Route looks up community context (display_name, tagline) and
   calls `suggestCaptions()` against Claude Haiku 4.5 vision.
5. System prompt enforces: 3 captions, ≤100 chars, must reference
   something visible in the photo, three distinct tones.
6. Defensive parser validates shape; UI renders 3 picker chips.
7. Click a chip → caption is appended to (or sets) the textarea.
   `caption_used` flag flips to true; the form's hidden input
   carries it through. createPostAction writes
   `community_posts.caption_used = true`.

Cost: ~1600 input tokens (image) + ~150 output × 3 captions ≈
$0.0007 per click. 1000 photo posts/mo with the button clicked
on every one = $0.70.

### Files

- `supabase/migrations/0031_caption_used.sql` — single-column add.
- `lib/captions/client.ts` — Claude vision wrapper.
- `lib/captions/index.ts` — barrel.
- `app/api/ai/caption-image/route.ts` — auth-gated POST.
- `app/artists/[slug]/community/caption-suggester.tsx` — client UI.
- `app/artists/[slug]/community/new-post-form.tsx` — wires it in.
- `app/artists/[slug]/community/actions.ts` — reads caption_used flag.

### Why it's opt-in

The suggester only fires when the fan clicks the button. We don't
auto-call on every image upload because:
  - It would burn Anthropic spend on photos the fan never publishes.
  - Some fans want to type their own caption immediately and
    proactively-generated suggestions feel patronizing.
  - It gives us a clean A/B signal post-launch: caption_used=true
    posts vs caption_used=false posts on the same images.

### Tunables

In `lib/captions/client.ts`:

- `temperature: 0.7` — modest variety across 3 captions. Bump to 0.9
  for more creative outputs; lower to 0.4 for safer / more literal.
- `max_tokens: 400` — fits 3 captions × ~100 chars × json overhead
  with headroom.
- System prompt — one of the most important tunables. The "MUST
  reference something visible in the photo" line is what prevents
  generic "Beautiful shot!" failure mode. Bump prompt version when
  changing.

### Failure modes

- **Anthropic 429 / 5xx** — `CaptionError` → 503 → UI shows "having
  trouble, please try again". User can hit Regenerate or just type
  their own.
- **Image URL fetch fails on Anthropic side** — same 503 path.
  Common cause: image bucket isn't actually public or URL is signed
  with an expiring token. Check `bucket=community-uploads` is
  configured for public read.
- **JSON parse fails** — `CaptionError` thrown by parser → 503 → UI
  shows generic error. Logged server-side. Bumping
  CAPTION_PROMPT_VERSION + adjusting the system prompt fixes it.
- **Empty image** — guarded at the API route (400 if missing).

### Future (V2)

- **Auto-pre-fill on upload** — if A/B data shows captions are
  high-quality, consider auto-firing on upload and populating the
  textarea with caption #1 (with the other 2 visible as alternates).
  Saves the explicit click. Don't ship until we have data — see the
  "Why it's opt-in" rationale above.
- **Comment-side captions** — captions in comments could explain
  reactions to posted images ("looking like the leopard fit is
  going to be the move"). Same `lib/captions` underneath.
- **Caption + auto-tag together** — Phase 5 tags posts based on
  body text. If a fan picks an AI caption, run the tagger
  immediately on the resulting body so the post lands in the right
  filter chip without waiting for the cron.

---

## Phase 15 — Engagement anomaly detection (admin daily brief)

Daily cron summarizes platform + per-community week-over-week metrics
into a Slack-ready narrative. Admins see history at `/admin/briefs`;
optional Slack delivery via webhook. Recs doc #15, Score 3.0.

### Pipeline

```
13:00 UTC daily
  │
  ▼
GET /api/cron/daily-admin-brief
  │
  ▼
gatherAdminBriefMetrics(now)
  │  ├─ per-community: posts / comments / reactions / signups /
  │  │  active_fans / top_post (this week vs last week)
  │  └─ platform: signups / points_awarded + sums of community metrics
  │  └─ rule-based anomaly detector
  │
  ▼
summarizeAdminBrief(metrics)
  │  Claude Haiku 4.5 (or deterministic fallback if API key missing)
  │  → plain-text Slack-ready brief, ≤ 80 lines
  │
  ▼
persistAndDispatchBrief(metrics, summary, ms)
  │  ├─ INSERT admin_briefs row (always)
  │  ├─ POST Slack webhook (if SLACK_ADMIN_WEBHOOK_URL set)
  │  └─ stamp channels_sent on the row
  │
  ▼
{ ok, brief_id, channels_sent, errors, took_ms }
```

### Files

- `supabase/migrations/0032_admin_briefs.sql` — storage table.
- `lib/admin-brief/gather.ts` — WoW metrics + anomaly detection.
- `lib/admin-brief/summarize.ts` — Claude wrapper + fallback.
- `lib/admin-brief/send.ts` — persist + Slack delivery.
- `lib/admin-brief/index.ts` — barrel.
- `app/api/cron/daily-admin-brief/route.ts` — cron endpoint.
- `app/admin/briefs/page.tsx` — admin view.
- `frontend/vercel.json` — `0 13 * * *` schedule entry.

### Setup

1. Migration 0032 must be applied (creates admin_briefs table).
2. (Optional) Slack:
   - In Slack, create an Incoming Webhook in the channel where
     admins should receive the brief (e.g. #fan-engage-admin).
   - Copy the webhook URL.
   - In Vercel project env vars, set
     `SLACK_ADMIN_WEBHOOK_URL=https://hooks.slack.com/services/...`
   - Trigger a redeploy. Next cron run will post to Slack.
3. Without the env var, briefs still persist + render at
   `/admin/briefs` — Slack is purely additive.

### Costs

Claude Haiku 4.5 at $0.25/M input + $1.25/M output. The user prompt
is the metrics jsonb (~600 tokens for a 6-community platform), the
output is ~600 tokens (the brief). Per run ≈ $0.0009. Daily cron =
~$0.027/month. Negligible.

### Tunables

In `lib/admin-brief/gather.ts`:

- The 7-day window is hard-coded. To change to 14-day, swap the `t7`
  / `t14` math in `gatherAdminBriefMetrics`.
- Anomaly thresholds:
  - Signup spike: 3x or more vs prior week.
  - Engagement drop: ≤ −20% (warn at ≤ −40%).
  - Engagement jump: ≥ +20%.
  - Quiet community: posts went from N>0 to 0.
  All defined in `detectAnomalies`. Bump the floors if briefs feel
  noisy; lower them if drops aren't being flagged.

In `lib/admin-brief/summarize.ts`:

- `temperature: 0.3` — leans deterministic. Bump to 0.5 if briefs
  feel mechanical; lower to 0.1 for maximum consistency.
- `max_tokens: 1200` — covers ~80 lines of plain text comfortably.

In `vercel.json`:

- Schedule is `0 13 * * *` (13:00 UTC = 8am Central). Adjust if your
  team is in a different timezone or wants a later read time.

### Failure modes

- **No active communities** — gather returns empty arrays, summarize
  returns "Quiet week — no posts in either window."
- **ANTHROPIC_API_KEY missing** — `summarizeAdminBrief` returns the
  deterministic fallback narrative. Cron continues to work.
- **Anthropic API error** — `AdminBriefError` thrown; cron returns
  500 with the error message and DOES NOT persist a row. Next-day
  retry happens normally.
- **Supabase down mid-gather** — partial metrics may have been
  computed; the eventual `admin_briefs.insert` fails; cron returns
  500. No row persisted, no Slack ping.
- **Slack webhook 4xx/5xx** — recorded in `errors[]` but doesn't fail
  the run; the row still inserts and `channels_sent` stays empty.

### Honest scope notes (what we DIDN'T build)

- **IP-block bot detection** (the recs doc's "47 signups from one IP
  block" example): the `fans` table doesn't track signup IPs today.
  Adding it requires either a `fans.signup_ip inet` column populated
  by the signup flow OR pulling from `auth.audit_log_entries` (a
  Supabase-internal schema). v2 follow-up — meanwhile, anomaly
  detection just flags volume spikes without source attribution.
- **Per-community points attribution**: `points_ledger` is global
  (no `community_id` column). We surface platform-total points
  awarded only. To attribute per-community, add a column + backfill
  from existing rows (challenge points → tagged community,
  community_post points → artist_slug → community_id, etc.).
- **Email channel**: Slack covers the typical admin team. Email is a
  v2 add — consider Resend (cheaper than Mailchimp Campaigns for
  transactional admin mail).

### Future (V2)

- **Inline charts in /admin/briefs** — sparkline of WoW per
  community.
- **Trend memory** — feed the previous 3 briefs into the prompt so
  the summarizer can say "RaeLynn engagement has now dropped 3
  weeks in a row — investigate" instead of treating each brief in
  isolation.
- **Per-admin filtering** — surface only the communities each admin
  has access to (the `admin_users` table is per-community). Right
  now everyone sees the platform-wide brief.
- **Anomaly-only Slack** — opt-in setting where Slack only fires
  when severity=warn anomalies are present, to reduce noise on
  calm weeks.
