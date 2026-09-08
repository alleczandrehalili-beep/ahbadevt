-- QA Audit module — functions & triggers (2026-09-08). Additive. Run AFTER qa-01..03.
set search_path = qa, public;

create or replace function qa.actor() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(nullif(public.my_team(), ''), 'SYSTEM')
$$;

create or replace function qa.next_audit_id() returns text
language sql volatile security definer set search_path = qa, pg_temp as $$
  select 'QA-' || to_char(now() at time zone 'Asia/Manila', 'YYYY') || '-' || lpad(nextval('qa.audit_seq')::text, 6, '0')
$$;

create or replace function qa.log(p_audit text, p_action text, p_detail jsonb default null) returns void
language sql volatile security definer set search_path = qa, public, pg_temp as $$
  insert into qa.audit_log(audit_id, by, action, detail) values (p_audit, qa.actor(), p_action, p_detail)
$$;

-- audit_log is append-only: no UPDATE / DELETE ever (same principle as the jobs.history guard).
create or replace function qa.guard_log() returns trigger language plpgsql security definer set search_path = qa, pg_temp as $$
begin raise exception 'qa.audit_log is append-only'; end $$;
drop trigger if exists qa_log_guard on qa.audit_log;
create trigger qa_log_guard before update or delete on qa.audit_log for each row execute function qa.guard_log();
drop trigger if exists qa_log_guard_trunc on qa.audit_log;
create trigger qa_log_guard_trunc before truncate on qa.audit_log for each statement execute function qa.guard_log();

create or replace function qa.setting(p_key text) returns text
language sql stable security definer set search_path = qa, pg_temp as $$
  select value from qa.settings where key = p_key
$$;

-- Mirror the audit's QA state onto the JO (additive jobs.qa_* columns).
create or replace function qa.sync_job(p_audit qa.audits) returns void
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare v_status text;
begin
  if p_audit.job_id is null then return; end if;
  v_status := case p_audit.status when 'done' then coalesce(p_audit.visit_status, 'VISITED')
                                  when 'assigned' then 'ASSIGNED' when 'in_progress' then 'ASSIGNED'
                                  else 'FOR VISIT' end;
  update public.jobs set qa_audit_id = p_audit.id, qa_status = v_status,
         qa_assessment = case when p_audit.status = 'done' then p_audit.assessment end,
         qa_inspected_at = case when p_audit.status = 'done' then p_audit.inspected_at end
   where id = p_audit.job_id;
end $$;

