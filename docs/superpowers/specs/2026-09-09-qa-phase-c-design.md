# QA Audit Phase C — Rectification loop, offense levels, subcon findings, monthly scorecard (approved 2026-09-09)

## Goal
Close the loop on failed subcontractor installs inside FieldOps: a failed inspection opens a
rectification the subcon can see, QA re-inspects and closes it, repeat violations escalate the
penalty level automatically (rolling 12 months), and the QA Head gets a monthly scorecard per
contractor. Builds on the live Phase A module (`qa` schema, console QA Audit page, mobile QA
inspector, sheet sync). Additive only; nothing in Phase A changes behaviour for GOOD audits.

## Owner decisions (2026-09-09)
- **Closure rule:** first inspection GOOD → done, no loop. Any Fail → FOR RECTIFICATION. Only QA
  re-inspects; a re-inspection that is GOOD closes the loop automatically (RECTIFIED). A
  re-inspection with any Fail keeps it open (new cycle). Only the **QA Head** can close manually
  (CLOSED, reason required). Subcon never marks anything in the system.
- **Subcon visibility:** read-only **QA Findings** page in the subcon console (own org only).
- **Deadline:** set by the QA Head per rectification, default **7 days**; overdue = flag only (no
  automatic escalation).
- **Offense counting:** per contractor, per violation code, **rolling 12 months**; penalty amount
  auto from the catalog level, QA Head may override with a reason.
- **Scorecard:** QA Head only, with Excel/PDF export. No penalty collection tracking.
- Approach 1: a separate `qa.rectifications` table; every re-inspection is a new audit row
  (history of every visit is preserved).

## Data model (additive)
### New table `qa.rectifications`
`id` text PK `RC-YYYY-NNNNNN` (sequence `qa.rect_seq`), `audit_id` (original failed audit, FK),
`last_audit_id` (latest inspection of this problem), `job_id`, `jo_no`, `acct_no`,
`contractor_name`, `contractor_org_id`, `subscriber`, `address`, `barangay`,
`status` check in (`FOR RECTIFICATION`, `FOR RE-INSPECTION`, `RECTIFIED`, `CLOSED`),
`deadline` date, `cycle` int default 1, `opened_at`, `rectified_at`, `closed_by`, `closed_at`,
`close_reason`, `created_at`, `updated_at`, `deleted_at`, `deleted_by`.
Computed in views/RPCs: `overdue` = status in (FOR RECTIFICATION, FOR RE-INSPECTION) and
`deadline < current_date` (Manila).
Indexes: `(status, deadline)`, `(contractor_org_id, status)`, `(audit_id)`.

### New columns
- `qa.audits.rectification_id` text FK (set on the original failed audit and on every
  re-inspection), `qa.audits.reinspection_of` text FK audits (the previous inspection of the same
  problem). `qa.audits.source` check gains `'reinspection'`.
- `qa.audit_violations.penalty_override` numeric, `override_by` text, `override_at` timestamptz,
  `override_reason` text. Effective penalty = `coalesce(penalty_override, penalty_amount)`.
- `qa.settings`: `rect_default_days` (7).
- `public.jobs.qa_status` gains values `FOR RECTIFICATION`, `FOR RE-INSPECTION`, `RECTIFIED`,
  `CLOSED BY HEAD` (mirror only; written by `qa.sync_job` / the rectification RPCs).

### New table `qa.notices`
`id` identity, `org_id` uuid, `rectification_id` text, `kind` (`opened`, `deadline`, `reinspect`,
`rectified`, `closed`), `created_at`, `seen_at`. Subcon badge = count where `seen_at is null`
for the caller's org. Append-only except `seen_at`.

## Rectification loop
1. **Open (automatic, inside `qa.submit_audit`)** — when `visit_status = VISITED` and the
   submission has ≥1 `fail` item (assessment FOR RECTIFY / FOR PENALTY / CLAWBACK):
   - if the audit has no `rectification_id`: insert `qa.rectifications` (status FOR
     RECTIFICATION, `deadline = today + rect_default_days`, cycle 1, `last_audit_id = audit`),
     set `audits.rectification_id`, mirror `jobs.qa_status = 'FOR RECTIFICATION'`, insert
     notice `opened` for `contractor_org_id` (if mapped), log.
   - if the audit **is a re-inspection** (`source = reinspection`): rectification stays open,
     `cycle + 1`, new `deadline = today + rect_default_days`, `last_audit_id = this audit`,
     status back to FOR RECTIFICATION, notice `opened`, log.
   - GOOD submission of a re-inspection → rectification `RECTIFIED`, `rectified_at = now()`,
     `last_audit_id = this audit`, mirror `jobs.qa_status = 'RECTIFIED'`, notice `rectified`.
   - GOOD submission of a first inspection → no rectification.
