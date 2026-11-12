# PR #4 (`superfan-radar-wip`) — assessment

**Date:** 2026-10-29 (Sprint 3, item D). **Assessed against:** `origin/main` @ `23ef92c` (#138).
**Verdict up front: close it (it is already closed on GitHub) and do not reopen. Everything in it that mattered is on `main` in a better form; the rest is superseded. Nothing to cherry-pick.**

## 1. Where the PR actually stands

| Fact | Value |
|---|---|
| PR | [JonasGroupEntertainment/fan-engage#4](https://github.com/JonasGroupEntertainment/fan-engage/pull/4) — "Superfan Radar admin + RLS migrations 0047 and artist payouts" |
| GitHub state | **`closed`, not merged** (`merged_at: null`), last updated 2026-09-18 |
| Head | `8d2fa75` (merge of `main` into the WIP); single content commit `0b3d3ae` "WIP: superfan radar admin + RLS migrations 0047 / artist payouts" |
| Branch on origin | **`superfan-radar-wip` no longer exists** (`git ls-remote --heads` does not list it). The commits are only reachable through `refs/pull/4/head`, fetched here as `origin/pr-4`. |
| Merge base with today's main | `d5bea1a` "Force sharp >=0.35.0 to clear libvips CVEs" (26 Jul 2026). `main` is **170 commits** past it. |
| Size | 14 files, +423 / −1 (GitHub count; the two videos are binary) |

`CLAUDE.md` still described this as an open PR with "no conflicts". Both statements are stale: it was closed six weeks ago and it no longer merges cleanly (section 3).

## 2. What the branch contains (`git diff --stat origin/main...origin/pr-4`)

| File | Change | Status vs. today's `main` |
|---|---|---|
| `frontend/app/admin/super-fans/page.tsx` | added, 107 lines | **Already on main** (106 lines). Main's copy differs by two cosmetic lines (drops an unused `Link` import; `({ connected: false } as const)` cast). |
| `frontend/lib/data/superfan-radar.ts` | added, 110 lines | **Superseded.** Main has a rewritten 76-line version that delegates to `lib/superfan-radar/summarize.ts` (78 lines, not in the PR), keys tenants by community slug instead of a numeric `artist_profile_id`, and has a test (`lib/data/superfan-radar.test.ts`). The PR version is the older, untested shape. |
| `frontend/lib/superfan-radar/client.ts` | added, 32 lines | **Byte-identical to main.** |
| `frontend/app/admin/layout.tsx` | +1 nav item `/admin/super-fans` | **Already on main** (`layout.tsx:24`). |
| `frontend/app/artist-portal/payouts/page.tsx` | reads `artist_payouts` with the session client instead of the admin client (3 lines) | **Superseded.** Sprint 1 (#135) reworked this page (144 lines changed): it is now "Revenue", reads `artist_payouts` through the session client under the 0060 owner-read policy (`page.tsx:29-42`), and the fake Stripe sparkline / ownership-claim copy is gone. |
| `supabase/migrations/0047_flagged_table_rls.sql` (+ `supabase/rollbacks/0047_flagged_table_rls_rollback.sql`) | RLS + `artist_payouts_owner_read` policy on `artist_payouts`, RLS on `leaderboard_snapshots` | **Number collides**: main has `0047_rewards_terms_policy.sql`. **Content already landed as `0060_artist_payouts_owner_read.sql`**, whose header literally says "Renumbered from PR #4's 0047_flagged_table_rls.sql". 0060 was applied to prod 2026-09-17, and `supabase/rollbacks/0060_artist_payouts_owner_read_rollback.sql` exists. `0049_secure_financial_and_leaderboard_tables.sql` and the backfilled `20260713111819_enable_rls_payouts_and_leaderboard.sql` cover the rest. |
| `frontend/supabase/migrations/20260714_artist_payouts_leaderboard_snapshots_rls.sql` (+ `frontend/supabase/backups/20260714_rls_preflight_…sql`, `frontend/supabase/rollbacks/20260714_…_rollback.sql`) | a second, DO-block variant of the same RLS change with a preflight snapshot | **Wrong folder** (`frontend/supabase/` is the stale-duplicates folder, see `CLAUDE.md`) and **redundant** with 0049/0060/20260713111819. Would also create a `service_role` policy (`artist_payouts_service_role_all`) that main deliberately does not have — service_role bypasses RLS, so the policy is noise. |
| `frontend/app/for-artists/page.tsx` | +11 lines: `<video>` block for `for-artists-overview.mp4` | **Superseded.** Main's `for-artists` page was rewritten since (84 lines changed) and has no video block. |
| `frontend/components/signed-out-landing.tsx` | +11 lines: `<video>` block for `fan-experience-overview.mp4` | **Superseded.** Main's landing was rewritten (241 lines changed) and already ships its own hero video (`/videos/hero-aurora-loop.mp4`, `signed-out-landing.tsx:50`). |
| `frontend/public/videos/for-artists-overview.mp4` | binary, **8,033,343 bytes** (7.7 MB) | not on main; nothing on main references it |
| `frontend/public/videos/fan-experience-overview.mp4` | binary, **6,660,266 bytes** (6.4 MB) | not on main; nothing on main references it |

Total video payload: **14.7 MB** committed straight into git history (no `.gitattributes`, no LFS anywhere in the repo).

## 3. Does it still merge cleanly? No.

`git merge-tree --write-tree origin/main origin/pr-4` (read-only dry run, no worktree touched) exits 1 with **four conflicts**:

```
CONFLICT (add/add):  frontend/app/admin/super-fans/page.tsx
CONFLICT (content):  frontend/app/artist-portal/payouts/page.tsx
CONFLICT (content):  frontend/components/signed-out-landing.tsx
CONFLICT (add/add):  frontend/lib/data/superfan-radar.ts
```

`admin/layout.tsx` and `for-artists/page.tsx` auto-merge, but auto-merging `for-artists` would re-add a video block to a page that was redesigned without one. Resolving every conflict in favour of `main` leaves exactly: two orphan videos, a mis-numbered 0047 that would shadow a migration already in the applied ledger, and three files under `frontend/supabase/` that the repo rules say not to add.

## 4. The two videos — recommendation: drop

- They are unreferenced on `main` (the pages that embedded them were redesigned with different assets).
- Main already carries its own videos the same way (`hero-aurora-loop.mp4` 4.7 MB, `fan-profile-holo-loop.mp4` 2.0 MB, committed directly in `frontend/public/videos/`). If LFS is ever adopted it should be for those, as a separate decision; adopting it now just to carry two orphaned files is backwards.
- Because the PR branch was deleted, the 14.7 MB only lives in `refs/pull/4/head` on GitHub. It is not in any local clone's default fetch and does not bloat `main`. Leave it there.
- If the marketing team still wants the clips, the source files should come from wherever they were exported (Descript / Drive), not from this PR.

## 5. Reusable vs. superseded, in one glance

| Reusable | Superseded (by) |
|---|---|
| nothing — `client.ts` is identical, the rest exists in a newer form | Superfan Radar admin page + data layer (main's `app/admin/super-fans`, `lib/data/superfan-radar.ts`, `lib/superfan-radar/summarize.ts`, with tests) |
| | `0047_flagged_table_rls.sql` (→ `0060_artist_payouts_owner_read.sql`, applied 2026-09-17; plus 0049 and `20260713111819`) |
| | payouts page session-client read (→ Sprint 1 #135 "Revenue" page) |
| | landing / for-artists video embeds (→ redesigned pages with `hero-aurora-loop.mp4`) |
| | `frontend/supabase/{migrations,backups,rollbacks}/20260714_*` (wrong folder; redundant) |

## 6. Recommendation

**Close — already closed; leave it closed. Do not merge, do not cherry-pick, do not resurrect the branch.**

1. Nothing in the PR is missing from `main`; the parts that mattered were re-landed deliberately (0060's header documents the renumbering, Sprint 1 documented the payouts rework).
2. Merging would reintroduce an older untested `superfan-radar.ts`, a colliding 0047, stale-folder migrations and 14.7 MB of orphaned video.
3. Housekeeping that *is* worth doing: update `CLAUDE.md` "Repo state" (done in this sprint) so no future agent spends time on it, and optionally leave a one-line comment on the closed PR pointing here.
4. If anyone wants the historical diff, `git fetch origin refs/pull/4/head:pr-4` still works; the branch name `superfan-radar-wip` does not.

## Appendix — commands used

```bash
gh api repos/JonasGroupEntertainment/fan-engage/pulls/4            # state=closed, merged_at=null
gh api repos/JonasGroupEntertainment/fan-engage/pulls/4/files
git ls-remote --heads origin                                        # no superfan-radar-wip
git fetch origin refs/pull/4/head:refs/remotes/origin/pr-4
git fetch --deepen=400 origin main                                  # clone was shallow; needed for a merge base
git merge-base origin/main origin/pr-4                              # d5bea1a
git diff --stat origin/main...origin/pr-4
git merge-tree --write-tree origin/main origin/pr-4                 # dry run; exit 1, 4 conflicts
git cat-file -s origin/pr-4:frontend/public/videos/*.mp4
```
