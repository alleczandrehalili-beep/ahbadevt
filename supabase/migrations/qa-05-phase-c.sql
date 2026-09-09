-- QA Audit Phase C (2026-09-09). ADDITIVE. Run AFTER qa-01..04 (+ the two live patches: ingest limit, unassign in_progress).
-- Spec: docs/superpowers/specs/2026-09-09-qa-phase-c-design.md. Apply in chunks in the SQL editor.
set search_path = qa, public;

-- ---------- 1. schema ----------
create sequence if not exists qa.rect_seq;
create table if not exists qa.rectifications (
  id text primary key,
  audit_id text not null references qa.audits(id),
  last_audit_id text not null references qa.audits(id),
  job_id text references public.jobs(id),
  jo_no text, acct_no text,
  contractor_name text, contractor_org_id uuid references public.orgs(id),
  subscriber text, address text, barangay text,
  status text not null default 'FOR RECTIFICATION' check (status in ('FOR RECTIFICATION','FOR RE-INSPECTION','RECTIFIED','CLOSED')),
  deadline date not null,
  cycle int not null default 1,
  opened_at timestamptz not null default now(),
  rectified_at timestamptz, closed_by text, closed_at timestamptz, close_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, deleted_by text
);
create index if not exists rect_status_deadline_idx on qa.rectifications(status, deadline) where deleted_at is null;
create index if not exists rect_org_status_idx on qa.rectifications(contractor_org_id, status) where deleted_at is null;
create index if not exists rect_audit_idx on qa.rectifications(audit_id);

create table if not exists qa.notices (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs(id),
  rectification_id text not null references qa.rectifications(id),
  kind text not null check (kind in ('opened','deadline','reinspect','rectified','closed')),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index if not exists notices_org_unseen_idx on qa.notices(org_id) where seen_at is null;

alter table qa.audits add column if not exists rectification_id text references qa.rectifications(id);
alter table qa.audits add column if not exists reinspection_of text references qa.audits(id);
alter table qa.audits drop constraint if exists audits_source_check;
alter table qa.audits add constraint audits_source_check check (source in ('sheet','fieldops','sheet_legacy','manual','reinspection'));
create index if not exists audits_rect_idx on qa.audits(rectification_id) where rectification_id is not null;
-- a re-inspection copies the original JO number, so the Phase A partial unique index (qa-01) must ignore those rows
drop index if exists qa.audits_jo_no_uidx;
create unique index audits_jo_no_uidx on qa.audits(jo_no) where jo_no is not null and deleted_at is null and source <> 'reinspection';

alter table qa.audit_violations add column if not exists penalty_override numeric;
alter table qa.audit_violations add column if not exists override_by text;
alter table qa.audit_violations add column if not exists override_at timestamptz;
alter table qa.audit_violations add column if not exists override_reason text;
create index if not exists audit_violations_code_contractor_idx on qa.audit_violations(code, audit_id);

insert into qa.settings(key, value) values ('rect_default_days', '7') on conflict (key) do nothing;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'qa_touch_rectifications') then
    create trigger qa_touch_rectifications before update on qa.rectifications for each row execute function qa.touch_updated_at();
  end if;
end $$;

-- ---------- 2. helpers ----------
create or replace function qa.next_rect_id() returns text
language sql volatile security definer set search_path = qa, pg_temp as $$
  select 'RC-' || to_char(now() at time zone 'Asia/Manila', 'YYYY') || '-' || lpad(nextval('qa.rect_seq')::text, 6, '0')
$$;

