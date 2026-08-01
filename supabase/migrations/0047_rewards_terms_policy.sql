-- ────────────────────────────────────────────────────────────────────────────
-- Fan Engage — Rewards Terms & Conditions
-- Safe to re-run (idempotent).
-- ────────────────────────────────────────────────────────────────────────────

-- ─── Seed rewards terms policy (upsert; safe to re-run) ────────────────────
insert into public.policy_pages (slug, title, content_md, is_draft) values
  ('rewards_terms', 'Fan Engage Pro Rewards Program Terms & Conditions',
   E'# Fan Engage Pro Rewards Program Terms & Conditions — DRAFT\n\n_This is a placeholder. Final policy pending resolution of cross-reference links (Rules for Use, Terms of Use, Cancellation & Refund Policy) before publication._\n\n' ||
   E'## Contact\nFor questions about the Rewards Program, email support@fanengagepro.com.',
   true)
on conflict (slug) do update set
  title = excluded.title,
  -- Only overwrite content when the existing row is still the placeholder
  -- draft — so re-running the migration never clobbers real legal copy.
  content_md = case when policy_pages.is_draft and policy_pages.content_md like '%DRAFT%'
                   then excluded.content_md else policy_pages.content_md end;
