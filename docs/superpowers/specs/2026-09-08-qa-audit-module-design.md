# QA Audit Module (Field Inspection) — Design (approved 2026-09-08)

## Goal
100% field QA audit of subcontractor installs (250–300/month, scaling with total
volume toward 2,000/month) plus sampled audits of in-house installs, replacing the
printed subscriber sheets + paper checklist carried by the 2–3 QA inspector teams.
Built INSIDE FieldOps (Approach A): new mobile role, new console page, new `qa`
schema, all code in separate files so `app.js` / `mobile-a.js` / `mobile-b.js` stay
small. Reuses everything FieldOps already pays for: Supabase auth/RLS/storage/
realtime/Edge Functions/pg_cron, push, attendance, GPS, photo compress+watermark,
offline queue, chat/announcements, Access Control, export.

**Phase scope (owner decision):** record-only now (option A). Failed audits are
recorded with structured findings; follow-up with the subcon stays manual
(Messenger/call). The data model is built so option C (rectification loop, SLA,
offense counting, monthly scorecard) is additive later — no restructure.

## Facts the design depends on
- Source of truth for "install completed" is the **Sky JO-closure extract**, kept in
  the QA team's Google Sheet `FOR QA VALIDATION` (id
  `1ilvGcqRaHGDM7nRKIkQT3f9BQmCMQs5pN5yOropllKo`, owner sky.ahbacx@gmail.com).
  Tab `NEW COMPLETED JOS` = master with QA columns; tab `NEW EXTRACT` = raw Sky
  extract; tab `ACC` = lookup lists incl. the **102-code violation catalog**
  (CODE / TYPE / DESCRIPTION / PENALTY per offense level); tab `SUMMARY PER CON`
  = the weekly/monthly pivot the QA Head reviews today.
- Sheet columns used: COMP, JODATECLOSED, ACCTNO, JONO, SSPCODE, SUBSCRIBERNAME,
  MOBILENO, BARANGAYNAME, COMPLETEADDRESS, TRANTYPECODE, NAPCODE, PORTNO, SERIALNO,
  REMARKS, QA / GC, VISITED, DATE QA, LATLONG, WIRE, OTHERS, ASSESMENT,
  INSPECTED BY, DRIVER, TECH, TECH 2.
- Existing QA vocabulary (kept verbatim so the team is not retrained):
  - Visit status: VISITED, VISITED / NPA, FOR VISIT, UNLOCATED, NOT EXIST, H.CLOSED
  - Assessment: GOOD, FOR RECTIFY, FOR PENALTY, CLAWBACK (RECTIFIED = phase C)
  - Wire: STANDARD, EXISTING, SUBSTANDARD
  - QA / GC: COMPLETED, INCOMPLETE, NONE
  - OTHERS (27 free-text findings, e.g. NO TAGGING NAP-NIU, NO HOUSE BRACKET/USED
    SPAN CLAMP, NO MIDSPAN, NO S-CLAMP, IMPROPER CABLE LAYOUT, NO LOOPING IN NIU,
    NO PATCH CORD INSTALLED, WRONG ADDRESS …) — seeded as quick-pick remarks.
- Match keys sheet ↔ FieldOps: `ACCTNO` = `jobs.ibass_acct_no`, `JONO` =
  `jobs.job_order_no`.
- Contractor names in the sheet (AVELINE, J2, RIA, MAX - ALLY88, JHANRENZ, J VANA,
  COMWORKS, JD CRUZ, AHBA) do NOT equal FieldOps org codes → mapping table.
- Subcon technicians only partly use FieldOps mobile (some close out, most don't,
  no photos). Both sources must feed one queue without duplicates.
- Paper form (QA FORM.docx): header (Inspection/Ticket no., Inspection Date,
  Inspector, Contractor's Representative, Installer/s, Contractor/Dept, Client's
  Name, Account No., Address); 10 checklist items (Pass/Fail) in 2 sections;
  violations table (CODE, CATEGORY, DESCRIPTION, CLASS, SEVERITY, NO. OF OFFENSE,
  PENALTY) + TOTAL VIOLATION FOUND + TOTAL PENALTY; FOUND BUSINESS (willing / not
  willing to upgrade, OLD PLAN, NEW PLAN); subscriber acknowledgement text +
  inspector certification text; subscriber and inspector signatures.

