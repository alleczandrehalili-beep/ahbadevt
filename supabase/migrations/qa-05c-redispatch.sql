-- QA Phase C addendum: redispatch. qa.assign_audits also accepts in_progress tickets (pulled out of one inspector, handed to another).
set search_path = qa, public;
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
  return v_n;
end $$;
grant execute on function qa.assign_audits(text[],text,date,int) to authenticated;
