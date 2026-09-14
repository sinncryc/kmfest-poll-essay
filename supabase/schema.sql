-- =====================================================================
-- Anniversary Feedback — Supabase schema
-- Paste this whole file into Supabase Studio → SQL Editor → Run.
-- Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

create table if not exists public.feedback (
  id          bigint generated always as identity primary key,
  message     text        not null check (char_length(message) between 10 and 500),
  poll_choice text        check (poll_choice in ('A', 'B')),
  session_id  text,
  is_visible  boolean     not null default true,
  created_at  timestamptz not null default now()
);

comment on column public.feedback.poll_choice is
  'A = USE AI NOW, B = UNDERSTAND FIRST — the vote submitted with this answer.';
comment on column public.feedback.session_id is
  'Opaque random id from an httpOnly cookie. Not linked to any person.';
comment on column public.feedback.is_visible is
  'false = flagged by the profanity filter; stored but never shown on the big screen.';

create index if not exists feedback_visible_idx
  on public.feedback (is_visible, id desc);
create index if not exists feedback_created_at_idx
  on public.feedback (created_at desc);
create index if not exists feedback_poll_choice_idx
  on public.feedback (poll_choice);

-- Up to five rows, one per rank. The admin "Update Display" action (and the
-- auto-summarize cron) upsert on rank, which is what /display listens to.
create table if not exists public.ai_summary (
  rank       smallint    primary key check (rank between 1 and 5),
  title      text        not null,
  count      integer     not null default 0,
  summary    text        not null,
  updated_at timestamptz not null default now()
);

alter table public.ai_summary replica identity full;
-- /display also resyncs on DELETE (the admin reset), which needs the old
-- row to be published.
alter table public.feedback replica identity full;

-- ---------------------------------------------------------------------
-- 2. Row level security
-- ---------------------------------------------------------------------

alter table public.feedback    enable row level security;
alter table public.ai_summary  enable row level security;

-- Participants (anon key) may submit feedback...
drop policy if exists "anon insert feedback" on public.feedback;
create policy "anon insert feedback"
  on public.feedback for insert
  to anon
  with check (true);

-- ...and may only read what passed moderation.
drop policy if exists "anon read visible feedback" on public.feedback;
create policy "anon read visible feedback"
  on public.feedback for select
  to anon
  using (is_visible = true);

-- The big screen reads Top 3 with the anon key.
drop policy if exists "anon read ai summary" on public.ai_summary;
create policy "anon read ai summary"
  on public.ai_summary for select
  to anon
  using (true);

-- No anon UPDATE/DELETE policies anywhere: nobody with the public key can
-- edit or remove what is on the projector. Writes to ai_summary go through
-- the server using SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.

-- ---------------------------------------------------------------------
-- 3. Realtime
-- ---------------------------------------------------------------------

do $$
begin
  begin
    alter publication supabase_realtime add table public.feedback;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.ai_summary;
  exception when duplicate_object then null;
  end;
end
$$;

-- ---------------------------------------------------------------------
-- 4. Optional seed so /display is not empty during a rehearsal
--    (delete these rows before the real event)
-- ---------------------------------------------------------------------

-- insert into public.ai_summary (rank, title, count, summary) values
--   (1, 'Komunikasi Internal', 32, 'Meningkatkan kecepatan dan kejelasan komunikasi antar divisi.'),
--   (2, 'Pengembangan Karyawan', 24, 'Memperbanyak program training dan pengembangan karier.'),
--   (3, 'Fasilitas Kerja', 19, 'Meningkatkan fasilitas dan kenyamanan lingkungan kerja.')
-- on conflict (rank) do update set
--   title = excluded.title,
--   count = excluded.count,
--   summary = excluded.summary,
--   updated_at = now();