## Data model — new schema `qa` (exposed to PostgREST like `wims`)
All additive. Soft-delete only. No hard deletes anywhere.

### Config (QA Head edits in console → Settings)
- `qa.checklist_items` — `id`, `section` ('OUTSIDE' | 'PREMISE'), `label`,
  `sort_order`, `active`, `photo_required` bool (default false), `suggested_code`
  (FK violation code, nullable), `created_at`. Seed = the 10 form items:
  - OUTSIDE: Maintenance loop above the NAP; Attachment of S-clamps from every pole
  - PREMISE: Attachment of house bracket; Maintenance loop beside the house bracket;
    Layout of drop cable in client premise; Use of tapping clip and/or tie wrap;
    NIU box fixed; Looping at NIU box; Patch cord; Modem location
  - Suggested codes: S-clamps → PR003, house bracket → HA001, drop cable layout →
    INW001, NIU box fixed / looping / modem → INW002, patch cord → INW002,
    maintenance loops → PR005 (QA Head may change).
- `qa.violation_codes` — `code` PK, `category` (sheet TYPE), `description`,
  `class`, `severity`, `penalty_text` (raw), `penalty_l1/l2/l3` numeric nullable
  (parsed where the text is a plain peso amount), `active`. Seed = 102 rows from
  tab `ACC` (extracted by a script that reads ONLY the lookup columns — no
  subscriber PII enters the repo).
- `qa.contractors` — `sheet_name` PK (COMP value), `org_id` FK `orgs` nullable,
  `display_name`, `kind` ('subcon' | 'inhouse'), `coverage` ('all' | 'sample'),
  `active`. Seed = 9 names; AHBA = inhouse/sample, others = subcon/all, `org_id`
  null until the QA Head maps them (Settings shows "unmapped").
- `qa.quick_remarks` — the 27 OTHERS values (quick-pick chips on the fail/remark
  field).
- `qa.settings` — key/value: `inhouse_sample_pct` (default 10), `initial_cutoff`
  (default 2026-08-01), `sync_window_days` (60), `last_sync_at`, `last_sync_rows`.

### Imported mirror
- `qa.sheet_rows` — `jo_no` PK, `acct_no`, `comp`, `jo_date_closed`, `ssp_code`,
  `subscriber_name`, `mobile_no`, `barangay`, `complete_address`, `tran_type`,
  `nap_code`, `port_no`, `serial_no`, `driver`, `tech`, `tech2`, legacy QA columns
  (`sheet_qa_gc`, `sheet_visited`, `sheet_date_qa`, `sheet_latlong`, `sheet_wire`,
  `sheet_others`, `sheet_assessment`, `sheet_inspected_by`, `sheet_remarks`),
  `raw` jsonb, `first_seen_at`, `updated_at`. Upsert only.

### The audit (queue + result in one row)
- `qa.audits` — `id` text PK `QA-YYYY-NNNNNN` (sequence), `source` ('sheet' |
  'fieldops' | 'sheet_legacy' | 'manual'), `job_id` FK `jobs` nullable, `jo_no`,
  `acct_no`, `sheet_row_jo` FK nullable, `contractor_name`, `contractor_org_id`,
  `kind`, copied subscriber fields (`subscriber`, `mobile_no`, `address`,
  `barangay`, `nap_code`, `port_no`, `serial_no`, `tran_type`, `jo_date_closed`,
  `installers_text` prefilled from driver/tech/tech2, `sheet_latlong`),
  `status` ('pool' | 'queued' | 'assigned' | 'in_progress' | 'done'),
  `unmapped` bool, `assigned_to` (inspector username), `assigned_by`,
  `assigned_at`, `scheduled_date`, `sequence` int, `started_at`, `inspected_at`,
  `lat`, `lng`, `inspector`, `contractor_rep`, `visit_status`, `qa_gc`, `wire`,
  `assessment`, `found_business` ('willing' | 'not_willing' | null), `old_plan`,
  `new_plan`, `remarks`, `subscriber_signed_name`, `subscriber_signature_path`,
  `inspector_signature_path`, `total_violations` int, `total_penalty` numeric,
  `reopened_count`, `created_at`, `updated_at`, `deleted_at`, `deleted_by`.
  Unique partial index on `jo_no` where not null (dedup key); fallback match on
  `acct_no`.