-- RLS helpers (SECURITY DEFINER so policies never re-enter qa.audits' own RLS — see qa-05d)
create or replace function qa.prev_of_mine(p_audit_id text) returns boolean
language sql stable security definer set search_path = qa, public, pg_temp as $$
  select exists (select 1 from qa.audits n where n.reinspection_of = p_audit_id and n.assigned_to = public.my_team() and n.deleted_at is null)
$$;
create or replace function qa.rect_of_mine(p_rect_id text) returns boolean
language sql stable security definer set search_path = qa, public, pg_temp as $$
  select exists (select 1 from qa.audits a where a.rectification_id = p_rect_id and a.assigned_to = public.my_team() and a.deleted_at is null)
$$;

create or replace function qa.my_org() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select public.jwt_org_id()
$$;

-- prior distinct audits of the same contractor+code, done, not deleted, in the 12 months BEFORE p_asof, excluding p_exclude.
-- p_asof makes live scoring (default now()) and qa.recompute_offenses() use one rule; the 3-arg signature is replaced.
--
-- RULE DECISION (re-inspections and counting) — deliberately asymmetric, do not "fix" one to match the other:
--   * OFFENSE LEVELS count re-inspection violations. There is NO `source <> 'reinspection'` filter here: a violation
--     still found at re-inspection is a genuine repeat of the same code by the same contractor, so it escalates
--     L1 → L2 → L3 exactly like a violation found on a fresh inspection.
--   * THE MONTHLY SCORECARD counts ORIGINAL inspections only. qa.monthly_scorecard() filters
--     `a.source <> 'reinspection'` for its inspected / violations / penalty (and prev-month) figures, so a single
--     job that needed three visits is one inspection with one penalty total, not three — re-inspection outcomes
--     surface there through the rect_opened / rect_on_time / rect_late / rect_closed columns instead.
drop function if exists qa.offense_no(text, text, text);
create or replace function qa.offense_no(p_contractor text, p_code text, p_exclude text, p_asof timestamptz default now()) returns int
language sql stable security definer set search_path = qa, pg_temp as $$
  select 1 + count(distinct v.audit_id)::int
    from qa.audit_violations v join qa.audits a on a.id = v.audit_id
   where v.code = p_code and a.contractor_name = p_contractor and a.status = 'done' and a.deleted_at is null
     and a.source <> 'sheet_legacy' and a.inspected_at < p_asof and a.inspected_at >= p_asof - interval '12 months'
     and (p_exclude is null or v.audit_id <> p_exclude)
$$;

create or replace function qa.penalty_for_level(c qa.violation_codes, p_level int) returns numeric
language sql immutable as $$
  select case least(greatest(p_level, 1), 3) when 1 then c.penalty_l1 when 2 then c.penalty_l2 else c.penalty_l3 end
$$;

create or replace function qa.notify_org(p_org uuid, p_rect text, p_kind text) returns void
language sql volatile security definer set search_path = qa, pg_temp as $$
  insert into qa.notices(org_id, rectification_id, kind) select p_org, p_rect, p_kind where p_org is not null
$$;

-- JO mirror for rectification states (overrides the visit-status mirror while a loop is open/closed)
create or replace function qa.sync_job_rect(p_rect qa.rectifications) returns void
language plpgsql security definer set search_path = qa, public, pg_temp as $$
begin
  if p_rect.job_id is null then return; end if;
  update public.jobs set qa_audit_id = p_rect.last_audit_id,
         qa_status = case p_rect.status when 'CLOSED' then 'CLOSED BY HEAD' else p_rect.status end
   where id = p_rect.job_id;
end $$;

-- ---------- 3. sync_job: keep Phase A behaviour, but a done audit that belongs to a loop shows the loop state ----------
create or replace function qa.sync_job(p_audit qa.audits) returns void
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare v_status text; r qa.rectifications;
begin
  if p_audit.job_id is null then return; end if;
  v_status := case p_audit.status when 'done' then coalesce(p_audit.visit_status, 'VISITED')
                                  when 'assigned' then 'ASSIGNED' when 'in_progress' then 'ASSIGNED'
                                  else 'FOR VISIT' end;
  if p_audit.status = 'done' and p_audit.rectification_id is not null then
    select * into r from qa.rectifications where id = p_audit.rectification_id;
    if r.id is not null then v_status := case r.status when 'CLOSED' then 'CLOSED BY HEAD' else r.status end; end if;
  end if;
  update public.jobs set qa_audit_id = p_audit.id, qa_status = v_status,
         qa_assessment = case when p_audit.status = 'done' then p_audit.assessment end,
         qa_inspected_at = case when p_audit.status = 'done' then p_audit.inspected_at end
   where id = p_audit.job_id;
end $$;

-- ---------- 4. loop transitions after a submit ----------
create or replace function qa.after_submit_rect(a qa.audits, p_fails int) returns void
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare r qa.rectifications; v_days int := coalesce(nullif(qa.setting('rect_default_days'),'')::int, 7); v_id text; v_same boolean;
begin
  if a.visit_status <> 'VISITED' then return; end if;            -- NPA/unlocated never open or close a loop
  if a.rectification_id is null then
    if p_fails = 0 then return; end if;                           -- first inspection GOOD → nothing
    v_id := qa.next_rect_id();
    insert into qa.rectifications(id, audit_id, last_audit_id, job_id, jo_no, acct_no, contractor_name, contractor_org_id, subscriber, address, barangay, status, deadline, cycle)
    values (v_id, a.id, a.id, a.job_id, a.jo_no, a.acct_no, a.contractor_name, a.contractor_org_id, a.subscriber, a.address, a.barangay, 'FOR RECTIFICATION', (now() at time zone 'Asia/Manila')::date + v_days, 1)
    returning * into r;
    update qa.audits set rectification_id = v_id where id = a.id;
    perform qa.notify_org(r.contractor_org_id, r.id, 'opened');
    perform qa.log(a.id, 'rect_opened', jsonb_build_object('rect', r.id, 'deadline', r.deadline));
    perform qa.sync_job_rect(r);
    return;
  end if;
  -- ONLY a re-inspection visit advances the loop: a reopened original resubmitted later must not close or re-cycle it
  if a.source <> 'reinspection' then
    perform qa.log(a.id, 'rect_ignored_resubmit', jsonb_build_object('rect', a.rectification_id, 'fails', p_fails));
    return;
  end if;
  select * into r from qa.rectifications where id = a.rectification_id for update;
  if r.id is null then return; end if;
  -- CORRECTION OF A RECTIFIED OUTCOME: this very re-inspection rectified the loop, the head reopened it, and it now
  -- comes back WITH fails. Move the loop back to FOR RECTIFICATION in place — same cycle, same deadline, rectified_at
  -- cleared — instead of treating the resubmit as a late submit against a terminal loop. CLOSED stays terminal.
  if r.status = 'RECTIFIED' and r.last_audit_id = a.id and a.source = 'reinspection' and p_fails > 0 then
    update qa.rectifications set status = 'FOR RECTIFICATION', rectified_at = null where id = r.id returning * into r;
    perform qa.notify_org(r.contractor_org_id, r.id, 'opened');
    perform qa.log(a.id, 'rect_resubmit', jsonb_build_object('rect', r.id, 'cycle', r.cycle, 'deadline', r.deadline));
    perform qa.sync_job_rect(r);
    return;
  end if;
  if r.status in ('RECTIFIED','CLOSED') then
    perform qa.log(a.id, 'rect_ignored_late_submit', jsonb_build_object('rect', r.id, 'status', r.status, 'fails', p_fails));
    return;
  end if;
  -- this re-inspection already advanced the loop once (it was reopened and is being resubmitted):
  -- correct the outcome in place — do NOT burn a second cycle or push the deadline out again.
  v_same := (r.last_audit_id = a.id);
  if p_fails = 0 then
    update qa.rectifications set status = 'RECTIFIED', rectified_at = now(), last_audit_id = a.id where id = r.id returning * into r;
    perform qa.notify_org(r.contractor_org_id, r.id, 'rectified');
    perform qa.log(a.id, 'rect_rectified', jsonb_build_object('rect', r.id, 'cycle', r.cycle));
  else
    update qa.rectifications set status = 'FOR RECTIFICATION',
           cycle = case when v_same then cycle else cycle + 1 end, last_audit_id = a.id,
           deadline = case when v_same then deadline else (now() at time zone 'Asia/Manila')::date + v_days end
     where id = r.id returning * into r;
    -- v_same = the loop was ALREADY FOR RECTIFICATION because of this same audit; the subcon has that notice.
    -- Only a genuine new cycle earns a new 'opened' notice.
    if not v_same then perform qa.notify_org(r.contractor_org_id, r.id, 'opened'); end if;
    perform qa.log(a.id, case when v_same then 'rect_resubmit' else 'rect_cycle' end,
                   jsonb_build_object('rect', r.id, 'cycle', r.cycle, 'deadline', r.deadline));
  end if;
  perform qa.sync_job_rect(r);
end $$;

-- ---------- 5. submit_audit: offense levels + loop hook (body otherwise identical to the live Phase A version) ----------
create or replace function qa.submit_audit(p_id text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare a qa.audits; v_key text := p_payload->>'submit_key'; it jsonb; v_visit text := p_payload->>'visit_status';
        v_fails int := 0; v_missing int; v_count int := 0; v_pen numeric := 0; c qa.violation_codes; v_p numeric; v_off int;
begin
  if v_key is null or v_key = '' then raise exception 'submit_key required'; end if;
  select * into a from qa.audits where id = p_id and deleted_at is null for update;
  if a.id is null then raise exception 'Audit % not found', p_id; end if;
  if a.status = 'done' and a.submit_key = v_key then
    return jsonb_build_object('ok', true, 'audit', to_jsonb(a), 'duplicate', true);
  end if;
  if a.status not in ('assigned','in_progress') then raise exception 'Audit % is % — not submittable', p_id, a.status; end if;
  if not (qa.is_head() or coalesce(a.assigned_to, '') = qa.actor()) then raise exception 'Audit % is not assigned to %', p_id, qa.actor(); end if;
  if coalesce(v_visit, '') not in ('VISITED','VISITED / NPA','UNLOCATED','NOT EXIST','H.CLOSED') then raise exception 'visit_status required'; end if;

  delete from qa.audit_items where audit_id = p_id;
  delete from qa.audit_violations where audit_id = p_id;
  delete from qa.audit_photos where audit_id = p_id;

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
      v_off := qa.offense_no(a.contractor_name, c.code, p_id);            -- same value for every occurrence of the code in this audit
      v_p := qa.penalty_for_level(c, v_off);                                -- server-side only: a client-supplied penalty_amount is ignored
      insert into qa.audit_violations(audit_id, code, item_id, description, category, class, severity, offense_no, penalty_amount, photo_path, remark)
      values (p_id, c.code, (it->>'item_id')::bigint, coalesce(nullif(it->>'description',''), c.description), c.category, c.class, c.severity,
              v_off, v_p, it->>'photo_path', it->>'remark');
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
  perform qa.log(p_id, 'submitted', jsonb_build_object('visit', v_visit, 'assessment', a.assessment, 'violations', v_count, 'penalty', v_pen, 'fails', v_fails));
  perform qa.after_submit_rect(a, v_fails);
  select * into a from qa.audits where id = p_id;
  return jsonb_build_object('ok', true, 'audit', to_jsonb(a));
end $$;

-- ---------- 6. unassign: also releases a pending re-inspection back to FOR RECTIFICATION ----------
create or replace function qa.unassign_audits(p_ids text[]) returns int
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare v_n int := 0; v_id text; a qa.audits; r qa.rectifications;
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  foreach v_id in array p_ids loop
    update qa.audits set status = 'queued', assigned_to = null, assigned_by = null, assigned_at = null, scheduled_date = null, sequence = null, started_at = null
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

-- ---------- 7. QA Head RPCs ----------
create or replace function qa.set_rect_deadline(p_id text, p_date date, p_reason text) returns qa.rectifications
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare r qa.rectifications;
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  update qa.rectifications set deadline = p_date where id = p_id and deleted_at is null and status in ('FOR RECTIFICATION','FOR RE-INSPECTION') returning * into r;
  if not found then raise exception 'Rectification % is not open', p_id; end if;
  perform qa.notify_org(r.contractor_org_id, r.id, 'deadline');
  perform qa.log(r.last_audit_id, 'rect_deadline', jsonb_build_object('rect', r.id, 'deadline', p_date, 'reason', p_reason));
  return r;
end $$;

create or replace function qa.assign_reinspection(p_rect_id text, p_inspector text, p_date date, p_seq int default 1) returns qa.audits
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare r qa.rectifications; prev qa.audits; pend qa.audits; a qa.audits; v_id text;
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  if not exists (select 1 from public.technicians where username = p_inspector and role = 'qa_inspector') then raise exception 'Not a QA inspector account: %', p_inspector; end if;
  select * into r from qa.rectifications where id = p_rect_id and deleted_at is null for update;
  if r.id is null or r.status not in ('FOR RECTIFICATION','FOR RE-INSPECTION') then raise exception 'Rectification % is not open', p_rect_id; end if;
  -- a pending (not yet submitted) re-inspection visit is retired and replaced
  select * into pend from qa.audits where rectification_id = r.id and source = 'reinspection' and deleted_at is null and status in ('assigned','in_progress') limit 1;
  if pend.id is not null then update qa.audits set deleted_at = now(), deleted_by = qa.actor() where id = pend.id; perform qa.log(pend.id, 'reinspection_replaced', jsonb_build_object('rect', r.id)); end if;
  select * into prev from qa.audits where id = r.last_audit_id;
  v_id := qa.next_audit_id();
  insert into qa.audits(id, source, job_id, jo_no, acct_no, sheet_row_jo, contractor_name, contractor_org_id, kind, unmapped,
    subscriber, mobile_no, address, barangay, nap_code, port_no, serial_no, tran_type, jo_date_closed, installers_text, sheet_latlong,
    status, assigned_to, assigned_by, assigned_at, scheduled_date, sequence, rectification_id, reinspection_of)
  values (v_id, 'reinspection', prev.job_id, prev.jo_no, prev.acct_no, prev.sheet_row_jo, prev.contractor_name, prev.contractor_org_id, prev.kind, prev.unmapped,
    prev.subscriber, prev.mobile_no, prev.address, prev.barangay, prev.nap_code, prev.port_no, prev.serial_no, prev.tran_type, prev.jo_date_closed, prev.installers_text, prev.sheet_latlong,
    'assigned', p_inspector, qa.actor(), now(), p_date, coalesce(p_seq, 1), r.id, prev.id)
  returning * into a;
  update qa.rectifications set status = 'FOR RE-INSPECTION' where id = r.id returning * into r;
  perform qa.notify_org(r.contractor_org_id, r.id, 'reinspect');
  perform qa.log(a.id, 'assigned', jsonb_build_object('to', p_inspector, 'date', p_date, 'seq', coalesce(p_seq, 1), 'rect', r.id, 'reinspection_of', prev.id));
  perform qa.sync_job_rect(r);
  return a;
end $$;

create or replace function qa.close_rectification(p_id text, p_reason text) returns qa.rectifications
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare r qa.rectifications; pend qa.audits;
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Reason required'; end if;
  update qa.rectifications set status = 'CLOSED', closed_by = qa.actor(), closed_at = now(), close_reason = p_reason
   where id = p_id and deleted_at is null and status in ('FOR RECTIFICATION','FOR RE-INSPECTION') returning * into r;
  if not found then raise exception 'Rectification % is not open', p_id; end if;
  select * into pend from qa.audits where rectification_id = r.id and source = 'reinspection' and deleted_at is null and status in ('assigned','in_progress') limit 1;
  if pend.id is not null then update qa.audits set deleted_at = now(), deleted_by = qa.actor() where id = pend.id; end if;
  perform qa.notify_org(r.contractor_org_id, r.id, 'closed');
  perform qa.log(r.last_audit_id, 'rect_closed', jsonb_build_object('rect', r.id, 'reason', p_reason));
  perform qa.sync_job_rect(r);
  return r;
end $$;

create or replace function qa.override_penalty(p_violation_id bigint, p_amount numeric, p_reason text) returns jsonb
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare v qa.audit_violations; v_total numeric; a qa.audits;
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Reason required'; end if;
  -- resolve and guard BEFORE writing: overriding a penalty on a draft or soft-deleted audit would leave an
  -- override that submit_audit later wipes (it deletes and re-inserts the violation rows), or one that bills a
  -- retired inspection. Both are silent money bugs, so refuse instead.
  select * into v from qa.audit_violations where id = p_violation_id;
  if v.id is null then raise exception 'Violation % not found', p_violation_id; end if;
  select * into a from qa.audits where id = v.audit_id;
  if a.id is null or a.status <> 'done' or a.deleted_at is not null then raise exception 'Audit % is not done', v.audit_id; end if;
  update qa.audit_violations set penalty_override = p_amount, override_by = qa.actor(), override_at = now(), override_reason = p_reason
   where id = p_violation_id returning * into v;
  select coalesce(sum(coalesce(penalty_override, penalty_amount)), 0) into v_total from qa.audit_violations where audit_id = v.audit_id;
  update qa.audits set total_penalty = v_total where id = v.audit_id;
  perform qa.log(v.audit_id, 'penalty_override', jsonb_build_object('violation', v.id, 'code', v.code, 'amount', p_amount, 'reason', p_reason));
  return jsonb_build_object('ok', true, 'violation', to_jsonb(v), 'total_penalty', v_total);
end $$;

create or replace function qa.offense_preview(p_contractor text, p_codes text[]) returns jsonb
language plpgsql stable security definer set search_path = qa, public, pg_temp as $$
begin
  if not (qa.is_head() or qa.is_inspector()) then raise exception 'QA Head or inspector only'; end if;
  return (
    select coalesce(jsonb_object_agg(c.code, jsonb_build_object('offense_no', qa.offense_no(p_contractor, c.code, null),
             'penalty_amount', qa.penalty_for_level(c, qa.offense_no(p_contractor, c.code, null)), 'penalty_text', c.penalty_text)), '{}'::jsonb)
      from qa.violation_codes c where c.code = any(p_codes));
end $$;

-- one-time: recompute offense levels of every done, non-legacy audit in chronological order (override values are kept)
create or replace function qa.recompute_offenses() returns jsonb
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare a record; v record; c qa.violation_codes; v_off int; v_audits int := 0; v_viol int := 0; n int;
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  for a in select id, contractor_name, inspected_at from qa.audits where status = 'done' and deleted_at is null and source <> 'sheet_legacy' order by inspected_at, id loop
    n := 0;
    for v in select id, code from qa.audit_violations where audit_id = a.id loop
      select * into c from qa.violation_codes where code = v.code;
      v_off := qa.offense_no(a.contractor_name, v.code, a.id, a.inspected_at);   -- one rule, shared with the live path
      update qa.audit_violations set offense_no = v_off, penalty_amount = qa.penalty_for_level(c, v_off) where id = v.id;
      n := n + 1; v_viol := v_viol + 1;
    end loop;
    update qa.audits set total_penalty = (select coalesce(sum(coalesce(penalty_override, penalty_amount)), 0) from qa.audit_violations where audit_id = a.id) where id = a.id;
    -- an audit trail per audit: this rewrites offense levels and catalog penalties in bulk, and without a per-audit
    -- entry there is no way afterwards to tell a recomputed penalty from the one the inspector's submit produced.
    perform qa.log(a.id, 'offenses_recomputed', jsonb_build_object('violations', n));
    v_audits := v_audits + 1;
  end loop;
  return jsonb_build_object('audits', v_audits, 'violations', v_viol);
end $$;

-- ---------- 8. notices ----------
create or replace function qa.notices_unseen() returns int
language sql stable security definer set search_path = qa, public, pg_temp as $$
  select count(*)::int from qa.notices where org_id = qa.my_org() and seen_at is null
$$;
create or replace function qa.mark_notices_seen() returns int
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare n int;
begin
  update qa.notices set seen_at = now() where org_id = qa.my_org() and seen_at is null;
  get diagnostics n = row_count; return n;
end $$;

-- ---------- 8b. subcon findings bundle ----------
-- RLS cannot filter COLUMNS, so the subcon gets NO direct select on qa.audits/items/violations/photos (see §10).
-- Everything the contractor's console shows about a loop comes from here, column-filtered:
-- no signatures, no signed name, no GPS, no submit_key, no rep/mobile, and photos only for FAILED items.
create or replace function qa.rectification_bundle(p_id text) returns jsonb
language plpgsql stable security definer set search_path = qa, public, pg_temp as $$
declare r qa.rectifications; v_head boolean := qa.is_head(); v_audits jsonb;
begin
  select * into r from qa.rectifications where id = p_id and deleted_at is null;
  if r.id is null then raise exception 'Rectification % not found', p_id; end if;
  if not v_head then
    -- a wrong-org / non-console caller learns nothing beyond "not found".
    -- NULL-safe: a NULL org (either side) makes the comparison NULL, and plpgsql treats `if NULL` as false —
    -- so the test is wrapped in coalesce(..., false) to DENY rather than fall through. is_console() is exists(), never NULL.
    if not (coalesce(r.contractor_org_id = qa.my_org(), false) and public.is_console()) then
      raise exception 'Rectification % not found', p_id;
    end if;
  end if;
  select coalesce(jsonb_agg(b.bundle order by b.created_at, b.id), '[]'::jsonb) into v_audits from (
    select a.created_at, a.id, jsonb_build_object(
      'audit', case when v_head then to_jsonb(a)
                    else to_jsonb(a) - 'subscriber_signature_path' - 'inspector_signature_path' - 'subscriber_signed_name'
                                     - 'lat' - 'lng' - 'sheet_latlong' - 'submit_key' - 'contractor_rep' - 'mobile_no' end,
      'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.item_id) from qa.audit_items i where i.audit_id = a.id), '[]'::jsonb),
      -- the subcon sees that a penalty was overridden and why, but not WHICH head account did it
      'violations', coalesce((select jsonb_agg(case when v_head then to_jsonb(vv) else to_jsonb(vv) - 'override_by' end order by vv.id)
                                from qa.audit_violations vv where vv.audit_id = a.id), '[]'::jsonb),
      'photos', coalesce((select jsonb_agg(to_jsonb(ph) order by ph.id) from qa.audit_photos ph
                           where ph.audit_id = a.id
                             and (v_head or exists (select 1 from qa.audit_items fi
                                                     where fi.audit_id = a.id and fi.item_id = ph.item_id and fi.result = 'fail'))), '[]'::jsonb)
    ) as bundle
      -- the head also sees retired re-inspections (replaced / released visits carry deleted_at); the subcon sees live audits only
      from qa.audits a where a.rectification_id = p_id and (v_head or a.deleted_at is null)) b;
  return jsonb_build_object(
    'rect', to_jsonb(r) || jsonb_build_object('overdue',
       r.status in ('FOR RECTIFICATION','FOR RE-INSPECTION') and r.deadline < (now() at time zone 'Asia/Manila')::date),
    'audits', v_audits);
end $$;

-- ---------- 9. monthly scorecard ----------
create or replace function qa.monthly_scorecard(p_month date) returns jsonb
language plpgsql stable security definer set search_path = qa, public, pg_temp as $$
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  return (
  with bounds as (select date_trunc('month', p_month)::date as m0, (date_trunc('month', p_month) + interval '1 month')::date as m1,
                         (date_trunc('month', p_month) - interval '1 month')::date as pm0),
  ins as (select a.* from qa.audits a, bounds b where a.deleted_at is null and a.status = 'done' and a.source <> 'reinspection'
             and (a.inspected_at at time zone 'Asia/Manila')::date >= b.m0 and (a.inspected_at at time zone 'Asia/Manila')::date < b.m1),
  prev as (select a.* from qa.audits a, bounds b where a.deleted_at is null and a.status = 'done' and a.source <> 'reinspection'
             and (a.inspected_at at time zone 'Asia/Manila')::date >= b.pm0 and (a.inspected_at at time zone 'Asia/Manila')::date < b.m0),
  closed as (select comp, count(*)::int n from qa.sheet_rows s, bounds b where s.jo_date_closed >= b.m0 and s.jo_date_closed < b.m1 group by comp),
  pclosed as (select comp, count(*)::int n from qa.sheet_rows s, bounds b where s.jo_date_closed >= b.pm0 and s.jo_date_closed < b.m0 group by comp),
  names as (select sheet_name as contractor, kind from qa.contractors where active
            union all
            select i.contractor_name, coalesce(min(i.kind), 'subcon') from ins i         -- one row per name: only names not already mapped
             where i.contractor_name is not null
               and not exists (select 1 from qa.contractors c2 where c2.active and c2.sheet_name = i.contractor_name)
             group by i.contractor_name),
  viol as (select a.contractor_name, v.* from qa.audit_violations v join ins a on a.id = v.audit_id),
  items as (select a.contractor_name, i.item_id, i.result from qa.audit_items i join ins a on a.id = i.audit_id),
  rect as (select r.* from qa.rectifications r, bounds b where r.deleted_at is null and (r.opened_at at time zone 'Asia/Manila')::date >= b.m0 and (r.opened_at at time zone 'Asia/Manila')::date < b.m1),
  openend as (select r.* from qa.rectifications r, bounds b where r.deleted_at is null and r.opened_at < b.m1 and (r.rectified_at is null or r.rectified_at >= b.m1) and (r.closed_at is null or r.closed_at >= b.m1))
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by (t.kind = 'inhouse'), t.contractor), '[]'::jsonb) from (
    select n.contractor, n.kind,
      coalesce((select x.n from closed x where x.comp = n.contractor), 0) as closed,
      (select count(*) from ins where contractor_name = n.contractor)::int as inspected,
      (select count(*) filter (where assessment = 'GOOD') from ins where contractor_name = n.contractor)::int as good,
      (select count(*) filter (where assessment = 'FOR RECTIFY') from ins where contractor_name = n.contractor)::int as rectify,
      (select count(*) filter (where assessment = 'FOR PENALTY') from ins where contractor_name = n.contractor)::int as penalty_n,
      (select count(*) filter (where assessment = 'CLAWBACK') from ins where contractor_name = n.contractor)::int as clawback,
      (select count(*) filter (where visit_status <> 'VISITED') from ins where contractor_name = n.contractor)::int as npa,
      (select coalesce(jsonb_object_agg(item_id, jsonb_build_object('pass', p, 'fail', f)), '{}'::jsonb) from
         (select item_id, count(*) filter (where result = 'pass') p, count(*) filter (where result = 'fail') f from items where contractor_name = n.contractor group by item_id) q) as items,
      (select count(*) from viol where contractor_name = n.contractor)::int as violations,
      (select count(*) filter (where severity = 'MINOR') from viol where contractor_name = n.contractor)::int as v_minor,
      (select count(*) filter (where severity = 'MAJOR') from viol where contractor_name = n.contractor)::int as v_major,
      (select count(*) filter (where severity = 'CRITICAL') from viol where contractor_name = n.contractor)::int as v_critical,
      (select count(*) filter (where offense_no >= 2) from viol where contractor_name = n.contractor)::int as repeat_offenses,
      (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'n', c) order by c desc), '[]'::jsonb) from
         (select code, count(*) c from viol where contractor_name = n.contractor group by code order by c desc limit 5) q) as top_codes,
      (select coalesce(sum(coalesce(penalty_override, penalty_amount)), 0) from viol where contractor_name = n.contractor) as penalty,
      (select count(*) filter (where penalty_override is not null) from viol where contractor_name = n.contractor)::int as overrides,
      (select count(*) from rect where contractor_name = n.contractor)::int as rect_opened,
      (select count(*) filter (where status = 'RECTIFIED' and (rectified_at at time zone 'Asia/Manila')::date <= deadline) from rect where contractor_name = n.contractor)::int as rect_on_time,
      (select count(*) filter (where status = 'RECTIFIED' and (rectified_at at time zone 'Asia/Manila')::date > deadline) from rect where contractor_name = n.contractor)::int as rect_late,
      (select count(*) filter (where status = 'CLOSED') from rect where contractor_name = n.contractor)::int as rect_closed,
      (select count(*) from openend where contractor_name = n.contractor)::int as rect_open_end,
      (select count(*) from openend o, bounds b where o.contractor_name = n.contractor and o.deadline < b.m1)::int as rect_overdue_end,
      (select round(avg(extract(epoch from (rectified_at - opened_at)) / 86400.0)::numeric, 1) from rect where contractor_name = n.contractor and status = 'RECTIFIED') as avg_days_to_rectify,
      coalesce((select x.n from pclosed x where x.comp = n.contractor), 0) as prev_closed,
      (select count(*) from prev where contractor_name = n.contractor)::int as prev_inspected,
      (select coalesce(sum(coalesce(v.penalty_override, v.penalty_amount)), 0) from qa.audit_violations v join prev a on a.id = v.audit_id where a.contractor_name = n.contractor) as prev_penalty,
      (select count(*) filter (where result = 'pass') from qa.audit_items i join prev a on a.id = i.audit_id where a.contractor_name = n.contractor)::int as prev_pass,
      (select count(*) filter (where result = 'fail') from qa.audit_items i join prev a on a.id = i.audit_id where a.contractor_name = n.contractor)::int as prev_fail
    from names n) t);