-- Find the FieldOps JO for a jo_no / acct_no pair (not soft-deleted). Prefer the JO number.
create or replace function qa.find_job(p_jo text, p_acct text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.jobs
   where deleted_at is null
     and ((p_jo is not null and upper(job_order_no) = upper(p_jo))
       or (p_acct is not null and ibass_acct_no = p_acct))
   order by (upper(job_order_no) = upper(p_jo)) desc nulls last, updated_at desc
   limit 1
$$;

-- Initial status rule (mirrors QaCore.initialStatus): before cutoff → pool; subcon/all → queued; inhouse/sample → pool; unmapped → queued.
create or replace function qa.initial_status(p_closed date, p_contractor qa.contractors) returns text
language sql stable security definer set search_path = qa, pg_temp as $$
  select case when p_closed is not null and p_closed < coalesce(nullif(qa.setting('initial_cutoff'),'')::date, '1900-01-01'::date) then 'pool'
              when p_contractor.sheet_name is null then 'queued'
              when p_contractor.kind = 'subcon' or p_contractor.coverage = 'all' then 'queued'
              else 'pool' end
$$;

-- ---------- ingest: sheet rows → audits ----------
create or replace function qa.ingest_sheet_rows() returns int
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare r record; c qa.contractors; v_id text; v_job text; v_status text; v_lat double precision; v_lng double precision;
        v_legacy boolean; v_n int := 0; a qa.audits; v_parts text[];
begin
  -- Gate: QA Head console user, a service-role call (Edge Function), or a direct admin session (SQL editor). NULL-safe by construction.
  if not (qa.is_head()
          or session_user in ('postgres', 'supabase_admin', 'service_role')
          or coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
                      '') = 'service_role') then
    raise exception 'QA Head or service role only';
  end if;
  -- a sheet row is still pending while no audit carries its JONO *with* a sheet link (audits made by FieldOps first must still be linked + blank-filled)
  -- bounded per call (statement timeout): the Edge Function / next sync keeps calling until a call returns fewer than 300
  for r in select s.* from qa.sheet_rows s
            where not exists (select 1 from qa.audits ex where ex.jo_no = s.jo_no and ex.deleted_at is null and ex.sheet_row_jo is not null)
            order by s.jo_date_closed nulls last, s.jo_no
            limit 300 loop
    select * into c from qa.contractors where sheet_name = r.comp;
    -- an existing audit with the same JONO but no sheet link, else a FieldOps-sourced audit matched by acct_no → link + fill blanks only
    select * into a from qa.audits where deleted_at is null and jo_no = r.jo_no and sheet_row_jo is null limit 1;
    if a.id is null then
      select * into a from qa.audits
       where deleted_at is null and source = 'fieldops' and jo_no is null and acct_no is not null and acct_no = r.acct_no
       order by abs(coalesce(jo_date_closed, r.jo_date_closed, current_date) - coalesce(r.jo_date_closed, current_date)) asc, created_at desc
       limit 1;
    end if;
    if a.id is not null then
      update qa.audits set jo_no = coalesce(jo_no, r.jo_no), sheet_row_jo = r.jo_no,
             acct_no = coalesce(acct_no, r.acct_no), tran_type = coalesce(tran_type, r.tran_type),
             contractor_name = coalesce(contractor_name, r.comp), kind = coalesce(kind, c.kind), contractor_org_id = coalesce(contractor_org_id, c.org_id), unmapped = case when contractor_name is null then (r.comp is not null and c.sheet_name is null) else unmapped end,
             nap_code = coalesce(nap_code, r.nap_code), port_no = coalesce(port_no, r.port_no), serial_no = coalesce(serial_no, r.serial_no),
             installers_text = coalesce(installers_text, nullif(concat_ws(' / ', r.driver, r.tech, r.tech2), '')),
             jo_date_closed = coalesce(jo_date_closed, r.jo_date_closed), sheet_latlong = coalesce(sheet_latlong, r.sheet_latlong),
             subscriber = coalesce(subscriber, r.subscriber_name), mobile_no = coalesce(mobile_no, r.mobile_no), address = coalesce(address, r.complete_address), barangay = coalesce(barangay, r.barangay)
       where id = a.id;
      perform qa.log(a.id, 'sheet_linked', jsonb_build_object('jo_no', r.jo_no));
      continue;
    end if;
    v_legacy := r.sheet_visited in ('VISITED','VISITED / NPA','UNLOCATED','NOT EXIST','H.CLOSED','GOOD') or r.sheet_assessment is not null or r.sheet_date_qa is not null;
    v_status := case when v_legacy then 'done' else qa.initial_status(r.jo_date_closed, c) end;
    v_job := qa.find_job(r.jo_no, r.acct_no);
    v_lat := null; v_lng := null;
    if r.sheet_latlong ~ '^\s*-?\d+(\.\d+)?[,\s]+-?\d+(\.\d+)?\s*$' then
      v_parts := regexp_split_to_array(trim(r.sheet_latlong), '[,\s]+');
      v_lat := v_parts[1]::double precision; v_lng := v_parts[2]::double precision;
    end if;
    v_id := qa.next_audit_id();
    insert into qa.audits(id, source, job_id, jo_no, acct_no, sheet_row_jo, contractor_name, contractor_org_id, kind, unmapped,
      subscriber, mobile_no, address, barangay, nap_code, port_no, serial_no, tran_type, jo_date_closed, installers_text, sheet_latlong,
      status, inspected_at, lat, lng, inspector, visit_status, qa_gc, wire, assessment, remarks)
    values (v_id, case when v_legacy then 'sheet_legacy' else 'sheet' end, v_job, r.jo_no, r.acct_no, r.jo_no, r.comp, c.org_id, c.kind, (c.sheet_name is null),
      r.subscriber_name, r.mobile_no, r.complete_address, r.barangay, r.nap_code, r.port_no, r.serial_no, r.tran_type, r.jo_date_closed,
      nullif(concat_ws(' / ', r.driver, r.tech, r.tech2), ''), r.sheet_latlong,
      v_status,
      case when v_legacy then coalesce(r.sheet_date_qa::timestamptz, now()) end, v_lat, v_lng,
      case when v_legacy then r.sheet_inspected_by end,
      case when v_legacy then (case when r.sheet_visited in ('VISITED','VISITED / NPA','UNLOCATED','NOT EXIST','H.CLOSED') then r.sheet_visited else 'VISITED' end) end,
      case when v_legacy and r.sheet_qa_gc in ('COMPLETED','INCOMPLETE','NONE') then r.sheet_qa_gc end,
      case when v_legacy and r.sheet_wire in ('STANDARD','EXISTING','SUBSTANDARD') then r.sheet_wire end,
      case when v_legacy and r.sheet_assessment in ('GOOD','FOR RECTIFY','FOR PENALTY','CLAWBACK','RECTIFIED') then r.sheet_assessment end,
      case when v_legacy then nullif(concat_ws(' · ', r.sheet_others, r.sheet_remarks), '') end)
    returning * into a;
    perform qa.sync_job(a);
    perform qa.log(v_id, case when v_legacy then 'imported_legacy' else 'created' end, jsonb_build_object('source','sheet','status',v_status,'comp',r.comp));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------- FieldOps trigger: JO completed → audit (if none yet) ----------
