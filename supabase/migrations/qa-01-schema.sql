-- QA Audit module — schema (2026-09-08). ADDITIVE ONLY. Spec: docs/superpowers/specs/2026-09-08-qa-audit-module-design.md
-- Run in the Supabase SQL editor (Phase 0). Re-runnable (if not exists everywhere).
create schema if not exists qa;

-- ---------- config ----------
create table if not exists qa.violation_codes (
  code text primary key,
  category text not null,
  description text not null default '',
  class text,                       -- code prefix family (PR, HA, INW, CPE, MIS, ...)
  severity text not null default 'MINOR' check (severity in ('MINOR','MAJOR','CRITICAL')),
  penalty_text text not null default '',
  penalty_l1 numeric, penalty_l2 numeric, penalty_l3 numeric,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists qa.checklist_items (
  id bigint generated always as identity primary key,
  section text not null check (section in ('OUTSIDE','PREMISE')),
  label text not null unique,
  sort_order int not null default 100,
  active boolean not null default true,
  photo_required boolean not null default false,
  suggested_code text references qa.violation_codes(code),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists qa.contractors (
  sheet_name text primary key,                  -- COMP value in the sheet (AVELINE, J2, ...)
  display_name text not null,
  org_id uuid references public.orgs(id),       -- null until the QA Head maps it
  kind text not null default 'subcon' check (kind in ('subcon','inhouse')),
  coverage text not null default 'all' check (coverage in ('all','sample')),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists qa.quick_remarks (
  label text primary key,
  sort_order int not null default 100,
  active boolean not null default true
);

create table if not exists qa.settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------- imported mirror of the Google Sheet (upsert only, never deleted) ----------
create table if not exists qa.sheet_rows (
  jo_no text primary key,
  acct_no text,
  comp text,
  jo_date_closed date,
  ssp_code text, subscriber_name text, mobile_no text, barangay text, complete_address text,
  tran_type text, nap_code text, port_no text, serial_no text,
  driver text, tech text, tech2 text,
  sheet_qa_gc text, sheet_visited text, sheet_date_qa date, sheet_latlong text, sheet_wire text,
  sheet_others text, sheet_assessment text, sheet_inspected_by text, sheet_remarks text,
  raw jsonb,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sheet_rows_acct_idx on qa.sheet_rows(acct_no);
create index if not exists sheet_rows_closed_idx on qa.sheet_rows(jo_date_closed);

-- ---------- the audit: queue + result in one row ----------
create sequence if not exists qa.audit_seq;
create table if not exists qa.audits (
  id text primary key,                                    -- QA-YYYY-NNNNNN
  source text not null check (source in ('sheet','fieldops','sheet_legacy','manual')),
  job_id text references public.jobs(id),
  jo_no text, acct_no text, sheet_row_jo text references qa.sheet_rows(jo_no),
  contractor_name text, contractor_org_id uuid references public.orgs(id),
  kind text check (kind in ('subcon','inhouse')),
  unmapped boolean not null default false,
  subscriber text, mobile_no text, address text, barangay text, nap_code text, port_no text, serial_no text,
  tran_type text, jo_date_closed date, installers_text text, sheet_latlong text,
  status text not null default 'queued' check (status in ('pool','queued','assigned','in_progress','done')),
  assigned_to text, assigned_by text, assigned_at timestamptz, scheduled_date date, sequence int,
  started_at timestamptz, inspected_at timestamptz, lat double precision, lng double precision,
  inspector text, contractor_rep text,
  visit_status text check (visit_status is null or visit_status in ('VISITED','VISITED / NPA','FOR VISIT','UNLOCATED','NOT EXIST','H.CLOSED')),
  qa_gc text check (qa_gc is null or qa_gc in ('COMPLETED','INCOMPLETE','NONE')),
  wire text check (wire is null or wire in ('STANDARD','EXISTING','SUBSTANDARD')),
  assessment text check (assessment is null or assessment in ('GOOD','FOR RECTIFY','FOR PENALTY','CLAWBACK','RECTIFIED')),
  found_business text check (found_business is null or found_business in ('willing','not_willing')),
  old_plan text, new_plan text, remarks text,
  subscriber_signed_name text, subscriber_signature_path text, inspector_signature_path text,
  total_violations int not null default 0, total_penalty numeric not null default 0,
  submit_key text, reopened_count int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, deleted_by text
);
create unique index if not exists audits_jo_no_uidx on qa.audits(jo_no) where jo_no is not null and deleted_at is null;
create index if not exists audits_acct_idx on qa.audits(acct_no);
create index if not exists audits_job_idx on qa.audits(job_id);
create index if not exists audits_queue_idx on qa.audits(status, scheduled_date, assigned_to) where deleted_at is null;
create index if not exists audits_results_idx on qa.audits(contractor_name, inspected_at) where deleted_at is null;
create index if not exists audits_closed_idx on qa.audits(jo_date_closed) where deleted_at is null;

create table if not exists qa.audit_items (
  audit_id text not null references qa.audits(id),
  item_id bigint not null references qa.checklist_items(id),
  result text not null check (result in ('pass','fail','na')),
  remark text,
  updated_at timestamptz not null default now(),
  primary key (audit_id, item_id)
);

create table if not exists qa.audit_photos (
  id bigint generated always as identity primary key,
  audit_id text not null references qa.audits(id),
  item_id bigint references qa.checklist_items(id),
  path text not null unique,
  label text,
  created_at timestamptz not null default now()
);
create index if not exists audit_photos_audit_idx on qa.audit_photos(audit_id);

create table if not exists qa.audit_violations (
  id bigint generated always as identity primary key,
  audit_id text not null references qa.audits(id),
  code text not null references qa.violation_codes(code),
  item_id bigint references qa.checklist_items(id),
  description text, category text, class text, severity text,
  offense_no int, penalty_amount numeric,
  photo_path text, remark text,
  created_at timestamptz not null default now()
);
create index if not exists audit_violations_audit_idx on qa.audit_violations(audit_id);
create index if not exists audit_violations_code_idx on qa.audit_violations(code);

create table if not exists qa.audit_log (
  id bigint generated always as identity primary key,
  audit_id text not null references qa.audits(id),
  at timestamptz not null default now(),
  by text not null,
  action text not null,
  detail jsonb
);
create index if not exists audit_log_audit_idx on qa.audit_log(audit_id, at);

-- ---------- additive QA status on the JO (written ONLY by qa triggers/RPCs) ----------
alter table public.jobs add column if not exists qa_audit_id text;
alter table public.jobs add column if not exists qa_status text;
alter table public.jobs add column if not exists qa_assessment text;
alter table public.jobs add column if not exists qa_inspected_at timestamptz;
create index if not exists jobs_qa_status_idx on public.jobs(qa_status) where qa_status is not null;

-- updated_at maintenance
create or replace function qa.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['violation_codes','checklist_items','contractors','settings','sheet_rows','audits','audit_items'] loop
    if not exists (select 1 from pg_trigger where tgname = 'qa_touch_'||t) then
      execute format('create trigger qa_touch_%I before update on qa.%I for each row execute function qa.touch_updated_at()', t, t);
    end if;
  end loop;
end $$;