end $$;

-- ---------- 9b. violations register (one row per violation, for the monthly export) ----------
-- Unlike the scorecard's aggregates, this is the LINE-ITEM register the QA Head bills from, so it deliberately
-- INCLUDES re-inspection violations — a code still failing at re-inspection is a real charge. The `source` column
-- marks them so the register can be read either way; do not add a `source <> 'reinspection'` filter here.
create or replace function qa.month_violations(p_month date) returns jsonb
language plpgsql stable security definer set search_path = qa, public, pg_temp as $$
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'audit_id', a.id, 'source', a.source, 'inspected_at', a.inspected_at,
             'contractor_name', a.contractor_name, 'subscriber', a.subscriber, 'jo_no', a.jo_no, 'acct_no', a.acct_no,
             'inspector', a.inspector, 'code', v.code, 'category', v.category, 'description', v.description,
             'severity', v.severity, 'offense_no', v.offense_no,
             'penalty_amount', v.penalty_amount, 'penalty_override', v.penalty_override,
             'effective_penalty', coalesce(v.penalty_override, v.penalty_amount, 0),
             'override_reason', v.override_reason, 'override_at', v.override_at, 'remark', v.remark)
           order by a.contractor_name, a.inspected_at, a.id, v.id), '[]'::jsonb)
      from qa.audit_violations v
      join qa.audits a on a.id = v.audit_id
     where a.status = 'done' and a.deleted_at is null
       and (a.inspected_at at time zone 'Asia/Manila')::date >= date_trunc('month', p_month)::date
       and (a.inspected_at at time zone 'Asia/Manila')::date < (date_trunc('month', p_month) + interval '1 month')::date);