2. **QA Head actions (RPCs, `qa.is_head()` only)**
   - `qa.set_rect_deadline(p_id, p_date, p_reason)` → log + notice `deadline`.
   - `qa.assign_reinspection(p_rect_id, p_inspector, p_date, p_seq)` → creates a new
     `qa.audits` row: `source = 'reinspection'`, `rectification_id`, `reinspection_of =
     last_audit_id`, copies subscriber/JO/contractor/NAP fields from the last audit, status
     `assigned` to the inspector (same `assign` semantics: date, sequence, push, log); sets
     rectification status FOR RE-INSPECTION, notice `reinspect`. Allowed while status is FOR
     RECTIFICATION or FOR RE-INSPECTION (re-assign replaces the pending re-inspection audit if it
     is still `assigned`; an `in_progress` one is unassigned first).
   - `qa.close_rectification(p_id, p_reason)` → status CLOSED, `closed_by/at/reason`, mirror
     `jobs.qa_status = 'CLOSED BY HEAD'`, notice `closed`. Requires a non-empty reason.
   - Unassign of a re-inspection audit (existing `unassign_audits`, now also `in_progress`)
     returns the rectification to FOR RECTIFICATION.
3. **Mobile inspector** — a re-inspection audit renders in the same flow with a header badge
   "RE-INSPECTION · cycle N" and a collapsible "Previous findings" block (failed items, codes,
   inspector remarks, inspector photos of the previous inspection, via `getAudit` of
   `reinspection_of`). Everything else (checklist, photos, signatures, submit, offline) is
   unchanged.
4. **Console QA Head** — new sixth tab **Rectifications**: filters (status, contractor, overdue
   only, search), stats (open, overdue, rectified this month, avg days to rectify), rows (RC no.,
   subscriber, contractor, original audit link, codes summary, deadline red when overdue, cycle,
   last action), actions: Set deadline, Assign re-inspection, Close (reason), Print findings
   (PDF: the failed items + violations + inspector photos, no signatures). The audit detail modal
   gains a "Rectification" section listing every inspection of the problem with links.

## Offense counting and penalty
- Computed inside `qa.submit_audit` per violation row:
  `offense_no = 1 + count(distinct audit_id)` of prior `qa.audit_violations` with the same
  `code` whose audit is `done`, not deleted, same `contractor_name`, `inspected_at >= now() -
  interval '12 months'`, and `audit_id <> current`. The same code appearing on several items of
  one audit shares one `offense_no`.
- `penalty_amount = penalty_l{min(offense_no,3)}` from the catalog (null when the level has no
  peso amount; `penalty_text` is shown instead). `total_penalty` = sum of effective amounts.
- **Override:** RPC `qa.override_penalty(p_violation_id, p_amount, p_reason)` (head only, reason
  required) sets `penalty_override/override_by/override_at/override_reason`, recomputes the
  audit `total_penalty`, logs. `offense_no` never changes.
- **Re-inspection Fail** on the same code counts as a new offense (level rises).
- **Legacy rows** (sheet imports, no codes) never count. Phase-A audits keep their stored values
  until the QA Head runs **Settings → "Recompute offense levels"** once (RPC
  `qa.recompute_offenses()`, head only, confirm dialog, logs per audit); after that every
  submission is computed live.
- **Mobile hint:** when the inspector picks a code, the form shows "Offense #N · ₱X" using
  `qa.offense_preview(contractor, codes[])` fetched when the audit is opened (cached in the
  draft for offline). The server value at submit is authoritative.
- Print form: NO. OF OFFENSE and PENALTY columns are always filled from the stored values.

## Subcon "QA Findings" page
- Visible to subcon console users (`dashboard_users.org_id` = a subcon org); added to
  `SUBCON_CONSOLE_PAGES` as view-only (`qafindings`). GC users do not get it.
- Content (read-only): stats (For Rectification, Overdue, For Re-inspection, Rectified this
  month); list of the org's rectifications (RC no., subscriber, address, JO, inspection date,
  deadline, status, cycle); detail = failed items, violation code + category + severity +
  offense level + effective penalty + inspector remark + inspector photos of the **last**
  inspection, plus the inspection history of the problem. Never shows subscriber/inspector
  signatures, Pass photos, other contractors' data, GOOD audits, `sheet_rows`, `audit_log`, or
  config.
- Badge on the nav item = unseen notices; opening the page marks them seen
  (`qa.mark_notices_seen()`); realtime on `qa.notices` shows a toast "May bagong QA finding".
