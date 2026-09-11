-- QA Audit Phase C addendum — DISPATCH BOARD (2026-09-11). ADDITIVE. Run AFTER qa-05e.
-- Gives every audit a clock time on its inspector's day so the console can draw Clicksoft-style lanes
-- (one track per inspector, 07:00–18:00) and the head can drag a queued card onto a lane to dispatch it.
--   * qa.audits.scheduled_time   — the pinned arrival time (null = "no time" bucket at the left of the track)
--   * qa.reseq_day()             — renumbers one inspector's day 1..n by time, so `sequence` always matches the board
--   * qa.schedule_audit()        — the drop handler: assign/redispatch + pin the time + resequence + log
--   * qa.assign_audits()         — re-declared from qa-05c with ONE edit: it resequences the inspector's day too
--   * qa.unassign_audits()       — re-declared from qa-05-phase-c.sql §6 with ONE edit: the update also clears scheduled_time
-- The column, reseq_day, schedule_audit and unassign_audits are folded into qa-05-phase-c.sql (§1, §6, §7, §11) so a
-- fresh run matches. assign_audits is NOT: qa-05-phase-c.sql never declares it (it lives in qa-04 + qa-05c and is
-- only granted there), so THIS file is its last word — run qa-05f AFTER qa-05c, never the other way round.
set search_path = qa, public;

-- ---------- 1. column ----------
alter table qa.audits add column if not exists scheduled_time time;

-- ---------- 2. day resequencer ----------
-- The board's contract: within one inspector-day, `sequence` is 1..n in scheduled_time order (untimed rows last).
-- Called from qa.schedule_audit for BOTH the lane an audit lands on and the lane it left, so neither keeps a gap.
create or replace function qa.reseq_day(p_inspector text, p_date date) returns void
language plpgsql security definer set search_path = qa, public, pg_temp as $$
begin
  if p_inspector is null or p_date is null then return; end if;
  update qa.audits a set sequence = s.rn
    from (select id, row_number() over (order by scheduled_time nulls last, sequence, id) rn
            from qa.audits
           where assigned_to = p_inspector and scheduled_date = p_date and deleted_at is null
             and status in ('assigned','in_progress','done')) s
   where a.id = s.id and a.sequence is distinct from s.rn;
end $$;

-- ---------- 3. assign_audits also resequences the inspector's day ----------
-- Verbatim copy of qa-05c-redispatch.sql; the ONLY edit is the `perform qa.reseq_day(...)` line before `return v_n;`.
-- Without it a plain Queue-tab assign (start sequence 1,2,3…) overwrites the numbering the board pinned by time:
-- a visit already scheduled for 08:00 could end up #3 behind two untimed rows. With it, timed rows always come
-- first in clock order and untimed rows keep the head's manual order after them.
create or replace function qa.assign_audits(p_ids text[], p_inspector text, p_date date, p_start_seq int default 1) returns int
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare v_n int := 0; v_id text; v_seq int := coalesce(p_start_seq, 1); a qa.audits; v_prev text;
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  if not exists (select 1 from public.technicians where username = p_inspector and role = 'qa_inspector') then
    raise exception 'Not a QA inspector account: %', p_inspector; end if;
  foreach v_id in array p_ids loop
    select assigned_to into v_prev from qa.audits where id = v_id for update;
    update qa.audits set status = case when assigned_to = p_inspector and status = 'in_progress' then 'in_progress' else 'assigned' end,
           assigned_to = p_inspector, assigned_by = qa.actor(), assigned_at = now(),
           scheduled_date = p_date, sequence = v_seq,
           started_at = case when assigned_to = p_inspector then started_at end,
           inspector = case when assigned_to = p_inspector then inspector end
     where id = v_id and deleted_at is null and status in ('pool','queued','assigned','in_progress') returning * into a;
    if found then
      perform qa.sync_job(a);
      if v_prev is not null and v_prev <> p_inspector then perform qa.log(v_id, 'reassigned', jsonb_build_object('from', v_prev, 'to', p_inspector, 'date', p_date, 'seq', v_seq));
      else perform qa.log(v_id, 'assigned', jsonb_build_object('to', p_inspector, 'date', p_date, 'seq', v_seq)); end if;
      v_n := v_n + 1; v_seq := v_seq + 1;
    end if;
  end loop;
  perform qa.reseq_day(p_inspector, p_date);
  return v_n;
