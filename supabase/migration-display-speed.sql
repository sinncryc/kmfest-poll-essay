-- =====================================================================
-- ASTRA KM FEST 2026 — migration: pill speed setting for /display
--
-- Run ONCE (Supabase Studio → SQL Editor → Run). Safe to re-run.
-- /admin writes this one row; /display reads it every few seconds.
-- Until this runs, the display simply uses the default speed.
-- =====================================================================

create table if not exists public.display_settings (
  id           smallint    primary key default 1 check (id = 1),
  loop_seconds integer     not null default 60 check (loop_seconds between 15 and 300),
  updated_at   timestamptz not null default now()
);

insert into public.display_settings (id) values (1) on conflict (id) do nothing;

alter table public.display_settings enable row level security;

drop policy if exists "anon read display settings" on public.display_settings;
create policy "anon read display settings"
  on public.display_settings for select
  to anon
  using (true);
