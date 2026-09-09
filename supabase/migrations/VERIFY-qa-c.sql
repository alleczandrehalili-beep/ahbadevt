select 'rect table' as check_name, case when to_regclass('qa.rectifications') is not null then 'OK' else 'FAIL' end as result
union all select 'notices table', case when to_regclass('qa.notices') is not null then 'OK' else 'FAIL' end
union all select 'audits.rectification_id', case when exists (select 1 from information_schema.columns where table_schema='qa' and table_name='audits' and column_name='rectification_id') then 'OK' else 'FAIL' end
union all select 'audits.source allows reinspection', case when pg_get_constraintdef((select oid from pg_constraint where conname='audits_source_check' and connamespace = 'qa'::regnamespace)) like '%reinspection%' then 'OK' else 'FAIL' end
union all select 'jo_no index excludes reinspection', case when coalesce(pg_get_indexdef(to_regclass('qa.audits_jo_no_uidx')), '') like '%reinspection%' then 'OK' else 'FAIL' end
union all select 'violations.penalty_override', case when exists (select 1 from information_schema.columns where table_schema='qa' and table_name='audit_violations' and column_name='penalty_override') then 'OK' else 'FAIL' end
union all select 'setting rect_default_days', case when (select value from qa.settings where key='rect_default_days') = '7' then 'OK' else 'FAIL' end
union all select 'rpc functions (11 new)', case when count(*) = 11 then 'OK' else 'FAIL '||count(*) end from (values
  (to_regprocedure('qa.set_rect_deadline(text,date,text)')), (to_regprocedure('qa.assign_reinspection(text,text,date,int)')), (to_regprocedure('qa.close_rectification(text,text)')),
  (to_regprocedure('qa.override_penalty(bigint,numeric,text)')), (to_regprocedure('qa.offense_preview(text,text[])')), (to_regprocedure('qa.recompute_offenses()')),
  (to_regprocedure('qa.monthly_scorecard(date)')), (to_regprocedure('qa.month_violations(date)')), (to_regprocedure('qa.notices_unseen()')), (to_regprocedure('qa.mark_notices_seen()')),
  (to_regprocedure('qa.rectification_bundle(text)'))) v(p) where p is not null
union all select 'month_violations head-only', case when coalesce(pg_get_functiondef(to_regprocedure('qa.month_violations(date)')), '') like '%QA Head only%' then 'OK' else 'FAIL' end
union all select 'month_violations executable', case when has_function_privilege('authenticated','qa.month_violations(date)','execute') then 'OK' else 'FAIL' end
union all select 'my_org executable', case when has_function_privilege('authenticated','qa.my_org()','execute') then 'OK' else 'FAIL' end
union all select 'submit_audit has loop hook', case when pg_get_functiondef(to_regprocedure('qa.submit_audit(text,jsonb)')) like '%after_submit_rect%' then 'OK' else 'FAIL' end
union all select 'sync_job knows loops', case when pg_get_functiondef(to_regprocedure('qa.sync_job(qa.audits)')) like '%rectification_id%' then 'OK' else 'FAIL' end
union all select 'rls rect/notices', case when count(*) = 2 then 'OK' else 'FAIL '||count(*) end from pg_tables where schemaname='qa' and tablename in ('rectifications','notices') and rowsecurity
union all select 'subcon policies', case when count(*) >= 4 then 'OK' else 'FAIL '||count(*) end from pg_policies where schemaname='qa' and policyname in ('qa_rect_subcon','qa_notices_subcon_read','qa_notices_subcon_seen','qa_checklist_subcon')
union all select 'no subcon table policies', case when count(*) = 0 then 'OK' else 'FAIL '||count(*) end from pg_policies where schemaname='qa' and policyname in ('qa_audits_subcon','qa_child_subcon')
union all select 'realtime notices', case when exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='qa' and tablename='notices') then 'OK' else 'FAIL' end
union all select 'offense_no runs', case when qa.offense_no('J2','HA001',null) >= 1 then 'OK' else 'FAIL' end
union all select 'scorecard head-only', case when coalesce(pg_get_functiondef(to_regprocedure('qa.monthly_scorecard(date)')), '') like '%QA Head only%' then 'OK' else 'FAIL' end
union all select 'offense_preview role guard', case when coalesce(pg_get_functiondef(to_regprocedure('qa.offense_preview(text,text[])')), '') like '%QA Head or inspector only%' then 'OK' else 'FAIL' end
union all select 'bundle strips signatures', case when coalesce(pg_get_functiondef(to_regprocedure('qa.rectification_bundle(text)')), '') like '%subscriber_signature_path%' then 'OK' else 'FAIL' end
-- every head write goes through a security-definer RPC: no direct table insert and no sequence grant
union all select 'no table insert for authenticated', case when not has_table_privilege('authenticated','qa.rectifications','insert')
       and not has_table_privilege('authenticated','qa.notices','insert') then 'OK' else 'FAIL' end
union all select 'no seq grant', case when not has_sequence_privilege('authenticated','qa.rect_seq','usage') then 'OK' else 'FAIL' end
union all select 'offense_no has p_asof', case when to_regprocedure('qa.offense_no(text,text,text,timestamptz)') is not null then 'OK' else 'FAIL' end
union all select 'cfg read narrowed', case when coalesce((select pg_get_expr(polqual, polrelid) from pg_policy
         where polname = 'qa_cfg_read' and polrelid = 'qa.contractors'::regclass), '') like '%is_head%' then 'OK' else 'FAIL' end
-- the do-block loop is easy to half-apply: all FIVE config tables must be narrowed, not just the one probed above
union all select 'cfg read narrowed (all 5)', case when count(*) = 5 then 'OK' else 'FAIL '||count(*) end
  from pg_policy p where p.polname = 'qa_cfg_read'
   and p.polrelid in ('qa.violation_codes'::regclass,'qa.contractors'::regclass,'qa.quick_remarks'::regclass,'qa.settings'::regclass,'qa.checklist_items'::regclass)
   and pg_get_expr(p.polqual, p.polrelid) like '%is_head%'
union all select 'rls helpers (no recursion)', case when to_regprocedure('qa.prev_of_mine(text)') is not null and to_regprocedure('qa.rect_of_mine(text)') is not null and not exists (select 1 from pg_policies where schemaname='qa' and qual ilike '%from qa.audits%') then 'OK' else 'FAIL' end
-- is_console() is called from the storage + notices quals, which run with the CALLER's privileges
union all select 'is_console executable', case when has_function_privilege('authenticated','public.is_console()','execute') then 'OK' else 'FAIL' end
union all select 'touch trigger', case when exists (select 1 from pg_trigger where tgname = 'qa_touch_rectifications' and not tgisinternal) then 'OK' else 'FAIL' end
union all select 'ingest excludes reinspection', case when coalesce(pg_get_functiondef(to_regprocedure('qa.ingest_sheet_rows()')), '') like '%reinspection%' then 'OK' else 'FAIL (run qa-05b)' end
-- these two now need a QA-Head JWT; in the SQL editor (no claims) they report SKIP instead of raising
union all select 'scorecard runs', case when not qa.is_head() then 'SKIP (needs head JWT)' when jsonb_typeof(qa.monthly_scorecard(current_date)) = 'array' then 'OK' else 'FAIL' end
union all select 'offense_preview runs', case when not qa.is_head() then 'SKIP (needs head JWT)' when qa.offense_preview('J2', array['HA001']) ? 'HA001' then 'OK' else 'FAIL' end;
