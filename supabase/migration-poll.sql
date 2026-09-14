-- =====================================================================
-- ASTRA KM FEST 2026 — migration: add the POLL, widen results to Top 5
--
-- Run this ONCE on an existing database (Supabase Studio → SQL Editor →
-- Run). Safe to re-run. A brand-new database can just run schema.sql
-- instead, which already includes everything below.
-- =====================================================================

-- 1. Every answer now also records the A/B vote that came with it.
alter table public.feedback
  add column if not exists poll_choice text;

do $$
begin
  alter table public.feedback
    add constraint feedback_poll_choice_check
    check (poll_choice in ('A', 'B'));
exception
  when duplicate_object then null;
end
$$;

comment on column public.feedback.poll_choice is
  'A = USE AI NOW, B = UNDERSTAND FIRST. Null only for rows written before the poll existed.';

create index if not exists feedback_poll_choice_idx
  on public.feedback (poll_choice);

-- 2. The display now shows a ranked top FIVE, not three.
alter table public.ai_summary
  drop constraint if exists ai_summary_rank_check;

alter table public.ai_summary
  add constraint ai_summary_rank_check check (rank between 1 and 5);

-- 3. The display listens for DELETEs on feedback (so the counters reset the
--    instant the admin wipes data). Postgres only publishes the old row for
--    a DELETE when the table has a replica identity — the primary key is
--    enough, but FULL keeps it working even if the key ever changes.
alter table public.feedback replica identity full;