- Requires `qa.contractors.org_id` mapping; Settings warns for any contractor with an open
  rectification and no org mapping (they cannot see their findings).
- RLS (additive): helper `qa.my_org()` = `public.jwt_org_id()`. Subcon SELECT on
  `qa.rectifications` where `contractor_org_id = qa.my_org()`; SELECT on `qa.audits`,
  `audit_items`, `audit_violations`, `audit_photos` only for rows whose `rectification_id`
  belongs to the org; `qa.notices` SELECT/UPDATE(seen_at) for own org; storage read on
  `qa-photos` for audit folders of the org's rectifications. `qa.is_head()` remains GC console
  only; inspectors unchanged.
- Code: new file `console-qa-findings.js` (`ConsoleQAFindings.mount(rootEl,{api,user,deps})`),
  reusing `qa-api.js` with new methods `listRectifications(filter)`, `getRectification(id)`,
  `setRectDeadline`, `assignReinspection`, `closeRectification`, `overridePenalty`,
  `offensePreview`, `recomputeOffenses`, `monthlyScorecard(month)`, `noticesUnseen()`,
  `markNoticesSeen()`, `subscribeNotices(cb)`; `qa-sim.js` mirrors all of them.

## Monthly scorecard (QA Head)
- SQL function `qa.monthly_scorecard(p_month date)` → one row per contractor (subcon first,
  AHBA last), Manila month by `inspected_at` (inspections) and `opened_at` (rectifications):
  closed installs (from `sheet_rows`), inspected (first inspections only), coverage %;
  GOOD / FOR RECTIFY / FOR PENALTY / CLAWBACK; pass rate per checklist item; NPA/unlocated;
  violations total and per severity, top 5 codes, repeat offenses (level ≥ 2); total effective
  penalty and override count; rectifications opened, rectified within deadline, rectified late,
  closed by head, still open, overdue at month end, average days finding → RECTIFIED; previous
  month's coverage, pass rate and penalty for trend.
- Console: Reports tab → **Monthly scorecard** section (month picker, table with colour rules:
  subcon coverage < 100 % red, pass rate < 90 % yellow, overdue > 0 red; click a contractor for
  its breakdown). Current month allowed (partial).
- Export: Excel with sheets **Scorecard** (SUMMARY PER CON layout + new columns), **Violations**
  (one row per violation of the month with offense level, effective penalty, override reason),
  **Rectifications** (one row per rectification with dates, deadline, status, cycle, days);
  PDF one page per contractor for Sky / the subcon.

## Security summary
Head-only writes for everything new (RPCs check `qa.is_head()`); inspector writes only through
`submit_audit` (re-inspection audits obey the existing inspector policies); subcon strictly
read-only on own-org rows; notices' only subcon write is `seen_at`. All RPCs `security definer`
with explicit `search_path`, revoked from public/anon and granted explicitly. Soft-delete only;
`audit_log` append-only guard unchanged.

## Testing (dry run before live, like Phase A)
- `qa-core.js`: offense counting rule (rolling window, same-audit dedup), effective penalty,
  scorecard math, rectification state transitions (pure functions) — node tests.
- `qa-sim.js`: full loop tests (fail → rectification opened with deadline; assign re-inspection
  creates linked audit; GOOD re-inspection → RECTIFIED; Fail re-inspection → cycle 2 and offense
  level 2; head close with reason; unassign returns to FOR RECTIFICATION; override changes
  totals; subcon visibility filter; notices/seen).
- Demo page: third frame "Subcon console" beside inspector phone and QA Head console.
- Live test: one real failed audit by QA01 → subcon findings page shows it → re-inspection
  assigned and submitted → RECTIFIED; then the Messenger export is retired.

## Rollout (owner go per phase)
- **C0 SQL:** tables/columns/RPCs/RLS/VERIFY; then the QA Head runs "Recompute offense levels"
  once. SQL is applied in the SQL editor in small chunks (the editor's RLS dialog blocks
  whole-file runs; learned in Phase 0).
- **C1 Console:** Rectifications tab, override, scorecard + exports, subcon QA Findings page;
  contractor → org mapping completed in Settings.
- **C2 Mobile:** re-inspection header + previous findings + offense hint.
- **C3 Subcon accounts:** each subcon's console user informed; Messenger becomes a reminder only.

## Out of scope (later)
Penalty collection/deduction tracking, subcon self-marking, email/SMS notifications, ranking
visible to subcons, searchable violation picker (Phase A follow-up), audit soft-delete UI
(Phase A follow-up).
