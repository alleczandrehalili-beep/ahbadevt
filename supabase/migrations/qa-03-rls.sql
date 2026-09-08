-- QA Audit module — access control (2026-09-08). Additive. Run AFTER qa-01 and qa-02.
-- MANUAL STEP (Supabase Dashboard → Project Settings → API → Exposed schemas): add `qa`, same as `wims` / `billing`.
grant usage on schema qa to authenticated, service_role;
grant select on all tables in schema qa to authenticated;
grant insert, update on qa.audits, qa.audit_items, qa.audit_photos, qa.audit_violations, qa.audit_log to authenticated;
grant insert, update on qa.violation_codes, qa.checklist_items, qa.contractors, qa.quick_remarks, qa.settings, qa.sheet_rows to authenticated;
grant usage, select on all sequences in schema qa to authenticated;
grant all on all tables in schema qa to service_role;
grant all on all sequences in schema qa to service_role;
alter default privileges in schema qa grant select on tables to authenticated;

-- QA Head = GC CONSOLE user (dashboard_users) or platform admin; mobile accounts of the GC org are NOT heads.
create or replace function qa.is_head() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (coalesce(public.jwt_org_is_gc(), false) and coalesce(public.is_console(), false)) or coalesce(public.jwt_is_platform_admin(), false)
$$;
-- QA inspector = mobile account with role qa_inspector (username = my_team()).
create or replace function qa.is_inspector() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.technicians t where t.username = public.my_team() and t.role = 'qa_inspector')
$$;
grant execute on function qa.is_head(), qa.is_inspector() to authenticated;

-- ---------- RLS ----------
do $$ declare t text; begin
  foreach t in array array['violation_codes','checklist_items','contractors','quick_remarks','settings','sheet_rows','audits','audit_items','audit_photos','audit_violations','audit_log'] loop
    execute format('alter table qa.%I enable row level security', t);
  end loop;
end $$;

-- Config: everyone authenticated reads; only the head writes.
do $$ declare t text; begin
  foreach t in array array['violation_codes','checklist_items','contractors','quick_remarks','settings'] loop
    execute format('drop policy if exists qa_cfg_read on qa.%I', t);
    execute format('create policy qa_cfg_read on qa.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists qa_cfg_head_write on qa.%I', t);
    execute format('create policy qa_cfg_head_write on qa.%I for all to authenticated using (qa.is_head()) with check (qa.is_head())', t);
  end loop;
end $$;

-- sheet_rows carries subscriber PII: head-only in every direction.
drop policy if exists qa_cfg_read on qa.sheet_rows;        -- retired: sheet_rows left the config loop (PII → head-only)
drop policy if exists qa_cfg_head_write on qa.sheet_rows;
drop policy if exists qa_sheet_rows_head on qa.sheet_rows;
create policy qa_sheet_rows_head on qa.sheet_rows for all to authenticated using (qa.is_head()) with check (qa.is_head());

-- Audits: head = all; inspector = read-only on own assigned rows (every inspector write goes through the security-definer RPCs).
drop policy if exists qa_audits_head on qa.audits;
create policy qa_audits_head on qa.audits for all to authenticated using (qa.is_head()) with check (qa.is_head());
drop policy if exists qa_audits_insp_read on qa.audits;
create policy qa_audits_insp_read on qa.audits for select to authenticated
  using (qa.is_inspector() and assigned_to = public.my_team() and deleted_at is null);
drop policy if exists qa_audits_insp_write on qa.audits;   -- retired: start/submit/reopen are RPC-only

-- Child tables: head = all; inspector = rows of own audit; RESTRICTIVE: no child writes once done.
do $$ declare t text; begin
  foreach t in array array['audit_items','audit_photos','audit_violations','audit_log'] loop
    execute format('drop policy if exists qa_child_head on qa.%I', t);
    execute format('create policy qa_child_head on qa.%I for all to authenticated using (qa.is_head()) with check (qa.is_head())', t);
    execute format('drop policy if exists qa_child_insp on qa.%I', t);
    execute format($p$create policy qa_child_insp on qa.%I for all to authenticated
      using (qa.is_inspector() and exists (select 1 from qa.audits a where a.id = audit_id and a.assigned_to = public.my_team()))
      with check (qa.is_inspector() and exists (select 1 from qa.audits a where a.id = audit_id and a.assigned_to = public.my_team() and a.status in ('assigned','in_progress')))$p$, t);
  end loop;
end $$;
drop policy if exists qa_items_locked on qa.audit_items;
create policy qa_items_locked on qa.audit_items as restrictive for insert to authenticated
  with check (qa.is_head() or not exists (select 1 from qa.audits a where a.id = audit_id and a.status = 'done'));

-- ---------- storage bucket (private) ----------
insert into storage.buckets (id, name, public) values ('qa-photos', 'qa-photos', false) on conflict (id) do nothing;
drop policy if exists qa_photos_read on storage.objects;
create policy qa_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'qa-photos' and (qa.is_head() or qa.is_inspector()));
drop policy if exists qa_photos_insp_write on storage.objects;
create policy qa_photos_insp_write on storage.objects for insert to authenticated
  with check (bucket_id = 'qa-photos' and qa.is_inspector()
    and (storage.foldername(name))[1] = 'qa'
    and exists (select 1 from qa.audits a where a.id = (storage.foldername(name))[2] and a.assigned_to = public.my_team() and a.status in ('assigned','in_progress')));
drop policy if exists qa_photos_head_write on storage.objects;
create policy qa_photos_head_write on storage.objects for all to authenticated
  using (bucket_id = 'qa-photos' and qa.is_head()) with check (bucket_id = 'qa-photos' and qa.is_head());

-- Console badge/toast and inspector auto-refresh listen to qa.audits via Realtime.
do $$ begin alter publication supabase_realtime add table qa.audits; exception when duplicate_object then null; when others then raise notice 'realtime publication: %', sqlerrm; end $$;

notify pgrst, 'reload schema';