end $$;

-- ---------- 4. schedule_audit: the drag-and-drop drop handler ----------
-- assign_audits (§3 above) already does the status / redispatch / sync_job / log / reseq work — this only adds the clock time.
create or replace function qa.schedule_audit(p_id text, p_inspector text, p_date date, p_time time) returns qa.audits
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare a qa.audits; v_prev_insp text; v_prev_date date;
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  if not exists (select 1 from public.technicians where username = p_inspector and role = 'qa_inspector') then
    raise exception 'Not a QA inspector account: %', p_inspector; end if;
  select assigned_to, scheduled_date into v_prev_insp, v_prev_date
    from qa.audits where id = p_id and deleted_at is null and status in ('pool','queued','assigned','in_progress') for update;
  if not found then raise exception 'Audit % cannot be scheduled', p_id; end if;
  perform qa.assign_audits(array[p_id], p_inspector, p_date, 1);
  update qa.audits set scheduled_time = p_time where id = p_id;
  perform qa.reseq_day(p_inspector, p_date);
  if v_prev_insp is not null and (v_prev_insp is distinct from p_inspector or v_prev_date is distinct from p_date) then
    perform qa.reseq_day(v_prev_insp, v_prev_date);
  end if;
  select * into a from qa.audits where id = p_id;
  perform qa.log(p_id, 'scheduled', jsonb_build_object('to', p_inspector, 'date', p_date, 'time', p_time));
  return a;
end $$;

-- ---------- 5. unassign also drops the clock time ----------
-- Verbatim copy of qa-05-phase-c.sql §6; the ONLY edit is `scheduled_time = null` in the update below.
create or replace function qa.unassign_audits(p_ids text[]) returns int
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare v_n int := 0; v_id text; a qa.audits; r qa.rectifications;
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  foreach v_id in array p_ids loop
    update qa.audits set status = 'queued', assigned_to = null, assigned_by = null, assigned_at = null, scheduled_date = null, scheduled_time = null, sequence = null, started_at = null
     where id = v_id and deleted_at is null and status in ('assigned','in_progress') returning * into a;
    if found then
      if a.source = 'reinspection' and a.rectification_id is not null then
        update qa.audits set deleted_at = now(), deleted_by = qa.actor() where id = a.id;            -- a released re-inspection visit is retired, not queued
        update qa.rectifications set status = 'FOR RECTIFICATION' where id = a.rectification_id and status = 'FOR RE-INSPECTION' returning * into r;
        if r.id is not null then perform qa.sync_job_rect(r); end if;
      else
        perform qa.sync_job(a);
      end if;
      perform qa.log(v_id, 'unassigned', null); v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- ---------- 6. grants ----------
grant execute on function qa.schedule_audit(text,text,date,time), qa.unassign_audits(text[]) to authenticated;
grant execute on function qa.assign_audits(text[],text,date,int) to authenticated;
-- create or replace RE-GRANTS execute to PUBLIC on a function Postgres just (re)created, so lock the new
-- definitions down again — only `authenticated` (and then only past the qa.is_head() guard) may call them.
revoke execute on function qa.schedule_audit(text,text,date,time) from public, anon;
revoke execute on function qa.assign_audits(text[],text,date,int) from public, anon;
revoke execute on function qa.unassign_audits(text[]) from public, anon;
-- qa.reseq_day is called only from INSIDE qa.schedule_audit (already head-guarded), so nobody else may call it.
-- Postgres grants EXECUTE to PUBLIC on a freshly created function, and qa-05-phase-c.sql §11's blanket revoke
-- does NOT run when this file is applied on its own — so revoke it here explicitly.
revoke execute on function qa.reseq_day(text,date) from public, anon, authenticated;
notify pgrst, 'reload schema';