create or replace function qa.on_job_completed() returns trigger
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare c qa.contractors; v_id text; v_status text; v_code text; a qa.audits;
begin
  if new.status = 'completed' and (TG_OP = 'INSERT' or old.status is distinct from 'completed') then
    begin
      if exists (select 1 from qa.audits where deleted_at is null and (job_id = new.id
                 or (new.job_order_no is not null and upper(jo_no) = upper(new.job_order_no))
                 or (new.ibass_acct_no is not null and acct_no = new.ibass_acct_no))) then
        return new;
      end if;
      select * into c from qa.contractors where org_id = coalesce(new.assigned_org_id, new.org_id) and active limit 1;
      if c.sheet_name is null then
        select o.code into v_code from public.orgs o where o.id = coalesce(new.assigned_org_id, new.org_id);
        if v_code = 'AHBA' then select * into c from qa.contractors where sheet_name = 'AHBA'; end if;
      end if;
      v_status := qa.initial_status(coalesce((new.completed_at at time zone 'Asia/Manila')::date, (now() at time zone 'Asia/Manila')::date), c);
      v_id := qa.next_audit_id();
      insert into qa.audits(id, source, job_id, jo_no, acct_no, contractor_name, contractor_org_id, kind, unmapped,
        subscriber, mobile_no, address, barangay, jo_date_closed, installers_text, status)
      values (v_id, 'fieldops', new.id, nullif(upper(new.job_order_no), ''), nullif(new.ibass_acct_no, ''),
        coalesce(c.sheet_name, (select code from public.orgs where id = coalesce(new.assigned_org_id, new.org_id))), coalesce(new.assigned_org_id, new.org_id), c.kind, (c.sheet_name is null),
        new.subscriber, coalesce(nullif(new.primary_no, ''), new.other_contact_no), new.address, coalesce(nullif(new.brgy, ''), new.area),
        coalesce((new.completed_at at time zone 'Asia/Manila')::date, (now() at time zone 'Asia/Manila')::date),
        nullif(concat_ws(' / ', new.crew_driver, new.crew_tech1, new.crew_tech2), ''), v_status)
      returning * into a;
      perform qa.sync_job(a);
      perform qa.log(v_id, 'created', jsonb_build_object('source','fieldops','status',v_status));
    exception when others then
      -- a JO completion must NEVER fail because of QA
      raise warning 'qa.on_job_completed skipped for %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end $$;
