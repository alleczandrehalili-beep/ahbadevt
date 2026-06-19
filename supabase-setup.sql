-- FieldFlow / AHBA — Supabase setup for mobile <-> dashboard sync
-- Run this in: Supabase dashboard -> SQL Editor -> New query -> Run
-- Project: avjzkfxgzeyxtihkofed.supabase.co

-- 1) Table with the EXACT columns ahba-cloud.js reads/writes
create table if not exists public.jobs (
  id           text primary key,
  subscriber   text,
  service_type text,
  plan         text,
  area         text,
  address      text,
  status       text,
  wait_time    text,
  priority     text,
  schedule     text,
  team         text,
  updated_at   timestamptz default now()
);

-- 2) Enable Row Level Security
alter table public.jobs enable row level security;

-- 3) Allow the anon (publishable) key to read AND write.
--    NOTE: this is fine for a demo/prototype. Lock it down before production.
drop policy if exists "anon read jobs"   on public.jobs;
drop policy if exists "anon insert jobs" on public.jobs;
drop policy if exists "anon update jobs" on public.jobs;

create policy "anon read jobs"
  on public.jobs for select
  to anon
  using (true);

create policy "anon insert jobs"
  on public.jobs for insert
  to anon
  with check (true);

create policy "anon update jobs"
  on public.jobs for update
  to anon
  using (true)
  with check (true);

-- 4) Turn on Realtime so changes push instantly (otherwise the 15s poll still works)
alter publication supabase_realtime add table public.jobs;

-- 5) Quick check — should return rows after either app writes
-- select * from public.jobs order by updated_at desc;
