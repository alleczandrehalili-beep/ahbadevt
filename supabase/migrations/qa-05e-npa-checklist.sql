-- qa-05e-npa-checklist.sql — VISITED / NPA becomes a fully inspected visit.
--
-- Owner change (2026-09-09): when the inspector reaches the site but the subscriber is not around, the
-- installation is still there to be inspected. 'VISITED / NPA' therefore runs the SAME checklist as 'VISITED'
-- — all active items answered, a violation code per fail, wire / qa_gc / assessment, inspector signature, and
-- it opens or advances a rectification loop — EXCEPT that the subscriber's name and signature are not required
-- (nobody was there to sign) and no location photo / remarks are demanded.
-- UNLOCATED / NOT EXIST / H.CLOSED are unchanged: location photo + remarks, no checklist.
--
-- Owner change (2026-09-09, part 2): Commercial is Yes/No only — the "Willing to upgrade / Not willing" 3-way
-- is gone. found_business = 'yes' means Commercial = Yes; null means No/none. Legacy rows keep 'willing' /
-- 'not_willing' and still display as Yes. found_business remains the only stored column — 'commercial' is
-- derived on prefill, not persisted.
--
-- Scorecard / weekly `npa` counters still count visit_status <> 'VISITED' — deliberately unchanged.
--
-- Idempotent: two create-or-replace bodies, copied verbatim from qa-05-phase-c.sql §4 and §5 with only the
-- edits above. qa-05-phase-c.sql carries the same edits so a fresh run of the migration set matches.
-- Run after qa-05-phase-c.sql (and qa-05b / qa-05c / qa-05d).

set search_path = qa, public;

-- ---------- 0. Commercial is Yes/No only: found_business = 'yes' means Commercial = Yes ----------
alter table qa.audits drop constraint if exists audits_found_business_check;
alter table qa.audits add constraint audits_found_business_check check (found_business is null or found_business in ('yes','willing','not_willing'));

-- ---------- 1. loop transitions after a submit: an NPA visit moves the loop like a VISITED one ----------
create or replace function qa.after_submit_rect(a qa.audits, p_fails int) returns void
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare r qa.rectifications; v_days int := coalesce(nullif(qa.setting('rect_default_days'),'')::int, 7); v_id text; v_same boolean;
begin
  if a.visit_status not in ('VISITED','VISITED / NPA') then return; end if;   -- unlocated / not exist / h.closed never open or close a loop
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


-- ---------- 2. submit_audit: NPA runs the checklist; subscriber signature only for VISITED; Commercial rule ----------
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

  if v_visit in ('VISITED','VISITED / NPA') then
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
    if coalesce(p_payload->>'found_business','') not in ('', 'yes','willing','not_willing') then raise exception 'Invalid found_business'; end if;
    -- VISITED / NPA = the subscriber was not around: no name, nothing for them to sign. The inspector still signs.
    if v_visit = 'VISITED' and coalesce(p_payload->>'subscriber_signed_name', '') = '' then raise exception 'Subscriber name required'; end if;
    if v_visit = 'VISITED' then
      if coalesce(p_payload->>'subscriber_signature_path','') = '' or coalesce(p_payload->>'inspector_signature_path','') = '' then raise exception 'Both signatures are required'; end if;
    else
      if coalesce(p_payload->>'inspector_signature_path','') = '' then raise exception 'Inspector signature is required'; end if;
    end if;
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
    wire = case when v_visit in ('VISITED','VISITED / NPA') then nullif(p_payload->>'wire','') end,
    qa_gc = case when v_visit in ('VISITED','VISITED / NPA') then nullif(p_payload->>'qa_gc','') end,
    assessment = case when v_visit in ('VISITED','VISITED / NPA') then nullif(p_payload->>'assessment','') end,
    found_business = case when v_visit in ('VISITED','VISITED / NPA') then nullif(p_payload->>'found_business','') end,
    old_plan = case when v_visit in ('VISITED','VISITED / NPA') then nullif(p_payload->>'old_plan','') end,
    new_plan = case when v_visit in ('VISITED','VISITED / NPA') then nullif(p_payload->>'new_plan','') end,
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


-- quick check
select 'submit_audit NPA checklist' as check_name,
       case when pg_get_functiondef(to_regprocedure('qa.submit_audit(text,jsonb)')) like '%VISITED / NPA%' then 'OK' else 'FAIL' end as result
union all select 'after_submit_rect NPA loop',
       case when pg_get_functiondef(to_regprocedure('qa.after_submit_rect(qa.audits,integer)')) like '%VISITED / NPA%' then 'OK' else 'FAIL' end;

grant execute on function qa.submit_audit(text,jsonb) to authenticated;
notify pgrst, 'reload schema';