drop trigger if exists qa_on_job_completed on public.jobs;
create trigger qa_on_job_completed after insert or update of status on public.jobs
  for each row execute function qa.on_job_completed();

-- ---------- QA Head actions ----------
create or replace function qa.assign_audits(p_ids text[], p_inspector text, p_date date, p_start_seq int default 1) returns int
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare v_n int := 0; v_id text; v_seq int := coalesce(p_start_seq, 1); a qa.audits;
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  if not exists (select 1 from public.technicians where username = p_inspector and role = 'qa_inspector') then
    raise exception 'Not a QA inspector account: %', p_inspector; end if;
  foreach v_id in array p_ids loop
    update qa.audits set status = 'assigned', assigned_to = p_inspector, assigned_by = qa.actor(), assigned_at = now(),
           scheduled_date = p_date, sequence = v_seq
     where id = v_id and deleted_at is null and status in ('pool','queued','assigned') returning * into a;
    if found then
      perform qa.sync_job(a);
      perform qa.log(v_id, 'assigned', jsonb_build_object('to', p_inspector, 'date', p_date, 'seq', v_seq));
      v_n := v_n + 1; v_seq := v_seq + 1;
    end if;
  end loop;
  return v_n;
end $$;

create or replace function qa.unassign_audits(p_ids text[]) returns int
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare v_n int := 0; v_id text; a qa.audits;
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  foreach v_id in array p_ids loop
    update qa.audits set status = 'queued', assigned_to = null, assigned_by = null, assigned_at = null, scheduled_date = null, sequence = null
     where id = v_id and deleted_at is null and status = 'assigned' returning * into a;
    if found then perform qa.sync_job(a); perform qa.log(v_id, 'unassigned', null); v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;

create or replace function qa.queue_pool(p_ids text[]) returns int
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare v_n int := 0; v_id text;
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  foreach v_id in array p_ids loop
    update qa.audits set status = 'queued' where id = v_id and deleted_at is null and status = 'pool';
    if found then perform qa.log(v_id, 'queued_manual', null); v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;

-- Random sample of in-house pool rows closed in [p_from, p_to] → queued. ceil(pool * pct / 100).
create or replace function qa.sample_inhouse(p_from date, p_to date, p_pct numeric) returns int
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare v_total int; v_take int; v_n int := 0; r record;
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  select count(*) into v_total from qa.audits where deleted_at is null and status = 'pool' and kind = 'inhouse' and jo_date_closed between p_from and p_to;
  v_take := ceil(v_total * coalesce(p_pct, 0) / 100.0);
  for r in select id from qa.audits where deleted_at is null and status = 'pool' and kind = 'inhouse' and jo_date_closed between p_from and p_to
           order by random() limit v_take loop
    update qa.audits set status = 'queued' where id = r.id;
    perform qa.log(r.id, 'queued_sample', jsonb_build_object('pct', p_pct, 'from', p_from, 'to', p_to));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function qa.reopen_audit(p_id text, p_reason text) returns qa.audits
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare a qa.audits;
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  update qa.audits set status = 'in_progress', reopened_count = reopened_count + 1, submit_key = null
   where id = p_id and deleted_at is null and status = 'done' and assigned_to is not null returning * into a;
  if not found then raise exception 'Audit % is not done or has no inspector', p_id; end if;
  perform qa.sync_job(a);
  perform qa.log(p_id, 'reopened', jsonb_build_object('reason', p_reason));
  return a;
end $$;