end $$;

-- ---------- 10. RLS (subcon read-only on own-org loop rows; head all; inspectors unchanged) ----------
alter table qa.rectifications enable row level security;
alter table qa.notices enable row level security;
drop policy if exists qa_rect_head on qa.rectifications;
create policy qa_rect_head on qa.rectifications for all to authenticated using (qa.is_head()) with check (qa.is_head());
drop policy if exists qa_rect_subcon on qa.rectifications;
create policy qa_rect_subcon on qa.rectifications for select to authenticated
  using (deleted_at is null and contractor_org_id is not null and contractor_org_id = qa.my_org() and public.is_console());
drop policy if exists qa_rect_insp on qa.rectifications;
-- a.deleted_at is null: a RETIRED re-inspection (replaced or released) must not keep granting its old inspector
-- read access to the loop — that is exactly the row assign_reinspection / unassign_audits soft-delete.
-- NEVER put a subquery on an RLS-protected table inside a policy: qa.audits' own policies would be evaluated again →
-- "infinite recursion detected in policy" (42P17) for every non-head caller (this broke ALL storage uploads on 2026-09-10).
-- qa.rect_of_mine / qa.prev_of_mine are SECURITY DEFINER helpers (defined in qa-05d) that read qa.audits without RLS.
create policy qa_rect_insp on qa.rectifications for select to authenticated using (qa.is_inspector() and qa.rect_of_mine(id));
drop policy if exists qa_notices_head on qa.notices;
create policy qa_notices_head on qa.notices for all to authenticated using (qa.is_head()) with check (qa.is_head());
drop policy if exists qa_notices_subcon_read on qa.notices;
create policy qa_notices_subcon_read on qa.notices for select to authenticated using (org_id = qa.my_org() and public.is_console());
drop policy if exists qa_notices_subcon_seen on qa.notices;
create policy qa_notices_subcon_seen on qa.notices for update to authenticated using (org_id = qa.my_org() and public.is_console()) with check (org_id = qa.my_org());

