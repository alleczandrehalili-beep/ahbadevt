-- Run after qa-01..04. Every row must say OK. Stop and report if any says FAIL.
select 'tables' as check_name, case when count(*) = 11 then 'OK' else 'FAIL '||count(*) end as result
  from information_schema.tables where table_schema = 'qa';
select 'seed codes', case when count(*) = 102 then 'OK' else 'FAIL '||count(*) end from qa.violation_codes;
select 'seed checklist', case when count(*) = 10 then 'OK' else 'FAIL '||count(*) end from qa.checklist_items where active;
select 'seed contractors', case when count(*) = 9 then 'OK' else 'FAIL '||count(*) end from qa.contractors;
select 'seed quick remarks', case when count(*) = 27 then 'OK' else 'FAIL '||count(*) end from qa.quick_remarks;
select 'rls enabled', case when count(*) = 11 then 'OK' else 'FAIL '||count(*) end
  from pg_tables where schemaname = 'qa' and rowsecurity;
select 'rpc functions', case when count(*) = 10 then 'OK' else 'FAIL '||count(*) end from (values
  (to_regprocedure('qa.ingest_sheet_rows()')), (to_regprocedure('qa.assign_audits(text[],text,date,int)')), (to_regprocedure('qa.unassign_audits(text[])')),
  (to_regprocedure('qa.queue_pool(text[])')), (to_regprocedure('qa.sample_inhouse(date,date,numeric)')), (to_regprocedure('qa.reopen_audit(text,text)')),
  (to_regprocedure('qa.start_audit(text,double precision,double precision)')), (to_regprocedure('qa.submit_audit(text,jsonb)')),
  (to_regprocedure('qa.weekly_report(date,date)')), (to_regprocedure('qa.sync_status()'))) v(p) where p is not null;
select 'jobs trigger', case when count(*) = 1 then 'OK' else 'FAIL' end from pg_trigger where tgname = 'qa_on_job_completed';
select 'log guard', case when count(*) = 1 then 'OK' else 'FAIL' end from pg_trigger where tgname = 'qa_log_guard';
select 'log truncate guard', case when count(*) = 1 then 'OK' else 'FAIL' end from pg_trigger where tgname = 'qa_log_guard_trunc';
select 'jobs.qa columns', case when count(*) = 4 then 'OK' else 'FAIL '||count(*) end
  from information_schema.columns where table_schema = 'public' and table_name = 'jobs' and column_name in ('qa_audit_id','qa_status','qa_assessment','qa_inspected_at');
select 'bucket', case when count(*) = 1 then 'OK' else 'FAIL' end from storage.buckets where id = 'qa-photos' and public = false;
select 'realtime publication', case when exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'qa' and tablename = 'audits') then 'OK' else 'FAIL' end;
select 'is_head requires console', case when coalesce(pg_get_functiondef(to_regprocedure('qa.is_head()')), '') like '%is_console%' then 'OK' else 'FAIL' end;
select 'sheet_rows head-only', case when count(*) = 1 then 'OK' else 'FAIL '||count(*) end
  from pg_policies where schemaname = 'qa' and tablename = 'sheet_rows';
select 'audit seq', case when exists (select 1 from pg_sequences where schemaname = 'qa' and sequencename = 'audit_seq') then 'OK' else 'FAIL' end;
select 'sync_status runs', case when qa.sync_status() ? 'unmapped' then 'OK' else 'FAIL' end;
select 'weekly_report runs', case when qa.weekly_report(current_date - 7, current_date) ? 'contractors' then 'OK' else 'FAIL' end;
select 'exposed schemas (manual dashboard step — must contain qa)' as check_name,
       coalesce((select array_to_string(setconfig, ' ') from pg_db_role_setting where setrole = 'authenticator'::regrole limit 1), '(no per-role setting found — check Dashboard → API → Exposed schemas)') as result;