-- ---------- inspector actions ----------
create or replace function qa.start_audit(p_id text, p_lat double precision default null, p_lng double precision default null) returns qa.audits
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare a qa.audits;
begin
  update qa.audits set status = 'in_progress', started_at = coalesce(started_at, now()), lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng),
         inspector = coalesce(inspector, qa.actor())
   where id = p_id and deleted_at is null and status in ('assigned','in_progress')
     and (qa.is_head() or assigned_to = qa.actor()) returning * into a;
  if not found then raise exception 'Audit % cannot be started by %', p_id, qa.actor(); end if;
  perform qa.sync_job(a);
  if a.started_at >= now() - interval '2 seconds' then perform qa.log(p_id, 'started', jsonb_build_object('lat', p_lat, 'lng', p_lng)); end if;
  return a;
end $$;

-- Transactional + idempotent submit. p_payload shape = QaApi.submitAudit payload (see plan header).
create or replace function qa.submit_audit(p_id text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare a qa.audits; v_key text := p_payload->>'submit_key'; it jsonb; v_visit text := p_payload->>'visit_status';
        v_fails int := 0; v_missing int; v_count int := 0; v_pen numeric := 0; c qa.violation_codes; v_p numeric;
begin
  if v_key is null or v_key = '' then raise exception 'submit_key required'; end if;
  select * into a from qa.audits where id = p_id and deleted_at is null for update;
  if a.id is null then raise exception 'Audit % not found', p_id; end if;
  if a.status = 'done' and a.submit_key = v_key then
    return jsonb_build_object('ok', true, 'audit', to_jsonb(a), 'duplicate', true);      -- idempotent replay
  end if;
  if a.status not in ('assigned','in_progress') then raise exception 'Audit % is % — not submittable', p_id, a.status; end if;
  if not (qa.is_head() or coalesce(a.assigned_to, '') = qa.actor()) then raise exception 'Audit % is not assigned to %', p_id, qa.actor(); end if;
  if coalesce(v_visit, '') not in ('VISITED','VISITED / NPA','UNLOCATED','NOT EXIST','H.CLOSED') then raise exception 'visit_status required'; end if;

  delete from qa.audit_items where audit_id = p_id;          -- re-submission after reopen replaces the result set (log keeps history)
  delete from qa.audit_violations where audit_id = p_id;
  delete from qa.audit_photos where audit_id = p_id;          -- a submission fully defines its photo set

  for it in select * from jsonb_array_elements(coalesce(p_payload->'photos','[]'::jsonb)) loop
    insert into qa.audit_photos(audit_id, item_id, path, label) values (p_id, (it->>'item_id')::bigint, it->>'path', it->>'label')
      on conflict (path) do update set audit_id = excluded.audit_id, item_id = excluded.item_id, label = excluded.label;
  end loop;

  if v_visit = 'VISITED' then
    for it in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
      if coalesce(it->>'result', '') not in ('pass','fail','na') then raise exception 'Invalid item result %', it->>'result'; end if;
      insert into qa.audit_items(audit_id, item_id, result, remark) values (p_id, (it->>'item_id')::bigint, it->>'result', it->>'remark');
      if it->>'result' = 'fail' then v_fails := v_fails + 1; end if;
    end loop;
    select count(*) into v_missing from qa.checklist_items ci
     where ci.active and not exists (select 1 from qa.audit_items ai where ai.audit_id = p_id and ai.item_id = ci.id);
    if v_missing > 0 then raise exception '% active checklist item(s) not answered', v_missing; end if;
    if v_fails > 0 and p_payload->>'assessment' = 'GOOD' then raise exception 'Assessment cannot be GOOD with failed items'; end if;
    if coalesce(p_payload->>'assessment', '') not in ('GOOD','FOR RECTIFY','FOR PENALTY','CLAWBACK') then raise exception 'assessment required'; end if;
    if coalesce(p_payload->>'wire', '') not in ('STANDARD','EXISTING','SUBSTANDARD') then raise exception 'wire required'; end if;
    if coalesce(p_payload->>'qa_gc', '') not in ('COMPLETED','INCOMPLETE','NONE') then raise exception 'qa_gc required'; end if;
    if coalesce(p_payload->>'subscriber_signed_name', '') = '' then raise exception 'Subscriber name required'; end if;
    if coalesce(p_payload->>'subscriber_signature_path','') = '' or coalesce(p_payload->>'inspector_signature_path','') = '' then raise exception 'Both signatures are required'; end if;
    for it in select * from jsonb_array_elements(coalesce(p_payload->'violations','[]'::jsonb)) loop
      select * into c from qa.violation_codes where code = it->>'code';
      if c.code is null then raise exception 'Unknown violation code %', it->>'code'; end if;
      v_p := coalesce((it->>'penalty_amount')::numeric, c.penalty_l1);
      insert into qa.audit_violations(audit_id, code, item_id, description, category, class, severity, offense_no, penalty_amount, photo_path, remark)
      values (p_id, c.code, (it->>'item_id')::bigint, coalesce(nullif(it->>'description',''), c.description), c.category, c.class, c.severity,
              (it->>'offense_no')::int, v_p, it->>'photo_path', it->>'remark');
      v_count := v_count + 1; v_pen := v_pen + coalesce(v_p, 0);
    end loop;
    if v_fails > 0 and v_count = 0 then raise exception 'Failed items need at least one violation'; end if;
  else
    if not exists (select 1 from qa.audit_photos where audit_id = p_id) then raise exception 'A location photo is required'; end if;
    if coalesce(p_payload->>'remarks','') = '' then raise exception 'Remarks are required'; end if;
  end if;

  update qa.audits set status = 'done', inspected_at = now(), submit_key = v_key,
    lat = coalesce((p_payload->>'lat')::double precision, lat), lng = coalesce((p_payload->>'lng')::double precision, lng),
    inspector = coalesce(inspector, qa.actor()), visit_status = v_visit,
    contractor_rep = p_payload->>'contractor_rep', installers_text = coalesce(nullif(p_payload->>'installers_text',''), installers_text),
    wire = case when v_visit = 'VISITED' then nullif(p_payload->>'wire','') end,
    qa_gc = case when v_visit = 'VISITED' then nullif(p_payload->>'qa_gc','') end,
    assessment = case when v_visit = 'VISITED' then nullif(p_payload->>'assessment','') end,
    found_business = case when v_visit = 'VISITED' then nullif(p_payload->>'found_business','') end,
    old_plan = case when v_visit = 'VISITED' then nullif(p_payload->>'old_plan','') end,
    new_plan = case when v_visit = 'VISITED' then nullif(p_payload->>'new_plan','') end,
    remarks = p_payload->>'remarks', subscriber_signed_name = p_payload->>'subscriber_signed_name',
    subscriber_signature_path = p_payload->>'subscriber_signature_path', inspector_signature_path = p_payload->>'inspector_signature_path',
    total_violations = v_count, total_penalty = v_pen
   where id = p_id returning * into a;
  perform qa.sync_job(a);
  perform qa.log(p_id, 'submitted', jsonb_build_object('visit', v_visit, 'assessment', a.assessment, 'violations', v_count, 'penalty', v_pen));
  return jsonb_build_object('ok', true, 'audit', to_jsonb(a));
end $$;

-- ---------- reports / status ----------
create or replace function qa.weekly_report(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = qa, public, pg_temp as $$
  with d as (select * from qa.audits where deleted_at is null and status = 'done' and (inspected_at at time zone 'Asia/Manila')::date between p_from and p_to),
  closed as (select comp, count(*)::int as n from qa.sheet_rows where jo_date_closed between p_from and p_to group by comp),
  con as (
    select contractor_name, count(*)::int as inspected,
      (count(*) filter (where assessment = 'GOOD'))::int as good, (count(*) filter (where assessment = 'FOR RECTIFY'))::int as rectify,
      (count(*) filter (where assessment = 'FOR PENALTY'))::int as penalty_n, (count(*) filter (where assessment = 'CLAWBACK'))::int as clawback,
      (count(*) filter (where visit_status <> 'VISITED'))::int as npa, coalesce(sum(total_penalty), 0) as penalty
    from d group by contractor_name),
  items as (
    select i.item_id, ci.label, ci.sort_order, (count(*) filter (where i.result = 'pass'))::int as pass,
      (count(*) filter (where i.result = 'fail'))::int as fail, (count(*) filter (where i.result = 'na'))::int as na
    from qa.audit_items i join d on d.id = i.audit_id join qa.checklist_items ci on ci.id = i.item_id group by i.item_id, ci.label, ci.sort_order),
  codes as (select v.code, v.category, count(*)::int as n from qa.audit_violations v join d on d.id = v.audit_id group by v.code, v.category),
  insp as (select coalesce(inspector, '—') as inspector, count(*)::int as n, (count(*) filter (where visit_status <> 'VISITED'))::int as npa from d group by inspector),
  cov as (select c.comp, c.n as closed, (select count(*)::int from d where d.contractor_name = c.comp) as inspected from closed c)
  select jsonb_build_object(
    'contractors', coalesce((select jsonb_agg(jsonb_build_object('contractor', contractor_name, 'inspected', inspected, 'GOOD', good, 'FOR RECTIFY', rectify,
        'FOR PENALTY', penalty_n, 'CLAWBACK', clawback, 'npa', npa, 'penalty', penalty,
        'closed', coalesce((select n from closed where closed.comp = con.contractor_name), 0)) order by inspected desc) from con), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('item_id', item_id, 'label', label, 'pass', pass, 'fail', fail, 'na', na,
        'pass_rate', case when pass + fail = 0 then null else round(100.0 * pass / (pass + fail)) end) order by sort_order) from items), '[]'::jsonb),
    'codes', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'category', category, 'count', n) order by n desc) from codes), '[]'::jsonb),
    'inspectors', coalesce((select jsonb_agg(jsonb_build_object('inspector', inspector, 'inspections', n, 'npa', npa)) from insp), '[]'::jsonb),
    'coverage', coalesce((select jsonb_agg(jsonb_build_object('contractor', comp, 'closed', closed, 'inspected', inspected,
        'pct', round(100.0 * inspected / nullif(closed, 0)))) from cov), '[]'::jsonb))