- `qa.audit_items` — `audit_id`, `item_id`, `result` ('pass' | 'fail' | 'na'),
  `remark`, `updated_at`. Unique (audit_id, item_id).
- `qa.audit_photos` — `id`, `audit_id`, `item_id` nullable, `path`, `label`,
  `created_at`. Bucket `qa-photos` (authenticated read, NOT public — contains
  signatures + subscriber info).
- `qa.audit_violations` — `id`, `audit_id`, `code` FK, `item_id` nullable,
  `description` (from catalog, editable), `category`, `class`, `severity`,
  `offense_no` int nullable (phase C computes), `penalty_amount` numeric nullable,
  `photo_path`, `remark`, `created_at`.
- `qa.audit_log` — append-only (`audit_id`, `at`, `by`, `action`, `detail`).
  Trigger blocks UPDATE/DELETE (same principle as the jobs.history guard).

### Additive columns on `public.jobs` (four-place rule does NOT apply — these are
written by DB triggers, never by encode forms)
`qa_audit_id`, `qa_status` ('FOR VISIT' | 'ASSIGNED' | 'VISITED' | 'VISITED / NPA'
| 'UNLOCATED' | 'NOT EXIST' | 'H.CLOSED'), `qa_assessment`, `qa_inspected_at`.
Updated by trigger when an audit is created/linked/assigned/submitted. Console
shows a QA badge on Job Orders rows, JO Detail (new QA section with link), and the
Completed page. Add the four names to the `getJobs` column list in `ahba-cloud.js`.

## Mobile — QA Inspector (`mobile-qa.js`)
- `technicians.role = 'qa_inspector'` (org AHBA). Accounts AHBA_QA01… created in
  Access Control (role picker gets the new role). Reuse password flow, attendance
  clock-in, GPS capture, chat, announcements.
- `mobile.html` loads `mobile-qa.js` (with `?v=`); `enterFlow()` gets one line:
  `if(myRole==='qa_inspector'){ startQA(); return; }`. Nothing else in a/b changes.
- **Home "My Inspections"**: tabs Today / Upcoming / Done. Card = audit no.,
  subscriber, address, barangay, contractor, JO close date, installers,
  **Navigate** (Google Maps link by lat/long if present else address). Assigned
  list cached in localStorage for offline viewing. If the audit has a FieldOps
  `job_id`, the install's close-out photos are viewable inside the card.
- **Start inspection** → `in_progress`, GPS + time captured; header auto-filled.
  Editable: contractor's representative, installer/s (prefilled).
- **Visit status first.** Not VISITED → short form (remark + location photo) →
  submit. VISITED → checklist.
- **Checklist**: 10 items, big Pass / Fail / N/A buttons. Fail expands: camera
  (required), remark with quick-remark chips, violation code preselected from the
  item's `suggested_code`, changeable via searchable picker over the catalog.
  Optional photo on Pass. "Add other violation" for findings not tied to an item.
- **Assessment section**: Wire, QA/GC, Assessment (default GOOD when no Fail;
  with any Fail the inspector must pick FOR RECTIFY / FOR PENALTY / CLAWBACK),
  Found Business + old/new plan, general remarks.
- **Signatures**: subscriber name + canvas signature pad, inspector signature pad,
  both certification texts displayed. Subscriber signature required when
  VISITED; not required for NPA/other statuses.
- **Submit** = one RPC `qa.submit_audit(audit_id, payload)`; client validates
  (all items answered, every Fail has a photo + code, signatures). Offline: the
  payload and each photo/signature are separate `syncQ` items with retry;
  "N pending upload" indicator. Photos go through `compressImage` + `buildStamp`
  (date/time/GPS/inspector watermark). After submit the audit is view-only for the
  inspector (Done tab) until the QA Head reopens it.

