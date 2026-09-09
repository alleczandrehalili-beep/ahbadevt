-- QA Phase C HOTFIX (applied live 2026-09-10 ~2:20 PM). RLS policies must never query a table that itself has RLS
-- (qa.audits inside a qa.audits policy) — Postgres raises "infinite recursion detected in policy" (42P17) for any
-- non-head caller, and the Phase A storage policy qa_photos_insp_write (WITH CHECK EXISTS on qa.audits) is evaluated on
-- EVERY storage.objects insert, so all job-photos uploads failed ("The database schema is invalid or incompatible").
-- Fix: security-definer helpers read qa.audits without RLS; the policies call the helpers.
set search_path = qa, public;
create or replace function qa.prev_of_mine(p_audit_id text) returns boolean
language sql stable security definer set search_path = qa, public, pg_temp as $$
  select exists (select 1 from qa.audits n where n.reinspection_of = p_audit_id and n.assigned_to = public.my_team() and n.deleted_at is null)
$$;
create or replace function qa.rect_of_mine(p_rect_id text) returns boolean
language sql stable security definer set search_path = qa, public, pg_temp as $$
  select exists (select 1 from qa.audits a where a.rectification_id = p_rect_id and a.assigned_to = public.my_team() and a.deleted_at is null)
$$;
grant execute on function qa.prev_of_mine(text), qa.rect_of_mine(text) to authenticated;
drop policy if exists qa_audits_insp_prev on qa.audits;
create policy qa_audits_insp_prev on qa.audits for select to authenticated using (qa.is_inspector() and qa.prev_of_mine(id));
do $$ declare t text; begin
  foreach t in array array['audit_items','audit_violations','audit_photos'] loop
    execute format('drop policy if exists qa_child_insp_prev on qa.%I', t);
    execute format('create policy qa_child_insp_prev on qa.%I for select to authenticated using (qa.is_inspector() and qa.prev_of_mine(audit_id))', t);
  end loop;
end $$;
drop policy if exists qa_rect_insp on qa.rectifications;
create policy qa_rect_insp on qa.rectifications for select to authenticated using (qa.is_inspector() and qa.rect_of_mine(id));
-- the subcon storage policy of qa-05 §10 is retired for now (also dropped live); it will return in a recursion-safe form before C3
drop policy if exists qa_photos_subcon_read on storage.objects;
drop function if exists qa.subcon_can_read_photo(text);
-- perf: qa-05 policies reference these columns
create index if not exists audits_reinspection_of_idx on qa.audits(reinspection_of) where reinspection_of is not null;
create index if not exists audits_assigned_status_idx on qa.audits(assigned_to, status) where deleted_at is null;
notify pgrst, 'reload schema';
-- VERIFY (as a plain authenticated user this must return numbers, not "infinite recursion"):
-- begin; select set_config('request.jwt.claims','{"role":"authenticated","email":"x@ahbadevt.local","app_metadata":{}}',true); select set_config('role','authenticated',true);
-- select (select count(*) from qa.audits), (select count(*) from storage.objects where bucket_id='job-photos'); rollback;