$$;

create or replace function qa.sync_status() returns jsonb
language sql stable security definer set search_path = qa, pg_temp as $$
  select jsonb_build_object('last_sync_at', qa.setting('last_sync_at'), 'last_sync_rows', qa.setting('last_sync_rows'),
    'unmapped', coalesce((select jsonb_agg(distinct contractor_name) from qa.audits where unmapped and deleted_at is null and contractor_name is not null), '[]'::jsonb))
$$;

-- Internal helpers (log, sync_job, setting, next_audit_id, find_job, initial_status, actor, guard_log, touch) must NOT be callable as RPCs.
-- NOTE: this also narrows service_role to ingest_sheet_rows(); grant others to service_role explicitly if a cron/Edge Function ever needs them.
revoke execute on all functions in schema qa from public, anon, authenticated;
grant execute on function qa.is_head(), qa.is_inspector() to authenticated;
grant execute on function qa.ingest_sheet_rows(), qa.assign_audits(text[],text,date,int), qa.unassign_audits(text[]), qa.queue_pool(text[]),
  qa.sample_inhouse(date,date,numeric), qa.reopen_audit(text,text), qa.start_audit(text,double precision,double precision),
  qa.submit_audit(text,jsonb), qa.weekly_report(date,date), qa.sync_status() to authenticated;
grant execute on function qa.ingest_sheet_rows() to service_role;
notify pgrst, 'reload schema';