## Console — QA Head page (`console-qa.js`)
Sidebar page **QA Audit**, key `qaaudit` (added to `PAGE_KEYS`, gated by
`allowed_pages` / `edit_pages`; GC-only). `app.js` adds only: page key, nav item,
`initQA()` call in `switchPage`, JO Detail QA section, role in Access Control.
Five sub-tabs:
1. **Queue** — filters (contractor, kind, barangay, JO close date range, status
   pool/queued/assigned, search), checkboxes, actions: **Assign** (inspector +
   date + sequence, bulk), **Random sample N% of in-house** for a date range
   (pool → queued), manual pick of any pool row, unassign. Header stats: subcon
   closed / queued / done this month, **aging** buckets (days since JO close, not
   yet inspected).
2. **Today's board** — per inspector: assigned list for the date with live status
   and progress, reassign / reorder (realtime to mobile), Leaflet map with pins
   colored per inspector.
3. **Results** — done audits with filters (QA date, contractor, assessment,
   inspector, has-violation). Detail modal = replica of the paper form: header,
   checklist results + photos, violations table, found business, signatures, GPS
   pin, audit log. Actions: **Reopen** (→ `in_progress`, logged),
   **Print / PDF** (HTML form replica + photo sheet), export row.
4. **Reports** — **Daily** (per-install list for a date, all form columns, Excel
   export, batch print) and **Weekly review** (Mon–Sun or custom range): per
   contractor counts by assessment, pass rate per checklist item, top violations
   by code, total penalty, per-inspector productivity (inspections, NPA count),
   coverage vs closed installs. Excel export shaped like `SUMMARY PER CON`.
   Aggregation runs in a SQL view/RPC, not in the browser.
5. **Settings** — checklist editor, violation catalog editor, contractor mapping
   (sheet name → org → kind → coverage), sampling %, initial cutoff, sync status
   (last sync, rows, unmapped contractor names), **CSV upload** fallback.
- Notifications: nav badge = audits submitted today; toast on new submission via
  realtime on `qa.audits` + 2-minute fallback poll (no other timers). Push to the
  inspector on assignment (existing `send-push`, `team` = inspector username).

## Sheet sync and queue creation
- **Google Apps Script** bound to the sheet, installed by the sheet owner
  (Extensions → Apps Script, time trigger every 15 min). Reads `NEW COMPLETED JOS`
  rows with JODATECLOSED within `sync_window_days`, POSTs JSON batches (≤500
  rows) to Edge Function `qa-sheet-sync` with header `x-qa-secret`. **Read-only on
  the sheet; writes nothing there.** Claude writes the script + step-by-step
  instructions; the owner installs it (Claude does not enter Google accounts).
- **Edge Function `qa-sheet-sync`**: verify secret → validate rows (JONO required,
  date parseable; bad rows reported, not fatal) → upsert `qa.sheet_rows` → call
  RPC `qa.ingest_sheet_rows()` → update `qa.settings.last_sync_*` → return counts.
- **`qa.ingest_sheet_rows()`** for each sheet row without an audit:
  1. Create `qa.audits`: `kind`/`coverage` from `qa.contractors`; subcon/all →
     `queued`; inhouse/sample → `pool`; unknown contractor → `queued` +
     `unmapped=true`. Rows older than `initial_cutoff` → `pool` (never auto-queued).
  2. Match `jobs` by `job_order_no` = JONO else `ibass_acct_no` = ACCTNO (not
     soft-deleted) → set `job_id`, `jobs.qa_status='FOR VISIT'`, `qa_audit_id`.
  3. Rows that already carry sheet QA data (VISITED / DATE QA / ASSESMENT /
     INSPECTED BY) → audit created as `done`, `source='sheet_legacy'`, copying
     visit status, date, assessment, wire, inspector, OTHERS → `remarks`, LATLONG
     → lat/lng. No checklist detail. Included in reports/coverage.
  For a sheet row whose JONO already has a `fieldops` audit: link `sheet_row_jo`,
  fill blank fields only (NAP, port, serial, installers), never touch inspection
  data.
- **FieldOps trigger** on `jobs`: status → `completed` (any org) and no audit with
  the same `job_order_no`/`ibass_acct_no` → create audit `source='fieldops'`
  (contractor from `assigned_org_id` → `qa.contractors.org_id`; subcon → queued,
  inhouse → pool).
- **Sync health**: Settings shows last sync age/rows; QA page shows a warning
  banner when last sync > 2 h. CSV upload (same columns) is the fallback path and
  runs the same ingest RPC.

