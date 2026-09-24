-- =====================================================================
-- ASTRA KM FEST 2026 — migration: new display summary (10 cards)
--
-- Run ONCE on the existing database (Supabase Studio → SQL Editor → Run).
-- Safe to re-run. A brand-new database can run schema.sql instead.
--
-- ai_summary now holds 10 rows instead of 5 (see src/lib/summary-schema.ts):
--   1–2 A reasons, 3 A AI insight, 4–5 B reasons, 6 B AI insight,
--   7 A pro, 8 A con, 9 B pro, 10 B con.
-- =====================================================================

alter table public.ai_summary
  drop constraint if exists ai_summary_rank_check;

alter table public.ai_summary
  add constraint ai_summary_rank_check check (rank between 1 and 10);

-- Old 5-card results would show up in the wrong boxes; clear them. The next
-- auto-summarize run (or an /admin publish) fills the new layout.
delete from public.ai_summary;

comment on column public.feedback.poll_choice is
  'A = USE AI FIRST, B = THINK FIRST — the vote submitted with this answer.';