-- narrow the qa-03 config read: it was `using (true)`, i.e. every authenticated account in the whole project
-- (mobile technicians, other orgs' console users) could read the penalty matrix, the contractor→org map,
-- the quick remarks and qa.settings. Config reads belong to the head and the inspectors only.
do $$ declare t text; begin
  foreach t in array array['violation_codes','contractors','quick_remarks','settings'] loop
    execute format('drop policy if exists qa_cfg_read on qa.%I', t);
    execute format('create policy qa_cfg_read on qa.%I for select to authenticated using (qa.is_head() or qa.is_inspector())', t);
  end loop;
end $$;
-- checklist_items is narrowed the same way; the subcon's labels-only access is qa_checklist_subcon below (policies are OR-ed)
drop policy if exists qa_cfg_read on qa.checklist_items;
create policy qa_cfg_read on qa.checklist_items for select to authenticated using (qa.is_head() or qa.is_inspector());

-- checklist labels for the subcon findings page (labels only; codes/settings stay head/inspector)
drop policy if exists qa_checklist_subcon on qa.checklist_items;
create policy qa_checklist_subcon on qa.checklist_items for select to authenticated using (public.is_console());

-- NO subcon policy on qa.audits / audit_items / audit_violations / audit_photos: a row policy cannot hide COLUMNS
-- (signatures, signed name, GPS, submit_key, rep/mobile). The contractor reads loops through qa.rectification_bundle() only.
drop policy if exists qa_audits_subcon on qa.audits;
-- inspectors also read the previous inspection of their re-inspection
drop policy if exists qa_audits_insp_prev on qa.audits;
create policy qa_audits_insp_prev on qa.audits for select to authenticated using (qa.is_inspector() and qa.prev_of_mine(id));
do $$ declare t text; begin
  foreach t in array array['audit_items','audit_violations','audit_photos'] loop
    execute format('drop policy if exists qa_child_subcon on qa.%I', t);      -- retired: bundle RPC only (column filtering)
    execute format('drop policy if exists qa_child_insp_prev on qa.%I', t);
    execute format('create policy qa_child_insp_prev on qa.%I for select to authenticated using (qa.is_inspector() and qa.prev_of_mine(audit_id))', t);
  end loop;
end $$;
-- storage policy for subcon photo access: RETIRED (see qa-05d) — will be re-added in a recursion-safe form before C3.
drop policy if exists qa_photos_subcon_read on storage.objects;
drop function if exists qa.subcon_can_read_photo(text);

grant select on qa.rectifications, qa.notices to authenticated;
grant update (seen_at) on qa.notices to authenticated;
-- no insert/update on qa.rectifications and no rect_seq grant: every head write goes through a security-definer RPC.
-- explicit revoke, because qa-03's `grant usage, select on all sequences in schema qa to authenticated` would hand
-- rect_seq over if qa-03 is ever re-run after this file (it predates the sequence, so a first run does not).
revoke all on sequence qa.rect_seq from authenticated;
grant all on qa.rectifications, qa.notices to service_role;
do $$ begin alter publication supabase_realtime add table qa.notices; exception when duplicate_object then null; when others then raise notice 'realtime: %', sqlerrm; end $$;

-- ---------- 11. grants for the new RPCs ----------
revoke execute on all functions in schema qa from public, anon, authenticated;
-- helpers called from RLS/storage quals: a policy expression runs with the CALLER's privileges, so these must be executable
grant execute on function qa.is_head(), qa.is_inspector(), qa.my_org(), qa.prev_of_mine(text), qa.rect_of_mine(text) to authenticated;
grant execute on function qa.ingest_sheet_rows(), qa.assign_audits(text[],text,date,int), qa.unassign_audits(text[]), qa.queue_pool(text[]),
  qa.sample_inhouse(date,date,numeric), qa.reopen_audit(text,text), qa.start_audit(text,double precision,double precision),
  qa.submit_audit(text,jsonb), qa.weekly_report(date,date), qa.sync_status(),
  qa.set_rect_deadline(text,date,text), qa.assign_reinspection(text,text,date,int), qa.close_rectification(text,text),
  qa.override_penalty(bigint,numeric,text), qa.offense_preview(text,text[]), qa.recompute_offenses(), qa.monthly_scorecard(date),
  qa.month_violations(date), qa.notices_unseen(), qa.mark_notices_seen(), qa.rectification_bundle(text) to authenticated;
grant execute on function qa.ingest_sheet_rows() to service_role;
notify pgrst, 'reload schema';