## Security
- RLS on every `qa` table. Inspector (`qa_inspector`, org AHBA): SELECT audits
  where `assigned_to = my_team()`; UPDATE own audit while status in
  (`assigned`,`in_progress`); INSERT items/photos/violations only for own audit;
  RESTRICTIVE policy denies writes when `done`. GC console with `qaaudit`: full
  access (edit) or SELECT (view-only). Subcon console users: no access now (phase
  C adds SELECT on own contractor's audits). Config tables: SELECT authenticated,
  write GC only.
- Storage `qa-photos`: inspector may upload under `qa/<own audit id>/…` only;
  read = authenticated.
- Edge Function: secret header check, service role inside, no delete path.
- All helper functions SECURITY DEFINER with explicit `search_path`.
- `submit_audit` is transactional and idempotent (re-submission of the same
  payload is a no-op).

## Reliability / performance
- No new `setInterval` beyond the single 2-min QA badge fallback. `console-qa.js`
  and `mobile-qa.js` initialise only when the QA page is opened / QA role logs in.
- All list queries paginated (1,000-row PostgREST cap). Indexes:
  `audits(status, scheduled_date, assigned_to)`, `audits(contractor_name,
  inspected_at)`, `audits(jo_no)`, `audits(job_id)`, `sheet_rows(acct_no)`.
- Version stamps: new `APP_VERSION` in mobile + console, `?v=` on the new script
  tags, matching `version.json`, complete upload, live verify.

## Build order (each a small, separately testable piece)
1. SQL migrations `supabase/migrations/qa-01…qa-0N` + VERIFY scripts: schema,
   tables, indexes, RLS, RPCs, jobs columns + trigger, bucket, seeds (checklist,
   102 codes, contractors, quick remarks, settings). Seed extraction script reads
   `~/Downloads/FOR QA VALIDATION.xlsx` tab `ACC` lookup columns only.
2. Edge Function `qa-sheet-sync` + `google-apps-script/qa-sheet-sync.gs` +
   install instructions.
3. `mobile-qa.js` + `mobile.html` script tag + role router line.
4. `console-qa.js` + `index.html` (nav, page container, script tag) + `app.js`
   glue + `ahba-cloud.js` column list.
5. Print form replica.

## Testing
- `node --check` on every JS file.
- Unit tests (`qa-core.test.mjs`, node test runner, like `billing-core.test.mjs`)
  for pure logic: assessment default, penalty text parsing, sampling picker,
  sheet/FieldOps dedup, submit payload validation.
- **QA demo page** (`qa-demo.html` + fake backend, like `billing-demo.html`):
  full inspector flow and QA Head page runnable in the preview browser without
  live data; UI reviewed by the owner before any deploy.
- Live tests only with throwaway `ZZ-` rows (soft-deleted immediately), a test
  inspector account, and sheet rows flagged as test.

## Rollout (each phase needs the owner's explicit go)
- **Phase 0** — SQL on live Supabase (additive, invisible to users) + legacy
  import. Verify.
- **Phase 1** — Console QA page deployed; Apps Script installed; coverage/aging/
  legacy results usable immediately.
- **Phase 2** — Mobile deployed; **one inspector pilot for one week, paper kept in
  parallel**; compare, fix gaps.
- **Phase 3** — All QA teams; paper retired; weekly review from the app.
- **Phase 4 (= option C, separate spec)** — rectification loop visible to subcon,
  automatic offense numbering per contractor per code, SLA, monthly scorecard.

## Work is done in GitHub clones, not the local repo root
Production console = repo `alleczandrehalili-beep/ahba-console`; mobile = repo
`alleczandrehalili-beep/ahbadevt`. Clone to scratchpad, branch `qa-audit`, bump
versions, push the branch when the owner says so; owner decides merge/deploy.

## Inputs still needed from the owner (not blocking the build)
- Inspector account names (sheet shows MARVEL MANZO, MARLON BILLONES, NIKKO
  ESTROPE → AHBA_QA01–03).
- Contractor mapping to FieldOps org codes (can be done later in Settings).
- In-house sampling % (proposed 10) and initial cutoff date (proposed 2026-08-01).
- Sheet owner installs the Apps Script.
