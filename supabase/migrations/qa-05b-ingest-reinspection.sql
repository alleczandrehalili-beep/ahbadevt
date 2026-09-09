-- QA Audit Phase C companion patch (2026-09-09). ADDITIVE — replaces qa.ingest_sheet_rows() only.
-- RUN AFTER qa-05-phase-c.sql, and BEFORE any re-inspection is assigned (qa.assign_reinspection).
--
-- Why: a re-inspection audit copies the ORIGINAL jo_no and leaves sheet_row_jo null (see qa-05 §7, qa.assign_reinspection).
-- The ingest's "existing audit with the same JONO but no sheet link" lookup would therefore match the re-inspection row
-- and stamp the sheet link + blank-fill onto it — hijacking the loop's visit and leaving the original audit unlinked
-- (and, because the row `continue`s, the sheet row is never re-processed). Adding `and source <> 'reinspection'`
-- keeps the lookup on original inspections only.
--
-- Body is qa-04-functions.sql lines 68-137 verbatim (including the live `limit 300`); the ONLY change is that one predicate.
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
    select * into a from qa.audits where deleted_at is null and jo_no = r.jo_no and sheet_row_jo is null and source <> 'reinspection' limit 1;
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

-- re-grant: qa-05 §11 revoked execute on all functions in schema qa from public/anon/authenticated,
-- and `create or replace` above keeps the existing ACL — these are restated so the patch is order-independent.
grant execute on function qa.ingest_sheet_rows() to authenticated, service_role;
notify pgrst, 'reload schema';
