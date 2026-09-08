# QA Audit Module (Field Inspection) — Implementation Plan (DRY RUN FIRST)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the QA field-inspection module (inspector mobile flow, QA Head console page, `qa` schema, sheet sync) as separate files, fully runnable and reviewable in a local demo with a fake backend BEFORE anything touches live FieldOps.

**Architecture:** All QA data access goes through one adapter interface (`QaApi`) with two implementations: `qa-sim.js` (in-memory, seeded, used by the demo + node tests) and `qa-api.js` (real Supabase, `qa` schema). `mobile-qa.js` and `console-qa.js` are UI modules that `mount(rootEl, {api, user, deps})` — identical code in the demo and in production. Pure rules (assessment default, penalty parsing, sampling, dedup, validation, weekly summary) live in `qa-core.js` and are unit-tested; the SQL RPCs implement the same rules server-side.

**Tech Stack:** Vanilla JS (no build), Supabase (PostgREST, RLS, RPC, Storage, Realtime, Edge Functions on Deno), Google Apps Script, `node --test` (Node 24), Python 3 + openpyxl (seed extraction only), Leaflet (already loaded by console + mobile).

**Owner decisions baked in:** record-only (option A) now, model ready for option C; 100% subcon field visit + sampled in-house (random % AND manual pick); QA Head assigns; sheet is read-only (extraction only); dry run before live; each live phase needs the owner's explicit go.

## Global Constraints
- Additive only. Soft-delete only. No hard deletes anywhere (`deleted_at`/`deleted_by`). `qa.audit_log` and `qa.sheet_rows` never delete.
- No new `setInterval` in console except the single 2-minute QA badge fallback; modules initialise only when the QA page opens / QA role logs in.
- Every list query paginated (PostgREST caps at 1,000 rows/request).
- Version stamp rule at deploy time: new `APP_VERSION` + `?v=` on script tags + matching `version.json`, complete upload, live verify.
- Do NOT edit the local repo-root copies of `app.js`, `index.html`, `mobile-*.js`, `mobile.html`, `ahba-cloud.js` for production. Production integration (Task 14) is applied on GitHub clones (`alleczandrehalili-beep/ahba-console`, `alleczandrehalili-beep/ahbadevt`) on branch `qa-audit`, and only after the owner's Phase 1/2 go.
- Subscriber PII never enters the repo: seed extraction reads ONLY the `ACC` lookup columns of the xlsx; demo seed data is synthetic.
- Vocabulary is verbatim from the sheet: visit status `VISITED | VISITED / NPA | FOR VISIT | UNLOCATED | NOT EXIST | H.CLOSED`; assessment `GOOD | FOR RECTIFY | FOR PENALTY | CLAWBACK` (`RECTIFIED` reserved for phase C); wire `STANDARD | EXISTING | SUBSTANDARD`; qa_gc `COMPLETED | INCOMPLETE | NONE`.
- Audit id format `QA-YYYY-NNNNNN`. Storage bucket `qa-photos` (private), paths `qa/<audit_id>/<file>.jpg|png`.
- Match keys: sheet `JONO` = `jobs.job_order_no`; sheet `ACCTNO` = `jobs.ibass_acct_no`.
- Local tooling: no `psql`/`docker` → SQL cannot execute locally. SQL tasks end with a static checklist + the VERIFY script; the in-memory sim (Task 6) is the executable dry run of the same rules. First real SQL execution = Phase 0 on live Supabase (SQL editor), stop at any VERIFY mismatch.

---

## File structure

```
scripts/qa-extract-seed.py                 # Task 1  — xlsx ACC tab → supabase/migrations/qa-02-seed.sql (lookups only)
supabase/migrations/qa-01-schema.sql       # Task 3  — schema, tables, indexes, sequence, jobs.qa_* columns
supabase/migrations/qa-02-seed.sql         # Task 1  — generated seed (checklist, 102 codes, contractors, quick remarks, settings)
supabase/migrations/qa-03-rls.sql          # Task 4  — grants, helper fns, RLS, storage bucket + policies
supabase/migrations/qa-04-functions.sql    # Task 5  — RPCs + triggers (ingest, submit, assign, sample, reopen, report, jobs trigger, log guard)
supabase/migrations/VERIFY-qa.sql          # Task 5  — post-run checks (counts, policies, functions)
qa-core.js                                 # Task 2  — pure rules (UMD, no DOM/fetch)
qa-core.test.mjs                           # Task 2  — node --test
qa-sim.js                                  # Task 6  — in-memory QaApi + synthetic seed (demo + tests)
qa-sim.test.mjs                            # Task 6  — workflow tests (queue→assign→start→submit, ingest dedup, sampling, legacy, idempotency)
qa-api.js                                  # Task 7  — real QaApi over supabase-js (schema 'qa')
qa-api.test.mjs                            # Task 7  — contract test: same method set as sim
mobile-qa.js                               # Task 8  — inspector UI (mount), signature pad
console-qa.js                              # Tasks 9–11 — QA Head UI (queue/board, results/print, reports/settings)
qa-demo.html                               # Task 12 — phone frame + console frame side by side, sim backend
.claude/qa-demo-server.js                  # Task 12 — static server port 8392 (+ launch.json entry "qa-demo")
supabase/functions/qa-sheet-sync/index.ts  # Task 13 — Edge Function (secret-gated upsert + ingest)
google-apps-script/qa-sheet-sync.gs        # Task 13 — sheet-side pusher (read-only on the sheet)
google-apps-script/README-qa-sheet-sync.md # Task 13 — install steps for the sheet owner
docs/superpowers/plans/2026-09-08-qa-audit-module.md   # this plan; Task 14 = production glue (applied on clones later)
```

### The `QaApi` interface (both adapters implement exactly this; Task 7's contract test enforces it)

```js
// Inspector side
listMyAudits(username)                      // -> Promise<Audit[]> (status in assigned|in_progress|done, done limited to last 30 days)
startAudit(auditId, {lat,lng})              // -> Promise<Audit>   (assigned -> in_progress, sets started_at, lat, lng)
uploadPhoto(auditId, blob, {itemId,label})  // -> Promise<{path}>  (storage only; row is written by submitAudit)
uploadSignature(auditId, who, blob)         // -> Promise<{path}>  who = 'subscriber' | 'inspector'
submitAudit(auditId, payload)               // -> Promise<{ok:true, audit:Audit}>  idempotent by payload.submit_key
getInstallPhotos(jobId)                     // -> Promise<{path,label,url}[]>  (existing close-out photos, may be [])
// QA Head side
listAudits(filter)                          // filter {status:[], contractor, kind, barangay, from, to, q, page, pageSize} -> {rows, total}
assignAudits(ids, {inspector, date, startSeq, by})   // -> Promise<number>
unassignAudits(ids, {by})                   // -> Promise<number>
queuePool(ids, {by})                        // -> Promise<number>   pool -> queued (manual pick)
sampleInhouse({from,to,pct,by})             // -> Promise<number>   random pool -> queued
getAudit(id)                                // -> {audit, items, photos, violations, log}
reopenAudit(id, {by, reason})               // -> Promise<Audit>    done -> in_progress
listInspectors()                            // -> [{username, display_name}]
board(date)                                 // -> Audit[] (assigned/in_progress/done for that scheduled_date, with inspector)
weeklyReport(from, to)                      // -> {contractors:[], items:[], codes:[], inspectors:[], coverage:[]}
getConfig()                                 // -> {checklist, codes, contractors, quickRemarks, settings}
saveChecklistItem(item) / saveCode(code) / saveContractor(c) / saveSetting(key, value)
syncStatus()                                // -> {last_sync_at, last_sync_rows, unmapped:[names]}
importRows(rows)                            // -> {upserted, audits_created}  (CSV fallback; same shape the Edge Function sends)
subscribe(cb)                               // -> unsubscribe()   cb({type:'audit', row})
photoUrl(path)                              // -> Promise<string>  (signed URL real; object URL sim)
```

`Audit` row fields = the `qa.audits` columns in Task 3. `payload` for `submitAudit` (Task 2 `validateSubmission` defines it):

```js
{ submit_key, visit_status, contractor_rep, installers_text, wire, qa_gc, assessment,
  found_business, old_plan, new_plan, remarks, lat, lng,
  items: [{item_id, result:'pass'|'fail'|'na', remark}],
  violations: [{code, item_id, description, remark, photo_path}],
  photos: [{path, item_id, label}],
  subscriber_signed_name, subscriber_signature_path, inspector_signature_path }
```

---

### Task 1: Seed extraction script → `qa-02-seed.sql`

**Files:**
- Create: `scripts/qa-extract-seed.py`
- Create (generated): `supabase/migrations/qa-02-seed.sql`

**Interfaces:**
- Produces: the seed SQL consumed after Task 3's schema. Table/column names must match Task 3 exactly: `qa.checklist_items(section,label,sort_order,active,photo_required,suggested_code)`, `qa.violation_codes(code,category,description,class,severity,penalty_text,penalty_l1,penalty_l2,penalty_l3,active)`, `qa.contractors(sheet_name,display_name,kind,coverage,active)`, `qa.quick_remarks(label,sort_order)`, `qa.settings(key,value)`.

- [ ] **Step 1: Write the script**

```python
#!/usr/bin/env python3
"""Extract QA lookup lists from the QA team's workbook into an additive seed SQL.
Reads ONLY tab 'ACC' lookup columns (no subscriber rows). Usage:
  python3 scripts/qa-extract-seed.py "/Users/alleczandre/Downloads/FOR QA VALIDATION.xlsx"
"""
import re, sys, warnings
warnings.filterwarnings('ignore')
import openpyxl

SRC = sys.argv[1] if len(sys.argv) > 1 else '/Users/alleczandre/Downloads/FOR QA VALIDATION.xlsx'
OUT = 'supabase/migrations/qa-02-seed.sql'

def q(s):
    return "'" + str(s if s is not None else '').replace("'", "''") + "'"

def ws_(s):
    return re.sub(r'\s+', ' ', str(s or '')).strip()

# Penalty text like "OFFENSE LEVEL 1: PHP 500 OFFENSE LEVEL 2: PHP 1,000 OFFENSE LEVEL 3: P2,000"
# -> plain peso amounts per level when present; otherwise NULL (text kept verbatim).
def parse_levels(text):
    out = [None, None, None]
    for m in re.finditer(r'OFFENSE LEVEL\s*(\d)\s*:\s*(.*?)(?=OFFENSE LEVEL\s*\d\s*:|$)', text, flags=re.I):
        lvl = int(m.group(1)); body = m.group(2).strip()
        pm = re.match(r'^(?:FINE OF\s+)?(?:PHP|P|₱)\s*([\d,]+(?:\.\d+)?)(?![\dA-Za-z])', body, flags=re.I)
        if 1 <= lvl <= 3 and pm:
            out[lvl-1] = float(pm.group(1).replace(',', ''))
    return out

wb = openpyxl.load_workbook(SRC, data_only=True)
ws = wb['ACC']
rows = list(ws.iter_rows(values_only=True))
hdr = [ws_(h) for h in rows[0]]

def column(name, nth=0):
    idx = [i for i, h in enumerate(hdr) if h == name][nth]
    return [r[idx] for r in rows[1:] if r[idx] not in (None, '', ' ')]

# violation catalog = the SECOND 'CODE' header block: CODE | TYPE | DESCRIPTION | PENALTY
ci = [i for i, h in enumerate(hdr) if h == 'CODE'][1]
codes = []
for r in rows[1:]:
    if r[ci] in (None, ''):
        continue
    code, typ, desc, pen = [ws_(x) for x in r[ci:ci+4]]
    code = re.sub(r'\s+', '', code)              # "TSU-CO L-002" -> "TSU-COL-002"
    prefix = re.match(r'^[A-Z]+', code)
    codes.append((code, typ, desc, pen, prefix.group(0) if prefix else 'GEN'))

CHECKLIST = [
    ('OUTSIDE', 'Maintenance loop above the NAP', 'PR005'),
    ('OUTSIDE', 'Attachment of S-clamps from every pole', 'PR003'),
    ('PREMISE', 'Attachment of house bracket', 'HA001'),
    ('PREMISE', 'Maintenance loop beside the house bracket', 'PR005'),
    ('PREMISE', 'Layout of drop cable in client premise', 'INW001'),
    ('PREMISE', 'Use of tapping clip and/or tie wrap', 'INW001'),
    ('PREMISE', 'NIU box fixed', 'INW002'),
    ('PREMISE', 'Looping at NIU box', 'INW002'),
    ('PREMISE', 'Patch cord', 'INW002'),
    ('PREMISE', 'Modem location', 'INW002'),
]
CONTRACTORS = [('AHBA', 'AHBA (in-house)', 'inhouse', 'sample')] + [
    (n, n, 'subcon', 'all') for n in ['AVELINE', 'J2', 'RIA', 'MAX - ALLY88', 'JHANRENZ', 'J VANA', 'COMWORKS', 'JD CRUZ']]
QUICK = column('OTHERS')
SETTINGS = [('inhouse_sample_pct', '10'), ('initial_cutoff', '2026-08-01'), ('sync_window_days', '60'),
            ('last_sync_at', ''), ('last_sync_rows', '0')]

known = {c[0] for c in codes}
for _, _, sug in CHECKLIST:
    assert sug in known, 'suggested code missing from catalog: ' + sug

lines = ['-- GENERATED by scripts/qa-extract-seed.py from the QA workbook tab ACC (lookup columns only). Additive; safe to re-run.',
         'begin;']
lines.append('insert into qa.violation_codes(code,category,description,class,severity,penalty_text,penalty_l1,penalty_l2,penalty_l3,active) values')
vals = []
for code, typ, desc, pen, pfx in codes:
    l1, l2, l3 = parse_levels(pen)
    sev = 'CRITICAL' if (l1 or 0) >= 20000 or 'TERMINATION' in pen.upper() or 'CLAWBACK' in pen.upper() else ('MAJOR' if (l1 or 0) >= 1000 else 'MINOR')
    vals.append('(%s,%s,%s,%s,%s,%s,%s,%s,%s,true)' % (q(code), q(typ), q(desc), q(pfx), q(sev), q(pen),
                'null' if l1 is None else l1, 'null' if l2 is None else l2, 'null' if l3 is None else l3))
lines.append(',\n'.join(vals))
lines.append('on conflict (code) do update set category=excluded.category, description=excluded.description, class=excluded.class, severity=excluded.severity, penalty_text=excluded.penalty_text, penalty_l1=excluded.penalty_l1, penalty_l2=excluded.penalty_l2, penalty_l3=excluded.penalty_l3;')

lines.append('insert into qa.checklist_items(section,label,sort_order,active,photo_required,suggested_code) values')
lines.append(',\n'.join('(%s,%s,%d,true,false,%s)' % (q(s), q(l), i+1, q(c)) for i, (s, l, c) in enumerate(CHECKLIST)))
lines.append('on conflict (label) do update set section=excluded.section, sort_order=excluded.sort_order, suggested_code=excluded.suggested_code;')

lines.append('insert into qa.contractors(sheet_name,display_name,kind,coverage,active) values')
lines.append(',\n'.join('(%s,%s,%s,%s,true)' % (q(a), q(b), q(c), q(d)) for a, b, c, d in CONTRACTORS))
lines.append('on conflict (sheet_name) do nothing;')

lines.append('insert into qa.quick_remarks(label,sort_order) values')
lines.append(',\n'.join('(%s,%d)' % (q(ws_(x)), i+1) for i, x in enumerate(QUICK)))
lines.append('on conflict (label) do nothing;')

lines.append('insert into qa.settings(key,value) values')
lines.append(',\n'.join('(%s,%s)' % (q(k), q(v)) for k, v in SETTINGS))
lines.append('on conflict (key) do nothing;')
lines.append('commit;')

open(OUT, 'w', encoding='utf8').write('\n'.join(lines) + '\n')
print('codes=%d checklist=%d contractors=%d quick=%d settings=%d -> %s' % (len(codes), len(CHECKLIST), len(CONTRACTORS), len(QUICK), len(SETTINGS), OUT))
```

- [ ] **Step 2: Run it**

Run: `cd /Users/alleczandre/Downloads/ahbadevt && python3 scripts/qa-extract-seed.py`
Expected: `codes=102 checklist=10 contractors=9 quick=27 settings=5 -> supabase/migrations/qa-02-seed.sql`

- [ ] **Step 3: Verify no PII leaked and the SQL is well-formed**

Run: `grep -cE "[0-9]{10,}" supabase/migrations/qa-02-seed.sql; grep -c "insert into" supabase/migrations/qa-02-seed.sql; head -3 supabase/migrations/qa-02-seed.sql`
Expected: first line `0` (no 10+ digit numbers = no phones/accounts), second line `5`, header comment shown.

- [ ] **Step 4: Commit**

```bash
git add scripts/qa-extract-seed.py supabase/migrations/qa-02-seed.sql
git commit -m "feat(qa): seed extraction script + generated lookup seed (102 codes, 10 checklist items)"
```

---

### Task 2: `qa-core.js` pure rules + tests

**Files:**
- Create: `qa-core.js`
- Create: `qa-core.test.mjs`

**Interfaces:**
- Produces (global `QaCore` in browser / `module.exports` in node):
  - `VISIT = ['VISITED','VISITED / NPA','UNLOCATED','NOT EXIST','H.CLOSED']`, `ASSESS = ['GOOD','FOR RECTIFY','FOR PENALTY','CLAWBACK']`, `WIRE = ['STANDARD','EXISTING','SUBSTANDARD']`, `QAGC = ['COMPLETED','INCOMPLETE','NONE']`
  - `defaultAssessment(items) -> 'GOOD' | null`
  - `parsePenalty(text) -> {l1,l2,l3}` (numbers or null)
  - `penaltyFor(code, offenseNo) -> number|null` (code row from catalog)
  - `totals(violations, catalogByCode) -> {count, penalty}`
  - `validateSubmission(payload, checklist) -> string[]` (empty = valid)
  - `normalizeSheetRow(raw) -> row|null` (raw = object keyed by sheet headers)
  - `hasLegacyQa(row) -> boolean`
  - `initialStatus(row, contractor, cutoff) -> 'queued'|'pool'`
  - `pickSample(rows, pct, rng) -> rows[]`
  - `agingBucket(days) -> '0-7'|'8-14'|'15-30'|'31+'`
  - `weeklySummary(audits, violations, items, sheetRows, checklist) -> {contractors, items, codes, inspectors, coverage}`

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
const C = (await import('./qa-core.js')).default ?? require('./qa-core.js');

const CHECK = [{id:1,label:'A'},{id:2,label:'B'}];

test('defaultAssessment is GOOD only when no fail', () => {
  assert.equal(C.defaultAssessment([{item_id:1,result:'pass'},{item_id:2,result:'na'}]), 'GOOD');
  assert.equal(C.defaultAssessment([{item_id:1,result:'pass'},{item_id:2,result:'fail'}]), null);
  assert.equal(C.defaultAssessment([]), 'GOOD');
});

test('parsePenalty reads plain peso levels, leaves prose as null', () => {
  assert.deepEqual(C.parsePenalty('OFFENSE LEVEL 1: PHP 500 OFFENSE LEVEL 2: PHP 1,000 OFFENSE LEVEL 3: P2,000'), {l1:500,l2:1000,l3:2000});
  assert.deepEqual(C.parsePenalty('OFFENSE LEVEL 1: CLAWBACK (INSTALLATION FEE) OFFENSE LEVEL 2: CLAWBACK'), {l1:null,l2:null,l3:null});
  assert.deepEqual(C.parsePenalty('PHP 1000 PER JOB ORDER'), {l1:null,l2:null,l3:null});
});

test('penaltyFor + totals', () => {
  const cat = { HA001:{code:'HA001',penalty_l1:500,penalty_l2:1000,penalty_l3:2000}, PR012:{code:'PR012',penalty_l1:null} };
  assert.equal(C.penaltyFor(cat.HA001, 2), 1000);
  assert.equal(C.penaltyFor(cat.HA001, 7), 2000);      // beyond L3 uses L3
  assert.equal(C.penaltyFor(cat.PR012, 1), null);
  assert.equal(C.penaltyFor({code:'CS002',penalty_l1:null,penalty_l2:500,penalty_l3:1000}, 1), null);   // L1 is a warning → no amount, no fallback
  assert.equal(C.penaltyFor({code:'X',penalty_l1:500,penalty_l2:null,penalty_l3:null}, 2), null);        // L2 prose → null, never L1's 500
  assert.deepEqual(C.totals([{code:'HA001'},{code:'HA001'},{code:'PR012'}], cat), {count:3, penalty:1000}); // L1 each when offense_no unknown
});

test('validateSubmission enforces the form rules', () => {
  const base = { submit_key:'k1', visit_status:'VISITED', assessment:'GOOD', wire:'STANDARD', qa_gc:'COMPLETED',
    items:[{item_id:1,result:'pass'},{item_id:2,result:'pass'}], violations:[], photos:[],
    subscriber_signed_name:'JUAN', subscriber_signature_path:'qa/x/s.png', inspector_signature_path:'qa/x/i.png' };
  assert.deepEqual(C.validateSubmission(base, CHECK), []);
  const missingItem = {...base, items:[{item_id:1,result:'pass'}]};
  assert.ok(C.validateSubmission(missingItem, CHECK).some(e=>/item/i.test(e)));
  const failNoPhoto = {...base, items:[{item_id:1,result:'fail'},{item_id:2,result:'pass'}], assessment:'FOR RECTIFY'};
  assert.ok(C.validateSubmission(failNoPhoto, CHECK).some(e=>/photo/i.test(e)));
  const failOk = {...failNoPhoto, photos:[{path:'p',item_id:1}], violations:[{code:'HA001',item_id:1}]};
  assert.deepEqual(C.validateSubmission(failOk, CHECK), []);
  const failGood = {...failOk, assessment:'GOOD'};
  assert.ok(C.validateSubmission(failGood, CHECK).some(e=>/assessment/i.test(e)));
  const npa = { submit_key:'k2', visit_status:'VISITED / NPA', remarks:'walang tao', photos:[{path:'p'}] };
  assert.deepEqual(C.validateSubmission(npa, CHECK), []);
  const npaNoPhoto = { submit_key:'k3', visit_status:'UNLOCATED', remarks:'x', photos:[] };
  assert.ok(C.validateSubmission(npaNoPhoto, CHECK).some(e=>/photo/i.test(e)));
  const noSig = {...base, subscriber_signature_path:null};
  assert.ok(C.validateSubmission(noSig, CHECK).some(e=>/signature/i.test(e)));
});

test('normalizeSheetRow maps headers, dates, blanks; rejects rows without JONO', () => {
  const r = C.normalizeSheetRow({COMP:'J2', JODATECLOSED:'2026-05-09 00:00:00', ACCTNO:'1878702259412', JONO:'R3418635',
    SUBSCRIBERNAME:' x ', MOBILENO:'9928382193', BARANGAYNAME:'BATASAN HILLS', COMPLETEADDRESS:'82 MELINDAS', TRANTYPECODE:'MAINLINE APPLICATION',
    NAPCODE:'QCY074 LP369 NP3', PORTNO:'P3-O', SERIALNO:'4857', 'QA / GC':'COMPLETED', VISITED:'VISITED', 'DATE QA':'2026-07-11 00:00:00',
    LATLONG:'14.688932, 121.099427', WIRE:'STANDARD', OTHERS:'', ASSESMENT:'GOOD', 'INSPECTED BY':'MARLON BILLONES', DRIVER:'D', TECH:'T', 'TECH 2':''});
  assert.equal(r.jo_no, 'R3418635'); assert.equal(r.comp, 'J2'); assert.equal(r.jo_date_closed, '2026-05-09');
  assert.equal(r.subscriber_name, 'X'); assert.equal(r.sheet_date_qa, '2026-07-11'); assert.equal(r.sheet_assessment, 'GOOD');
  assert.equal(r.tech2, null);
  assert.equal(C.normalizeSheetRow({COMP:'J2'}), null);
  assert.equal(C.normalizeSheetRow({JONO:'R1', JODATECLOSED:'July 30, 2026'}).jo_date_closed, '2026-07-30');
  assert.equal(C.normalizeSheetRow({JONO:'R1', JODATECLOSED:'July 1'}).jo_date_closed, null);   // no year → null, row still kept
});

test('hasLegacyQa + initialStatus', () => {
  assert.equal(C.hasLegacyQa({sheet_visited:'VISITED'}), true);
  assert.equal(C.hasLegacyQa({sheet_visited:'FOR VISIT'}), false);
  assert.equal(C.hasLegacyQa({sheet_assessment:'GOOD'}), true);
  assert.equal(C.hasLegacyQa({}), false);
  const sub = {kind:'subcon', coverage:'all'}, inh = {kind:'inhouse', coverage:'sample'};
  assert.equal(C.initialStatus({jo_date_closed:'2026-09-01'}, sub, '2026-08-01'), 'queued');
  assert.equal(C.initialStatus({jo_date_closed:'2026-09-01'}, inh, '2026-08-01'), 'pool');
  assert.equal(C.initialStatus({jo_date_closed:'2026-07-01'}, sub, '2026-08-01'), 'pool');   // before cutoff
  assert.equal(C.initialStatus({jo_date_closed:'2026-09-01'}, null, '2026-08-01'), 'queued'); // unmapped → queued
});

test('pickSample is deterministic with an injected rng and rounds up', () => {
  const rows = Array.from({length:23}, (_,i)=>({id:i}));
  let s = 7; const rng = () => { s = (s*9301+49297) % 233280; return s/233280; };
  const a = C.pickSample(rows, 10, rng);
  assert.equal(a.length, 3);                       // ceil(2.3)
  assert.equal(C.pickSample(rows, 0, rng).length, 0);
  assert.equal(C.pickSample([], 50, rng).length, 0);
  assert.equal(new Set(a.map(r=>r.id)).size, 3);   // no duplicates
});

test('agingBucket', () => {
  assert.equal(C.agingBucket(0), '0-7'); assert.equal(C.agingBucket(7), '0-7'); assert.equal(C.agingBucket(8), '8-14');
  assert.equal(C.agingBucket(30), '15-30'); assert.equal(C.agingBucket(31), '31+');
});

test('weeklySummary groups by contractor, item, code, inspector and coverage', () => {
  const audits = [
    {id:'A1', contractor_name:'J2', status:'done', assessment:'GOOD', inspector:'AHBA_QA01', visit_status:'VISITED', total_penalty:0},
    {id:'A2', contractor_name:'J2', status:'done', assessment:'FOR RECTIFY', inspector:'AHBA_QA01', visit_status:'VISITED', total_penalty:500},
    {id:'A3', contractor_name:'RIA', status:'done', assessment:null, inspector:'AHBA_QA02', visit_status:'VISITED / NPA', total_penalty:0},
    {id:'A4', contractor_name:'RIA', status:'queued'},
  ];
  const viol = [{audit_id:'A2', code:'HA001'}, {audit_id:'A2', code:'PR003'}];
  const items = [{audit_id:'A1', item_id:1, result:'pass'}, {audit_id:'A2', item_id:1, result:'fail'}];
  const sheet = [{comp:'J2'},{comp:'J2'},{comp:'RIA'},{comp:'RIA'}];
  const s = C.weeklySummary(audits, viol, items, sheet, [{id:1,label:'House bracket'}]);
  const j2 = s.contractors.find(c=>c.contractor==='J2');
  assert.deepEqual({inspected:j2.inspected, GOOD:j2.GOOD, 'FOR RECTIFY':j2['FOR RECTIFY'], penalty:j2.penalty, closed:j2.closed}, {inspected:2, GOOD:1, 'FOR RECTIFY':1, penalty:500, closed:2});
  assert.equal(s.codes.find(c=>c.code==='HA001').count, 1);
  assert.equal(s.items[0].pass_rate, 50);
  assert.equal(s.inspectors.find(i=>i.inspector==='AHBA_QA02').npa, 1);
  assert.equal(s.coverage.find(c=>c.contractor==='RIA').pct, 50);   // 1 done of 2 closed
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test qa-core.test.mjs`
Expected: FAIL — `Cannot find module './qa-core.js'`

- [ ] **Step 3: Write `qa-core.js`**

```js
// AHBA QA Audit — shared pure rules. Loaded by mobile-qa.js, console-qa.js, qa-sim.js AND node tests.
// No DOM, no fetch, no Date.now side effects — every function takes inputs explicitly.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QaCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var VISIT = ['VISITED', 'VISITED / NPA', 'UNLOCATED', 'NOT EXIST', 'H.CLOSED'];
  var ASSESS = ['GOOD', 'FOR RECTIFY', 'FOR PENALTY', 'CLAWBACK'];
  var WIRE = ['STANDARD', 'EXISTING', 'SUBSTANDARD'];
  var QAGC = ['COMPLETED', 'INCOMPLETE', 'NONE'];
  var LEGACY_VISITED = ['VISITED', 'VISITED / NPA', 'UNLOCATED', 'NOT EXIST', 'H.CLOSED', 'GOOD'];

  function defaultAssessment(items) {
    return (items || []).some(function (i) { return i.result === 'fail'; }) ? null : 'GOOD';
  }

  function parsePenalty(text) {
    var out = { l1: null, l2: null, l3: null };
    var re = /OFFENSE LEVEL\s*(\d)\s*:\s*([\s\S]*?)(?=OFFENSE LEVEL\s*\d\s*:|$)/gi, m;
    while ((m = re.exec(String(text || '')))) {
      var lvl = parseInt(m[1], 10), body = m[2].trim();
      var pm = /^(?:FINE OF\s+)?(?:PHP|P|₱)\s*([\d,]+(?:\.\d+)?)(?![\dA-Za-z])/i.exec(body);   // leading amount; trailing qualifiers ("+ WRITTEN WARNING") ignored — same rule as scripts/qa-extract-seed.py
      if (lvl >= 1 && lvl <= 3 && pm) out['l' + lvl] = parseFloat(pm[1].replace(/,/g, ''));
    }
    return out;
  }

  function penaltyFor(codeRow, offenseNo) {
    if (!codeRow) return null;
    var n = Math.max(1, Math.min(3, offenseNo || 1));
    var v = codeRow['penalty_l' + n];          // no fallback to a lower level: a prose level (CLAWBACK, WARNING) is not a peso amount
    return v == null ? null : Number(v);
  }

  function totals(violations, catalogByCode) {
    var count = 0, penalty = 0;
    (violations || []).forEach(function (v) {
      count++;
      var p = v.penalty_amount != null ? Number(v.penalty_amount) : penaltyFor(catalogByCode && catalogByCode[v.code], v.offense_no || 1);
      if (p) penalty += p;
    });
    return { count: count, penalty: penalty };
  }

  function validateSubmission(p, checklist) {
    var errs = [];
    p = p || {};
    if (!p.submit_key) errs.push('Missing submit key.');
    if (VISIT.indexOf(p.visit_status) < 0) errs.push('Visit status is required.');
    var photos = p.photos || [];
    if (p.visit_status !== 'VISITED') {
      if (!photos.length) errs.push('A location photo is required when the subscriber was not visited.');
      if (!(p.remarks || '').trim()) errs.push('Remarks are required when the subscriber was not visited.');
      return errs;
    }
    var items = p.items || [], byItem = {};
    items.forEach(function (i) { byItem[i.item_id] = i; });
    (checklist || []).forEach(function (c) {
      var it = byItem[c.id];
      if (!it || ['pass', 'fail', 'na'].indexOf(it.result) < 0) errs.push('Checklist item "' + c.label + '" has no answer.');
    });
    var fails = items.filter(function (i) { return i.result === 'fail'; });
    fails.forEach(function (f) {
      var label = ((checklist || []).filter(function (c) { return c.id === f.item_id; })[0] || {}).label || ('item ' + f.item_id);
      if (!photos.some(function (ph) { return ph.item_id === f.item_id; })) errs.push('Failed item "' + label + '" needs a photo.');
      if (!(p.violations || []).some(function (v) { return v.item_id === f.item_id && v.code; })) errs.push('Failed item "' + label + '" needs a violation code.');
    });
    if (ASSESS.indexOf(p.assessment) < 0) errs.push('Assessment is required.');
    if (fails.length && p.assessment === 'GOOD') errs.push('Assessment cannot be GOOD when an item failed.');
    if (WIRE.indexOf(p.wire) < 0) errs.push('Wire status is required.');
    if (QAGC.indexOf(p.qa_gc) < 0) errs.push('QA / GC status is required.');
    if (!(p.subscriber_signed_name || '').trim()) errs.push("Subscriber's name is required.");
    if (!p.subscriber_signature_path) errs.push("Subscriber's signature is required.");
    if (!p.inspector_signature_path) errs.push("Inspector's signature is required.");
    return errs;
  }

  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function toDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
    var s = String(v).trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = /^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);          // "July 30, 2026" / "Jul  21, 2026"
    if (m && MONTHS[m[1].toLowerCase()]) return m[3] + '-' + String(MONTHS[m[1].toLowerCase()]).padStart(2, '0') + '-' + String(m[2]).padStart(2, '0');
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);                                  // "7/30/2026"
    if (m) return m[3] + '-' + String(m[1]).padStart(2, '0') + '-' + String(m[2]).padStart(2, '0');
    return null;                                                                   // "July 1" (no year) → unknown
  }
  function up(v) { var s = v == null ? '' : String(v).trim(); return s ? s.toUpperCase() : null; }
  function txt(v) { var s = v == null ? '' : String(v).trim(); return s ? s : null; }

  function normalizeSheetRow(raw) {
    raw = raw || {};
    var jo = up(raw.JONO || raw.jo_no);
    if (!jo) return null;
    return {
      jo_no: jo, acct_no: txt(raw.ACCTNO || raw.acct_no) && String(raw.ACCTNO || raw.acct_no).replace(/\.0$/, ''),
      comp: up(raw.COMP || raw.comp), jo_date_closed: toDate(raw.JODATECLOSED || raw.jo_date_closed),
      ssp_code: up(raw.SSPCODE || raw.ssp_code), subscriber_name: up(raw.SUBSCRIBERNAME || raw.subscriber_name),
      mobile_no: txt(raw.MOBILENO || raw.mobile_no), barangay: up(raw.BARANGAYNAME || raw.barangay),
      complete_address: up(raw.COMPLETEADDRESS || raw.complete_address), tran_type: up(raw.TRANTYPECODE || raw.tran_type),
      nap_code: up(raw.NAPCODE || raw.nap_code), port_no: up(raw.PORTNO || raw.port_no), serial_no: up(raw.SERIALNO || raw.serial_no),
      driver: up(raw.DRIVER || raw.driver), tech: up(raw.TECH || raw.tech), tech2: up(raw['TECH 2'] || raw.tech2),
      sheet_qa_gc: up(raw['QA / GC'] || raw.sheet_qa_gc), sheet_visited: up(raw.VISITED || raw.sheet_visited),
      sheet_date_qa: toDate(raw['DATE QA'] || raw.sheet_date_qa), sheet_latlong: txt(raw.LATLONG || raw.sheet_latlong),
      sheet_wire: up(raw.WIRE || raw.sheet_wire), sheet_others: up(raw.OTHERS || raw.sheet_others),
      sheet_assessment: up(raw.ASSESMENT || raw.ASSESSMENT || raw.sheet_assessment), sheet_inspected_by: up(raw['INSPECTED BY'] || raw.sheet_inspected_by),
      sheet_remarks: txt(raw.REMARKS || raw.sheet_remarks)
    };
  }

  function hasLegacyQa(r) {
    r = r || {};
    return LEGACY_VISITED.indexOf(r.sheet_visited) >= 0 || !!r.sheet_assessment || !!r.sheet_date_qa;
  }

  function initialStatus(row, contractor, cutoff) {
    if (cutoff && row && row.jo_date_closed && row.jo_date_closed < cutoff) return 'pool';
    if (!contractor) return 'queued';
    return (contractor.kind === 'subcon' || contractor.coverage === 'all') ? 'queued' : 'pool';
  }

  function pickSample(rows, pct, rng) {
    rows = (rows || []).slice(); rng = rng || Math.random;
    var n = Math.ceil(rows.length * (Number(pct) || 0) / 100);
    if (n <= 0) return [];
    for (var i = rows.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = rows[i]; rows[i] = rows[j]; rows[j] = t; }
    return rows.slice(0, n);
  }

  function agingBucket(days) { return days <= 7 ? '0-7' : days <= 14 ? '8-14' : days <= 30 ? '15-30' : '31+'; }

  function weeklySummary(audits, violations, items, sheetRows, checklist) {
    var byC = {}, byCode = {}, byInsp = {}, byItem = {}, closed = {};
    (sheetRows || []).forEach(function (r) { closed[r.comp] = (closed[r.comp] || 0) + 1; });
    var done = (audits || []).filter(function (a) { return a.status === 'done'; });
    var doneIds = {};
    done.forEach(function (a) {
      doneIds[a.id] = a;
      var c = byC[a.contractor_name] = byC[a.contractor_name] || { contractor: a.contractor_name, inspected: 0, GOOD: 0, 'FOR RECTIFY': 0, 'FOR PENALTY': 0, CLAWBACK: 0, npa: 0, penalty: 0, closed: closed[a.contractor_name] || 0 };
      c.inspected++;
      if (a.assessment && c[a.assessment] != null) c[a.assessment]++;
      if (a.visit_status && a.visit_status !== 'VISITED') c.npa++;
      c.penalty += Number(a.total_penalty || 0);
      var ins = byInsp[a.inspector || '—'] = byInsp[a.inspector || '—'] || { inspector: a.inspector || '—', inspections: 0, npa: 0 };
      ins.inspections++; if (a.visit_status && a.visit_status !== 'VISITED') ins.npa++;
    });
    (violations || []).forEach(function (v) { if (!doneIds[v.audit_id]) return; var k = byCode[v.code] = byCode[v.code] || { code: v.code, count: 0 }; k.count++; });
    (items || []).forEach(function (i) { if (!doneIds[i.audit_id]) return; var k = byItem[i.item_id] = byItem[i.item_id] || { item_id: i.item_id, pass: 0, fail: 0, na: 0 }; k[i.result] = (k[i.result] || 0) + 1; });
    var labels = {}; (checklist || []).forEach(function (c) { labels[c.id] = c.label; });
    var itemRows = Object.keys(byItem).map(function (k) { var r = byItem[k]; var d = r.pass + r.fail; return { item_id: r.item_id, label: labels[r.item_id] || ('#' + r.item_id), pass: r.pass, fail: r.fail, na: r.na, pass_rate: d ? Math.round(r.pass * 100 / d) : null }; });
    var coverage = Object.keys(closed).map(function (k) { var d = (byC[k] || {}).inspected || 0; return { contractor: k, closed: closed[k], inspected: d, pct: closed[k] ? Math.round(d * 100 / closed[k]) : null }; });
    return {
      contractors: Object.values(byC).sort(function (a, b) { return b.inspected - a.inspected; }),
      items: itemRows, codes: Object.values(byCode).sort(function (a, b) { return b.count - a.count; }),
      inspectors: Object.values(byInsp), coverage: coverage
    };
  }

  return { VISIT: VISIT, ASSESS: ASSESS, WIRE: WIRE, QAGC: QAGC, defaultAssessment: defaultAssessment, parsePenalty: parsePenalty,
           penaltyFor: penaltyFor, totals: totals, validateSubmission: validateSubmission, normalizeSheetRow: normalizeSheetRow,
           hasLegacyQa: hasLegacyQa, initialStatus: initialStatus, pickSample: pickSample, agingBucket: agingBucket,
           weeklySummary: weeklySummary, toDate: toDate };
});
```

- [ ] **Step 4: Run tests**

Run: `node --test qa-core.test.mjs`
Expected: `# pass 9`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add qa-core.js qa-core.test.mjs
git commit -m "feat(qa): qa-core pure rules (assessment, penalty, validation, sheet normalize, sampling, weekly summary) + tests"
```

---

### Task 3: `qa-01-schema.sql` — schema, tables, indexes, `jobs.qa_*` columns

**Files:**
- Create: `supabase/migrations/qa-01-schema.sql`

**Interfaces:**
- Produces: every table/column used by Tasks 1, 4, 5, 6, 7. Names here are canonical.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Static check (no local Postgres)**

Run: `grep -c "create table if not exists" supabase/migrations/qa-01-schema.sql; grep -n "references qa\.\|references public\." supabase/migrations/qa-01-schema.sql | wc -l`
Expected: `11` tables (5 config + sheet_rows + audits + 4 audit children); FK-bearing lines ≈ `13`. Read the file once top-to-bottom against the spec's data-model section (every column listed there exists here; check constraints match the vocabulary in Global Constraints).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/qa-01-schema.sql
git commit -m "feat(qa): qa schema — config, sheet mirror, audits, items, photos, violations, log, jobs.qa_* columns"
```

---

### Task 4: `qa-03-rls.sql` — grants, helpers, RLS, storage bucket

**Files:**
- Create: `supabase/migrations/qa-03-rls.sql`

**Interfaces:**
- Consumes: Task 3 tables; existing `public.jwt_org_is_gc()`, `public.jwt_is_platform_admin()`, `public.my_team()`.
- Produces: `qa.is_head()`, `qa.is_inspector()` used by Task 5 RPCs and by storage policies.

- [ ] **Step 1: Write the migration**

```sql
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

-- QA Head = any GC console user (page access is enforced in the console; data access = GC org).
create or replace function qa.is_head() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.jwt_org_is_gc(), false) or coalesce(public.jwt_is_platform_admin(), false)
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

-- Config + sheet mirror: everyone authenticated reads; only the head writes.
do $$ declare t text; begin
  foreach t in array array['violation_codes','checklist_items','contractors','quick_remarks','settings','sheet_rows'] loop
    execute format('drop policy if exists qa_cfg_read on qa.%I', t);
    execute format('create policy qa_cfg_read on qa.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists qa_cfg_head_write on qa.%I', t);
    execute format('create policy qa_cfg_head_write on qa.%I for all to authenticated using (qa.is_head()) with check (qa.is_head())', t);
  end loop;
end $$;

-- Audits: head = all; inspector = own assigned rows, writable only while assigned/in_progress.
drop policy if exists qa_audits_head on qa.audits;
create policy qa_audits_head on qa.audits for all to authenticated using (qa.is_head()) with check (qa.is_head());
drop policy if exists qa_audits_insp_read on qa.audits;
create policy qa_audits_insp_read on qa.audits for select to authenticated
  using (qa.is_inspector() and assigned_to = public.my_team() and deleted_at is null);
drop policy if exists qa_audits_insp_write on qa.audits;
create policy qa_audits_insp_write on qa.audits for update to authenticated
  using (qa.is_inspector() and assigned_to = public.my_team() and status in ('assigned','in_progress'))
  with check (qa.is_inspector() and assigned_to = public.my_team() and status in ('assigned','in_progress'));   -- the done transition happens ONLY inside qa.submit_audit (security definer)

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

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Static check**

Run: `grep -c "create policy" supabase/migrations/qa-03-rls.sql`
Expected: `11` (2 lines inside the config loop + 3 audits + 2 lines inside the child loop + 1 restrictive + 3 storage). Read once more: every table in Task 3 has RLS enabled (11 names in the enable loop).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/qa-03-rls.sql
git commit -m "feat(qa): grants, is_head/is_inspector helpers, RLS, private qa-photos bucket"
```

---

### Task 5: `qa-04-functions.sql` — RPCs, triggers, report + `VERIFY-qa.sql`

**Files:**
- Create: `supabase/migrations/qa-04-functions.sql`
- Create: `supabase/migrations/VERIFY-qa.sql`

**Interfaces:**
- Consumes: Tasks 3–4. `public.my_team()` returns the caller's username (email prefix, upper).
- Produces (all `security definer`, exposed via `/rest/v1/rpc/<name>` with `Content-Profile: qa`):
  - `qa.ingest_sheet_rows() returns int` (audits created)
  - `qa.assign_audits(p_ids text[], p_inspector text, p_date date, p_start_seq int) returns int`
  - `qa.unassign_audits(p_ids text[]) returns int`, `qa.queue_pool(p_ids text[]) returns int`
  - `qa.sample_inhouse(p_from date, p_to date, p_pct numeric) returns int`
  - `qa.start_audit(p_id text, p_lat double precision, p_lng double precision) returns qa.audits`
  - `qa.submit_audit(p_id text, p_payload jsonb) returns jsonb` — `{ok:true, audit:{...}}`; idempotent by `p_payload->>'submit_key'`
  - `qa.reopen_audit(p_id text, p_reason text) returns qa.audits`
  - `qa.weekly_report(p_from date, p_to date) returns jsonb` — same shape as `QaCore.weeklySummary`
  - `qa.sync_status() returns jsonb`
  - trigger `qa_on_job_completed` on `public.jobs`; trigger `qa_log_guard` on `qa.audit_log`

- [ ] **Step 1: Write the migration**

```sql
-- QA Audit module — functions & triggers (2026-09-08). Additive. Run AFTER qa-01..03.
set search_path = qa, public;

create or replace function qa.actor() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(nullif(public.my_team(), ''), 'SYSTEM')
$$;

create or replace function qa.next_audit_id() returns text
language sql volatile security definer set search_path = qa, pg_temp as $$
  select 'QA-' || to_char(now() at time zone 'Asia/Manila', 'YYYY') || '-' || lpad(nextval('qa.audit_seq')::text, 6, '0')
$$;

create or replace function qa.log(p_audit text, p_action text, p_detail jsonb default null) returns void
language sql volatile security definer set search_path = qa, public, pg_temp as $$
  insert into qa.audit_log(audit_id, by, action, detail) values (p_audit, qa.actor(), p_action, p_detail)
$$;

-- audit_log is append-only: no UPDATE / DELETE ever (same principle as the jobs.history guard).
create or replace function qa.guard_log() returns trigger language plpgsql as $$
begin raise exception 'qa.audit_log is append-only'; end $$;
drop trigger if exists qa_log_guard on qa.audit_log;
create trigger qa_log_guard before update or delete on qa.audit_log for each row execute function qa.guard_log();

create or replace function qa.setting(p_key text) returns text
language sql stable security definer set search_path = qa, pg_temp as $$
  select value from qa.settings where key = p_key
$$;

-- Mirror the audit's QA state onto the JO (additive jobs.qa_* columns).
create or replace function qa.sync_job(p_audit qa.audits) returns void
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare v_status text;
begin
  if p_audit.job_id is null then return; end if;
  v_status := case p_audit.status when 'done' then coalesce(p_audit.visit_status, 'VISITED')
                                  when 'assigned' then 'ASSIGNED' when 'in_progress' then 'ASSIGNED'
                                  else 'FOR VISIT' end;
  update public.jobs set qa_audit_id = p_audit.id, qa_status = v_status,
         qa_assessment = p_audit.assessment, qa_inspected_at = p_audit.inspected_at
   where id = p_audit.job_id;
end $$;

-- Find the FieldOps JO for a jo_no / acct_no pair (not soft-deleted). Prefer the JO number.
create or replace function qa.find_job(p_jo text, p_acct text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.jobs
   where deleted_at is null
     and ((p_jo is not null and upper(job_order_no) = upper(p_jo))
       or (p_acct is not null and ibass_acct_no = p_acct))
   order by (upper(job_order_no) = upper(p_jo)) desc nulls last, updated_at desc
   limit 1
$$;

-- Initial status rule (mirrors QaCore.initialStatus): before cutoff → pool; subcon/all → queued; inhouse/sample → pool; unmapped → queued.
create or replace function qa.initial_status(p_closed date, p_contractor qa.contractors) returns text
language sql stable security definer set search_path = qa, pg_temp as $$
  select case when p_closed is not null and p_closed < coalesce(nullif(qa.setting('initial_cutoff'),'')::date, '1900-01-01'::date) then 'pool'
              when p_contractor.sheet_name is null then 'queued'
              when p_contractor.kind = 'subcon' or p_contractor.coverage = 'all' then 'queued'
              else 'pool' end
$$;

-- ---------- ingest: sheet rows → audits ----------
create or replace function qa.ingest_sheet_rows() returns int
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare r record; c qa.contractors; v_id text; v_job text; v_status text; v_lat double precision; v_lng double precision;
        v_legacy boolean; v_n int := 0; a qa.audits; v_parts text[];
begin
  for r in select s.* from qa.sheet_rows s left join qa.audits a on a.jo_no = s.jo_no and a.deleted_at is null
            where a.id is null order by s.jo_date_closed nulls last, s.jo_no loop
    select * into c from qa.contractors where sheet_name = r.comp;
    -- an existing FieldOps-sourced audit matched by acct_no → link + fill blanks only
    select * into a from qa.audits where deleted_at is null and jo_no is null and acct_no is not null and acct_no = r.acct_no limit 1;
    if a.id is not null then
      update qa.audits set jo_no = r.jo_no, sheet_row_jo = r.jo_no,
             nap_code = coalesce(nap_code, r.nap_code), port_no = coalesce(port_no, r.port_no), serial_no = coalesce(serial_no, r.serial_no),
             installers_text = coalesce(installers_text, nullif(concat_ws(' / ', r.driver, r.tech, r.tech2), '')),
             jo_date_closed = coalesce(jo_date_closed, r.jo_date_closed), sheet_latlong = coalesce(sheet_latlong, r.sheet_latlong)
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
      case when v_legacy then (case when r.sheet_visited = 'GOOD' then 'VISITED' else coalesce(r.sheet_visited, 'VISITED') end) end,
      case when v_legacy and r.sheet_qa_gc in ('COMPLETED','INCOMPLETE','NONE') then r.sheet_qa_gc end,
      case when v_legacy and r.sheet_wire in ('STANDARD','EXISTING','SUBSTANDARD') then r.sheet_wire end,
      case when v_legacy and r.sheet_assessment in ('GOOD','FOR RECTIFY','FOR PENALTY','CLAWBACK','RECTIFIED') then r.sheet_assessment end,
      case when v_legacy then nullif(concat_ws(' · ', r.sheet_others, r.sheet_remarks), '') end);
    select * into a from qa.audits where id = v_id;
    perform qa.sync_job(a);
    perform qa.log(v_id, case when v_legacy then 'imported_legacy' else 'created' end, jsonb_build_object('source','sheet','status',v_status,'comp',r.comp));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------- FieldOps trigger: JO completed → audit (if none yet) ----------
create or replace function qa.on_job_completed() returns trigger
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare c qa.contractors; v_id text; v_status text; v_code text; a qa.audits;
begin
  if new.status = 'completed' and (TG_OP = 'INSERT' or old.status is distinct from 'completed') then
    begin
      if exists (select 1 from qa.audits where deleted_at is null and (job_id = new.id
                 or (new.job_order_no is not null and upper(jo_no) = upper(new.job_order_no))
                 or (new.ibass_acct_no is not null and acct_no = new.ibass_acct_no))) then
        return new;
      end if;
      select * into c from qa.contractors where org_id = coalesce(new.assigned_org_id, new.org_id) and active limit 1;
      if c.sheet_name is null then
        select o.code into v_code from public.orgs o where o.id = coalesce(new.assigned_org_id, new.org_id);
        if v_code = 'AHBA' then select * into c from qa.contractors where sheet_name = 'AHBA'; end if;
      end if;
      v_status := qa.initial_status(coalesce((new.completed_at at time zone 'Asia/Manila')::date, (now() at time zone 'Asia/Manila')::date), c);
      v_id := qa.next_audit_id();
      insert into qa.audits(id, source, job_id, jo_no, acct_no, contractor_name, contractor_org_id, kind, unmapped,
        subscriber, mobile_no, address, barangay, jo_date_closed, installers_text, status)
      values (v_id, 'fieldops', new.id, nullif(upper(new.job_order_no), ''), nullif(new.ibass_acct_no, ''),
        coalesce(c.sheet_name, (select code from public.orgs where id = coalesce(new.assigned_org_id, new.org_id))), coalesce(new.assigned_org_id, new.org_id), c.kind, (c.sheet_name is null),
        new.subscriber, coalesce(nullif(new.primary_no, ''), new.other_contact_no), new.address, coalesce(nullif(new.brgy, ''), new.area),
        coalesce((new.completed_at at time zone 'Asia/Manila')::date, (now() at time zone 'Asia/Manila')::date),
        nullif(concat_ws(' / ', new.crew_driver, new.crew_tech1, new.crew_tech2), ''), v_status);
      select * into a from qa.audits where id = v_id;
      perform qa.sync_job(a);
      perform qa.log(v_id, 'created', jsonb_build_object('source','fieldops','status',v_status));
    exception when others then
      -- a JO completion must NEVER fail because of QA
      raise warning 'qa.on_job_completed skipped for %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end $$;
drop trigger if exists qa_on_job_completed on public.jobs;
create trigger qa_on_job_completed after insert or update of status on public.jobs
  for each row execute function qa.on_job_completed();

-- ---------- QA Head actions ----------
create or replace function qa.assign_audits(p_ids text[], p_inspector text, p_date date, p_start_seq int default 1) returns int
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare v_n int := 0; v_id text; v_seq int := coalesce(p_start_seq, 1); a qa.audits;
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  if not exists (select 1 from public.technicians where username = p_inspector and role = 'qa_inspector') then
    raise exception 'Not a QA inspector account: %', p_inspector; end if;
  foreach v_id in array p_ids loop
    update qa.audits set status = 'assigned', assigned_to = p_inspector, assigned_by = qa.actor(), assigned_at = now(),
           scheduled_date = p_date, sequence = v_seq
     where id = v_id and deleted_at is null and status in ('pool','queued','assigned') returning * into a;
    if found then
      perform qa.sync_job(a);
      perform qa.log(v_id, 'assigned', jsonb_build_object('to', p_inspector, 'date', p_date, 'seq', v_seq));
      v_n := v_n + 1; v_seq := v_seq + 1;
    end if;
  end loop;
  return v_n;
end $$;

create or replace function qa.unassign_audits(p_ids text[]) returns int
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare v_n int := 0; v_id text; a qa.audits;
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  foreach v_id in array p_ids loop
    update qa.audits set status = 'queued', assigned_to = null, assigned_by = null, assigned_at = null, scheduled_date = null, sequence = null
     where id = v_id and deleted_at is null and status = 'assigned' returning * into a;
    if found then perform qa.sync_job(a); perform qa.log(v_id, 'unassigned', null); v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;

create or replace function qa.queue_pool(p_ids text[]) returns int
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare v_n int := 0; v_id text;
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  foreach v_id in array p_ids loop
    update qa.audits set status = 'queued' where id = v_id and deleted_at is null and status = 'pool';
    if found then perform qa.log(v_id, 'queued_manual', null); v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;

-- Random sample of in-house pool rows closed in [p_from, p_to] → queued. ceil(pool * pct / 100).
create or replace function qa.sample_inhouse(p_from date, p_to date, p_pct numeric) returns int
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare v_total int; v_take int; v_n int := 0; r record;
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  select count(*) into v_total from qa.audits where deleted_at is null and status = 'pool' and kind = 'inhouse' and jo_date_closed between p_from and p_to;
  v_take := ceil(v_total * coalesce(p_pct, 0) / 100.0);
  for r in select id from qa.audits where deleted_at is null and status = 'pool' and kind = 'inhouse' and jo_date_closed between p_from and p_to
           order by random() limit v_take loop
    update qa.audits set status = 'queued' where id = r.id;
    perform qa.log(r.id, 'queued_sample', jsonb_build_object('pct', p_pct, 'from', p_from, 'to', p_to));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function qa.reopen_audit(p_id text, p_reason text) returns qa.audits
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare a qa.audits;
begin
  if not qa.is_head() then raise exception 'QA Head only'; end if;
  update qa.audits set status = 'in_progress', reopened_count = reopened_count + 1, submit_key = null
   where id = p_id and deleted_at is null and status = 'done' and assigned_to is not null returning * into a;
  if not found then raise exception 'Audit % is not done or has no inspector', p_id; end if;
  perform qa.sync_job(a);
  perform qa.log(p_id, 'reopened', jsonb_build_object('reason', p_reason));
  return a;
end $$;

-- ---------- inspector actions ----------
create or replace function qa.start_audit(p_id text, p_lat double precision default null, p_lng double precision default null) returns qa.audits
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare a qa.audits;
begin
  update qa.audits set status = 'in_progress', started_at = coalesce(started_at, now()), lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng),
         inspector = coalesce(inspector, qa.actor())
   where id = p_id and deleted_at is null and status in ('assigned','in_progress')
     and (qa.is_head() or assigned_to = qa.actor()) returning * into a;
  if not found then raise exception 'Audit % cannot be started by %', p_id, qa.actor(); end if;
  perform qa.sync_job(a);
  if a.started_at >= now() - interval '2 seconds' then perform qa.log(p_id, 'started', jsonb_build_object('lat', p_lat, 'lng', p_lng)); end if;
  return a;
end $$;

-- Transactional + idempotent submit. p_payload shape = QaApi.submitAudit payload (see plan header).
create or replace function qa.submit_audit(p_id text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = qa, public, pg_temp as $$
declare a qa.audits; v_key text := p_payload->>'submit_key'; it jsonb; v_visit text := p_payload->>'visit_status';
        v_fails int := 0; v_items int := 0; v_active int; v_count int := 0; v_pen numeric := 0; c qa.violation_codes; v_p numeric;
begin
  if v_key is null or v_key = '' then raise exception 'submit_key required'; end if;
  select * into a from qa.audits where id = p_id and deleted_at is null for update;
  if a.id is null then raise exception 'Audit % not found', p_id; end if;
  if a.status = 'done' and a.submit_key = v_key then
    return jsonb_build_object('ok', true, 'audit', to_jsonb(a), 'duplicate', true);      -- idempotent replay
  end if;
  if a.status not in ('assigned','in_progress') then raise exception 'Audit % is % — not submittable', p_id, a.status; end if;
  if not (qa.is_head() or a.assigned_to = qa.actor()) then raise exception 'Audit % is not assigned to %', p_id, qa.actor(); end if;
  if v_visit not in ('VISITED','VISITED / NPA','UNLOCATED','NOT EXIST','H.CLOSED') then raise exception 'visit_status required'; end if;

  delete from qa.audit_items where audit_id = p_id;          -- re-submission after reopen replaces the result set (log keeps history)
  delete from qa.audit_violations where audit_id = p_id;
  delete from qa.audit_photos where audit_id = p_id and path in (select x->>'path' from jsonb_array_elements(coalesce(p_payload->'photos','[]'::jsonb)) x);

  for it in select * from jsonb_array_elements(coalesce(p_payload->'photos','[]'::jsonb)) loop
    insert into qa.audit_photos(audit_id, item_id, path, label) values (p_id, (it->>'item_id')::bigint, it->>'path', it->>'label') on conflict (path) do nothing;
  end loop;

  if v_visit = 'VISITED' then
    select count(*) into v_active from qa.checklist_items where active;
    for it in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
      insert into qa.audit_items(audit_id, item_id, result, remark) values (p_id, (it->>'item_id')::bigint, it->>'result', it->>'remark');
      v_items := v_items + 1; if it->>'result' = 'fail' then v_fails := v_fails + 1; end if;
    end loop;
    if v_items < v_active then raise exception 'All % checklist items must be answered (got %)', v_active, v_items; end if;
    if v_fails > 0 and p_payload->>'assessment' = 'GOOD' then raise exception 'Assessment cannot be GOOD with failed items'; end if;
    if p_payload->>'assessment' not in ('GOOD','FOR RECTIFY','FOR PENALTY','CLAWBACK') then raise exception 'assessment required'; end if;
    if coalesce(p_payload->>'subscriber_signature_path','') = '' or coalesce(p_payload->>'inspector_signature_path','') = '' then raise exception 'Both signatures are required'; end if;
    for it in select * from jsonb_array_elements(coalesce(p_payload->'violations','[]'::jsonb)) loop
      select * into c from qa.violation_codes where code = it->>'code';
      if c.code is null then raise exception 'Unknown violation code %', it->>'code'; end if;
      v_p := coalesce((it->>'penalty_amount')::numeric, c.penalty_l1);
      insert into qa.audit_violations(audit_id, code, item_id, description, category, class, severity, offense_no, penalty_amount, photo_path, remark)
      values (p_id, c.code, (it->>'item_id')::bigint, coalesce(nullif(it->>'description',''), c.description), c.category, c.class, c.severity,
              (it->>'offense_no')::int, v_p, it->>'photo_path', it->>'remark');
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
    wire = nullif(p_payload->>'wire',''), qa_gc = nullif(p_payload->>'qa_gc',''), assessment = nullif(p_payload->>'assessment',''),
    found_business = nullif(p_payload->>'found_business',''), old_plan = p_payload->>'old_plan', new_plan = p_payload->>'new_plan',
    remarks = p_payload->>'remarks', subscriber_signed_name = p_payload->>'subscriber_signed_name',
    subscriber_signature_path = p_payload->>'subscriber_signature_path', inspector_signature_path = p_payload->>'inspector_signature_path',
    total_violations = v_count, total_penalty = v_pen
   where id = p_id returning * into a;
  perform qa.sync_job(a);
  perform qa.log(p_id, 'submitted', jsonb_build_object('visit', v_visit, 'assessment', a.assessment, 'violations', v_count, 'penalty', v_pen));
  return jsonb_build_object('ok', true, 'audit', to_jsonb(a));
end $$;

-- ---------- reports / status ----------
create or replace function qa.weekly_report(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = qa, public, pg_temp as $$
  with d as (select * from qa.audits where deleted_at is null and status = 'done' and (inspected_at at time zone 'Asia/Manila')::date between p_from and p_to),
  closed as (select comp, count(*) n from qa.sheet_rows where jo_date_closed between p_from and p_to group by comp)
  select jsonb_build_object(
    'contractors', coalesce((select jsonb_agg(x order by x->>'inspected' desc) from (
        select jsonb_build_object('contractor', contractor_name, 'inspected', count(*),
          'GOOD', count(*) filter (where assessment='GOOD'), 'FOR RECTIFY', count(*) filter (where assessment='FOR RECTIFY'),
          'FOR PENALTY', count(*) filter (where assessment='FOR PENALTY'), 'CLAWBACK', count(*) filter (where assessment='CLAWBACK'),
          'npa', count(*) filter (where visit_status <> 'VISITED'), 'penalty', coalesce(sum(total_penalty),0),
          'closed', coalesce((select n from closed where closed.comp = d.contractor_name),0)) x
        from d group by contractor_name) s), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('item_id', i.item_id, 'label', ci.label, 'pass', count(*) filter (where i.result='pass'),
          'fail', count(*) filter (where i.result='fail'), 'na', count(*) filter (where i.result='na'),
          'pass_rate', case when count(*) filter (where i.result in ('pass','fail')) = 0 then null
                            else round(100.0 * count(*) filter (where i.result='pass') / count(*) filter (where i.result in ('pass','fail'))) end) order by ci.sort_order)
        from qa.audit_items i join d on d.id = i.audit_id join qa.checklist_items ci on ci.id = i.item_id group by i.item_id, ci.label, ci.sort_order), '[]'::jsonb),
    'codes', coalesce((select jsonb_agg(jsonb_build_object('code', v.code, 'category', v.category, 'count', count(*)) order by count(*) desc)
        from qa.audit_violations v join d on d.id = v.audit_id group by v.code, v.category), '[]'::jsonb),
    'inspectors', coalesce((select jsonb_agg(jsonb_build_object('inspector', coalesce(inspector,'—'), 'inspections', count(*), 'npa', count(*) filter (where visit_status <> 'VISITED')))
        from d group by inspector), '[]'::jsonb),
    'coverage', coalesce((select jsonb_agg(jsonb_build_object('contractor', c.comp, 'closed', c.n, 'inspected', (select count(*) from d where d.contractor_name = c.comp),
          'pct', round(100.0 * (select count(*) from d where d.contractor_name = c.comp) / nullif(c.n,0)))) from closed c), '[]'::jsonb))
$$;

create or replace function qa.sync_status() returns jsonb
language sql stable security definer set search_path = qa, pg_temp as $$
  select jsonb_build_object('last_sync_at', qa.setting('last_sync_at'), 'last_sync_rows', qa.setting('last_sync_rows'),
    'unmapped', coalesce((select jsonb_agg(distinct contractor_name) from qa.audits where unmapped and deleted_at is null), '[]'::jsonb))
$$;

grant execute on function qa.ingest_sheet_rows(), qa.assign_audits(text[],text,date,int), qa.unassign_audits(text[]), qa.queue_pool(text[]),
  qa.sample_inhouse(date,date,numeric), qa.reopen_audit(text,text), qa.start_audit(text,double precision,double precision),
  qa.submit_audit(text,jsonb), qa.weekly_report(date,date), qa.sync_status() to authenticated;
grant execute on function qa.ingest_sheet_rows() to service_role;
notify pgrst, 'reload schema';
```

- [ ] **Step 2: Write `VERIFY-qa.sql`**

```sql
-- Run after qa-01..04. Every row must say OK. Stop and report if any says FAIL.
select 'tables' as check_name, case when count(*) = 11 then 'OK' else 'FAIL '||count(*) end as result
  from information_schema.tables where table_schema = 'qa';
select 'seed codes', case when count(*) = 102 then 'OK' else 'FAIL '||count(*) end from qa.violation_codes;
select 'seed checklist', case when count(*) = 10 then 'OK' else 'FAIL '||count(*) end from qa.checklist_items where active;
select 'seed contractors', case when count(*) = 9 then 'OK' else 'FAIL '||count(*) end from qa.contractors;
select 'seed quick remarks', case when count(*) = 27 then 'OK' else 'FAIL '||count(*) end from qa.quick_remarks;
select 'rls enabled', case when count(*) = 11 then 'OK' else 'FAIL '||count(*) end
  from pg_tables where schemaname = 'qa' and rowsecurity;
select 'functions', case when count(*) >= 16 then 'OK' else 'FAIL '||count(*) end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'qa';
select 'jobs trigger', case when count(*) = 1 then 'OK' else 'FAIL' end from pg_trigger where tgname = 'qa_on_job_completed';
select 'log guard', case when count(*) = 1 then 'OK' else 'FAIL' end from pg_trigger where tgname = 'qa_log_guard';
select 'jobs.qa columns', case when count(*) = 4 then 'OK' else 'FAIL '||count(*) end
  from information_schema.columns where table_schema = 'public' and table_name = 'jobs' and column_name in ('qa_audit_id','qa_status','qa_assessment','qa_inspected_at');
select 'bucket', case when count(*) = 1 then 'OK' else 'FAIL' end from storage.buckets where id = 'qa-photos' and public = false;
select 'audit id format', case when qa.next_audit_id() ~ '^QA-\d{4}-\d{6}$' then 'OK' else 'FAIL' end;
select 'sync_status runs', case when qa.sync_status() ? 'unmapped' then 'OK' else 'FAIL' end;
select 'weekly_report runs', case when qa.weekly_report(current_date - 7, current_date) ? 'contractors' then 'OK' else 'FAIL' end;
-- Exposed schema (manual dashboard step) — must list qa:
select 'exposed schemas (manual)', current_setting('pgrst.db_schemas', true);
```

- [ ] **Step 3: Static check**

Run: `grep -c "create or replace function" supabase/migrations/qa-04-functions.sql; grep -n "raise exception" supabase/migrations/qa-04-functions.sql | wc -l`
Expected: `19` functions; ≥ 20 guard exceptions. Cross-check the argument lists in the final `grant execute` line against each function header (they must match exactly or the grant fails at Phase 0).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/qa-04-functions.sql supabase/migrations/VERIFY-qa.sql
git commit -m "feat(qa): RPCs (ingest, assign, sample, start, submit, reopen, report), jobs trigger, log guard, VERIFY script"
```

---

### Task 6: `qa-sim.js` — in-memory `QaApi` + synthetic seed, workflow tests (the executable dry run)

**Files:**
- Create: `qa-sim.js`
- Create: `qa-sim.test.mjs`

**Interfaces:**
- Consumes: `QaCore` (Task 2).
- Produces: `QaSim.create({seed, now, rng, checklist, codes})` → object implementing the full `QaApi` interface (plan header) plus test hooks `_db` (state), `_ingest()`, `_completeJob(job)` (simulates the FieldOps trigger), `_tick(ms)`. `QaSim.demoSeed()` → synthetic data (no real names).

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
const Sim = (await import('./qa-sim.js')).default ?? require('./qa-sim.js');

function mk() { return Sim.create({ rng: () => 0.42, seed: { inspectors: [{ username: 'AHBA_QA01', display_name: 'QA 1' }, { username: 'AHBA_QA02', display_name: 'QA 2' }], jobs: [], sheetRows: [] } }); }
const job = (api, id) => api._db.jobs.find(j => j.id === id);
const SHEET = (over) => Object.assign({ COMP: 'J2', JODATECLOSED: '2026-09-01 00:00:00', ACCTNO: '1000000000001', JONO: 'R9000001',
  SUBSCRIBERNAME: 'TEST SUB', MOBILENO: '9000000001', BARANGAYNAME: 'PAYATAS', COMPLETEADDRESS: '1 TEST ST', TRANTYPECODE: 'MAINLINE APPLICATION',
  NAPCODE: 'QCY001 LP1 NP1', PORTNO: 'P1-O', SERIALNO: 'SN1', DRIVER: 'D1', TECH: 'T1' }, over || {});

test('importRows creates a queued subcon audit, a pool in-house audit, and links a FieldOps JO by JONO', async () => {
  const api = mk();
  api._db.jobs.push({ id: 'JO-1', job_order_no: 'R9000001', ibass_acct_no: '1000000000001', status: 'completed', subscriber: 'TEST SUB' });
  const r = await api.importRows([SHEET(), SHEET({ COMP: 'AHBA', JONO: 'R9000002', ACCTNO: '1000000000002' })]);
  assert.deepEqual(r, { upserted: 2, audits_created: 2 });
  const q = await api.listAudits({ status: ['queued'] });
  assert.equal(q.total, 1); assert.equal(q.rows[0].jo_no, 'R9000001'); assert.equal(q.rows[0].job_id, 'JO-1');
  assert.equal(job(api, 'JO-1').qa_status, 'FOR VISIT'); assert.equal(job(api, 'JO-1').qa_audit_id, q.rows[0].id);
  assert.equal((await api.listAudits({ status: ['pool'] })).total, 1);
  assert.match(q.rows[0].id, /^QA-\d{4}-\d{6}$/);
});

test('re-importing the same JONO does not duplicate; a FieldOps completion for a known JONO does not duplicate', async () => {
  const api = mk();
  await api.importRows([SHEET()]); await api.importRows([SHEET({ SUBSCRIBERNAME: 'RENAMED' })]);
  assert.equal((await api.listAudits({})).total, 1);
  api._completeJob({ id: 'JO-2', job_order_no: 'R9000001', ibass_acct_no: '1000000000001', status: 'completed', assigned_org_code: 'J2' });
  assert.equal((await api.listAudits({})).total, 1);
});

test('FieldOps completion first, sheet row later → linked, not duplicated', async () => {
  const api = mk();
  api._completeJob({ id: 'JO-3', job_order_no: null, ibass_acct_no: '1000000000009', status: 'completed', assigned_org_code: 'J2', subscriber: 'X' });
  assert.equal((await api.listAudits({ status: ['queued'] })).total, 1);
  await api.importRows([SHEET({ JONO: 'R9000009', ACCTNO: '1000000000009', NAPCODE: 'NAP-9' })]);
  const all = await api.listAudits({});
  assert.equal(all.total, 1); assert.equal(all.rows[0].jo_no, 'R9000009'); assert.equal(all.rows[0].nap_code, 'NAP-9'); assert.equal(all.rows[0].source, 'fieldops');
});

test('legacy sheet QA data imports as done/sheet_legacy and counts in the weekly report', async () => {
  const api = mk();
  await api.importRows([SHEET({ JONO: 'R9000010', ACCTNO: '1000000000010', VISITED: 'VISITED', 'DATE QA': '2026-09-02 00:00:00', ASSESMENT: 'FOR RECTIFY', 'INSPECTED BY': 'LEGACY QA', OTHERS: 'NO MIDSPAN', LATLONG: '14.6, 121.0' })]);
  const a = (await api.listAudits({ status: ['done'] })).rows[0];
  assert.equal(a.source, 'sheet_legacy'); assert.equal(a.assessment, 'FOR RECTIFY'); assert.equal(a.inspector, 'LEGACY QA'); assert.equal(a.lat, 14.6);
  const rep = await api.weeklyReport('2026-09-01', '2026-09-07');
  assert.equal(rep.contractors.find(c => c.contractor === 'J2')['FOR RECTIFY'], 1);
});

test('before-cutoff subcon rows go to pool, not queued', async () => {
  const api = mk();
  await api.saveSetting('initial_cutoff', '2026-08-01');
  await api.importRows([SHEET({ JODATECLOSED: '2026-07-15 00:00:00', JONO: 'R9000011' })]);
  assert.equal((await api.listAudits({ status: ['pool'] })).total, 1);
});

test('sampleInhouse queues ceil(pct%) of pool in range; queuePool moves a manual pick', async () => {
  const api = mk();
  const rows = []; for (let i = 0; i < 20; i++) rows.push(SHEET({ COMP: 'AHBA', JONO: 'R80000' + i, ACCTNO: '20000000000' + i }));
  await api.importRows(rows);
  assert.equal(await api.sampleInhouse({ from: '2026-09-01', to: '2026-09-30', pct: 10, by: 'HEAD' }), 2);
  assert.equal((await api.listAudits({ status: ['queued'] })).total, 2);
  const pool = (await api.listAudits({ status: ['pool'] })).rows;
  assert.equal(await api.queuePool([pool[0].id], { by: 'HEAD' }), 1);
  assert.equal((await api.listAudits({ status: ['queued'] })).total, 3);
});

test('assign → inspector sees it → start → submit VISITED with a fail; jobs.qa_* mirrors; idempotent replay', async () => {
  const api = mk();
  api._db.jobs.push({ id: 'JO-5', job_order_no: 'R9000005', ibass_acct_no: '1000000000005', status: 'completed' });
  await api.importRows([SHEET({ JONO: 'R9000005', ACCTNO: '1000000000005' })]);
  const id = (await api.listAudits({ status: ['queued'] })).rows[0].id;
  assert.equal(await api.assignAudits([id], { inspector: 'AHBA_QA01', date: '2026-09-08', startSeq: 1, by: 'HEAD' }), 1);
  assert.equal((await api.listMyAudits('AHBA_QA01')).length, 1);
  assert.equal((await api.listMyAudits('AHBA_QA02')).length, 0);
  assert.equal(job(api, 'JO-5').qa_status, 'ASSIGNED');
  const a = await api.startAudit(id, { lat: 14.7, lng: 121.05 });
  assert.equal(a.status, 'in_progress'); assert.equal(a.lat, 14.7);
  const cfg = await api.getConfig();
  const items = cfg.checklist.map((c, i) => ({ item_id: c.id, result: i === 2 ? 'fail' : 'pass' }));
  const failId = cfg.checklist[2].id;
  const ph = await api.uploadPhoto(id, new Blob(['x']), { itemId: failId, label: 'Attachment of house bracket' });
  assert.match(ph.path, new RegExp('^qa/' + id + '/'));
  const s1 = await api.uploadSignature(id, 'subscriber', new Blob(['s'])), s2 = await api.uploadSignature(id, 'inspector', new Blob(['i']));
  const payload = { submit_key: 'k-1', visit_status: 'VISITED', assessment: 'FOR RECTIFY', wire: 'STANDARD', qa_gc: 'COMPLETED',
    items, violations: [{ code: 'HA001', item_id: failId, remark: 'walang bracket' }], photos: [{ path: ph.path, item_id: failId, label: 'x' }],
    subscriber_signed_name: 'TEST SUB', subscriber_signature_path: s1.path, inspector_signature_path: s2.path, lat: 14.7, lng: 121.05 };
  const r = await api.submitAudit(id, payload);
  assert.equal(r.ok, true); assert.equal(r.audit.status, 'done'); assert.equal(r.audit.total_violations, 1); assert.equal(r.audit.total_penalty, 500);
  assert.equal(job(api, 'JO-5').qa_status, 'VISITED'); assert.equal(job(api, 'JO-5').qa_assessment, 'FOR RECTIFY');
  const again = await api.submitAudit(id, payload);
  assert.equal(again.duplicate, true);
  const detail = await api.getAudit(id);
  assert.equal(detail.items.length, cfg.checklist.length); assert.equal(detail.violations[0].category, 'NO OR POOR BRACKET');
  assert.ok(detail.log.map(l => l.action).includes('submitted'));
  await assert.rejects(api.submitAudit(id, { ...payload, submit_key: 'k-2' }), /not submittable/);
});

test('submit rejects GOOD with a failed item, missing signature, and NPA without photo', async () => {
  const api = mk();
  await api.importRows([SHEET({ JONO: 'R9000006', ACCTNO: '1000000000006' })]);
  const id = (await api.listAudits({ status: ['queued'] })).rows[0].id;
  await api.assignAudits([id], { inspector: 'AHBA_QA01', date: '2026-09-08', by: 'HEAD' });
  await api.startAudit(id, {});
  const cfg = await api.getConfig();
  const items = cfg.checklist.map((c, i) => ({ item_id: c.id, result: i === 0 ? 'fail' : 'pass' }));
  const base = { submit_key: 'z', visit_status: 'VISITED', assessment: 'GOOD', wire: 'STANDARD', qa_gc: 'COMPLETED', items,
    violations: [{ code: 'PR005', item_id: cfg.checklist[0].id }], photos: [{ path: 'qa/' + id + '/p.jpg', item_id: cfg.checklist[0].id }],
    subscriber_signed_name: 'A', subscriber_signature_path: 's', inspector_signature_path: 'i' };
  await assert.rejects(api.submitAudit(id, base), /GOOD/);
  await assert.rejects(api.submitAudit(id, { ...base, assessment: 'FOR PENALTY', inspector_signature_path: null }), /signature/i);
  await assert.rejects(api.submitAudit(id, { submit_key: 'n', visit_status: 'UNLOCATED', remarks: 'x', photos: [] }), /photo/i);
  const ok = await api.submitAudit(id, { submit_key: 'n2', visit_status: 'UNLOCATED', remarks: 'hindi mahanap', photos: [{ path: 'qa/' + id + '/loc.jpg' }] });
  assert.equal(ok.audit.visit_status, 'UNLOCATED'); assert.equal(ok.audit.assessment, null);
});

test('reopen lets the inspector resubmit; unassign returns to queued; board and syncStatus', async () => {
  const api = mk();
  await api.importRows([SHEET({ JONO: 'R9000007', ACCTNO: '1000000000007' }), SHEET({ JONO: 'R9000008', ACCTNO: '1000000000008', COMP: 'UNKNOWN CO' })]);
  const ids = (await api.listAudits({ status: ['queued'] })).rows.map(r => r.id);
  assert.equal((await api.syncStatus()).unmapped[0], 'UNKNOWN CO');
  await api.assignAudits(ids, { inspector: 'AHBA_QA01', date: '2026-09-08', by: 'HEAD' });
  assert.equal((await api.board('2026-09-08')).length, 2);
  assert.equal(await api.unassignAudits([ids[1]], { by: 'HEAD' }), 1);
  assert.equal((await api.board('2026-09-08')).length, 1);
  await api.startAudit(ids[0], {});
  await api.submitAudit(ids[0], { submit_key: 'a', visit_status: 'NOT EXIST', remarks: 'giniba', photos: [{ path: 'qa/' + ids[0] + '/x.jpg' }] });
  const re = await api.reopenAudit(ids[0], { by: 'HEAD', reason: 'mali ang status' });
  assert.equal(re.status, 'in_progress'); assert.equal(re.reopened_count, 1);
  const r2 = await api.submitAudit(ids[0], { submit_key: 'b', visit_status: 'H.CLOSED', remarks: 'sarado', photos: [{ path: 'qa/' + ids[0] + '/y.jpg' }] });
  assert.equal(r2.audit.visit_status, 'H.CLOSED');
  const events = [];
  const off = api.subscribe(e => events.push(e));
  await api.queuePool([], {}); off();
});

test('listAudits filters, searches and paginates; demoSeed is synthetic', async () => {
  const api = Sim.create({ seed: Sim.demoSeed() });
  const all = await api.listAudits({ pageSize: 5, page: 1 });
  assert.equal(all.rows.length, 5); assert.ok(all.total > 5);
  const j2 = await api.listAudits({ contractor: 'J2' });
  assert.ok(j2.rows.every(r => r.contractor_name === 'J2'));
  const q = await api.listAudits({ q: all.rows[0].subscriber.slice(0, 5) });
  assert.ok(q.total >= 1);
  assert.ok(Sim.demoSeed().sheetRows.every(r => /^DEMO /.test(r.SUBSCRIBERNAME)));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test qa-sim.test.mjs`
Expected: FAIL — `Cannot find module './qa-sim.js'`

- [ ] **Step 3: Write `qa-sim.js`**

```js
// AHBA QA Audit — in-memory QaApi implementation (demo + node tests). Mirrors the SQL rules in qa-04-functions.sql.
// Same method set as qa-api.js (enforced by qa-api.test.mjs). No network. Storage = fake paths (+ object URLs in the browser).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./qa-core.js'));
  else root.QaSim = factory(root.QaCore);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  var VISIT = Core.VISIT, ASSESS = Core.ASSESS;
  var CHECKLIST = [
    ['OUTSIDE', 'Maintenance loop above the NAP', 'PR005'], ['OUTSIDE', 'Attachment of S-clamps from every pole', 'PR003'],
    ['PREMISE', 'Attachment of house bracket', 'HA001'], ['PREMISE', 'Maintenance loop beside the house bracket', 'PR005'],
    ['PREMISE', 'Layout of drop cable in client premise', 'INW001'], ['PREMISE', 'Use of tapping clip and/or tie wrap', 'INW001'],
    ['PREMISE', 'NIU box fixed', 'INW002'], ['PREMISE', 'Looping at NIU box', 'INW002'], ['PREMISE', 'Patch cord', 'INW002'], ['PREMISE', 'Modem location', 'INW002']
  ];
  var CODES = [
    ['PR001', 'SAGGING DROP WIRE', 'PR', 500, 1000, 2000], ['PR003', 'MISSING S-CLAMP ON POLE', 'PR', 500, 1000, 2000], ['PR005', 'POOR ROUTING ON NAP', 'PR', 500, 1000, 2000],
    ['PR009', 'MISSING MID-SPAN CLAMP', 'PR', 500, 1000, 2000], ['PR013', 'NO LABEL AT NAP', 'PR', 500, 1000, 2000], ['HA001', 'NO OR POOR BRACKET', 'HA', 500, 1000, 2000],
    ['HA002', 'NO S-CLAMP ON BRACKET', 'HA', 500, 1000, 2000], ['INW001', 'SUBSTANDARD INDOOR CABLING', 'INW', 1000, 2000, 3000], ['INW002', 'POOR NIU / NO PATCH CORD', 'INW', 500, 1000, 2000],
    ['INW003', 'MISSING LABEL IN NIU BOX', 'INW', 500, 1000, 2000], ['CPE001', 'FAILED SIGNAL LEVEL', 'CPE', 500, 1000, 2000], ['MIS005', 'WRONG INSTALL ADDRESS', 'MIS', 1000, 2000, 3000],
    ['STY001', 'NO PPE / UNSAFE SETUP', 'STY', 500, 1000, 2000], ['DOC001', 'INCOMPLETE SAR', 'DOC', 500, 1000, 2000], ['PR012', 'IMPROPER POLE ATTACH', 'PR', null, null, null]
  ];
  var CONTRACTORS = [['AHBA', 'inhouse', 'sample'], ['AVELINE', 'subcon', 'all'], ['J2', 'subcon', 'all'], ['RIA', 'subcon', 'all'], ['MAX - ALLY88', 'subcon', 'all'],
    ['JHANRENZ', 'subcon', 'all'], ['J VANA', 'subcon', 'all'], ['COMWORKS', 'subcon', 'all'], ['JD CRUZ', 'subcon', 'all']];
  var QUICK = ['NO TAGGING NAP-NIU', 'NO HOUSE BRACKET/USED SPAN CLAMP', 'NO MIDSPAN', 'NO S-CLAMP', 'IMPROPER CABLE LAYOUT', 'NO LOOPING IN NIU', 'NO PATCH CORD INSTALLED', 'WRONG ADDRESS', 'FAILED PARAMETERS', 'COMMERCIAL'];
  var BRGYS = ['PAYATAS', 'BATASAN HILLS', 'COMMONWEALTH', 'BAGBAG', 'HOLY SPIRIT', 'KALIGAYAHAN', 'PASONG TAMO', 'CULIAT'];

  function demoSeed() {
    var rows = [], s = 11; var rng = function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    var comps = ['J2', 'AVELINE', 'RIA', 'AHBA', 'AHBA', 'MAX - ALLY88', 'J VANA', 'COMWORKS'];
    for (var i = 0; i < 60; i++) {
      var d = new Date(Date.UTC(2026, 8, 1 + Math.floor(rng() * 7)));
      var legacy = i % 9 === 0;
      rows.push({ COMP: comps[i % comps.length], JODATECLOSED: d.toISOString().slice(0, 10) + ' 00:00:00', ACCTNO: String(1900000000000 + i), JONO: 'R7' + String(100000 + i),
        SSPCODE: 'SKY-DEMO' + i, SUBSCRIBERNAME: 'DEMO SUBSCRIBER ' + (i + 1), MOBILENO: '9' + String(100000000 + i), BARANGAYNAME: BRGYS[i % BRGYS.length],
        COMPLETEADDRESS: (i + 1) + ' DEMO ST ' + BRGYS[i % BRGYS.length], TRANTYPECODE: 'MAINLINE APPLICATION', NAPCODE: 'QCY0' + (i % 9) + ' LP' + i + ' NP' + (i % 8 + 1),
        PORTNO: 'P' + (i % 8 + 1) + '-O', SERIALNO: 'SN' + i, DRIVER: 'DEMO DRIVER ' + (i % 5), TECH: 'DEMO TECH ' + (i % 7), 'TECH 2': '',
        LATLONG: (14.65 + rng() * 0.1).toFixed(6) + ', ' + (121.0 + rng() * 0.1).toFixed(6),
        VISITED: legacy ? 'VISITED' : '', 'DATE QA': legacy ? '2026-09-03 00:00:00' : '', ASSESMENT: legacy ? (i % 2 ? 'GOOD' : 'FOR RECTIFY') : '', 'INSPECTED BY': legacy ? 'DEMO LEGACY QA' : '', OTHERS: legacy && i % 2 === 0 ? 'NO MIDSPAN' : '' });
    }
    return { sheetRows: rows, inspectors: [{ username: 'AHBA_QA01', display_name: 'Demo Inspector 1' }, { username: 'AHBA_QA02', display_name: 'Demo Inspector 2' }, { username: 'AHBA_QA03', display_name: 'Demo Inspector 3' }],
      jobs: rows.slice(0, 20).map(function (r, i) { return { id: 'DEMO-JO-' + i, job_order_no: r.JONO, ibass_acct_no: r.ACCTNO, status: 'completed', subscriber: r.SUBSCRIBERNAME, photos: i % 3 === 0 ? [{ path: 'demo/' + i + '.jpg', label: 'HOUSE BRACKET' }] : [] }; }) };
  }

  function create(opts) {
    opts = opts || {};
    var now = opts.now || function () { return new Date(); };
    var rng = opts.rng || Math.random;
    var db = { audits: [], items: [], photos: [], violations: [], log: [], sheetRows: {}, jobs: [], settings: { inhouse_sample_pct: '10', initial_cutoff: '2026-08-01', sync_window_days: '60', last_sync_at: '', last_sync_rows: '0' },
      checklist: CHECKLIST.map(function (c, i) { return { id: i + 1, section: c[0], label: c[1], sort_order: i + 1, active: true, photo_required: false, suggested_code: c[2] }; }),
      codes: CODES.map(function (c) { return { code: c[0], category: c[1], description: c[1], class: c[2], severity: (c[3] || 0) >= 1000 ? 'MAJOR' : 'MINOR', penalty_text: c[3] ? 'OFFENSE LEVEL 1: PHP ' + c[3] : 'CLAWBACK', penalty_l1: c[3], penalty_l2: c[4], penalty_l3: c[5], active: true }; }),
      contractors: CONTRACTORS.map(function (c) { return { sheet_name: c[0], display_name: c[0], org_id: null, kind: c[1], coverage: c[2], active: true }; }),
      quickRemarks: QUICK.map(function (q, i) { return { label: q, sort_order: i + 1 }; }),
      inspectors: [], seq: 0, blobs: {} };
    var subs = [];
    var emit = function (row) { subs.forEach(function (f) { try { f({ type: 'audit', row: clone(row) }); } catch (e) {} }); };
    function clone(x) { return JSON.parse(JSON.stringify(x)); }
    function iso() { return now().toISOString(); }
    function today() { return iso().slice(0, 10); }
    function codeMap() { var m = {}; db.codes.forEach(function (c) { m[c.code] = c; }); return m; }
    function nextId() { db.seq++; return 'QA-' + iso().slice(0, 4) + '-' + String(db.seq).padStart(6, '0'); }
    function log(id, action, detail, by) { db.log.push({ id: db.log.length + 1, audit_id: id, at: iso(), by: by || 'SYSTEM', action: action, detail: detail || null }); }
    function find(id) { var a = db.audits.filter(function (x) { return x.id === id && !x.deleted_at; })[0]; if (!a) throw new Error('Audit ' + id + ' not found'); return a; }
    function contractor(name) { return db.contractors.filter(function (c) { return c.sheet_name === name; })[0] || null; }
    function syncJob(a) {
      if (!a.job_id) return;
      var j = db.jobs.filter(function (x) { return x.id === a.job_id; })[0]; if (!j) return;
      j.qa_audit_id = a.id; j.qa_assessment = a.assessment || null; j.qa_inspected_at = a.inspected_at || null;
      j.qa_status = a.status === 'done' ? (a.visit_status || 'VISITED') : (a.status === 'assigned' || a.status === 'in_progress') ? 'ASSIGNED' : 'FOR VISIT';
    }
    function findJob(jo, acct) {
      var hit = db.jobs.filter(function (j) { return !j.deleted_at && jo && (j.job_order_no || '').toUpperCase() === jo; })[0];
      if (!hit && acct) hit = db.jobs.filter(function (j) { return !j.deleted_at && j.ibass_acct_no === acct; })[0];
      return hit ? hit.id : null;
    }
    function parseLatLng(s) { var m = /^\s*(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)\s*$/.exec(s || ''); return m ? [parseFloat(m[1]), parseFloat(m[2])] : [null, null]; }
    function newAudit(base) {
      var a = Object.assign({ id: nextId(), source: 'sheet', job_id: null, jo_no: null, acct_no: null, sheet_row_jo: null, contractor_name: null, contractor_org_id: null, kind: null, unmapped: false,
        subscriber: null, mobile_no: null, address: null, barangay: null, nap_code: null, port_no: null, serial_no: null, tran_type: null, jo_date_closed: null, installers_text: null, sheet_latlong: null,
        status: 'queued', assigned_to: null, assigned_by: null, assigned_at: null, scheduled_date: null, sequence: null, started_at: null, inspected_at: null, lat: null, lng: null,
        inspector: null, contractor_rep: null, visit_status: null, qa_gc: null, wire: null, assessment: null, found_business: null, old_plan: null, new_plan: null, remarks: null,
        subscriber_signed_name: null, subscriber_signature_path: null, inspector_signature_path: null, total_violations: 0, total_penalty: 0, submit_key: null, reopened_count: 0,
        created_at: iso(), updated_at: iso(), deleted_at: null, deleted_by: null }, base);
      db.audits.push(a); return a;
    }
    function ingest() {
      var n = 0;
      Object.keys(db.sheetRows).sort().forEach(function (jo) {
        var r = db.sheetRows[jo];
        if (db.audits.some(function (a) { return a.jo_no === jo && !a.deleted_at; })) return;
        var c = contractor(r.comp);
        var linked = db.audits.filter(function (a) { return !a.deleted_at && !a.jo_no && a.acct_no && a.acct_no === r.acct_no; })[0];
        if (linked) {
          linked.jo_no = jo; linked.sheet_row_jo = jo; linked.nap_code = linked.nap_code || r.nap_code; linked.port_no = linked.port_no || r.port_no; linked.serial_no = linked.serial_no || r.serial_no;
          linked.installers_text = linked.installers_text || [r.driver, r.tech, r.tech2].filter(Boolean).join(' / ') || null; linked.jo_date_closed = linked.jo_date_closed || r.jo_date_closed;
          log(linked.id, 'sheet_linked', { jo_no: jo }); return;
        }
        var legacy = Core.hasLegacyQa(r);
        var status = legacy ? 'done' : Core.initialStatus(r, c, db.settings.initial_cutoff);
        var ll = parseLatLng(r.sheet_latlong);
        var a = newAudit({ source: legacy ? 'sheet_legacy' : 'sheet', job_id: findJob(jo, r.acct_no), jo_no: jo, acct_no: r.acct_no, sheet_row_jo: jo, contractor_name: r.comp, contractor_org_id: c ? c.org_id : null,
          kind: c ? c.kind : null, unmapped: !c, subscriber: r.subscriber_name, mobile_no: r.mobile_no, address: r.complete_address, barangay: r.barangay, nap_code: r.nap_code, port_no: r.port_no, serial_no: r.serial_no,
          tran_type: r.tran_type, jo_date_closed: r.jo_date_closed, installers_text: [r.driver, r.tech, r.tech2].filter(Boolean).join(' / ') || null, sheet_latlong: r.sheet_latlong, status: status,
          inspected_at: legacy ? ((r.sheet_date_qa || today()) + 'T08:00:00.000Z') : null, lat: ll[0], lng: ll[1], inspector: legacy ? r.sheet_inspected_by : null,
          visit_status: legacy ? (r.sheet_visited === 'GOOD' ? 'VISITED' : (r.sheet_visited || 'VISITED')) : null,
          qa_gc: legacy && Core.QAGC.indexOf(r.sheet_qa_gc) >= 0 ? r.sheet_qa_gc : null, wire: legacy && Core.WIRE.indexOf(r.sheet_wire) >= 0 ? r.sheet_wire : null,
          assessment: legacy && (ASSESS.indexOf(r.sheet_assessment) >= 0 || r.sheet_assessment === 'RECTIFIED') ? r.sheet_assessment : null,
          remarks: legacy ? ([r.sheet_others, r.sheet_remarks].filter(Boolean).join(' · ') || null) : null });
        syncJob(a); log(a.id, legacy ? 'imported_legacy' : 'created', { source: 'sheet', status: status, comp: r.comp }); emit(a); n++;
      });
      return n;
    }
    function completeJob(job) {
      if (!db.jobs.some(function (j) { return j.id === job.id; })) db.jobs.push(job);
      var jo = (job.job_order_no || '').toUpperCase() || null, acct = job.ibass_acct_no || null;
      if (db.audits.some(function (a) { return !a.deleted_at && (a.job_id === job.id || (jo && a.jo_no === jo) || (acct && a.acct_no === acct)); })) return null;
      var c = contractor(job.assigned_org_code || 'AHBA');
      var closed = (job.completed_at || iso()).slice(0, 10);
      var a = newAudit({ source: 'fieldops', job_id: job.id, jo_no: jo, acct_no: acct, contractor_name: c ? c.sheet_name : (job.assigned_org_code || null), kind: c ? c.kind : null, unmapped: !c,
        subscriber: job.subscriber || null, mobile_no: job.primary_no || null, address: job.address || null, barangay: job.brgy || job.area || null, jo_date_closed: closed,
        installers_text: [job.crew_driver, job.crew_tech1, job.crew_tech2].filter(Boolean).join(' / ') || null, status: Core.initialStatus({ jo_date_closed: closed }, c, db.settings.initial_cutoff) });
      syncJob(a); log(a.id, 'created', { source: 'fieldops', status: a.status }); emit(a); return a;
    }
    function bump(a) { a.updated_at = iso(); emit(a); return clone(a); }
    function inspectorExists(u) { return db.inspectors.some(function (i) { return i.username === u; }); }

    var api = {
      // ----- inspector -----
      listMyAudits: function (username) {
        var cutoff = new Date(now().getTime() - 30 * 86400000).toISOString();
        return Promise.resolve(db.audits.filter(function (a) { return !a.deleted_at && a.assigned_to === username && (a.status === 'assigned' || a.status === 'in_progress' || (a.status === 'done' && a.inspected_at >= cutoff)); })
          .sort(function (x, y) { return (x.scheduled_date || '').localeCompare(y.scheduled_date || '') || (x.sequence || 0) - (y.sequence || 0); }).map(clone));
      },
      startAudit: function (id, pos) {
        var a = find(id); pos = pos || {};
        if (a.status !== 'assigned' && a.status !== 'in_progress') return Promise.reject(new Error('Audit ' + id + ' cannot be started'));
        var first = !a.started_at;
        a.status = 'in_progress'; a.started_at = a.started_at || iso(); if (pos.lat != null) a.lat = pos.lat; if (pos.lng != null) a.lng = pos.lng; a.inspector = a.inspector || a.assigned_to;
        syncJob(a); if (first) log(id, 'started', { lat: pos.lat, lng: pos.lng }, a.assigned_to); return Promise.resolve(bump(a));
      },
      uploadPhoto: function (id, blob, meta) {
        meta = meta || {}; var safe = String(meta.label || 'photo').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
        var path = 'qa/' + id + '/' + safe + '_' + now().getTime() + '_' + Math.floor(rng() * 1e6) + '.jpg'; db.blobs[path] = blob; return Promise.resolve({ path: path });
      },
      uploadSignature: function (id, who, blob) { var path = 'qa/' + id + '/sig_' + who + '_' + now().getTime() + '.png'; db.blobs[path] = blob; return Promise.resolve({ path: path }); },
      submitAudit: function (id, p) {
        try {
          var a = find(id); p = p || {};
          if (!p.submit_key) throw new Error('submit_key required');
          if (a.status === 'done' && a.submit_key === p.submit_key) return Promise.resolve({ ok: true, audit: clone(a), duplicate: true });
          if (a.status !== 'assigned' && a.status !== 'in_progress') throw new Error('Audit ' + id + ' is ' + a.status + ' — not submittable');
          var errs = Core.validateSubmission(p, db.checklist.filter(function (c) { return c.active; }));
          if (errs.length) throw new Error(errs.join(' '));
          db.items = db.items.filter(function (i) { return i.audit_id !== id; }); db.violations = db.violations.filter(function (v) { return v.audit_id !== id; });
          (p.photos || []).forEach(function (ph) { if (!db.photos.some(function (x) { return x.path === ph.path; })) db.photos.push({ id: db.photos.length + 1, audit_id: id, item_id: ph.item_id || null, path: ph.path, label: ph.label || null, created_at: iso() }); });
          var cm = codeMap(), count = 0, pen = 0;
          if (p.visit_status === 'VISITED') {
            (p.items || []).forEach(function (i) { db.items.push({ audit_id: id, item_id: i.item_id, result: i.result, remark: i.remark || null }); });
            (p.violations || []).forEach(function (v) {
              var c = cm[v.code]; if (!c) throw new Error('Unknown violation code ' + v.code);
              var amt = v.penalty_amount != null ? Number(v.penalty_amount) : c.penalty_l1;
              db.violations.push({ id: db.violations.length + 1, audit_id: id, code: c.code, item_id: v.item_id || null, description: v.description || c.description, category: c.category, class: c.class, severity: c.severity, offense_no: v.offense_no || null, penalty_amount: amt, photo_path: v.photo_path || null, remark: v.remark || null, created_at: iso() });
              count++; pen += amt || 0;
            });
          }
          Object.assign(a, { status: 'done', inspected_at: iso(), submit_key: p.submit_key, lat: p.lat != null ? p.lat : a.lat, lng: p.lng != null ? p.lng : a.lng, inspector: a.inspector || a.assigned_to,
            visit_status: p.visit_status, contractor_rep: p.contractor_rep || null, installers_text: p.installers_text || a.installers_text, wire: p.wire || null, qa_gc: p.qa_gc || null,
            assessment: p.assessment || null, found_business: p.found_business || null, old_plan: p.old_plan || null, new_plan: p.new_plan || null, remarks: p.remarks || null,
            subscriber_signed_name: p.subscriber_signed_name || null, subscriber_signature_path: p.subscriber_signature_path || null, inspector_signature_path: p.inspector_signature_path || null,
            total_violations: count, total_penalty: pen });
          syncJob(a); log(id, 'submitted', { visit: p.visit_status, assessment: a.assessment, violations: count, penalty: pen }, a.assigned_to);
          return Promise.resolve({ ok: true, audit: bump(a) });
        } catch (e) { return Promise.reject(e); }
      },
      getInstallPhotos: function (jobId) { var j = db.jobs.filter(function (x) { return x.id === jobId; })[0]; return Promise.resolve(((j && j.photos) || []).map(function (p) { return { path: p.path, label: p.label, url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="140"><rect width="200" height="140" fill="%23cfd8d3"/><text x="10" y="75" font-size="14">' + encodeURIComponent(p.label || 'photo') + '</text></svg>' }; })); },
      // ----- head -----
      listAudits: function (f) {
        f = f || {}; var page = f.page || 1, size = f.pageSize || 50, q = (f.q || '').toUpperCase();
        var rows = db.audits.filter(function (a) {
          if (a.deleted_at) return false;
          if (f.status && f.status.length && f.status.indexOf(a.status) < 0) return false;
          if (f.contractor && a.contractor_name !== f.contractor) return false;
          if (f.kind && a.kind !== f.kind) return false;
          if (f.barangay && a.barangay !== f.barangay) return false;
          if (f.from && (a.jo_date_closed || '') < f.from) return false;
          if (f.to && (a.jo_date_closed || '9999') > f.to) return false;
          if (f.inspector && a.inspector !== f.inspector && a.assigned_to !== f.inspector) return false;
          if (f.assessment && a.assessment !== f.assessment) return false;
          if (f.qfrom && (a.inspected_at || '') < f.qfrom) return false;
          if (f.qto && (a.inspected_at || '9999').slice(0, 10) > f.qto) return false;
          if (q && [a.id, a.subscriber, a.address, a.jo_no, a.acct_no].join(' ').toUpperCase().indexOf(q) < 0) return false;
          return true;
        }).sort(function (x, y) { return (y.jo_date_closed || '').localeCompare(x.jo_date_closed || '') || x.id.localeCompare(y.id); });
        return Promise.resolve({ rows: rows.slice((page - 1) * size, page * size).map(clone), total: rows.length });
      },
      assignAudits: function (ids, o) {
        o = o || {}; if (!inspectorExists(o.inspector)) return Promise.reject(new Error('Not a QA inspector account: ' + o.inspector));
        var n = 0, seq = o.startSeq || 1;
        ids.forEach(function (id) { var a = find(id); if (['pool', 'queued', 'assigned'].indexOf(a.status) < 0) return;
          Object.assign(a, { status: 'assigned', assigned_to: o.inspector, assigned_by: o.by || 'HEAD', assigned_at: iso(), scheduled_date: o.date, sequence: seq++ });
          syncJob(a); log(id, 'assigned', { to: o.inspector, date: o.date, seq: a.sequence }, o.by); bump(a); n++; });
        return Promise.resolve(n);
      },
      unassignAudits: function (ids, o) { var n = 0; ids.forEach(function (id) { var a = find(id); if (a.status !== 'assigned') return; Object.assign(a, { status: 'queued', assigned_to: null, assigned_by: null, assigned_at: null, scheduled_date: null, sequence: null }); syncJob(a); log(id, 'unassigned', null, (o || {}).by); bump(a); n++; }); return Promise.resolve(n); },
      queuePool: function (ids, o) { var n = 0; ids.forEach(function (id) { var a = find(id); if (a.status !== 'pool') return; a.status = 'queued'; log(id, 'queued_manual', null, (o || {}).by); bump(a); n++; }); return Promise.resolve(n); },
      sampleInhouse: function (o) {
        o = o || {}; var pool = db.audits.filter(function (a) { return !a.deleted_at && a.status === 'pool' && a.kind === 'inhouse' && a.jo_date_closed >= o.from && a.jo_date_closed <= o.to; });
        var pick = Core.pickSample(pool, o.pct, rng); pick.forEach(function (a) { a.status = 'queued'; log(a.id, 'queued_sample', { pct: o.pct, from: o.from, to: o.to }, o.by); bump(a); });
        return Promise.resolve(pick.length);
      },
      getAudit: function (id) { var a = find(id); return Promise.resolve({ audit: clone(a), items: clone(db.items.filter(function (i) { return i.audit_id === id; })), photos: clone(db.photos.filter(function (p) { return p.audit_id === id; })), violations: clone(db.violations.filter(function (v) { return v.audit_id === id; })), log: clone(db.log.filter(function (l) { return l.audit_id === id; })) }); },
      reopenAudit: function (id, o) { var a = find(id); if (a.status !== 'done' || !a.assigned_to) return Promise.reject(new Error('Audit ' + id + ' is not done or has no inspector')); a.status = 'in_progress'; a.reopened_count++; a.submit_key = null; syncJob(a); log(id, 'reopened', { reason: (o || {}).reason }, (o || {}).by); return Promise.resolve(bump(a)); },
      listInspectors: function () { return Promise.resolve(clone(db.inspectors)); },
      board: function (date) { return Promise.resolve(db.audits.filter(function (a) { return !a.deleted_at && a.scheduled_date === date && a.assigned_to; }).sort(function (x, y) { return (x.assigned_to || '').localeCompare(y.assigned_to || '') || (x.sequence || 0) - (y.sequence || 0); }).map(clone)); },
      weeklyReport: function (from, to) {
        var done = db.audits.filter(function (a) { return !a.deleted_at && a.status === 'done' && a.inspected_at && a.inspected_at.slice(0, 10) >= from && a.inspected_at.slice(0, 10) <= to; });
        var sheet = Object.values(db.sheetRows).filter(function (r) { return r.jo_date_closed >= from && r.jo_date_closed <= to; });
        var s = Core.weeklySummary(done, db.violations, db.items, sheet, db.checklist);
        var cm = codeMap(); s.codes.forEach(function (c) { c.category = (cm[c.code] || {}).category || ''; });
        return Promise.resolve(s);
      },
      getConfig: function () { return Promise.resolve({ checklist: clone(db.checklist).sort(function (a, b) { return a.sort_order - b.sort_order; }), codes: clone(db.codes), contractors: clone(db.contractors), quickRemarks: clone(db.quickRemarks), settings: clone(db.settings) }); },
      saveChecklistItem: function (item) { var ex = db.checklist.filter(function (c) { return c.id === item.id; })[0]; if (ex) Object.assign(ex, item); else db.checklist.push(Object.assign({ id: db.checklist.length + 1, active: true, photo_required: false, sort_order: db.checklist.length + 1 }, item)); return Promise.resolve(clone(ex || db.checklist[db.checklist.length - 1])); },
      saveCode: function (code) { var ex = codeMap()[code.code]; if (ex) Object.assign(ex, code); else db.codes.push(Object.assign({ active: true }, code)); return Promise.resolve(clone(ex || code)); },
      saveContractor: function (c) { var ex = contractor(c.sheet_name); if (ex) Object.assign(ex, c); else db.contractors.push(Object.assign({ active: true, kind: 'subcon', coverage: 'all', org_id: null, display_name: c.sheet_name }, c)); return Promise.resolve(clone(ex || c)); },
      saveSetting: function (k, v) { db.settings[k] = String(v); return Promise.resolve({ key: k, value: String(v) }); },
      syncStatus: function () { var un = {}; db.audits.forEach(function (a) { if (a.unmapped && !a.deleted_at) un[a.contractor_name] = 1; }); return Promise.resolve({ last_sync_at: db.settings.last_sync_at, last_sync_rows: db.settings.last_sync_rows, unmapped: Object.keys(un) }); },
      importRows: function (rows) {
        var up = 0; (rows || []).forEach(function (raw) { var r = Core.normalizeSheetRow(raw); if (!r) return; var ex = db.sheetRows[r.jo_no]; db.sheetRows[r.jo_no] = Object.assign(ex || { first_seen_at: iso() }, r, { raw: raw, updated_at: iso() }); up++; });
        var n = ingest(); db.settings.last_sync_at = iso(); db.settings.last_sync_rows = String(up);
        return Promise.resolve({ upserted: up, audits_created: n });
      },
      subscribe: function (cb) { subs.push(cb); return function () { subs = subs.filter(function (f) { return f !== cb; }); }; },
      photoUrl: function (path) {
        var b = db.blobs[path];
        if (b && typeof URL !== 'undefined' && URL.createObjectURL && typeof Blob !== 'undefined' && b instanceof Blob && b.size > 10) return Promise.resolve(URL.createObjectURL(b));
        return Promise.resolve('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="%23dfe7e2"/><text x="12" y="85" font-size="12">' + encodeURIComponent(path.split('/').pop()) + '</text></svg>');
      },
      // ----- test / demo hooks -----
      _db: db, _ingest: ingest, _completeJob: completeJob
    };
    var seed = opts.seed;
    if (seed) { db.inspectors = clone(seed.inspectors || []); (seed.jobs || []).forEach(function (j) { db.jobs.push(clone(j)); }); if (seed.sheetRows && seed.sheetRows.length) api.importRows(seed.sheetRows); }
    if (!db.inspectors.length) db.inspectors = [{ username: 'AHBA_QA01', display_name: 'QA Inspector 1' }, { username: 'AHBA_QA02', display_name: 'QA Inspector 2' }];
    return api;
  }
  return { create: create, demoSeed: demoSeed };
});
```

- [ ] **Step 4: Run the tests**

Run: `node --test qa-sim.test.mjs`
Expected: `# pass 10`, `# fail 0`. (Node 24 has global `Blob`; the sim never touches the DOM.)

- [ ] **Step 5: Commit**

```bash
git add qa-sim.js qa-sim.test.mjs
git commit -m "feat(qa): in-memory QaApi simulation + workflow tests (ingest/dedup/legacy/sampling/assign/submit/reopen)"
```

---

### Task 7: `qa-api.js` — real adapter over supabase-js + contract test

**Files:**
- Create: `qa-api.js`
- Create: `qa-api.test.mjs`

**Interfaces:**
- Consumes: a supabase-js v2 client (`sb` on mobile, `dashAuth` on console — both already created), the RPC names of Task 5, tables of Task 3, bucket `qa-photos`.
- Produces: `QaApi.create(client, {username})` → the `QaApi` interface. In node, `require('./qa-api.js')` must load without a client (factory only).

- [ ] **Step 1: Write the failing contract test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
const Sim = (await import('./qa-sim.js')).default ?? require('./qa-sim.js');
const Api = (await import('./qa-api.js')).default ?? require('./qa-api.js');

const PUBLIC = ['listMyAudits','startAudit','uploadPhoto','uploadSignature','submitAudit','getInstallPhotos','listAudits','assignAudits','unassignAudits','queuePool',
  'sampleInhouse','getAudit','reopenAudit','listInspectors','board','weeklyReport','getConfig','saveChecklistItem','saveCode','saveContractor','saveSetting',
  'syncStatus','importRows','subscribe','photoUrl'];

function fakeClient() {
  const calls = [];
  const q = (table) => { const b = { _t: table, _ops: [] }; ['select','eq','is','not','in','gte','lte','ilike','or','order','range','limit','upsert','insert','update','maybeSingle','single']
    .forEach(m => { b[m] = (...a) => { b._ops.push([m, a]); return b; }; }); b.then = (res) => res({ data: [], error: null, count: 0 }); return b; };
  return { calls, schema: (s) => ({ from: (t) => { calls.push(['from', s, t]); return q(t); }, rpc: (n, a) => { calls.push(['rpc', s, n, a]); return Promise.resolve({ data: 0, error: null }); } }),
    from: (t) => { calls.push(['from', 'public', t]); return q(t); },
    storage: { from: (b) => ({ upload: (p, blob) => { calls.push(['upload', b, p]); return Promise.resolve({ error: null }); }, createSignedUrl: (p) => Promise.resolve({ data: { signedUrl: 'https://x/' + p } }) }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {} };
}

test('qa-api exposes exactly the QaApi method set (same as the sim)', () => {
  const sim = Sim.create({}); const api = Api.create(fakeClient(), { username: 'AHBA_QA01' });
  const simKeys = Object.keys(sim).filter(k => !k.startsWith('_')).sort();
  const apiKeys = Object.keys(api).filter(k => !k.startsWith('_')).sort();
  assert.deepEqual(apiKeys, PUBLIC.slice().sort());
  assert.deepEqual(simKeys, apiKeys);
});

test('qa-api routes through schema qa and the RPC names from qa-04', async () => {
  const c = fakeClient(); const api = Api.create(c, { username: 'AHBA_QA01' });
  await api.assignAudits(['QA-1'], { inspector: 'AHBA_QA01', date: '2026-09-08', startSeq: 3 });
  assert.deepEqual(c.calls.pop(), ['rpc', 'qa', 'assign_audits', { p_ids: ['QA-1'], p_inspector: 'AHBA_QA01', p_date: '2026-09-08', p_start_seq: 3 }]);
  await api.submitAudit('QA-1', { submit_key: 'k' });
  assert.deepEqual(c.calls.pop().slice(0, 3), ['rpc', 'qa', 'submit_audit']);
  await api.uploadPhoto('QA-1', new Blob(['x']), { itemId: 3, label: 'House bracket' });
  const up = c.calls.pop(); assert.equal(up[0], 'upload'); assert.equal(up[1], 'qa-photos'); assert.match(up[2], /^qa\/QA-1\/house-bracket_/);
  await api.listMyAudits('AHBA_QA01');
  assert.deepEqual(c.calls.pop(), ['from', 'qa', 'audits']);
  await api.getInstallPhotos('JO-1');
  assert.deepEqual(c.calls.pop(), ['from', 'public', 'job_photos']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test qa-api.test.mjs`
Expected: FAIL — `Cannot find module './qa-api.js'`

- [ ] **Step 3: Write `qa-api.js`**

```js
// AHBA QA Audit — real QaApi over supabase-js v2 (schema `qa`, bucket `qa-photos`). Same method set as qa-sim.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QaApi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var BUCKET = 'qa-photos', PUBLIC_PHOTOS = 'job-photos';
  function create(client, opts) {
    opts = opts || {};
    var qa = function () { return client.schema('qa'); };
    var username = opts.username || '';
    function unwrap(p) { return Promise.resolve(p).then(function (r) { if (r.error) throw new Error(r.error.message || String(r.error)); return r.data; }); }
    function rpc(name, args) { return unwrap(qa().rpc(name, args || {})); }
    function safeName(s) { return String(s || 'photo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40); }
    function upload(path, blob, type) { return unwrap(client.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false })).then(function () { return { path: path }; }); }
    // PostgREST caps at 1,000 rows/request → page through explicitly for any unbounded list.
    function pageAll(build, size) {
      size = size || 1000; var out = [];
      function step(from) { return unwrap(build().range(from, from + size - 1)).then(function (rows) { rows = rows || []; out = out.concat(rows); return rows.length === size ? step(from + size) : out; }); }
      return step(0);
    }
    var api = {
      listMyAudits: function (u) {
        var cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
        return pageAll(function () { return qa().from('audits').select('*').eq('assigned_to', u || username).is('deleted_at', null)
          .or('status.in.(assigned,in_progress),and(status.eq.done,inspected_at.gte.' + cutoff + ')').order('scheduled_date', { ascending: true }).order('sequence', { ascending: true }); });
      },
      startAudit: function (id, pos) { pos = pos || {}; return rpc('start_audit', { p_id: id, p_lat: pos.lat == null ? null : pos.lat, p_lng: pos.lng == null ? null : pos.lng }); },
      uploadPhoto: function (id, blob, meta) { meta = meta || {}; return upload('qa/' + id + '/' + safeName(meta.label) + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '.jpg', blob, 'image/jpeg'); },
      uploadSignature: function (id, who, blob) { return upload('qa/' + id + '/sig_' + who + '_' + Date.now() + '.png', blob, 'image/png'); },
      submitAudit: function (id, payload) { return rpc('submit_audit', { p_id: id, p_payload: payload }); },
      getInstallPhotos: function (jobId) {
        if (!jobId) return Promise.resolve([]);
        return unwrap(client.from('job_photos').select('path,label').eq('job_id', jobId).order('created_at', { ascending: true })).then(function (rows) {
          var base = (opts.supaUrl || '') + '/storage/v1/object/public/' + PUBLIC_PHOTOS + '/';
          return (rows || []).map(function (r) { return { path: r.path, label: r.label, url: base + r.path }; });
        });
      },
      listAudits: function (f) {
        f = f || {}; var page = f.page || 1, size = f.pageSize || 50;
        var b = qa().from('audits').select('*', { count: 'exact' }).is('deleted_at', null);
        if (f.status && f.status.length) b = b.in('status', f.status);
        if (f.contractor) b = b.eq('contractor_name', f.contractor);
        if (f.kind) b = b.eq('kind', f.kind);
        if (f.barangay) b = b.eq('barangay', f.barangay);
        if (f.from) b = b.gte('jo_date_closed', f.from);
        if (f.to) b = b.lte('jo_date_closed', f.to);
        if (f.inspector) b = b.or('inspector.eq.' + f.inspector + ',assigned_to.eq.' + f.inspector);
        if (f.assessment) b = b.eq('assessment', f.assessment);
        if (f.qfrom) b = b.gte('inspected_at', f.qfrom);
        if (f.qto) b = b.lte('inspected_at', f.qto + 'T23:59:59+08:00');
        if (f.q) { var q = String(f.q).replace(/[(),]/g, ' ').trim(); b = b.or('id.ilike.%' + q + '%,subscriber.ilike.%' + q + '%,address.ilike.%' + q + '%,jo_no.ilike.%' + q + '%,acct_no.ilike.%' + q + '%'); }
        b = b.order('jo_date_closed', { ascending: false, nullsFirst: false }).order('id').range((page - 1) * size, page * size - 1);
        return Promise.resolve(b).then(function (r) { if (r.error) throw new Error(r.error.message); return { rows: r.data || [], total: r.count || 0 }; });
      },
      assignAudits: function (ids, o) { o = o || {}; return rpc('assign_audits', { p_ids: ids, p_inspector: o.inspector, p_date: o.date, p_start_seq: o.startSeq || 1 }); },
      unassignAudits: function (ids) { return rpc('unassign_audits', { p_ids: ids }); },
      queuePool: function (ids) { return rpc('queue_pool', { p_ids: ids }); },
      sampleInhouse: function (o) { o = o || {}; return rpc('sample_inhouse', { p_from: o.from, p_to: o.to, p_pct: o.pct }); },
      getAudit: function (id) {
        return Promise.all([
          unwrap(qa().from('audits').select('*').eq('id', id).single()),
          unwrap(qa().from('audit_items').select('*').eq('audit_id', id)),
          unwrap(qa().from('audit_photos').select('*').eq('audit_id', id).order('id')),
          unwrap(qa().from('audit_violations').select('*').eq('audit_id', id).order('id')),
          unwrap(qa().from('audit_log').select('*').eq('audit_id', id).order('at'))
        ]).then(function (r) { return { audit: r[0], items: r[1] || [], photos: r[2] || [], violations: r[3] || [], log: r[4] || [] }; });
      },
      reopenAudit: function (id, o) { return rpc('reopen_audit', { p_id: id, p_reason: (o || {}).reason || '' }); },
      listInspectors: function () { return unwrap(client.from('technicians').select('username,display_name').eq('role', 'qa_inspector').order('username')); },
      board: function (date) { return pageAll(function () { return qa().from('audits').select('*').eq('scheduled_date', date).is('deleted_at', null).not('assigned_to', 'is', null).order('assigned_to').order('sequence'); }); },
      weeklyReport: function (from, to) { return rpc('weekly_report', { p_from: from, p_to: to }); },
      getConfig: function () {
        return Promise.all([
          unwrap(qa().from('checklist_items').select('*').order('sort_order')), pageAll(function () { return qa().from('violation_codes').select('*').order('code'); }),
          unwrap(qa().from('contractors').select('*').order('sheet_name')), unwrap(qa().from('quick_remarks').select('*').order('sort_order')), unwrap(qa().from('settings').select('*'))
        ]).then(function (r) { var s = {}; (r[4] || []).forEach(function (x) { s[x.key] = x.value; }); return { checklist: r[0] || [], codes: r[1] || [], contractors: r[2] || [], quickRemarks: r[3] || [], settings: s }; });
      },
      saveChecklistItem: function (item) { return unwrap(item.id ? qa().from('checklist_items').update(item).eq('id', item.id).select().single() : qa().from('checklist_items').insert(item).select().single()); },
      saveCode: function (code) { return unwrap(qa().from('violation_codes').upsert(code, { onConflict: 'code' }).select().single()); },
      saveContractor: function (c) { return unwrap(qa().from('contractors').upsert(c, { onConflict: 'sheet_name' }).select().single()); },
      saveSetting: function (k, v) { return unwrap(qa().from('settings').upsert({ key: k, value: String(v) }, { onConflict: 'key' }).select().single()); },
      syncStatus: function () { return rpc('sync_status'); },
      importRows: function (rows) {
        var Core = (typeof QaCore !== 'undefined') ? QaCore : require('./qa-core.js');
        var norm = (rows || []).map(function (r) { var n = Core.normalizeSheetRow(r); if (n) n.raw = r; return n; }).filter(Boolean);
        var chunks = []; for (var i = 0; i < norm.length; i += 500) chunks.push(norm.slice(i, i + 500));
        return chunks.reduce(function (p, ch) { return p.then(function () { return unwrap(qa().from('sheet_rows').upsert(ch, { onConflict: 'jo_no' })); }); }, Promise.resolve())
          .then(function () { return rpc('ingest_sheet_rows'); })
          .then(function (n) { return api.saveSetting('last_sync_at', new Date().toISOString()).then(function () { return api.saveSetting('last_sync_rows', norm.length); }).then(function () { return { upserted: norm.length, audits_created: n }; }); });
      },
      subscribe: function (cb) {
        var ch = client.channel('qa-audits-' + Math.random().toString(36).slice(2, 8)).on('postgres_changes', { event: '*', schema: 'qa', table: 'audits' }, function (m) { cb({ type: 'audit', row: m.new || m.old }); }).subscribe();
        return function () { try { client.removeChannel(ch); } catch (e) {} };
      },
      photoUrl: function (path) { return Promise.resolve(client.storage.from(BUCKET).createSignedUrl(path, 3600)).then(function (r) { return (r.data && r.data.signedUrl) || ''; }); }
    };
    return api;
  }
  return { create: create };
});
```

- [ ] **Step 4: Run tests + lint**

Run: `node --test qa-api.test.mjs && node --check qa-api.js && node --check qa-sim.js && node --check qa-core.js`
Expected: `# pass 2`, no syntax errors.

- [ ] **Step 5: Commit**

```bash
git add qa-api.js qa-api.test.mjs
git commit -m "feat(qa): real QaApi adapter (supabase-js, schema qa, signed photo URLs, paginated lists) + contract test"
```

---

### Task 8: `mobile-qa.js` — inspector UI (mountable), signature pad, offline draft + retry

**Files:**
- Create: `mobile-qa.js`

**Interfaces:**
- Consumes: `QaCore`, a `QaApi` instance, `deps` = `{ toast(msg), compressImage(file,maxDim,targetKB,stamp)->Promise<Blob>, buildStamp()->Promise<stamp>, getPos()->Promise<{lat,lng}|null>, esc(s) }` (production passes the FieldOps globals; the demo passes simple versions).
- Produces: global `MobileQA` with `mount(rootEl, {api, user:{username,display_name}, deps}) -> {refresh(), destroy()}` and `makeSignaturePad(canvas) -> {clear(), isEmpty(), toBlob()->Promise<Blob>}`. Production glue (Task 14) calls `MobileQA.mount(document.getElementById('qaView'), {...})` from `startQA()`.
- Storage keys: `qa_draft_<auditId>` (form state incl. pending photo dataURLs), `qa_submitq` (queued submissions).

- [ ] **Step 1: Write `mobile-qa.js`**

```js
// AHBA FieldOps — QA INSPECTOR mobile module. Loaded by mobile.html (production) and qa-demo.html (dry run).
// Mount-only: no globals are read except QaCore. All data goes through the injected QaApi.
(function (root) {
  'use strict';
  var Core = root.QaCore;
  var DRAFT = 'qa_draft_', QUEUE = 'qa_submitq';
  var CSS = '.qa-wrap{font:14px system-ui,-apple-system,sans-serif;color:#0e2b27;padding:10px 12px 90px}.qa-tabs{display:flex;gap:6px;margin:6px 0 10px}.qa-tabs button{flex:1;padding:9px 6px;border:1px solid #cfe0d8;background:#fff;border-radius:10px;font-weight:700;font-size:12px}.qa-tabs button.on{background:#0d3b34;color:#fff;border-color:#0d3b34}' +
    '.qa-card{border:1px solid #dfe7e2;border-radius:12px;padding:11px;margin-bottom:9px;background:#fff}.qa-card .t{font-weight:800;font-size:14px}.qa-card .s{font-size:12px;color:#3a4a45;margin-top:3px}.qa-badge{display:inline-block;font-size:10px;font-weight:800;padding:2px 7px;border-radius:9px;background:#e7f7ef;color:#11825f;margin-left:6px}.qa-badge.done{background:#e8ecff;color:#2d3fa8}.qa-badge.prog{background:#fff3d6;color:#9a6200}' +
    '.qa-btn{display:inline-block;padding:9px 12px;border-radius:10px;border:1px solid #0d3b34;background:#0d3b34;color:#fff;font-weight:800;font-size:13px}.qa-btn.ghost{background:#fff;color:#0d3b34}.qa-btn.warn{background:#c2503a;border-color:#c2503a}.qa-btn[disabled]{opacity:.5}' +
    '.qa-sheet{position:fixed;inset:0;background:#f4f7f5;z-index:9000;overflow:auto;padding:12px 12px 120px}.qa-sec{font:800 11px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#107b5e;margin:16px 0 6px}.qa-field{margin-bottom:9px}.qa-field label{display:block;font-size:11px;font-weight:700;color:#3a4a45;margin-bottom:3px}.qa-field input,.qa-field select,.qa-field textarea{width:100%;padding:9px;border:1px solid #cfd8d3;border-radius:9px;font-size:14px;box-sizing:border-box;text-transform:uppercase}.qa-field textarea{text-transform:none}' +
    '.qa-item{border:1px solid #dfe7e2;border-radius:11px;padding:9px;margin-bottom:8px;background:#fff}.qa-item .lbl{font-weight:700;font-size:13px;margin-bottom:6px}.qa-pfn{display:flex;gap:6px}.qa-pfn button{flex:1;padding:10px 0;border-radius:9px;border:1px solid #cfd8d3;background:#fff;font-weight:800;font-size:13px}.qa-pfn button.pass.on{background:#11825f;color:#fff;border-color:#11825f}.qa-pfn button.fail.on{background:#c2503a;color:#fff;border-color:#c2503a}.qa-pfn button.na.on{background:#5c6b67;color:#fff;border-color:#5c6b67}' +
    '.qa-fail{margin-top:8px;border-top:1px dashed #e3b1a6;padding-top:8px}.qa-thumbs{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.qa-thumbs img{width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid #cfd8d3}.qa-chips{display:flex;gap:5px;flex-wrap:wrap;margin:5px 0}.qa-chips span{font-size:10px;border:1px solid #cfd8d3;border-radius:9px;padding:3px 7px;background:#fff}' +
    '.qa-seg{display:flex;gap:5px;flex-wrap:wrap}.qa-seg button{padding:8px 10px;border-radius:9px;border:1px solid #cfd8d3;background:#fff;font-weight:700;font-size:12px}.qa-seg button.on{background:#0d3b34;color:#fff;border-color:#0d3b34}' +
    '.qa-sig{border:1px solid #cfd8d3;border-radius:10px;background:#fff;width:100%;height:150px;touch-action:none}.qa-cert{font-size:11px;color:#3a4a45;background:#fff;border:1px solid #e3e8e2;border-radius:9px;padding:8px;margin:6px 0}.qa-footer{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #dfe7e2;padding:10px 12px;display:flex;gap:8px;z-index:9001}.qa-footer .qa-btn{flex:1;text-align:center}.qa-err{color:#c2503a;font-size:12px;margin:6px 0;white-space:pre-wrap}.qa-pend{font-size:11px;color:#9a6200;margin:4px 0}';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function h(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function blobToDataUrl(b) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.readAsDataURL(b); }); }
  function dataUrlToBlob(u) { var p = u.split(','), m = /data:([^;]+)/.exec(p[0]), bin = atob(p[1]), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: m ? m[1] : 'image/jpeg' }); }
  function mapsUrl(a) { return (a.lat != null && a.lng != null) ? 'https://www.google.com/maps/search/?api=1&query=' + a.lat + ',' + a.lng : (a.sheet_latlong ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a.sheet_latlong) : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((a.address || '') + ' ' + (a.barangay || '') + ' QUEZON CITY')); }
  function fmtDate(d) { return d ? new Date(d).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; }

  function makeSignaturePad(canvas) {
    var ctx = canvas.getContext('2d'), drawing = false, empty = true, last = null;
    function size() { var r = canvas.getBoundingClientRect(); if (canvas.width !== Math.round(r.width) || canvas.height !== Math.round(r.height)) { canvas.width = Math.round(r.width); canvas.height = Math.round(r.height); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#0e2b27'; } }
    function pt(e) { var r = canvas.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; }
    function down(e) { size(); drawing = true; last = pt(e); e.preventDefault(); }
    function move(e) { if (!drawing) return; var p = pt(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; empty = false; e.preventDefault(); }
    function up() { drawing = false; }
    canvas.addEventListener('mousedown', down); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    canvas.addEventListener('touchstart', down, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', up);
    size();
    return { clear: function () { size(); ctx.clearRect(0, 0, canvas.width, canvas.height); empty = true; }, isEmpty: function () { return empty; },
      toBlob: function () { return new Promise(function (res) { canvas.toBlob(function (b) { res(b); }, 'image/png'); }); } };
  }

  function mount(rootEl, o) {
    var api = o.api, user = o.user || {}, deps = o.deps || {};
    var toast = deps.toast || function (m) { console.log('[qa]', m); };
    var getPos = deps.getPos || function () { return Promise.resolve(null); };
    var compress = deps.compressImage || function (f) { return Promise.resolve(f); };
    var buildStamp = deps.buildStamp || function () { return Promise.resolve(null); };
    var state = { tab: 'today', audits: [], cfg: null, open: null, draft: null, pads: {}, unsub: null, destroyed: false };
    if (!document.getElementById('qaCss')) { var st = document.createElement('style'); st.id = 'qaCss'; st.textContent = CSS; document.head.appendChild(st); }
    rootEl.innerHTML = '<div class="qa-wrap"><div style="display:flex;justify-content:space-between;align-items:center"><div><b>QA Inspections</b><div style="font-size:11px;color:#3a4a45">' + esc(user.username) + (user.display_name ? ' · ' + esc(user.display_name) : '') + '</div></div><div class="qa-pend" id="qaPend"></div></div>' +
      '<div class="qa-tabs"><button data-tab="today" class="on">Today</button><button data-tab="upcoming">Upcoming</button><button data-tab="done">Done</button></div><div id="qaList"></div></div><div id="qaSheet"></div>';
    var $ = function (s) { return rootEl.querySelector(s); };
    rootEl.querySelectorAll('.qa-tabs button').forEach(function (b) { b.onclick = function () { state.tab = b.dataset.tab; rootEl.querySelectorAll('.qa-tabs button').forEach(function (x) { x.classList.toggle('on', x === b); }); renderList(); }; });

    function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); }
    function refresh() {
      return Promise.all([api.listMyAudits(user.username), state.cfg ? Promise.resolve(state.cfg) : api.getConfig()]).then(function (r) {
        state.audits = r[0]; state.cfg = r[1]; lsSet('qa_cache_' + user.username, state.audits); renderList(); return flushQueue();
      }).catch(function (e) { state.audits = lsGet('qa_cache_' + user.username, []); renderList(); toast('Offline — showing cached inspections'); });
    }
    function renderPend() { var q = lsGet(QUEUE, []); var p = $('#qaPend'); if (p) p.textContent = q.length ? ('⏳ ' + q.length + ' pending upload') : ''; }
    function renderList() {
      renderPend();
      var t = today(), list = state.audits.filter(function (a) {
        if (state.tab === 'done') return a.status === 'done';
        if (a.status === 'done') return false;
        return state.tab === 'today' ? (a.scheduled_date || t) <= t : (a.scheduled_date || t) > t;
      });
      var el = $('#qaList');
      if (!list.length) { el.innerHTML = '<div style="text-align:center;color:#9aa6a2;padding:30px 0">' + (state.tab === 'today' ? 'No inspections assigned for today.' : 'Nothing here.') + '</div>'; return; }
      el.innerHTML = list.map(function (a) {
        var badge = a.status === 'done' ? '<span class="qa-badge done">' + esc(a.visit_status || 'DONE') + (a.assessment ? ' · ' + esc(a.assessment) : '') + '</span>' : a.status === 'in_progress' ? '<span class="qa-badge prog">IN PROGRESS</span>' : '<span class="qa-badge">#' + (a.sequence || '-') + '</span>';
        return '<div class="qa-card" data-id="' + esc(a.id) + '"><div class="t">' + esc(a.subscriber || '—') + badge + '</div><div class="s">' + esc(a.address || '') + (a.barangay ? ' · ' + esc(a.barangay) : '') + '</div>' +
          '<div class="s">' + esc(a.id) + ' · ' + esc(a.contractor_name || '') + ' · JO ' + esc(a.jo_no || '—') + ' · closed ' + esc(a.jo_date_closed || '—') + '</div>' + (a.installers_text ? '<div class="s">Installers: ' + esc(a.installers_text) + '</div>' : '') +
          '<div style="display:flex;gap:6px;margin-top:8px"><a class="qa-btn ghost" href="' + mapsUrl(a) + '" target="_blank" rel="noopener">🧭 Navigate</a><button class="qa-btn" data-open="' + esc(a.id) + '">' + (a.status === 'done' ? 'View' : a.status === 'in_progress' ? 'Continue' : 'Start inspection') + '</button></div></div>';
      }).join('');
      el.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { openAudit(b.dataset.open); }; });
    }

    // ---------- inspection sheet ----------
    function draftKey(id) { return DRAFT + id; }
    function newDraft(a) { return { audit_id: a.id, submit_key: a.id + '-' + Date.now(), visit_status: 'VISITED', contractor_rep: '', installers_text: a.installers_text || '', wire: '', qa_gc: '', assessment: '', found_business: '', old_plan: '', new_plan: '', remarks: '', items: {}, violations: {}, photos: [], pending: [], subscriber_signed_name: a.subscriber || '', sig_sub: null, sig_ins: null, lat: a.lat, lng: a.lng }; }
    function openAudit(id) {
      var a = state.audits.filter(function (x) { return x.id === id; })[0]; if (!a) return;
      state.open = a;
      var start = a.status === 'assigned' ? getPos().then(function (p) { return api.startAudit(id, p || {}); }).then(function (r) { Object.assign(a, r); }).catch(function (e) { toast('Could not mark start (offline?) — you can continue'); }) : Promise.resolve();
      start.then(function () { state.draft = a.status === 'done' ? null : (lsGet(draftKey(id), null) || newDraft(a)); if (a.status !== 'done' && !state.draft.lat) getPos().then(function (p) { if (p) { state.draft.lat = p.lat; state.draft.lng = p.lng; saveDraft(); } }); renderSheet(); });
    }
    function saveDraft() { if (state.draft) lsSet(draftKey(state.draft.audit_id), state.draft); }
    function closeSheet() { $('#qaSheet').innerHTML = ''; state.open = null; state.draft = null; state.pads = {}; refresh(); }
    function checklist() { return (state.cfg.checklist || []).filter(function (c) { return c.active; }); }
    function codeOptions(sel) { return state.cfg.codes.filter(function (c) { return c.active !== false; }).map(function (c) { return '<option value="' + esc(c.code) + '"' + (c.code === sel ? ' selected' : '') + '>' + esc(c.code + ' — ' + c.category) + '</option>'; }).join(''); }

    function renderSheet() {
      var a = state.open, d = state.draft, ro = !d;
      var hdr = '<div class="qa-card"><div class="t">' + esc(a.id) + ' <span class="qa-badge">' + esc(a.contractor_name || '') + '</span></div><div class="s"><b>' + esc(a.subscriber || '') + '</b> · Acct ' + esc(a.acct_no || '—') + ' · JO ' + esc(a.jo_no || '—') + '</div><div class="s">' + esc(a.address || '') + ' · ' + esc(a.barangay || '') + '</div><div class="s">NAP ' + esc(a.nap_code || '—') + ' · Port ' + esc(a.port_no || '—') + ' · S/N ' + esc(a.serial_no || '—') + '</div><div class="s">Inspector: ' + esc(user.username) + ' · ' + esc(today()) + '</div></div>';
      var sheet = $('#qaSheet'); sheet.innerHTML = '<div class="qa-sheet">' + hdr + '<div id="qaBody"></div><div class="qa-err" id="qaErr"></div></div><div class="qa-footer"><button class="qa-btn ghost" id="qaBack">' + (ro ? 'Close' : 'Save & back') + '</button>' + (ro ? '' : '<button class="qa-btn" id="qaSubmit">Submit inspection</button>') + '</div>';
      $('#qaBack').onclick = function () { saveDraft(); closeSheet(); };
      if (ro) { renderReadOnly(a); return; }
      $('#qaSubmit').onclick = submit;
      renderForm();
    }
    function renderReadOnly(a) {
      api.getAudit(a.id).then(function (r) {
        var labels = {}; checklist().forEach(function (c) { labels[c.id] = c.label; });
        $('#qaBody').innerHTML = '<div class="qa-sec">Result</div><div class="qa-card"><div class="t">' + esc(r.audit.visit_status || '') + (r.audit.assessment ? ' · ' + esc(r.audit.assessment) : '') + '</div><div class="s">Wire ' + esc(r.audit.wire || '—') + ' · QA/GC ' + esc(r.audit.qa_gc || '—') + ' · Violations ' + r.audit.total_violations + ' · ₱' + Number(r.audit.total_penalty || 0).toLocaleString() + '</div><div class="s">' + esc(r.audit.remarks || '') + '</div><div class="s">Submitted ' + fmtDate(r.audit.inspected_at) + '</div></div>' +
          (r.items.length ? '<div class="qa-sec">Checklist</div>' + r.items.map(function (i) { return '<div class="qa-item"><div class="lbl">' + esc(labels[i.item_id] || i.item_id) + ' <span class="qa-badge ' + (i.result === 'fail' ? 'prog' : '') + '">' + i.result.toUpperCase() + '</span></div>' + (i.remark ? '<div class="s">' + esc(i.remark) + '</div>' : '') + '</div>'; }).join('') : '') +
          (r.violations.length ? '<div class="qa-sec">Violations</div>' + r.violations.map(function (v) { return '<div class="qa-item"><div class="lbl">' + esc(v.code) + ' — ' + esc(v.category || '') + '</div><div class="s">' + esc(v.description || '') + (v.penalty_amount != null ? ' · ₱' + Number(v.penalty_amount).toLocaleString() : '') + '</div></div>'; }).join('') : '') +
          '<div class="qa-sec">Photos</div><div class="qa-thumbs" id="qaRoThumbs"></div>';
        r.photos.forEach(function (p) { api.photoUrl(p.path).then(function (u) { var img = h('<img alt="">'); img.src = u; $('#qaRoThumbs').appendChild(img); }); });
      });
    }

    function renderForm() {
      var a = state.open, d = state.draft, body = $('#qaBody');
      var visited = d.visit_status === 'VISITED';
      var html = '<div class="qa-sec">Visit</div><div class="qa-seg" id="qaVisit">' + Core.VISIT.map(function (v) { return '<button data-v="' + esc(v) + '" class="' + (d.visit_status === v ? 'on' : '') + '">' + esc(v) + '</button>'; }).join('') + '</div>';
      html += '<div class="qa-field" style="margin-top:8px"><label>Contractor\'s representative</label><input id="f_rep" value="' + esc(d.contractor_rep) + '"></div><div class="qa-field"><label>Installer/s</label><input id="f_inst" value="' + esc(d.installers_text) + '"></div>';
      if (!visited) {
        html += '<div class="qa-sec">Location photo *</div><div class="qa-thumbs" id="qaLocThumbs"></div><input type="file" accept="image/*" capture="environment" id="f_locphoto" style="margin-top:6px">' +
          '<div class="qa-field" style="margin-top:8px"><label>Remarks *</label><textarea id="f_remarks" rows="3">' + esc(d.remarks) + '</textarea></div>';
      } else {
        var sections = { OUTSIDE: 'Outside segment of installation', PREMISE: 'Client premise segment of installation' };
        ['OUTSIDE', 'PREMISE'].forEach(function (sec) {
          html += '<div class="qa-sec">' + sections[sec] + '</div>';
          checklist().filter(function (c) { return c.section === sec; }).forEach(function (c) {
            var res = d.items[c.id] || '', v = d.violations[c.id] || {}, ph = d.photos.concat(d.pending).filter(function (p) { return p.item_id === c.id; });
            html += '<div class="qa-item" data-item="' + c.id + '"><div class="lbl">' + esc(c.label) + '</div><div class="qa-pfn"><button class="pass ' + (res === 'pass' ? 'on' : '') + '" data-r="pass">PASS</button><button class="fail ' + (res === 'fail' ? 'on' : '') + '" data-r="fail">FAIL</button><button class="na ' + (res === 'na' ? 'on' : '') + '" data-r="na">N/A</button></div>' +
              '<div class="qa-thumbs">' + ph.map(function (p) { return '<img src="' + esc(p.thumb || '') + '" alt="">'; }).join('') + '</div>' +
              (res === 'fail' ? '<div class="qa-fail"><input type="file" accept="image/*" capture="environment" data-photo="' + c.id + '"><div class="qa-field" style="margin-top:6px"><label>Violation code *</label><select data-code="' + c.id + '">' + codeOptions(v.code || c.suggested_code) + '</select></div><div class="qa-chips" data-chips="' + c.id + '">' + state.cfg.quickRemarks.map(function (q) { return '<span>' + esc(q.label) + '</span>'; }).join('') + '</div><div class="qa-field"><label>Remark</label><textarea rows="2" data-remark="' + c.id + '">' + esc(v.remark || '') + '</textarea></div></div>' :
               '<div style="margin-top:6px"><input type="file" accept="image/*" capture="environment" data-photo="' + c.id + '" style="font-size:11px"></div>') + '</div>';
          });
        });
        html += '<div class="qa-sec">Other violations</div><div id="qaExtra">' + Object.keys(d.violations).filter(function (k) { return k.indexOf('x') === 0; }).map(function (k) { var v = d.violations[k]; return '<div class="qa-item"><div class="qa-field"><label>Code</label><select data-code="' + k + '">' + codeOptions(v.code) + '</select></div><div class="qa-field"><label>Remark</label><textarea rows="2" data-remark="' + k + '">' + esc(v.remark || '') + '</textarea></div><button class="qa-btn ghost" data-delv="' + k + '">Remove</button></div>'; }).join('') + '</div><button class="qa-btn ghost" id="qaAddV">+ Add other violation</button>';
        html += '<div class="qa-sec">Assessment</div><div class="qa-field"><label>Wire *</label><div class="qa-seg" data-seg="wire">' + Core.WIRE.map(function (v) { return '<button data-v="' + v + '" class="' + (d.wire === v ? 'on' : '') + '">' + v + '</button>'; }).join('') + '</div></div>' +
          '<div class="qa-field"><label>QA / GC *</label><div class="qa-seg" data-seg="qa_gc">' + Core.QAGC.map(function (v) { return '<button data-v="' + v + '" class="' + (d.qa_gc === v ? 'on' : '') + '">' + v + '</button>'; }).join('') + '</div></div>' +
          '<div class="qa-field"><label>Assessment *</label><div class="qa-seg" data-seg="assessment">' + Core.ASSESS.map(function (v) { return '<button data-v="' + v + '" class="' + (d.assessment === v ? 'on' : '') + '">' + v + '</button>'; }).join('') + '</div></div>' +
          '<div class="qa-sec">Found business</div><div class="qa-seg" data-seg="found_business"><button data-v="" class="' + (!d.found_business ? 'on' : '') + '">NONE</button><button data-v="willing" class="' + (d.found_business === 'willing' ? 'on' : '') + '">WILLING TO UPGRADE</button><button data-v="not_willing" class="' + (d.found_business === 'not_willing' ? 'on' : '') + '">NOT WILLING (SUBJECT FOR TERMINATION)</button></div>' +
          '<div style="display:flex;gap:8px;margin-top:8px"><div class="qa-field" style="flex:1"><label>Old plan</label><input id="f_old" value="' + esc(d.old_plan) + '"></div><div class="qa-field" style="flex:1"><label>New plan</label><input id="f_new" value="' + esc(d.new_plan) + '"></div></div>' +
          '<div class="qa-field"><label>General remarks</label><textarea id="f_remarks" rows="2">' + esc(d.remarks) + '</textarea></div>' +
          '<div class="qa-sec">Subscriber acknowledgement</div><div class="qa-cert">I, <b>' + esc(d.subscriber_signed_name || a.subscriber || '__________') + '</b>, the client, understand that there is a non-compliance regarding my subscription and that I need to change and/or upgrade from residential plan to business plan (applies only when a business was found).</div>' +
          '<div class="qa-field"><label>Subscriber\'s name *</label><input id="f_subname" value="' + esc(d.subscriber_signed_name) + '"></div><canvas class="qa-sig" id="sigSub"></canvas><div style="display:flex;justify-content:space-between;align-items:center"><span class="qa-pend">' + (d.sig_sub ? '✓ signature captured' : '') + '</span><button class="qa-btn ghost" id="sigSubClear">Clear</button></div>' +
          '<div class="qa-sec">Inspector certification</div><div class="qa-cert">I, the inspector, hereby certify that the inspection has been performed in a fair, professional, and honest way, and that I have not asked, nor received any favour, compensation or gifts from anyone.</div><canvas class="qa-sig" id="sigIns"></canvas><div style="display:flex;justify-content:space-between;align-items:center"><span class="qa-pend">' + (d.sig_ins ? '✓ signature captured' : '') + '</span><button class="qa-btn ghost" id="sigInsClear">Clear</button></div>';
      }
      if (a.job_id) html += '<div class="qa-sec">Install close-out photos (technician)</div><div class="qa-thumbs" id="qaInstall">Loading…</div>';
      body.innerHTML = html;
      // wiring
      body.querySelectorAll('#qaVisit button').forEach(function (b) { b.onclick = function () { d.visit_status = b.dataset.v; saveDraft(); renderForm(); }; });
      body.querySelectorAll('[data-seg]').forEach(function (seg) { seg.querySelectorAll('button').forEach(function (b) { b.onclick = function () { d[seg.dataset.seg] = b.dataset.v; seg.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); saveDraft(); }; }); });
      body.querySelectorAll('.qa-pfn button').forEach(function (b) { b.onclick = function () { var item = b.closest('[data-item]').dataset.item; d.items[item] = b.dataset.r; if (b.dataset.r === 'fail' && !d.violations[item]) { var c = checklist().filter(function (x) { return String(x.id) === item; })[0]; d.violations[item] = { code: c.suggested_code || '', remark: '', item_id: c.id }; } if (b.dataset.r !== 'fail') delete d.violations[item]; if (!Object.values(d.items).some(function (r) { return r === 'fail'; })) d.assessment = 'GOOD'; else if (d.assessment === 'GOOD') d.assessment = ''; saveDraft(); renderForm(); }; });
      body.querySelectorAll('[data-code]').forEach(function (s) { s.onchange = function () { d.violations[s.dataset.code].code = s.value; saveDraft(); }; });
      body.querySelectorAll('[data-remark]').forEach(function (t) { t.oninput = function () { d.violations[t.dataset.remark].remark = t.value; saveDraft(); }; });
      body.querySelectorAll('[data-chips] span').forEach(function (sp) { sp.onclick = function () { var k = sp.parentNode.dataset.chips, t = body.querySelector('[data-remark="' + k + '"]'); t.value = (t.value ? t.value + ', ' : '') + sp.textContent; d.violations[k].remark = t.value; saveDraft(); }; });
      body.querySelectorAll('[data-delv]').forEach(function (b) { b.onclick = function () { delete d.violations[b.dataset.delv]; saveDraft(); renderForm(); }; });
      var addV = $('#qaAddV'); if (addV) addV.onclick = function () { d.violations['x' + Date.now()] = { code: state.cfg.codes[0].code, remark: '', item_id: null }; saveDraft(); renderForm(); };
      body.querySelectorAll('[data-photo]').forEach(function (inp) { inp.onchange = function () { if (inp.files && inp.files[0]) addPhoto(inp.files[0], Number(inp.dataset.photo)); }; });
      var loc = $('#f_locphoto'); if (loc) { loc.onchange = function () { if (loc.files && loc.files[0]) addPhoto(loc.files[0], null); }; var lt = $('#qaLocThumbs'); if (lt) lt.innerHTML = d.photos.concat(d.pending).filter(function (p) { return p.item_id == null; }).map(function (p) { return '<img src="' + esc(p.thumb || '') + '" alt="">'; }).join(''); }
      [['f_rep', 'contractor_rep'], ['f_inst', 'installers_text'], ['f_remarks', 'remarks'], ['f_old', 'old_plan'], ['f_new', 'new_plan'], ['f_subname', 'subscriber_signed_name']].forEach(function (p) { var el = $('#' + p[0]); if (el) el.oninput = function () { d[p[1]] = el.value; saveDraft(); }; });
      if (visited) {
        state.pads.sub = makeSignaturePad($('#sigSub')); state.pads.ins = makeSignaturePad($('#sigIns'));
        $('#sigSubClear').onclick = function () { state.pads.sub.clear(); d.sig_sub = null; saveDraft(); };
        $('#sigInsClear').onclick = function () { state.pads.ins.clear(); d.sig_ins = null; saveDraft(); };
        [['sub', '#sigSub'], ['ins', '#sigIns']].forEach(function (p) { var cv = $(p[1]); var done = function () { if (!state.pads[p[0]].isEmpty()) state.pads[p[0]].toBlob().then(blobToDataUrl).then(function (u) { d['sig_' + p[0]] = u; saveDraft(); }); }; cv.addEventListener('mouseup', done); cv.addEventListener('touchend', done); });
      }
      if (a.job_id) api.getInstallPhotos(a.job_id).then(function (ps) { var el = $('#qaInstall'); if (!el) return; el.innerHTML = ps.length ? ps.map(function (p) { return '<a href="' + esc(p.url) + '" target="_blank" rel="noopener"><img src="' + esc(p.url) + '" alt="" title="' + esc(p.label || '') + '"></a>'; }).join('') : '<span class="qa-pend">No close-out photos uploaded by the technician.</span>'; });
    }

    function addPhoto(file, itemId) {
      var d = state.draft, a = state.open, label = itemId == null ? 'location' : (checklist().filter(function (c) { return c.id === itemId; })[0] || {}).label;
      toast('Processing photo…');
      buildStamp().then(function (st) { return compress(file, 1000, 90, st); }).then(function (blob) {
        return blobToDataUrl(blob).then(function (thumb) {
          var rec = { key: 'p' + Date.now(), item_id: itemId, label: label, thumb: thumb };
          return api.uploadPhoto(a.id, blob, { itemId: itemId, label: label }).then(function (r) { rec.path = r.path; d.photos.push(rec); }, function () { d.pending.push(rec); toast('No signal — photo saved, will upload later'); });
        });
      }).then(function () { saveDraft(); renderForm(); }).catch(function (e) { toast('Photo failed: ' + e.message); });
    }

    // Upload any pending photos/signatures for a draft, then return the submit payload.
    function materialize(d) {
      var a = state.open || { id: d.audit_id };
      var ups = d.pending.map(function (p) { return api.uploadPhoto(a.id, dataUrlToBlob(p.thumb), { itemId: p.item_id, label: p.label }).then(function (r) { p.path = r.path; d.photos.push(p); }); });
      return Promise.all(ups).then(function () {
        d.pending = [];
        var sigs = [];
        if (d.sig_sub && !d.sig_sub_path) sigs.push(api.uploadSignature(a.id, 'subscriber', dataUrlToBlob(d.sig_sub)).then(function (r) { d.sig_sub_path = r.path; }));
        if (d.sig_ins && !d.sig_ins_path) sigs.push(api.uploadSignature(a.id, 'inspector', dataUrlToBlob(d.sig_ins)).then(function (r) { d.sig_ins_path = r.path; }));
        return Promise.all(sigs);
      }).then(function () {
        var viol = Object.keys(d.violations).map(function (k) { var v = d.violations[k]; var ph = d.photos.filter(function (p) { return v.item_id != null && p.item_id === v.item_id; })[0]; return { code: v.code, item_id: v.item_id, remark: v.remark || null, photo_path: ph ? ph.path : null }; }).filter(function (v) { return v.code; });
        return { submit_key: d.submit_key, visit_status: d.visit_status, contractor_rep: d.contractor_rep, installers_text: d.installers_text, wire: d.wire, qa_gc: d.qa_gc, assessment: d.assessment,
          found_business: d.found_business || null, old_plan: d.old_plan, new_plan: d.new_plan, remarks: d.remarks, lat: d.lat, lng: d.lng,
          items: Object.keys(d.items).map(function (k) { return { item_id: Number(k), result: d.items[k], remark: (d.violations[k] || {}).remark || null }; }),
          violations: viol, photos: d.photos.map(function (p) { return { path: p.path, item_id: p.item_id, label: p.label }; }),
          subscriber_signed_name: d.subscriber_signed_name, subscriber_signature_path: d.sig_sub_path || null, inspector_signature_path: d.sig_ins_path || null };
      });
    }
    function localCheck(d) {
      var probe = { submit_key: d.submit_key, visit_status: d.visit_status, wire: d.wire, qa_gc: d.qa_gc, assessment: d.assessment, remarks: d.remarks, subscriber_signed_name: d.subscriber_signed_name,
        subscriber_signature_path: d.sig_sub ? 'x' : null, inspector_signature_path: d.sig_ins ? 'x' : null,
        items: Object.keys(d.items).map(function (k) { return { item_id: Number(k), result: d.items[k] }; }),
        violations: Object.keys(d.violations).map(function (k) { return { code: d.violations[k].code, item_id: d.violations[k].item_id }; }),
        photos: d.photos.concat(d.pending).map(function (p) { return { item_id: p.item_id, path: p.path || 'pending' }; }) };
      return Core.validateSubmission(probe, checklist());
    }
    function submit() {
      var d = state.draft, errs = localCheck(d), errEl = $('#qaErr');
      if (errs.length) { errEl.textContent = errs.join('\n'); toast('Please complete the form'); return; }
      if (!confirm('Submit this inspection? It will be locked after submission.')) return;
      errEl.textContent = ''; $('#qaSubmit').disabled = true;
      materialize(d).then(function (payload) { return api.submitAudit(d.audit_id, payload); }).then(function () {
        lsDel(draftKey(d.audit_id)); toast('✅ Inspection submitted'); closeSheet();
      }).catch(function (e) {
        var msg = String(e && e.message || e);
        if (/not submittable|cannot be|required|Unknown|GOOD|signature|photo|items/i.test(msg)) { errEl.textContent = msg; $('#qaSubmit').disabled = false; return; }
        var q = lsGet(QUEUE, []); if (!q.some(function (x) { return x.audit_id === d.audit_id; })) q.push({ audit_id: d.audit_id, at: Date.now() }); lsSet(QUEUE, q); saveDraft();
        toast('No signal — inspection saved, will submit when online'); closeSheet();
      });
    }
    function flushQueue() {
      var q = lsGet(QUEUE, []); if (!q.length) { renderPend(); return Promise.resolve(); }
      var item = q[0], d = lsGet(draftKey(item.audit_id), null);
      if (!d) { lsSet(QUEUE, q.slice(1)); return flushQueue(); }
      state.open = state.audits.filter(function (x) { return x.id === item.audit_id; })[0] || { id: item.audit_id };
      return materialize(d).then(function (payload) { saveDraftFor(d); return api.submitAudit(d.audit_id, payload); }).then(function () {
        lsDel(draftKey(d.audit_id)); lsSet(QUEUE, q.slice(1)); toast('✅ Queued inspection ' + d.audit_id + ' submitted'); state.open = null; return flushQueue();
      }).catch(function (e) { saveDraftFor(d); state.open = null; renderPend(); });
    }
    function saveDraftFor(d) { lsSet(draftKey(d.audit_id), d); }

    if (api.subscribe) state.unsub = api.subscribe(function () { if (!state.open) refresh(); });
    var onOnline = function () { flushQueue().then(refresh); }; window.addEventListener('online', onOnline);
    refresh();
    return { refresh: refresh, destroy: function () { state.destroyed = true; if (state.unsub) state.unsub(); window.removeEventListener('online', onOnline); rootEl.innerHTML = ''; } };
  }
  root.MobileQA = { mount: mount, makeSignaturePad: makeSignaturePad };
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 2: Lint**

Run: `node --check mobile-qa.js`
Expected: no output (OK). Browser verification happens in Task 12 (demo).

- [ ] **Step 3: Commit**

```bash
git add mobile-qa.js
git commit -m "feat(qa): inspector mobile module — tabs, inspection sheet, checklist pass/fail, violations, signatures, offline draft + retry"
```

---

### Task 9: `console-qa.js` part 1 — shell, Queue tab, Today's board (assign / sample / unassign / map)

**Files:**
- Create: `console-qa.js`

**Interfaces:**
- Consumes: `QaCore`, a `QaApi` instance, `deps` = `{ toast(msg), canEdit:boolean, L (Leaflet global, optional), ensureXLSX()->Promise (optional, console has it) }`.
- Produces: global `ConsoleQA` with `mount(rootEl, {api, user:{username,display_name}, deps}) -> {refresh(), destroy(), badge()}`; internal tab registry `TABS = {queue, board, results, reports, settings}` — Tasks 10–11 add `results`, `reports`, `settings` to the same file by filling the stubs named here (`renderResults`, `renderReports`, `renderSettings`, `openDetail`, `printForm`).

- [ ] **Step 1: Write `console-qa.js` (shell + queue + board; results/reports/settings are stubs that Tasks 10–11 replace)**

```js
// AHBA Console — QA AUDIT page module. Loaded by index.html (production) and qa-demo.html (dry run). Mount-only.
(function (root) {
  'use strict';
  var Core = root.QaCore;
  var CSS = '.cq{font:13px "DM Sans",system-ui,sans-serif;color:#0e2b27}.cq-tabs{display:flex;gap:6px;margin:0 0 12px;flex-wrap:wrap}.cq-tabs button{padding:8px 14px;border-radius:10px;border:1px solid #cfe0d8;background:#fff;font-weight:700}.cq-tabs button.on{background:#0d3b34;color:#fff;border-color:#0d3b34}' +
    '.cq-stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}.cq-stat{background:#fff;border:1px solid #e3e8e2;border-radius:12px;padding:10px 14px;min-width:120px}.cq-stat span{display:block;font-size:10px;color:#8a9894;text-transform:uppercase;letter-spacing:.06em}.cq-stat strong{font-size:20px}.cq-stat.warn strong{color:#c2503a}' +
    '.cq-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.cq-bar input,.cq-bar select{padding:7px 9px;border:1px solid #cfd8d3;border-radius:9px;font-size:12px}.cq-btn{padding:7px 12px;border-radius:9px;border:1px solid #0d3b34;background:#0d3b34;color:#fff;font-weight:700;font-size:12px;cursor:pointer}.cq-btn.ghost{background:#fff;color:#0d3b34}.cq-btn.warn{background:#c2503a;border-color:#c2503a}.cq-btn[disabled]{opacity:.5;cursor:default}' +
    '.cq table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e3e8e2;border-radius:12px;overflow:hidden}.cq th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#8a9894;text-align:left;padding:8px 10px;border-bottom:1px solid #e3e8e2;background:#f8f9f7}.cq td{padding:8px 10px;border-bottom:1px solid #f0f2ef;font-size:12px;vertical-align:top}.cq tr:hover td{background:#f8faf8}' +
    '.cq-pill{display:inline-block;font-size:10px;font-weight:800;padding:2px 8px;border-radius:9px;background:#eef2ec;color:#3a4a45}.cq-pill.queued{background:#fff3d6;color:#9a6200}.cq-pill.assigned{background:#e8ecff;color:#2d3fa8}.cq-pill.in_progress{background:#ffe9d6;color:#a04a00}.cq-pill.done{background:#e7f7ef;color:#11825f}.cq-pill.pool{background:#f1f1f1;color:#777}.cq-pill.fail{background:#fde4df;color:#c2503a}' +
    '.cq-age{font-size:10px;color:#8a9894}.cq-age.late{color:#c2503a;font-weight:800}.cq-map{height:320px;border-radius:12px;border:1px solid #e3e8e2;margin-bottom:12px;background:#eef2ec}.cq-cols{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}.cq-col{background:#fff;border:1px solid #e3e8e2;border-radius:12px;padding:10px}.cq-col h4{margin:0 0 8px;font-size:13px}.cq-row{border:1px solid #f0f2ef;border-radius:9px;padding:7px 9px;margin-bottom:6px;font-size:12px}' +
    '.cq-modal{position:fixed;inset:0;background:rgba(8,28,24,.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px}.cq-modal>div{background:#fff;border-radius:14px;max-width:920px;width:100%;max-height:92vh;overflow:auto;padding:20px}.cq-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;font-size:12px}.cq-grid b{display:block;font-size:10px;color:#8a9894;text-transform:uppercase}.cq-thumbs{display:flex;gap:8px;flex-wrap:wrap}.cq-thumbs img{width:110px;height:110px;object-fit:cover;border-radius:9px;border:1px solid #e3e8e2}.cq-sec{font:800 10px Manrope,system-ui;letter-spacing:.08em;text-transform:uppercase;color:#107b5e;margin:14px 0 6px}.cq-banner{background:#fde4df;color:#8a2c1b;border:1px solid #f0c4b9;border-radius:10px;padding:8px 12px;margin-bottom:10px;font-size:12px}.cq-empty{padding:26px;text-align:center;color:#9aa6a2}';
  var COLORS = ['#18a57b', '#2d3fa8', '#c2503a', '#9a6200', '#7b2d8a', '#0d7c9a'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); }
  function addDays(d, n) { var x = new Date(d + 'T00:00:00+08:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); }
  function daysSince(d) { return d ? Math.max(0, Math.round((new Date(today()) - new Date(d)) / 86400000)) : 0; }
  function fmtWhen(s) { return s ? new Date(s).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; }
  function pill(s) { return '<span class="cq-pill ' + esc(s) + '">' + esc(String(s || '').replace('_', ' ')) + '</span>'; }
  function peso(n) { return '₱' + Number(n || 0).toLocaleString('en-PH'); }

  function mount(rootEl, o) {
    var api = o.api, user = o.user || {}, deps = o.deps || {}, canEdit = deps.canEdit !== false, L = deps.L || root.L;
    var toast = deps.toast || function (m) { console.log('[cq]', m); };
    var S = { tab: 'queue', cfg: null, inspectors: [], sel: {}, filter: { status: ['queued'], page: 1 }, boardDate: today(), map: null, layer: null, unsub: null, submittedToday: 0, results: { page: 1 }, report: { from: addDays(today(), -6), to: today() } };
    if (!document.getElementById('cqCss')) { var st = document.createElement('style'); st.id = 'cqCss'; st.textContent = CSS; document.head.appendChild(st); }
    rootEl.innerHTML = '<div class="cq"><div id="cqBanner"></div><div class="cq-tabs">' + [['queue', 'Queue'], ['board', "Today's board"], ['results', 'Results'], ['reports', 'Reports'], ['settings', 'Settings']].map(function (t) { return '<button data-tab="' + t[0] + '" class="' + (t[0] === 'queue' ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div id="cqBody"></div></div><div id="cqModal"></div>';
    var $ = function (s) { return rootEl.querySelector(s); };
    rootEl.querySelectorAll('.cq-tabs button').forEach(function (b) { b.onclick = function () { S.tab = b.dataset.tab; rootEl.querySelectorAll('.cq-tabs button').forEach(function (x) { x.classList.toggle('on', x === b); }); render(); }; });

    function load() { return Promise.all([api.getConfig(), api.listInspectors(), api.syncStatus()]).then(function (r) { S.cfg = r[0]; S.inspectors = r[1]; S.sync = r[2]; banner(); }); }
    function banner() {
      var b = $('#cqBanner'), msgs = [];
      var last = S.sync && S.sync.last_sync_at ? (Date.now() - new Date(S.sync.last_sync_at)) / 3600000 : null;
      if (last == null) msgs.push('Sheet sync has never run — install the Apps Script or upload a CSV in Settings.');
      else if (last > 2) msgs.push('Sheet sync is ' + Math.round(last) + ' h old — check the Apps Script trigger.');
      if (S.sync && S.sync.unmapped && S.sync.unmapped.length) msgs.push('Unmapped contractor name(s) in the sheet: ' + S.sync.unmapped.join(', ') + ' — map them in Settings.');
      b.innerHTML = msgs.map(function (m) { return '<div class="cq-banner">⚠ ' + esc(m) + '</div>'; }).join('');
    }
    function render() { var f = TABS[S.tab]; if (f) f(); }
    function modal(html) { $('#cqModal').innerHTML = '<div class="cq-modal"><div>' + html + '</div></div>'; $('#cqModal .cq-modal').onclick = function (e) { if (e.target === this) closeModal(); }; }
    function closeModal() { $('#cqModal').innerHTML = ''; }
    function inspectorOpts(sel) { return S.inspectors.map(function (i) { return '<option value="' + esc(i.username) + '"' + (i.username === sel ? ' selected' : '') + '>' + esc(i.username + (i.display_name ? ' · ' + i.display_name : '')) + '</option>'; }).join(''); }
    function contractorOpts() { return '<option value="">All contractors</option>' + S.cfg.contractors.map(function (c) { return '<option value="' + esc(c.sheet_name) + '">' + esc(c.display_name) + ' (' + c.kind + ')</option>'; }).join(''); }

    // ---------------- QUEUE ----------------
    function renderQueue() {
      var f = S.filter;
      $('#cqBody').innerHTML = '<div class="cq-stats" id="cqQStats"></div><div class="cq-bar">' +
        '<select id="qf_status"><option value="queued">Queued (to assign)</option><option value="pool">Pool (in-house, not selected)</option><option value="assigned">Assigned</option><option value="queued,assigned,in_progress">All open</option></select>' +
        '<select id="qf_contractor">' + contractorOpts() + '</select><select id="qf_kind"><option value="">Subcon + in-house</option><option value="subcon">Subcon only</option><option value="inhouse">In-house only</option></select>' +
        '<input type="date" id="qf_from" title="JO closed from"><input type="date" id="qf_to" title="JO closed to"><input id="qf_q" placeholder="Search name / address / JO / acct" style="min-width:220px"><button class="cq-btn ghost" id="qf_go">Filter</button>' +
        (canEdit ? '<span style="flex:1"></span><button class="cq-btn" id="q_assign" disabled>Assign selected</button><button class="cq-btn ghost" id="q_pick" disabled>Queue selected (manual pick)</button><button class="cq-btn ghost" id="q_unassign" disabled>Unassign selected</button><button class="cq-btn ghost" id="q_sample">Random sample in-house…</button>' : '') +
        '</div><div id="cqQTable"></div><div class="cq-bar" style="justify-content:flex-end"><button class="cq-btn ghost" id="q_prev">‹ Prev</button><span id="q_page"></span><button class="cq-btn ghost" id="q_next">Next ›</button></div>';
      $('#qf_status').value = f.status.join(','); if (f.contractor) $('#qf_contractor').value = f.contractor; if (f.kind) $('#qf_kind').value = f.kind; if (f.from) $('#qf_from').value = f.from; if (f.to) $('#qf_to').value = f.to; if (f.q) $('#qf_q').value = f.q;
      $('#qf_go').onclick = function () { S.filter = { status: $('#qf_status').value.split(','), contractor: $('#qf_contractor').value, kind: $('#qf_kind').value, from: $('#qf_from').value, to: $('#qf_to').value, q: $('#qf_q').value, page: 1 }; S.sel = {}; loadQueue(); };
      $('#qf_q').onkeydown = function (e) { if (e.key === 'Enter') $('#qf_go').click(); };
      $('#q_prev').onclick = function () { if (S.filter.page > 1) { S.filter.page--; loadQueue(); } };
      $('#q_next').onclick = function () { S.filter.page++; loadQueue(); };
      if (canEdit) { $('#q_assign').onclick = assignDialog; $('#q_pick').onclick = function () { act(api.queuePool(selIds(), { by: user.username }), 'queued'); }; $('#q_unassign').onclick = function () { act(api.unassignAudits(selIds(), { by: user.username }), 'unassigned'); }; $('#q_sample').onclick = sampleDialog; }
      loadQueue(); loadQueueStats();
    }
    function selIds() { return Object.keys(S.sel).filter(function (k) { return S.sel[k]; }); }
    function act(p, verb) { p.then(function (n) { toast(n + ' audit(s) ' + verb); S.sel = {}; loadQueue(); loadQueueStats(); }).catch(function (e) { toast('Failed: ' + e.message); }); }
    function loadQueueStats() {
      var m = today().slice(0, 7) + '-01';
      Promise.all([api.listAudits({ kind: 'subcon', from: m, pageSize: 1 }), api.listAudits({ kind: 'subcon', status: ['done'], from: m, pageSize: 1 }), api.listAudits({ status: ['queued'], pageSize: 1000 }), api.listAudits({ status: ['assigned', 'in_progress'], pageSize: 1 })]).then(function (r) {
        var buckets = { '0-7': 0, '8-14': 0, '15-30': 0, '31+': 0 }; r[2].rows.forEach(function (a) { buckets[Core.agingBucket(daysSince(a.jo_date_closed))]++; });
        var el = $('#cqQStats'); if (!el) return;
        el.innerHTML = '<div class="cq-stat"><span>Subcon closed this month</span><strong>' + r[0].total + '</strong></div><div class="cq-stat"><span>Subcon inspected</span><strong>' + r[1].total + '</strong></div><div class="cq-stat' + (r[2].total > 50 ? ' warn' : '') + '"><span>Queued (not assigned)</span><strong>' + r[2].total + '</strong></div><div class="cq-stat"><span>Assigned / in progress</span><strong>' + r[3].total + '</strong></div>' +
          '<div class="cq-stat' + (buckets['15-30'] + buckets['31+'] > 0 ? ' warn' : '') + '"><span>Aging of queued (days since close)</span><strong style="font-size:13px">0-7: ' + buckets['0-7'] + ' · 8-14: ' + buckets['8-14'] + ' · 15-30: ' + buckets['15-30'] + ' · 31+: ' + buckets['31+'] + '</strong></div>';
      });
    }
    function loadQueue() {
      var f = S.filter; $('#cqQTable').innerHTML = '<div class="cq-empty">Loading…</div>';
      api.listAudits({ status: f.status, contractor: f.contractor, kind: f.kind, from: f.from, to: f.to, q: f.q, page: f.page, pageSize: 50 }).then(function (r) {
        $('#q_page').textContent = 'Page ' + f.page + ' · ' + r.total + ' rows';
        if (!r.rows.length) { $('#cqQTable').innerHTML = '<div class="cq-empty">No audits match.</div>'; return; }
        $('#cqQTable').innerHTML = '<table><thead><tr>' + (canEdit ? '<th><input type="checkbox" id="q_all"></th>' : '') + '<th>Audit</th><th>Subscriber</th><th>Address</th><th>Contractor</th><th>JO closed</th><th>Aging</th><th>Status</th><th>Assigned</th></tr></thead><tbody>' + r.rows.map(function (a) {
          var d = daysSince(a.jo_date_closed);
          return '<tr>' + (canEdit ? '<td><input type="checkbox" data-sel="' + esc(a.id) + '"' + (S.sel[a.id] ? ' checked' : '') + '></td>' : '') + '<td><b>' + esc(a.id) + '</b><div class="cq-age">' + esc(a.jo_no || '') + (a.job_id ? ' · FieldOps' : '') + (a.unmapped ? ' · <span class="cq-pill fail">unmapped</span>' : '') + '</div></td><td><b>' + esc(a.subscriber || '') + '</b><div class="cq-age">' + esc(a.acct_no || '') + '</div></td><td>' + esc(a.address || '') + '<div class="cq-age">' + esc(a.barangay || '') + '</div></td><td>' + esc(a.contractor_name || '') + '<div class="cq-age">' + esc(a.kind || '') + '</div></td><td>' + esc(a.jo_date_closed || '—') + '</td><td class="cq-age ' + (d > 14 ? 'late' : '') + '">' + d + ' d</td><td>' + pill(a.status) + '</td><td>' + esc(a.assigned_to || '') + (a.scheduled_date ? '<div class="cq-age">' + esc(a.scheduled_date) + ' #' + (a.sequence || '') + '</div>' : '') + '</td></tr>';
        }).join('') + '</tbody></table>';
        rootEl.querySelectorAll('[data-sel]').forEach(function (cb) { cb.onchange = function () { S.sel[cb.dataset.sel] = cb.checked; syncButtons(); }; });
        var all = $('#q_all'); if (all) all.onchange = function () { rootEl.querySelectorAll('[data-sel]').forEach(function (cb) { cb.checked = all.checked; S.sel[cb.dataset.sel] = all.checked; }); syncButtons(); };
        syncButtons();
      });
    }
    function syncButtons() { var n = selIds().length; ['q_assign', 'q_pick', 'q_unassign'].forEach(function (id) { var b = $('#' + id); if (b) b.disabled = !n; }); }
    function assignDialog() {
      var ids = selIds(); if (!ids.length) return;
      modal('<h3 style="margin:0 0 10px">Assign ' + ids.length + ' audit(s)</h3><div class="cq-bar"><label>Inspector <select id="as_insp">' + inspectorOpts() + '</select></label><label>Date <input type="date" id="as_date" value="' + today() + '"></label><label>Start sequence # <input type="number" id="as_seq" value="1" min="1" style="width:70px"></label></div><div class="cq-age" style="margin-bottom:10px">Sequence = order of visits for that day. The inspector sees them in this order and gets a push notification.</div><div class="cq-bar" style="justify-content:flex-end"><button class="cq-btn ghost" id="as_cancel">Cancel</button><button class="cq-btn" id="as_ok">Assign</button></div>');
      $('#as_cancel').onclick = closeModal;
      $('#as_ok').onclick = function () { var insp = $('#as_insp').value, date = $('#as_date').value, seq = Number($('#as_seq').value || 1); if (!insp || !date) { toast('Pick an inspector and a date'); return; } closeModal(); act(api.assignAudits(ids, { inspector: insp, date: date, startSeq: seq, by: user.username }), 'assigned to ' + insp); };
    }
    function sampleDialog() {
      var pct = (S.cfg.settings || {}).inhouse_sample_pct || '10';
      modal('<h3 style="margin:0 0 10px">Random sample of in-house installs</h3><div class="cq-bar"><label>Closed from <input type="date" id="sm_from" value="' + addDays(today(), -7) + '"></label><label>to <input type="date" id="sm_to" value="' + today() + '"></label><label>Percent <input type="number" id="sm_pct" value="' + esc(pct) + '" min="1" max="100" style="width:70px"></label></div><div class="cq-age" style="margin-bottom:10px">Picks ceil(pool × %) random in-house pool rows closed in the range and moves them to Queued. Manual picks are still possible from the Pool filter.</div><div class="cq-bar" style="justify-content:flex-end"><button class="cq-btn ghost" id="sm_cancel">Cancel</button><button class="cq-btn" id="sm_ok">Sample</button></div>');
      $('#sm_cancel').onclick = closeModal;
      $('#sm_ok').onclick = function () { var o = { from: $('#sm_from').value, to: $('#sm_to').value, pct: Number($('#sm_pct').value), by: user.username }; closeModal(); act(api.sampleInhouse(o), 'sampled into the queue'); };
    }

    // ---------------- TODAY'S BOARD ----------------
    function renderBoard() {
      $('#cqBody').innerHTML = '<div class="cq-bar"><label>Date <input type="date" id="bd_date" value="' + S.boardDate + '"></label><button class="cq-btn ghost" id="bd_prev">‹</button><button class="cq-btn ghost" id="bd_next">›</button><span id="bd_sum" class="cq-age"></span></div><div class="cq-map" id="cqMap"></div><div class="cq-cols" id="cqCols"></div>';
      $('#bd_date').onchange = function () { S.boardDate = $('#bd_date').value; loadBoard(); };
      $('#bd_prev').onclick = function () { S.boardDate = addDays(S.boardDate, -1); renderBoard(); };
      $('#bd_next').onclick = function () { S.boardDate = addDays(S.boardDate, 1); renderBoard(); };
      S.map = null; loadBoard();
    }
    function loadBoard() {
      api.board(S.boardDate).then(function (rows) {
        var by = {}; rows.forEach(function (a) { (by[a.assigned_to] = by[a.assigned_to] || []).push(a); });
        var names = Object.keys(by).sort();
        $('#bd_sum').textContent = rows.length + ' assigned · ' + rows.filter(function (a) { return a.status === 'done'; }).length + ' done · ' + rows.filter(function (a) { return a.status === 'in_progress'; }).length + ' in progress';
        $('#cqCols').innerHTML = names.length ? names.map(function (n, i) {
          var list = by[n];
          return '<div class="cq-col"><h4><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + COLORS[i % COLORS.length] + ';margin-right:6px"></span>' + esc(n) + ' <span class="cq-age">' + list.filter(function (a) { return a.status === 'done'; }).length + '/' + list.length + ' done</span></h4>' +
            list.map(function (a) { return '<div class="cq-row"><b>#' + (a.sequence || '-') + ' ' + esc(a.subscriber || '') + '</b> ' + pill(a.status) + '<div class="cq-age">' + esc(a.address || '') + ' · ' + esc(a.contractor_name || '') + (a.started_at ? ' · started ' + fmtWhen(a.started_at) : '') + (a.inspected_at ? ' · done ' + fmtWhen(a.inspected_at) : '') + '</div>' +
              (canEdit && a.status === 'assigned' ? '<div style="margin-top:4px"><select data-re="' + esc(a.id) + '"><option value="">Reassign to…</option>' + inspectorOpts() + '</select> <button class="cq-btn ghost" data-un="' + esc(a.id) + '" style="padding:3px 8px">Unassign</button></div>' : '') + (a.status === 'done' ? '<div style="margin-top:4px"><button class="cq-btn ghost" data-view="' + esc(a.id) + '" style="padding:3px 8px">View result</button></div>' : '') + '</div>'; }).join('') + '</div>';
        }).join('') : '<div class="cq-empty">Nothing assigned for ' + esc(S.boardDate) + '.</div>';
        rootEl.querySelectorAll('[data-re]').forEach(function (s) { s.onchange = function () { if (!s.value) return; var a = rows.filter(function (x) { return x.id === s.dataset.re; })[0]; api.assignAudits([a.id], { inspector: s.value, date: S.boardDate, startSeq: a.sequence || 1, by: user.username }).then(function () { toast('Reassigned'); loadBoard(); }); }; });
        rootEl.querySelectorAll('[data-un]').forEach(function (b) { b.onclick = function () { api.unassignAudits([b.dataset.un], { by: user.username }).then(function () { toast('Unassigned'); loadBoard(); }); }; });
        rootEl.querySelectorAll('[data-view]').forEach(function (b) { b.onclick = function () { openDetail(b.dataset.view); }; });
        drawMap(rows, names);
      });
    }
    function drawMap(rows, names) {
      var el = $('#cqMap'); if (!el || !L) { if (el) el.innerHTML = '<div class="cq-empty">Map unavailable</div>'; return; }
      if (!S.map) { S.map = L.map(el, { zoomControl: true, attributionControl: false }).setView([14.68, 121.06], 12); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(S.map); }
      if (S.layer) S.map.removeLayer(S.layer); S.layer = L.layerGroup().addTo(S.map);
      var pts = [];
      rows.forEach(function (a) {
        var ll = null; if (a.lat != null && a.lng != null) ll = [a.lat, a.lng]; else if (a.sheet_latlong) { var m = /(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/.exec(a.sheet_latlong); if (m) ll = [parseFloat(m[1]), parseFloat(m[2])]; }
        if (!ll) return; pts.push(ll);
        L.circleMarker(ll, { radius: 8, weight: 2, color: COLORS[names.indexOf(a.assigned_to) % COLORS.length], fillColor: a.status === 'done' ? '#fff' : COLORS[names.indexOf(a.assigned_to) % COLORS.length], fillOpacity: .9 }).addTo(S.layer).bindPopup('<b>#' + (a.sequence || '') + ' ' + esc(a.subscriber || '') + '</b><br>' + esc(a.assigned_to) + ' · ' + esc(a.status));
      });
      if (pts.length) S.map.fitBounds(pts, { padding: [20, 20] });
      setTimeout(function () { S.map.invalidateSize(); }, 150);
    }

    // ---------------- stubs replaced in Tasks 10–11 ----------------
    function renderResults() { $('#cqBody').innerHTML = '<div class="cq-empty">Results — Task 10</div>'; }
    function renderReports() { $('#cqBody').innerHTML = '<div class="cq-empty">Reports — Task 11</div>'; }
    function renderSettings() { $('#cqBody').innerHTML = '<div class="cq-empty">Settings — Task 11</div>'; }
    function openDetail(id) { toast('Detail — Task 10 (' + id + ')'); }

    var TABS = { queue: renderQueue, board: renderBoard, results: renderResults, reports: renderReports, settings: renderSettings };
    if (api.subscribe) S.unsub = api.subscribe(function (e) { var r = e.row || {}; if (r.status === 'done' && r.inspected_at && r.inspected_at.slice(0, 10) === today()) { S.submittedToday++; toast('✅ ' + r.id + ' submitted by ' + (r.inspector || r.assigned_to) + (r.assessment ? ' · ' + r.assessment : '')); if (o.onBadge) o.onBadge(S.submittedToday); } if (S.tab === 'board') loadBoard(); if (S.tab === 'queue') loadQueueStats(); });
    load().then(render);
    return { refresh: function () { return load().then(render); }, destroy: function () { if (S.unsub) S.unsub(); rootEl.innerHTML = ''; }, badge: function () { return S.submittedToday; }, _S: S, _openDetail: function (id) { openDetail(id); } };
  }
  root.ConsoleQA = { mount: mount };
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 2: Lint + commit**

Run: `node --check console-qa.js`
Expected: OK.

```bash
git add console-qa.js
git commit -m "feat(qa): console QA page shell — queue (filters, assign, manual pick, random sample, aging) + today's board with map"
```

---

### Task 10: `console-qa.js` part 2 — Results tab, detail modal, reopen, print form

**Files:**
- Modify: `console-qa.js` (replace the `renderResults` and `openDetail` stubs; add `printForm`)

**Interfaces:**
- Consumes: `api.listAudits({status:['done'], qfrom, qto, contractor, inspector, assessment, q, page})`, `api.getAudit(id)`, `api.reopenAudit(id,{by,reason})`, `api.photoUrl(path)`.
- Produces: `openDetail(id)` (used by the board and by results), `printForm(bundle, urls)` (opens a print window with the paper-form replica).

- [ ] **Step 1: Replace the two stubs with this code (keep everything else)**

```js
    // ---------------- RESULTS ----------------
    function renderResults() {
      var r = S.results;
      $('#cqBody').innerHTML = '<div class="cq-bar"><label>QA date from <input type="date" id="rf_from" value="' + esc(r.qfrom || addDays(today(), -6)) + '"></label><label>to <input type="date" id="rf_to" value="' + esc(r.qto || today()) + '"></label><select id="rf_contractor">' + contractorOpts() + '</select><select id="rf_insp"><option value="">All inspectors</option>' + inspectorOpts() + '</select><select id="rf_assess"><option value="">Any assessment</option>' + Core.ASSESS.map(function (a) { return '<option>' + a + '</option>'; }).join('') + '</select><input id="rf_q" placeholder="Search"><button class="cq-btn ghost" id="rf_go">Filter</button></div><div id="cqRTable"></div><div class="cq-bar" style="justify-content:flex-end"><button class="cq-btn ghost" id="r_prev">‹ Prev</button><span id="r_page"></span><button class="cq-btn ghost" id="r_next">Next ›</button></div>';
      if (r.contractor) $('#rf_contractor').value = r.contractor; if (r.inspector) $('#rf_insp').value = r.inspector; if (r.assessment) $('#rf_assess').value = r.assessment;
      $('#rf_go').onclick = function () { S.results = { qfrom: $('#rf_from').value, qto: $('#rf_to').value, contractor: $('#rf_contractor').value, inspector: $('#rf_insp').value, assessment: $('#rf_assess').value, q: $('#rf_q').value, page: 1 }; loadResults(); };
      $('#r_prev').onclick = function () { if (S.results.page > 1) { S.results.page--; loadResults(); } };
      $('#r_next').onclick = function () { S.results.page++; loadResults(); };
      if (!r.qfrom) { S.results.qfrom = addDays(today(), -6); S.results.qto = today(); }
      loadResults();
    }
    function loadResults() {
      var r = S.results; $('#cqRTable').innerHTML = '<div class="cq-empty">Loading…</div>';
      api.listAudits({ status: ['done'], qfrom: r.qfrom, qto: r.qto, contractor: r.contractor, inspector: r.inspector, assessment: r.assessment, q: r.q, page: r.page, pageSize: 50 }).then(function (res) {
        $('#r_page').textContent = 'Page ' + r.page + ' · ' + res.total + ' rows';
        if (!res.rows.length) { $('#cqRTable').innerHTML = '<div class="cq-empty">No results in this range.</div>'; return; }
        $('#cqRTable').innerHTML = '<table><thead><tr><th>Audit</th><th>Subscriber</th><th>Contractor</th><th>Inspector</th><th>QA date</th><th>Visit</th><th>Assessment</th><th>Violations</th><th>Penalty</th><th></th></tr></thead><tbody>' + res.rows.map(function (a) {
          return '<tr><td><b>' + esc(a.id) + '</b><div class="cq-age">' + esc(a.jo_no || '') + (a.source === 'sheet_legacy' ? ' · legacy' : '') + (a.reopened_count ? ' · reopened ×' + a.reopened_count : '') + '</div></td><td><b>' + esc(a.subscriber || '') + '</b><div class="cq-age">' + esc(a.address || '') + '</div></td><td>' + esc(a.contractor_name || '') + '</td><td>' + esc(a.inspector || '') + '</td><td>' + fmtWhen(a.inspected_at) + '</td><td>' + esc(a.visit_status || '') + '</td><td>' + (a.assessment ? '<span class="cq-pill ' + (a.assessment === 'GOOD' ? 'done' : 'fail') + '">' + esc(a.assessment) + '</span>' : '') + '</td><td>' + a.total_violations + '</td><td>' + peso(a.total_penalty) + '</td><td><button class="cq-btn ghost" data-view="' + esc(a.id) + '" style="padding:3px 8px">Open</button></td></tr>';
        }).join('') + '</tbody></table>';
        rootEl.querySelectorAll('[data-view]').forEach(function (b) { b.onclick = function () { openDetail(b.dataset.view); }; });
      });
    }
    function openDetail(id) {
      modal('<div class="cq-empty">Loading ' + esc(id) + '…</div>');
      api.getAudit(id).then(function (r) {
        var a = r.audit, labels = {}; S.cfg.checklist.forEach(function (c) { labels[c.id] = c; });
        var byItem = {}; r.items.forEach(function (i) { byItem[i.item_id] = i; });
        var photosByItem = {}; r.photos.forEach(function (p) { (photosByItem[p.item_id || 'x'] = photosByItem[p.item_id || 'x'] || []).push(p); });
        var html = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div><h3 style="margin:0">' + esc(a.id) + ' · ' + esc(a.subscriber || '') + '</h3><div class="cq-age">' + esc(a.contractor_name || '') + ' · ' + pill(a.status) + ' · ' + esc(a.visit_status || '') + (a.assessment ? ' · <b>' + esc(a.assessment) + '</b>' : '') + '</div></div><div style="display:flex;gap:6px"><button class="cq-btn ghost" id="dt_print">🖨 Print / PDF</button>' + (canEdit && a.status === 'done' && a.assigned_to ? '<button class="cq-btn warn" id="dt_reopen">Reopen</button>' : '') + '<button class="cq-btn ghost" id="dt_close">Close</button></div></div>' +
          '<div class="cq-sec">Header</div><div class="cq-grid"><div><b>Inspection date</b>' + fmtWhen(a.inspected_at) + '</div><div><b>Inspector</b>' + esc(a.inspector || '—') + '</div><div><b>Contractor\'s rep</b>' + esc(a.contractor_rep || '—') + '</div><div><b>Installer/s</b>' + esc(a.installers_text || '—') + '</div><div><b>Account no.</b>' + esc(a.acct_no || '—') + '</div><div><b>JO no.</b>' + esc(a.jo_no || '—') + '</div><div><b>Address</b>' + esc(a.address || '') + ' ' + esc(a.barangay || '') + '</div><div><b>NAP / Port / S/N</b>' + esc(a.nap_code || '—') + ' / ' + esc(a.port_no || '—') + ' / ' + esc(a.serial_no || '—') + '</div><div><b>GPS</b>' + (a.lat != null ? '<a href="https://www.google.com/maps/search/?api=1&query=' + a.lat + ',' + a.lng + '" target="_blank" rel="noopener">' + a.lat.toFixed(5) + ', ' + a.lng.toFixed(5) + '</a>' : '—') + '</div><div><b>Wire</b>' + esc(a.wire || '—') + '</div><div><b>QA / GC</b>' + esc(a.qa_gc || '—') + '</div><div><b>Found business</b>' + esc(a.found_business ? a.found_business.replace('_', ' ') + ' · old ' + (a.old_plan || '—') + ' · new ' + (a.new_plan || '—') : '—') + '</div></div>' +
          (r.items.length ? '<div class="cq-sec">Checklist</div><table><thead><tr><th>Item</th><th>Result</th><th>Remark</th><th>Photos</th></tr></thead><tbody>' + S.cfg.checklist.map(function (c) { var i = byItem[c.id] || {}; return '<tr><td>' + esc(c.label) + '<div class="cq-age">' + esc(c.section) + '</div></td><td>' + (i.result ? '<span class="cq-pill ' + (i.result === 'fail' ? 'fail' : i.result === 'pass' ? 'done' : '') + '">' + i.result.toUpperCase() + '</span>' : '—') + '</td><td>' + esc(i.remark || '') + '</td><td><div class="cq-thumbs" data-ph="' + c.id + '"></div></td></tr>'; }).join('') + '</tbody></table>' : '') +
          (r.violations.length ? '<div class="cq-sec">Violations</div><table><thead><tr><th>Code</th><th>Category</th><th>Description</th><th>Class</th><th>Severity</th><th>No. of offense</th><th>Penalty</th></tr></thead><tbody>' + r.violations.map(function (v) { return '<tr><td><b>' + esc(v.code) + '</b></td><td>' + esc(v.category || '') + '</td><td>' + esc(v.description || '') + (v.remark ? '<div class="cq-age">' + esc(v.remark) + '</div>' : '') + '</td><td>' + esc(v.class || '') + '</td><td>' + esc(v.severity || '') + '</td><td>' + (v.offense_no || '—') + '</td><td>' + (v.penalty_amount != null ? peso(v.penalty_amount) : '—') + '</td></tr>'; }).join('') + '<tr><td colspan="6"><b>TOTAL VIOLATION FOUND: ' + a.total_violations + '</b></td><td><b>' + peso(a.total_penalty) + '</b></td></tr></tbody></table>' : '') +
          '<div class="cq-sec">Remarks</div><div>' + esc(a.remarks || '—') + '</div><div class="cq-sec">Other photos</div><div class="cq-thumbs" data-ph="x"></div><div class="cq-sec">Signatures</div><div class="cq-thumbs"><div><div class="cq-age">Subscriber: ' + esc(a.subscriber_signed_name || '—') + '</div><img data-sig="' + esc(a.subscriber_signature_path || '') + '" alt="" style="background:#fff"></div><div><div class="cq-age">Inspector: ' + esc(a.inspector || '') + '</div><img data-sig="' + esc(a.inspector_signature_path || '') + '" alt="" style="background:#fff"></div></div>' +
          '<div class="cq-sec">Log</div><table><tbody>' + r.log.map(function (l) { return '<tr><td class="cq-age" style="white-space:nowrap">' + fmtWhen(l.at) + '</td><td><b>' + esc(l.action) + '</b> · ' + esc(l.by) + '</td><td class="cq-age">' + esc(l.detail ? JSON.stringify(l.detail) : '') + '</td></tr>'; }).join('') + '</tbody></table>';
        modal(html);
        $('#dt_close').onclick = closeModal;
        var urls = {};
        var fill = function (path, sel) { if (!path) return; api.photoUrl(path).then(function (u) { urls[path] = u; rootEl.querySelectorAll(sel).forEach(function (img) { img.src = u; }); }); };
        r.photos.forEach(function (p) { var box = rootEl.querySelector('[data-ph="' + (p.item_id || 'x') + '"]'); if (!box) return; var img = document.createElement('img'); img.alt = p.label || ''; img.title = p.label || ''; box.appendChild(img); api.photoUrl(p.path).then(function (u) { urls[p.path] = u; img.src = u; img.onclick = function () { window.open(u, '_blank', 'noopener'); }; }); });
        fill(a.subscriber_signature_path, '[data-sig="' + a.subscriber_signature_path + '"]'); fill(a.inspector_signature_path, '[data-sig="' + a.inspector_signature_path + '"]');
        $('#dt_print').onclick = function () { printForm(r, urls); };
        var re = $('#dt_reopen'); if (re) re.onclick = function () { var why = prompt('Reason for reopening ' + a.id + ' (the inspector will be able to edit and resubmit):'); if (why == null) return; api.reopenAudit(a.id, { by: user.username, reason: why }).then(function () { toast(a.id + ' reopened'); closeModal(); render(); }).catch(function (e) { toast('Failed: ' + e.message); }); };
      }).catch(function (e) { modal('<div class="cq-empty">Could not load: ' + esc(e.message) + '</div><button class="cq-btn ghost" onclick="this.parentNode.parentNode.innerHTML=\'\'">Close</button>'); });
    }
    // Paper-form replica (QUALITY ASSURANCE INSPECTION FORM) → new window → print/PDF.
    function printForm(r, urls) {
      var a = r.audit, byItem = {}; r.items.forEach(function (i) { byItem[i.item_id] = i; });
      var row = function (l, v) { return '<tr><td class="k">' + esc(l) + '</td><td>' + esc(v || '') + '</td></tr>'; };
      var sec = function (name) { return '<tr class="sec"><td colspan="3">' + esc(name) + '</td></tr>'; };
      var items = [sec('Outside Segment of Installation')].concat(S.cfg.checklist.filter(function (c) { return c.section === 'OUTSIDE'; }).map(function (c) { var i = byItem[c.id] || {}; return '<tr><td>• ' + esc(c.label) + '</td><td class="c">' + (i.result === 'pass' ? '✔' : i.result === 'na' ? 'N/A' : '') + '</td><td class="c">' + (i.result === 'fail' ? '✘ ' + esc(i.remark || '') : '') + '</td></tr>'; }))
        .concat([sec('Client Premise Segment of Installation')]).concat(S.cfg.checklist.filter(function (c) { return c.section === 'PREMISE'; }).map(function (c) { var i = byItem[c.id] || {}; return '<tr><td>• ' + esc(c.label) + '</td><td class="c">' + (i.result === 'pass' ? '✔' : i.result === 'na' ? 'N/A' : '') + '</td><td class="c">' + (i.result === 'fail' ? '✘ ' + esc(i.remark || '') : '') + '</td></tr>'; })).join('');
      var viol = r.violations.map(function (v) { return '<tr><td>' + esc(v.code) + '</td><td>' + esc(v.category || '') + '</td><td>' + esc(v.description || '') + '</td><td>' + esc(v.class || '') + '</td><td>' + esc(v.severity || '') + '</td><td>' + (v.offense_no || '') + '</td><td>' + (v.penalty_amount != null ? peso(v.penalty_amount) : '') + '</td></tr>'; }).join('') + Array(Math.max(0, 5 - r.violations.length) + 1).join('<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>');
      var photos = r.photos.map(function (p) { return urls[p.path] ? '<div class="ph"><img src="' + esc(urls[p.path]) + '"><div>' + esc(p.label || '') + '</div></div>' : ''; }).join('');
      var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(a.id) + ' QA Inspection Form</title><style>body{font:12px Arial,sans-serif;color:#000;margin:18px}h1{background:#1d9e3f;color:#fff;font-size:14px;text-align:center;padding:5px;margin:0 0 6px}table{width:100%;border-collapse:collapse;margin-bottom:8px}td,th{border:1px solid #000;padding:4px 6px;font-size:11px;vertical-align:top}td.k{width:170px;background:#f3f3f3}tr.sec td{background:#c9e8cf;font-weight:bold}th{background:#1d9e3f;color:#fff}td.c{width:120px;text-align:center}.cert{margin:10px 0;font-size:11px}.sig{display:flex;justify-content:space-between;margin-top:18px}.sig div{width:45%}.sig img{height:60px;display:block}.ph{display:inline-block;width:23%;margin:1%;font-size:9px;text-align:center}.ph img{width:100%;height:120px;object-fit:cover;border:1px solid #999}@media print{.no{display:none}}</style></head><body>' +
        '<div class="no" style="text-align:right;margin-bottom:6px"><button onclick="window.print()">Print / Save as PDF</button></div><h1>QUALITY ASSURANCE INSPECTION FORM</h1>' +
        '<table><tr><td class="k">Inspection/Ticket no.</td><td>' + esc(a.id) + '</td><td class="k">Client\'s Name:</td><td>' + esc(a.subscriber || '') + '</td></tr><tr><td class="k">Inspection Date:</td><td>' + fmtWhen(a.inspected_at) + '</td><td class="k">Client\'s Account No.:</td><td>' + esc(a.acct_no || '') + '</td></tr><tr><td class="k">Inspector\'s Name:</td><td>' + esc(a.inspector || '') + '</td><td class="k">Address:</td><td>' + esc((a.address || '') + ' ' + (a.barangay || '')) + '</td></tr><tr><td class="k">Contractor\'s Representative:</td><td>' + esc(a.contractor_rep || '') + '</td><td class="k">JO / NAP / Port</td><td>' + esc((a.jo_no || '') + ' / ' + (a.nap_code || '') + ' / ' + (a.port_no || '')) + '</td></tr><tr><td class="k">Installer/s:</td><td>' + esc(a.installers_text || '') + '</td><td class="k">Visit / Wire / QA-GC</td><td>' + esc((a.visit_status || '') + ' / ' + (a.wire || '') + ' / ' + (a.qa_gc || '')) + '</td></tr><tr><td class="k">Contractor/ Dept:</td><td>' + esc(a.contractor_name || '') + '</td><td class="k">Assessment</td><td><b>' + esc(a.assessment || '') + '</b></td></tr></table>' +
        '<table><tr><th style="text-align:left">DESCRIPTION</th><th>PASSED</th><th>FAILED</th></tr>' + items + '</table>' +
        '<table><tr><th>CODE</th><th>CATEGORY</th><th>DESCRIPTION</th><th>CLASS</th><th>SEVERITY</th><th>NO. OF OFFENSE</th><th>PENALTY</th></tr>' + viol + '<tr><td colspan="6"><b>TOTAL VIOLATION FOUND:</b> ' + a.total_violations + '</td><td></td></tr><tr><td colspan="6"><b>TOTAL PENALTY:</b></td><td><b>' + peso(a.total_penalty) + '</b></td></tr></table>' +
        '<table><tr class="sec"><td colspan="4">FOUND BUSINESS</td></tr><tr><td class="c">' + (a.found_business === 'willing' ? '☑' : '☐') + '</td><td><b>WILLING TO UPGRADE</b></td><td class="k">OLD PLAN:</td><td>' + esc(a.old_plan || '') + '</td></tr><tr><td class="c">' + (a.found_business === 'not_willing' ? '☑' : '☐') + '</td><td><b>NOT WILLING TO UPGRADE (Subject for termination)</b></td><td class="k">NEW PLAN:</td><td>' + esc(a.new_plan || '') + '</td></tr></table>' +
        '<div class="cert">I, <u>&nbsp;' + esc(a.subscriber_signed_name || '') + '&nbsp;</u> the client, understands that there is a non-compliance regarding my subscription and that I need to change and/or upgrade from residential plan to business plan.</div><div class="cert">I, the inspector, hereby certify that the inspection has been performed in a fair, professional, and honest way, and that I have not asked, nor received any favour, compensation or gifts from anyone.</div>' +
        '<div class="sig"><div><b>Subscriber\'s Name:</b> ' + esc(a.subscriber_signed_name || '') + '<br><b>Signature:</b>' + (urls[a.subscriber_signature_path] ? '<img src="' + esc(urls[a.subscriber_signature_path]) + '">' : '<br><br>') + '</div><div><b>Name of Inspector:</b> ' + esc(a.inspector || '') + '<br><b>Signature:</b>' + (urls[a.inspector_signature_path] ? '<img src="' + esc(urls[a.inspector_signature_path]) + '">' : '<br><br>') + '</div></div>' +
        (a.remarks ? '<div class="cert"><b>Remarks:</b> ' + esc(a.remarks) + '</div>' : '') + (photos ? '<div style="page-break-before:always"><h1>PHOTOS · ' + esc(a.id) + '</h1>' + photos + '</div>' : '') + '</body></html>';
      var w = window.open('', '_blank'); if (!w) { toast('Pop-up blocked — allow pop-ups to print'); return; } w.document.write(html); w.document.close();
    }
```

- [ ] **Step 2: Lint + commit**

Run: `node --check console-qa.js`

```bash
git add console-qa.js
git commit -m "feat(qa): console results tab, audit detail modal (photos, violations, signatures, log), reopen, paper-form print"
```

---

### Task 11: `console-qa.js` part 3 — Reports (daily + weekly, Excel) and Settings (config editors, mapping, sampling %, sync status, CSV import)

**Files:**
- Modify: `console-qa.js` (replace `renderReports` and `renderSettings` stubs)

**Interfaces:**
- Consumes: `api.weeklyReport(from,to)`, `api.listAudits`, `api.getConfig/save*`, `api.syncStatus`, `api.importRows(rows)`; optional `deps.ensureXLSX()` (console global) — when absent, exports fall back to CSV download.

- [ ] **Step 1: Replace the two stubs with this code**

```js
    // ---------------- REPORTS ----------------
    function dl(name, text, mime) { var b = new Blob([text], { type: mime || 'text/csv' }); var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); }
    function exportRows(name, rows) {
      if (!rows.length) { toast('Nothing to export'); return; }
      var cols = Object.keys(rows[0]);
      var toXlsx = deps.ensureXLSX ? deps.ensureXLSX().then(function () { var ws = root.XLSX.utils.json_to_sheet(rows); var wb = root.XLSX.utils.book_new(); root.XLSX.utils.book_append_sheet(wb, ws, 'QA'); root.XLSX.writeFile(wb, name + '.xlsx'); }) : Promise.reject();
      toXlsx.catch(function () { dl(name + '.csv', cols.join(',') + '\n' + rows.map(function (r) { return cols.map(function (c) { return '"' + String(r[c] == null ? '' : r[c]).replace(/"/g, '""') + '"'; }).join(','); }).join('\n')); });
    }
    function renderReports() {
      var rp = S.report;
      $('#cqBody').innerHTML = '<div class="cq-bar"><b>Daily</b><label>Date <input type="date" id="rp_day" value="' + today() + '"></label><button class="cq-btn ghost" id="rp_dayShow">Show</button><button class="cq-btn ghost" id="rp_dayX">Export day</button><button class="cq-btn ghost" id="rp_dayPrint">Print all forms</button></div><div id="rp_dayT"></div>' +
        '<div class="cq-bar" style="margin-top:16px"><b>Weekly review</b><label>From <input type="date" id="rp_from" value="' + esc(rp.from) + '"></label><label>to <input type="date" id="rp_to" value="' + esc(rp.to) + '"></label><button class="cq-btn ghost" id="rp_prevW">‹ week</button><button class="cq-btn ghost" id="rp_nextW">week ›</button><button class="cq-btn" id="rp_run">Run</button><button class="cq-btn ghost" id="rp_x">Export (SUMMARY PER CON)</button></div><div id="rp_week"></div>';
      $('#rp_dayShow').onclick = loadDay; $('#rp_dayX').onclick = function () { dayRows().then(function (rows) { exportRows('QA-daily-' + $('#rp_day').value, rows); }); };
      $('#rp_dayPrint').onclick = function () { api.listAudits({ status: ['done'], qfrom: $('#rp_day').value, qto: $('#rp_day').value, pageSize: 200 }).then(function (r) { if (!r.rows.length) { toast('No inspections that day'); return; } if (!confirm('Open ' + r.rows.length + ' print window(s)?')) return; r.rows.forEach(function (a) { api.getAudit(a.id).then(function (b) { var urls = {}; Promise.all(b.photos.map(function (p) { return api.photoUrl(p.path).then(function (u) { urls[p.path] = u; }); }).concat([a.subscriber_signature_path, a.inspector_signature_path].filter(Boolean).map(function (p) { return api.photoUrl(p).then(function (u) { urls[p] = u; }); }))).then(function () { printForm(b, urls); }); }); }); }); };
      $('#rp_prevW').onclick = function () { S.report = { from: addDays(S.report.from, -7), to: addDays(S.report.to, -7) }; renderReports(); };
      $('#rp_nextW').onclick = function () { S.report = { from: addDays(S.report.from, 7), to: addDays(S.report.to, 7) }; renderReports(); };
      $('#rp_run').onclick = function () { S.report = { from: $('#rp_from').value, to: $('#rp_to').value }; loadWeek(); };
      $('#rp_x').onclick = function () { api.weeklyReport(S.report.from, S.report.to).then(function (w) { exportRows('QA-weekly-' + S.report.from + '_' + S.report.to, w.contractors.map(function (c) { return { COMP: c.contractor, INSPECTED: c.inspected, GOOD: c.GOOD, 'FOR RECTIFY': c['FOR RECTIFY'], 'FOR PENALTY': c['FOR PENALTY'], CLAWBACK: c.CLAWBACK, NPA: c.npa, PENALTY: c.penalty, CLOSED: c.closed, 'COVERAGE %': c.closed ? Math.round(c.inspected * 100 / c.closed) : '' }; })); }); };
      loadDay(); loadWeek();
    }
    function dayRows() { var d = $('#rp_day').value; return api.listAudits({ status: ['done'], qfrom: d, qto: d, pageSize: 1000 }).then(function (r) { return r.rows.map(function (a) { return { AUDIT: a.id, DATE_QA: a.inspected_at ? a.inspected_at.slice(0, 10) : '', INSPECTOR: a.inspector, COMP: a.contractor_name, JONO: a.jo_no, ACCTNO: a.acct_no, SUBSCRIBER: a.subscriber, ADDRESS: a.address, BARANGAY: a.barangay, NAP: a.nap_code, PORT: a.port_no, VISITED: a.visit_status, WIRE: a.wire, 'QA / GC': a.qa_gc, ASSESSMENT: a.assessment, VIOLATIONS: a.total_violations, PENALTY: a.total_penalty, REMARKS: a.remarks, LATLONG: a.lat != null ? a.lat + ', ' + a.lng : a.sheet_latlong, 'CONTRACTOR REP': a.contractor_rep, INSTALLERS: a.installers_text, 'FOUND BUSINESS': a.found_business, 'OLD PLAN': a.old_plan, 'NEW PLAN': a.new_plan }; }); }); }
    function loadDay() { $('#rp_dayT').innerHTML = '<div class="cq-empty">Loading…</div>'; dayRows().then(function (rows) { $('#rp_dayT').innerHTML = rows.length ? '<table><thead><tr>' + ['AUDIT', 'INSPECTOR', 'COMP', 'SUBSCRIBER', 'BARANGAY', 'VISITED', 'ASSESSMENT', 'VIOLATIONS', 'PENALTY'].map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr><td><a href="#" data-view="' + esc(r.AUDIT) + '">' + esc(r.AUDIT) + '</a></td><td>' + esc(r.INSPECTOR) + '</td><td>' + esc(r.COMP) + '</td><td>' + esc(r.SUBSCRIBER) + '</td><td>' + esc(r.BARANGAY) + '</td><td>' + esc(r.VISITED) + '</td><td>' + esc(r.ASSESSMENT) + '</td><td>' + r.VIOLATIONS + '</td><td>' + peso(r.PENALTY) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="cq-empty">No inspections on that day.</div>'; rootEl.querySelectorAll('#rp_dayT [data-view]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); openDetail(a.dataset.view); }; }); }); }
    function loadWeek() {
      $('#rp_week').innerHTML = '<div class="cq-empty">Loading…</div>';
      api.weeklyReport(S.report.from, S.report.to).then(function (w) {
        var tbl = function (title, heads, rows) { return '<div class="cq-sec">' + title + '</div>' + (rows.length ? '<table><thead><tr>' + heads.map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>' : '<div class="cq-empty">No data</div>'); };
        $('#rp_week').innerHTML = tbl('Per contractor (' + esc(S.report.from) + ' → ' + esc(S.report.to) + ')', ['Contractor', 'Closed', 'Inspected', 'Coverage', 'GOOD', 'FOR RECTIFY', 'FOR PENALTY', 'CLAWBACK', 'NPA/other', 'Penalty'], w.contractors.map(function (c) { var pct = c.closed ? Math.round(c.inspected * 100 / c.closed) : null; return '<tr><td><b>' + esc(c.contractor) + '</b></td><td>' + c.closed + '</td><td>' + c.inspected + '</td><td>' + (pct == null ? '—' : '<span class="cq-pill ' + (pct >= 100 ? 'done' : pct >= 50 ? 'queued' : 'fail') + '">' + pct + '%</span>') + '</td><td>' + c.GOOD + '</td><td>' + c['FOR RECTIFY'] + '</td><td>' + c['FOR PENALTY'] + '</td><td>' + c.CLAWBACK + '</td><td>' + c.npa + '</td><td>' + peso(c.penalty) + '</td></tr>'; })) +
          tbl('Checklist pass rate', ['Item', 'Pass', 'Fail', 'N/A', 'Pass rate'], w.items.map(function (i) { return '<tr><td>' + esc(i.label) + '</td><td>' + i.pass + '</td><td>' + i.fail + '</td><td>' + i.na + '</td><td>' + (i.pass_rate == null ? '—' : '<span class="cq-pill ' + (i.pass_rate >= 90 ? 'done' : i.pass_rate >= 70 ? 'queued' : 'fail') + '">' + i.pass_rate + '%</span>') + '</td></tr>'; })) +
          tbl('Top violations', ['Code', 'Category', 'Count'], w.codes.map(function (c) { return '<tr><td><b>' + esc(c.code) + '</b></td><td>' + esc(c.category || '') + '</td><td>' + c.count + '</td></tr>'; })) +
          tbl('Inspectors', ['Inspector', 'Inspections', 'NPA/other'], w.inspectors.map(function (i) { return '<tr><td>' + esc(i.inspector) + '</td><td>' + i.inspections + '</td><td>' + i.npa + '</td></tr>'; }));
      }).catch(function (e) { $('#rp_week').innerHTML = '<div class="cq-empty">' + esc(e.message) + '</div>'; });
    }

    // ---------------- SETTINGS ----------------
    function renderSettings() {
      var c = S.cfg, s = c.settings || {};
      var lastSync = S.sync && S.sync.last_sync_at ? fmtWhen(S.sync.last_sync_at) + ' · ' + S.sync.last_sync_rows + ' rows' : 'never';
      $('#cqBody').innerHTML = '<div class="cq-sec">Sheet sync</div><div class="cq-stats"><div class="cq-stat"><span>Last sync</span><strong style="font-size:13px">' + esc(lastSync) + '</strong></div><div class="cq-stat' + (S.sync && S.sync.unmapped.length ? ' warn' : '') + '"><span>Unmapped contractor names</span><strong style="font-size:13px">' + esc((S.sync && S.sync.unmapped.join(', ')) || 'none') + '</strong></div></div>' +
        (canEdit ? '<div class="cq-bar"><label>CSV fallback (same columns as the sheet: COMP, JODATECLOSED, ACCTNO, JONO, …) <input type="file" id="st_csv" accept=".csv"></label><button class="cq-btn ghost" id="st_csvGo">Import CSV</button></div>' : '') +
        '<div class="cq-sec">General</div><div class="cq-bar"><label>In-house sample % <input type="number" id="st_pct" value="' + esc(s.inhouse_sample_pct || '10') + '" min="0" max="100" style="width:70px"' + (canEdit ? '' : ' disabled') + '></label><label>Initial cutoff (rows closed before this are never auto-queued) <input type="date" id="st_cut" value="' + esc(s.initial_cutoff || '') + '"' + (canEdit ? '' : ' disabled') + '></label>' + (canEdit ? '<button class="cq-btn" id="st_save">Save</button>' : '') + '</div>' +
        '<div class="cq-sec">Contractor mapping</div><table><thead><tr><th>Sheet name (COMP)</th><th>Display name</th><th>Kind</th><th>Coverage</th><th>FieldOps org id</th><th>Active</th></tr></thead><tbody>' + c.contractors.map(function (x) { return '<tr data-ct="' + esc(x.sheet_name) + '"><td><b>' + esc(x.sheet_name) + '</b></td><td><input data-f="display_name" value="' + esc(x.display_name) + '"></td><td><select data-f="kind"><option' + (x.kind === 'subcon' ? ' selected' : '') + '>subcon</option><option' + (x.kind === 'inhouse' ? ' selected' : '') + '>inhouse</option></select></td><td><select data-f="coverage"><option' + (x.coverage === 'all' ? ' selected' : '') + '>all</option><option' + (x.coverage === 'sample' ? ' selected' : '') + '>sample</option></select></td><td><input data-f="org_id" value="' + esc(x.org_id || '') + '" placeholder="uuid from Subcontractors page" style="width:260px"></td><td><input type="checkbox" data-f="active"' + (x.active ? ' checked' : '') + '></td></tr>'; }).join('') + (canEdit ? '<tr><td><input id="ct_new" placeholder="NEW SHEET NAME"></td><td colspan="5"><button class="cq-btn ghost" id="ct_add">Add</button></td></tr>' : '') + '</tbody></table>' +
        '<div class="cq-sec">Checklist items</div><table><thead><tr><th>Section</th><th>Label</th><th>Order</th><th>Suggested code</th><th>Active</th></tr></thead><tbody>' + c.checklist.map(function (x) { return '<tr data-ci="' + x.id + '"><td><select data-f="section"><option' + (x.section === 'OUTSIDE' ? ' selected' : '') + '>OUTSIDE</option><option' + (x.section === 'PREMISE' ? ' selected' : '') + '>PREMISE</option></select></td><td><input data-f="label" value="' + esc(x.label) + '" style="width:320px"></td><td><input data-f="sort_order" type="number" value="' + x.sort_order + '" style="width:60px"></td><td><input data-f="suggested_code" value="' + esc(x.suggested_code || '') + '" style="width:90px"></td><td><input type="checkbox" data-f="active"' + (x.active ? ' checked' : '') + '></td></tr>'; }).join('') + (canEdit ? '<tr><td><select id="ci_sec"><option>OUTSIDE</option><option>PREMISE</option></select></td><td><input id="ci_label" placeholder="New item label" style="width:320px"></td><td colspan="3"><button class="cq-btn ghost" id="ci_add">Add</button></td></tr>' : '') + '</tbody></table>' +
        '<div class="cq-sec">Violation catalog (' + c.codes.length + ')</div><div class="cq-bar"><input id="vc_q" placeholder="Filter codes"></div><div id="vc_table"></div>';
      var renderCodes = function () { var q = ($('#vc_q').value || '').toUpperCase(); var rows = c.codes.filter(function (x) { return !q || (x.code + ' ' + x.category + ' ' + x.description).toUpperCase().indexOf(q) >= 0; }).slice(0, 60); $('#vc_table').innerHTML = '<table><thead><tr><th>Code</th><th>Category</th><th>Severity</th><th>L1</th><th>L2</th><th>L3</th><th>Penalty text</th><th>Active</th></tr></thead><tbody>' + rows.map(function (x) { return '<tr data-vc="' + esc(x.code) + '"><td><b>' + esc(x.code) + '</b></td><td><input data-f="category" value="' + esc(x.category) + '" style="width:220px"></td><td><select data-f="severity"><option' + (x.severity === 'MINOR' ? ' selected' : '') + '>MINOR</option><option' + (x.severity === 'MAJOR' ? ' selected' : '') + '>MAJOR</option><option' + (x.severity === 'CRITICAL' ? ' selected' : '') + '>CRITICAL</option></select></td><td><input data-f="penalty_l1" type="number" value="' + (x.penalty_l1 == null ? '' : x.penalty_l1) + '" style="width:70px"></td><td><input data-f="penalty_l2" type="number" value="' + (x.penalty_l2 == null ? '' : x.penalty_l2) + '" style="width:70px"></td><td><input data-f="penalty_l3" type="number" value="' + (x.penalty_l3 == null ? '' : x.penalty_l3) + '" style="width:70px"></td><td class="cq-age">' + esc(x.penalty_text).slice(0, 80) + '</td><td><input type="checkbox" data-f="active"' + (x.active !== false ? ' checked' : '') + '></td></tr>'; }).join('') + '</tbody></table>' + (c.codes.length > rows.length ? '<div class="cq-age">Showing ' + rows.length + ' of ' + c.codes.length + ' — use the filter.</div>' : ''); wireRows('[data-vc]', function (tr) { return c.codes.filter(function (x) { return x.code === tr.dataset.vc; })[0]; }, api.saveCode); };
      $('#vc_q').oninput = renderCodes; renderCodes();
      wireRows('[data-ct]', function (tr) { return c.contractors.filter(function (x) { return x.sheet_name === tr.dataset.ct; })[0]; }, api.saveContractor);
      wireRows('[data-ci]', function (tr) { return c.checklist.filter(function (x) { return String(x.id) === tr.dataset.ci; })[0]; }, api.saveChecklistItem);
      if (!canEdit) { rootEl.querySelectorAll('#cqBody input, #cqBody select').forEach(function (el) { el.disabled = true; }); return; }
      $('#st_save').onclick = function () { Promise.all([api.saveSetting('inhouse_sample_pct', $('#st_pct').value), api.saveSetting('initial_cutoff', $('#st_cut').value)]).then(function () { toast('Saved'); return load(); }); };
      $('#ct_add').onclick = function () { var n = ($('#ct_new').value || '').trim().toUpperCase(); if (!n) return; api.saveContractor({ sheet_name: n, display_name: n, kind: 'subcon', coverage: 'all', active: true }).then(function () { toast('Added'); load().then(renderSettings); }); };
      $('#ci_add').onclick = function () { var l = ($('#ci_label').value || '').trim(); if (!l) return; api.saveChecklistItem({ section: $('#ci_sec').value, label: l, sort_order: c.checklist.length + 1, active: true, photo_required: false }).then(function () { toast('Added'); load().then(renderSettings); }); };
      $('#st_csvGo').onclick = function () { var f = $('#st_csv').files && $('#st_csv').files[0]; if (!f) { toast('Choose a CSV first'); return; } f.text().then(function (txt) { var rows = parseCsv(txt); if (rows.length < 2) { toast('Empty CSV'); return; } var hdr = rows[0]; var objs = rows.slice(1).map(function (r) { var o = {}; hdr.forEach(function (h, i) { o[h.trim()] = r[i]; }); return o; }); return api.importRows(objs).then(function (r) { toast('Imported ' + r.upserted + ' rows · ' + r.audits_created + ' new audits'); return load().then(renderSettings); }); }).catch(function (e) { toast('Import failed: ' + e.message); }); };
    }
    function wireRows(sel, find, save) { rootEl.querySelectorAll(sel).forEach(function (tr) { tr.querySelectorAll('[data-f]').forEach(function (el) { el.onchange = function () { var row = find(tr); if (!row) return; var v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : (el.value === '' ? null : el.value); row[el.dataset.f] = v; save(row).then(function () { toast('Saved ' + (row.code || row.sheet_name || row.label)); }).catch(function (e) { toast('Save failed: ' + e.message); }); }; }); }); }
    function parseCsv(text) { var rows = [], row = [], cell = '', inQ = false, i, ch; text = String(text || ''); for (i = 0; i < text.length; i++) { ch = text[i]; if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += ch; } else if (ch === '"') inQ = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch; } if (cell !== '' || row.length) { row.push(cell); rows.push(row); } return rows.filter(function (r) { return r.some(function (c) { return c !== ''; }); }); }
```

- [ ] **Step 2: Lint + commit**

Run: `node --check console-qa.js`

```bash
git add console-qa.js
git commit -m "feat(qa): console reports (daily list/export/print-all, weekly review + SUMMARY PER CON export) and settings (mapping, checklist, catalog, sampling, sync, CSV import)"
```

---

### Task 12: `qa-demo.html` + demo server — the owner-facing DRY RUN (browser verified)

**Files:**
- Create: `qa-demo.html`
- Create: `.claude/qa-demo-server.js`
- Modify: `.claude/launch.json` (add configuration `qa-demo`, port 8392)

**Interfaces:**
- Consumes: `qa-core.js`, `qa-sim.js`, `mobile-qa.js`, `console-qa.js`, Leaflet from cdnjs.
- Produces: one page with a phone frame (inspector) on the left and the QA Head console on the right, both on ONE shared `QaSim` instance, so an assignment in the console appears instantly on the phone and a submission appears instantly in the console.

- [ ] **Step 1: Write the server**

```js
// Minimal static server for the QA DEMO (serves repo root; no dependencies). Same pattern as billing-demo-server.js.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  const url = decodeURIComponent(req.url.split('?')[0]);
  let p = path.normalize(path.join(ROOT, url));
  if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'qa-demo.html');
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    res.end(data);
  });
}).listen(8392, '127.0.0.1', () => console.log('serving repo root (QA demo) on http://127.0.0.1:8392'));
```

Add to `.claude/launch.json` `configurations`:

```json
    {
      "name": "qa-demo",
      "runtimeExecutable": "node",
      "runtimeArgs": [".claude/qa-demo-server.js"],
      "port": 8392
    }
```

- [ ] **Step 2: Write `qa-demo.html`**

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AHBA QA Audit — DRY RUN demo</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<style>
  body{margin:0;font:13px system-ui,sans-serif;background:#e9eee9;color:#0e2b27}
  .top{background:#0d3b34;color:#fff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center}
  .top b{font-size:15px}.top .tag{background:#ffb000;color:#000;font-weight:800;padding:2px 8px;border-radius:8px;font-size:11px;margin-left:8px}
  .top select,.top button{padding:6px 9px;border-radius:8px;border:0;font-weight:700}
  .wrap{display:grid;grid-template-columns:400px 1fr;gap:14px;padding:14px;min-height:calc(100vh - 48px)}
  .phone{background:#111;border-radius:34px;padding:14px 10px;box-shadow:0 12px 40px rgba(0,0,0,.35);height:800px;position:sticky;top:14px}
  .screen{background:#f4f7f5;border-radius:24px;height:100%;overflow:auto;position:relative}
  .screen .qa-sheet,.screen .qa-footer{position:absolute}
  .console{background:#f7f9f7;border:1px solid #dfe7e2;border-radius:16px;padding:16px;overflow:auto}
  .toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#0e2b27;color:#fff;padding:10px 16px;border-radius:12px;opacity:0;transition:.2s;pointer-events:none;z-index:99999}.toast.show{opacity:1}
</style></head><body>
<div class="top"><div><b>AHBA FieldOps · QA Audit</b><span class="tag">DRY RUN · fake backend · synthetic data</span></div>
  <div>Inspector: <select id="who"><option>AHBA_QA01</option><option>AHBA_QA02</option><option>AHBA_QA03</option></select>
  <button id="simJob">Simulate JO completed in FieldOps</button> <button id="simSheet">Simulate sheet sync (+5 rows)</button> <button id="reset">Reset demo</button></div></div>
<div class="wrap"><div class="phone"><div class="screen" id="phone"></div></div><div class="console" id="console"></div></div>
<div class="toast" id="toast"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script src="qa-core.js"></script><script src="qa-sim.js"></script><script src="mobile-qa.js"></script><script src="console-qa.js"></script>
<script>
(function(){
  function toast(m){ var t=document.getElementById('toast'); t.textContent=m; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(function(){ t.classList.remove('show'); },2600); }
  // Simple stand-ins for the FieldOps helpers (production passes the real compressImage/buildStamp/getPos).
  function compressImage(file){ return new Promise(function(res){ var img=new Image(), url=URL.createObjectURL(file); img.onload=function(){ var s=Math.min(1,800/Math.max(img.width,img.height)); var cv=document.createElement('canvas'); cv.width=Math.round(img.width*s); cv.height=Math.round(img.height*s); var cx=cv.getContext('2d'); cx.drawImage(img,0,0,cv.width,cv.height); cx.fillStyle='rgba(0,0,0,.55)'; cx.fillRect(0,cv.height-26,cv.width,26); cx.fillStyle='#fff'; cx.font='600 13px system-ui'; cx.fillText('DEMO · '+new Date().toLocaleString('en-PH')+' · 14.68, 121.06',8,cv.height-9); cv.toBlob(function(b){ URL.revokeObjectURL(url); res(b||file); },'image/jpeg',.6); }; img.onerror=function(){ res(file); }; img.src=url; }); }
  var getPos=function(){ return Promise.resolve({lat:14.68+Math.random()*0.02, lng:121.06+Math.random()*0.02}); };
  var api, phone, cons, who=document.getElementById('who');
  function boot(){
    if(phone) phone.destroy(); if(cons) cons.destroy();
    api=QaSim.create({seed:QaSim.demoSeed()});
    window.qaApi=api;   // for poking in devtools
    phone=MobileQA.mount(document.getElementById('phone'),{api:api,user:{username:who.value,display_name:'Demo Inspector'},deps:{toast:toast,compressImage:compressImage,buildStamp:function(){return Promise.resolve(null);},getPos:getPos}});
    cons=ConsoleQA.mount(document.getElementById('console'),{api:api,user:{username:'QA_HEAD',display_name:'QA Head'},deps:{toast:toast,canEdit:true,L:window.L},onBadge:function(n){ document.title='('+n+') QA demo'; }});
  }
  who.onchange=function(){ phone.destroy(); phone=MobileQA.mount(document.getElementById('phone'),{api:api,user:{username:who.value,display_name:'Demo Inspector'},deps:{toast:toast,compressImage:compressImage,buildStamp:function(){return Promise.resolve(null);},getPos:getPos}}); };
  document.getElementById('simJob').onclick=function(){ var n=Date.now()%100000; var a=api._completeJob({id:'DEMO-JO-NEW-'+n, job_order_no:'R8'+n, ibass_acct_no:'19'+n, status:'completed', assigned_org_code:'RIA', subscriber:'DEMO NEW SUBSCRIBER '+n, address:n+' DEMO AVE', brgy:'PAYATAS', crew_driver:'DEMO DRIVER', crew_tech1:'DEMO TECH'}); toast(a?('FieldOps JO completed → '+a.id+' queued'):'Already had an audit'); cons.refresh(); };
  document.getElementById('simSheet').onclick=function(){ var rows=[]; for(var i=0;i<5;i++){ var n=Date.now()%100000+i; rows.push({COMP:['J2','AVELINE','AHBA'][i%3], JODATECLOSED:new Date().toISOString().slice(0,10)+' 00:00:00', ACCTNO:'18'+n, JONO:'R7'+n, SUBSCRIBERNAME:'DEMO SHEET SUB '+n, MOBILENO:'9'+n, BARANGAYNAME:'COMMONWEALTH', COMPLETEADDRESS:n+' DEMO RD', TRANTYPECODE:'MAINLINE APPLICATION', NAPCODE:'QCY0 LP1 NP1', PORTNO:'P1-O', SERIALNO:'SN'+n, DRIVER:'D', TECH:'T'}); } api.importRows(rows).then(function(r){ toast('Sheet sync: '+r.upserted+' rows, '+r.audits_created+' new audits'); cons.refresh(); }); };
  document.getElementById('reset').onclick=function(){ Object.keys(localStorage).filter(function(k){return k.indexOf('qa_')===0;}).forEach(function(k){localStorage.removeItem(k);}); boot(); };
  boot();
})();
</script></body></html>
```

- [ ] **Step 3: Run the demo in the Browser pane and walk the full flow**

Start: preview_start `{name: "qa-demo"}` → `http://127.0.0.1:8392/qa-demo.html`.
Checklist (do each, then `read_console_messages` — expected: no errors):
1. Console → Queue shows queued subcon rows + stats; filter Pool shows in-house rows; "Random sample in-house…" 10% → toast "N audit(s) sampled".
2. Select 3 queued rows → Assign → AHBA_QA01, today → phone Today tab shows 3 cards with #1–#3 and Navigate links; Today's board shows the column + map pins.
3. Phone: Start inspection → header auto-filled → mark 9 PASS + 1 FAIL → fail expands with suggested code (HA001 for house bracket) → attach a photo (any image file) → Wire/QA-GC → Assessment shows GOOD greyed / pick FOR RECTIFY → sign both pads → Submit → toast "✅ Inspection submitted"; console toast "✅ QA-… submitted"; Results tab lists it; Open → detail shows checklist, violation with ₱500 L1, signatures; Print / PDF opens the form replica.
4. Phone: second card → visit status UNLOCATED → submit without photo → error text; add location photo + remark → submit OK; console Results shows UNLOCATED, no assessment.
5. Console: Reopen the first audit → phone Today shows "Continue" → change to FOR PENALTY → submit → Results shows reopened ×1.
6. Reports: Daily lists both; Weekly shows J2 coverage %, checklist pass rate (House bracket 0%), Top violations HA001; Export downloads a CSV (XLSX not loaded in the demo).
7. Settings: change sample % → Save → toast; add contractor "NEW CO" → appears; CSV import of a 2-row file (COMP,JODATECLOSED,ACCTNO,JONO,SUBSCRIBERNAME) → new audits.
8. Top bar: "Simulate JO completed" → new RIA audit queued with FieldOps link; "Simulate sheet sync" → 5 rows → 3 queued (J2/AVELINE) + 1 pool (AHBA) as expected.
9. Offline path: in devtools set `window.qaApi.submitAudit = () => Promise.reject(new Error('network'))`, submit an inspection → toast "No signal — inspection saved", header shows "⏳ 1 pending upload"; restore the method, dispatch `window.dispatchEvent(new Event('online'))` → "✅ Queued inspection … submitted".
10. `resize_window` mobile preset on the page: phone frame still usable (sheet scrolls, footer fixed).

Take screenshots of steps 2, 3 (form + detail), 6 and send them to the owner with SendUserFile.

- [ ] **Step 4: Commit**

```bash
git add qa-demo.html .claude/qa-demo-server.js .claude/launch.json
git commit -m "feat(qa): dry-run demo page (phone + console on one fake backend) + demo server"
```

---

### Task 13: Edge Function `qa-sheet-sync` + Google Apps Script + install README

**Files:**
- Create: `supabase/functions/qa-sheet-sync/index.ts`
- Create: `google-apps-script/qa-sheet-sync.gs`
- Create: `google-apps-script/README-qa-sheet-sync.md`

**Interfaces:**
- Consumes: `qa.sheet_rows` (upsert on `jo_no`), RPC `qa.ingest_sheet_rows()`, `qa.settings`. Secrets: `QA_SYNC_SECRET` (Edge Function env) = script property `QA_SYNC_SECRET` (Apps Script). `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` auto-injected.
- Produces: `POST /functions/v1/qa-sheet-sync` with header `x-qa-secret` and body `{rows:[{COMP,JODATECLOSED,ACCTNO,JONO,...}], source:'apps-script'}` → `{ok:true, upserted, audits_created, rejected:[...]}`.

- [ ] **Step 1: Write the Edge Function**

```ts
// AHBA QA — sheet sync receiver. Deploy: Supabase → Edge Functions → "qa-sheet-sync" → paste → Deploy. Turn OFF "Verify JWT".
// Secrets: QA_SYNC_SECRET (shared with the Apps Script). Never deletes; upserts qa.sheet_rows then runs qa.ingest_sheet_rows().
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-qa-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function toDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}
const up = (v: unknown) => { const s = v == null ? "" : String(v).trim(); return s ? s.toUpperCase() : null; };
const txt = (v: unknown) => { const s = v == null ? "" : String(v).trim(); return s ? s : null; };
function normalize(raw: Record<string, unknown>) {
  const jo = up(raw.JONO); if (!jo) return null;
  return { jo_no: jo, acct_no: txt(raw.ACCTNO)?.replace(/\.0$/, "") ?? null, comp: up(raw.COMP), jo_date_closed: toDate(raw.JODATECLOSED), ssp_code: up(raw.SSPCODE),
    subscriber_name: up(raw.SUBSCRIBERNAME), mobile_no: txt(raw.MOBILENO), barangay: up(raw.BARANGAYNAME), complete_address: up(raw.COMPLETEADDRESS), tran_type: up(raw.TRANTYPECODE),
    nap_code: up(raw.NAPCODE), port_no: up(raw.PORTNO), serial_no: up(raw.SERIALNO), driver: up(raw.DRIVER), tech: up(raw.TECH), tech2: up(raw["TECH 2"]),
    sheet_qa_gc: up(raw["QA / GC"]), sheet_visited: up(raw.VISITED), sheet_date_qa: toDate(raw["DATE QA"]), sheet_latlong: txt(raw.LATLONG), sheet_wire: up(raw.WIRE),
    sheet_others: up(raw.OTHERS), sheet_assessment: up(raw.ASSESMENT ?? raw.ASSESSMENT), sheet_inspected_by: up(raw["INSPECTED BY"]), sheet_remarks: txt(raw.REMARKS), raw, updated_at: new Date().toISOString() };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const secret = Deno.env.get("QA_SYNC_SECRET") || "";
  if (!secret || req.headers.get("x-qa-secret") !== secret) return json({ error: "unauthorized" }, 401);
  try {
    const body = await req.json();
    const rows: Record<string, unknown>[] = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length > 2000) return json({ error: "max 2000 rows per call" }, 413);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "qa" } });
    const rejected: string[] = []; const norm = [];
    for (const r of rows) { const n = normalize(r); if (n) norm.push(n); else rejected.push(JSON.stringify(r).slice(0, 80)); }
    for (let i = 0; i < norm.length; i += 500) {
      const { error } = await admin.from("sheet_rows").upsert(norm.slice(i, i + 500), { onConflict: "jo_no" });
      if (error) throw error;
    }
    const { data: created, error: e2 } = await admin.rpc("ingest_sheet_rows"); if (e2) throw e2;
    await admin.from("settings").upsert([{ key: "last_sync_at", value: new Date().toISOString() }, { key: "last_sync_rows", value: String(norm.length) }], { onConflict: "key" });
    return json({ ok: true, upserted: norm.length, audits_created: created ?? 0, rejected });
  } catch (e) { return json({ error: String((e as Error)?.message || e) }, 500); }
});
```

- [ ] **Step 2: Write the Apps Script (READ-ONLY on the sheet)**

```js
// AHBA QA — sheet → FieldOps pusher. Bound to the "FOR QA VALIDATION" spreadsheet. READS ONLY; never writes to the sheet.
// Setup: Extensions → Apps Script → paste → Project Settings → Script properties: QA_SYNC_URL, QA_SYNC_SECRET → run setupTrigger() once.
var SHEET_NAME = 'NEW COMPLETED JOS';
var WINDOW_DAYS = 60;      // rows whose JODATECLOSED is within the last N days are (re)sent every run — upsert on the server, so re-sending is safe
var BATCH = 500;

function syncNow() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('QA_SYNC_URL'), secret = props.getProperty('QA_SYNC_SECRET');
  if (!url || !secret) throw new Error('Set QA_SYNC_URL and QA_SYNC_SECRET in Script properties');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('Sheet not found: ' + SHEET_NAME);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return;
  var hdr = values[0].map(function (h) { return String(h || '').trim(); });
  var cutoff = new Date(); cutoff.setDate(cutoff.getDate() - WINDOW_DAYS);
  var iClosed = hdr.indexOf('JODATECLOSED'), iJo = hdr.indexOf('JONO');
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var v = values[r]; if (!v[iJo]) continue;
    var d = v[iClosed] instanceof Date ? v[iClosed] : (v[iClosed] ? new Date(v[iClosed]) : null);
    if (!d || isNaN(d) || d < cutoff) continue;
    var o = {};
    for (var c = 0; c < hdr.length; c++) {
      if (!hdr[c]) continue;
      var x = v[c];
      if (x instanceof Date) x = Utilities.formatDate(x, 'Asia/Manila', 'yyyy-MM-dd');
      o[hdr[c]] = x === '' ? null : x;
    }
    rows.push(o);
  }
  var sent = 0, created = 0;
  for (var i = 0; i < rows.length; i += BATCH) {
    var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', headers: { 'x-qa-secret': secret },
      payload: JSON.stringify({ rows: rows.slice(i, i + BATCH), source: 'apps-script' }), muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('Sync failed ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
    var j = JSON.parse(res.getContentText()); sent += j.upserted || 0; created += j.audits_created || 0;
  }
  Logger.log('QA sync: sent ' + sent + ' rows, ' + created + ' new audits');
}

function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'syncNow') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncNow').timeBased().everyMinutes(15).create();
  Logger.log('Trigger installed: syncNow every 15 minutes');
}
```

- [ ] **Step 3: Write the README (for the sheet owner; Taglish, step by step)**

```markdown
# QA sheet sync — install (sheet owner: sky.ahbacx@gmail.com)

Ang script ay **nagbabasa lang** ng tab `NEW COMPLETED JOS` at ipinapadala ang rows ng huling 60 araw sa FieldOps bawat 15 minuto. **Walang isusulat sa sheet.**

1. Buksan ang spreadsheet **FOR QA VALIDATION** → menu **Extensions → Apps Script**.
2. Burahin ang laman ng `Code.gs`, i-paste ang buong `qa-sheet-sync.gs`, **Save** (💾).
3. Kaliwa: ⚙ **Project Settings** → **Script properties** → Add:
   - `QA_SYNC_URL` = `https://avjzkfxgzeyxtihkofed.supabase.co/functions/v1/qa-sheet-sync`
   - `QA_SYNC_SECRET` = ang secret na ibibigay ng admin (pareho sa Edge Function secret). Huwag i-share sa chat.
4. Balik sa Editor → piliin ang function **`syncNow`** → **Run**. Sa unang run hihingi ng permission (Sheets read + external request) → **Allow**. Tingnan ang **Execution log**: dapat `QA sync: sent N rows, M new audits`.
5. Piliin ang function **`setupTrigger`** → **Run** (isang beses lang). Ito ang naglalagay ng 15-minute trigger.
6. Verify sa FieldOps console → QA Audit → Settings: "Last sync" ay dapat mag-update sa loob ng 15 minuto.

**Kung may error 401:** hindi tugma ang secret. **Kung 500:** ipadala ang Execution log sa admin. **Para itigil:** Triggers (⏰ sa kaliwa) → delete ang `syncNow` trigger.
```

- [ ] **Step 4: Lint what can be linted, commit**

Run: `node --check google-apps-script/qa-sheet-sync.gs` (valid JS) — expected OK. The Edge Function is TypeScript for Deno (no local Deno): review by eye against `send-push/index.ts` conventions; it is exercised for real only at Phase 1 with a `ZZ-` test row.

```bash
git add supabase/functions/qa-sheet-sync/index.ts google-apps-script/
git commit -m "feat(qa): qa-sheet-sync Edge Function + read-only Apps Script pusher + owner install guide"
```

---

### Task 14: Production glue (applied on the GitHub clones, branch `qa-audit`, ONLY after the owner's Phase 1/2 go)

**Files (console clone `ahba-console`):**
- Modify: `index.html` — nav item, page section, script tags
- Modify: `app.js` — `PAGE_KEYS`, `switchPage` label + init, JO Detail QA line, `roleLbl`, role `<option>`s
- Modify: `ahba-cloud.js` — `EXTRA` column list
- Add: `qa-core.js`, `qa-api.js`, `console-qa.js`
- Bump: `APP_VERSION`, `version.json`, `?v=` on new script tags

**Files (mobile clone `ahbadevt`):**
- Modify: `mobile.html` — `#qaView` container + script tags
- Modify: `mobile-a.js` — `show()` view list, `startQA()`
- Modify: `mobile-b.js` — role router line in `enterFlow`
- Add: `qa-core.js`, `qa-api.js`, `mobile-qa.js`
- Bump: `APP_VERSION`, `version.json`, `?v=`

- [ ] **Step 1: Clone both repos to the scratchpad and branch**

```bash
cd "$SCRATCH" && gh repo clone alleczandrehalili-beep/ahba-console && gh repo clone alleczandrehalili-beep/ahbadevt
cd ahba-console && git checkout -b qa-audit && cd ../ahbadevt && git checkout -b qa-audit
```

- [ ] **Step 2: Console — `index.html`**

Nav (after the `completed` item):
```html
        <button class="nav-item" data-page="qaaudit"><i data-icon="check"></i><span>QA Audit</span><b id="qaBadge" style="display:none">0</b></button>
```
Page section (before `<section id="wimsPage"`):
```html
      <section id="qaauditPage" class="page">
        <div class="page-toolbar"><div><h2>QA Audit · Field inspections</h2><p>Queue, assignment, results and weekly review of subcontractor installs.</p></div></div>
        <div id="qaRoot"></div>
      </section>
```
Scripts (after `ahba-cloud.js`):
```html
  <script src="qa-core.js?v=2026-09-XX.1"></script><script src="qa-api.js?v=2026-09-XX.1"></script><script src="console-qa.js?v=2026-09-XX.1"></script>
```
Role selects (`#cfRole` and `#scCfRole`): add `<option value="qa_inspector">QA inspector</option>`.

- [ ] **Step 3: Console — `app.js`**

`PAGE_KEYS`: append `['qaaudit','QA Audit']`.
`switchPage` labels: add `qaaudit:'QA Audit · Field inspections'`; after `if(page==='wims')initWims();` add `if(page==='qaaudit')initQA();`.
`roleLbl`: `{technician:'Technician',sales_agent:'Sales agent',security:'Security',qa_inspector:'QA inspector'}`.
Add near `initWims`:
```js
let _qaMount=null;
function initQA(){
  const rootEl=document.getElementById('qaRoot'); if(!rootEl||_qaMount||!window.dashAuthClient) return;
  const api=QaApi.create(window.dashAuthClient,{username:(window.dashUser||{}).username||'',supaUrl:SUPA_URL});
  _qaMount=ConsoleQA.mount(rootEl,{api,user:window.dashUser||{},deps:{toast:showToast,canEdit:dashCanEdit('qaaudit'),L:window.L,ensureXLSX},
    onBadge:n=>{const b=document.getElementById('qaBadge'); if(b){ b.textContent=n; b.style.display=n?'':'none'; }}});
}
```
`window.dashAuthClient` = the supabase-js client the console already creates for login (`dashAuth` at app.js:2551 — expose it with `window.dashAuthClient=dashAuth;` right where it is assigned). If the console login client is created with the anon key only, `QaApi` still works because supabase-js attaches the session token after sign-in.
JO Detail: in `openJobDetail`, after the status line, add `if(j.qa_status){ $('#jdSub').textContent+=' · QA: '+j.qa_status+(j.qa_assessment?' · '+j.qa_assessment:''); }` (uses the existing subtitle element of the detail modal; verify the id when editing the clone).

- [ ] **Step 4: Console — `ahba-cloud.js`**

Append to `EXTRA`: `'qa_audit_id','qa_status','qa_assessment','qa_inspected_at'`.

- [ ] **Step 5: Mobile — `mobile.html`**

Before `<div class="toast" id="toast"></div>`:
```html
    <!-- QA INSPECTOR -->
    <div class="hidden" id="qaView"></div>
```
Scripts (after `mobile-b.js`):
```html
  <script src="qa-core.js?v=2026-09-XX.1"></script><script src="qa-api.js?v=2026-09-XX.1"></script><script src="mobile-qa.js?v=2026-09-XX.1"></script>
```

- [ ] **Step 6: Mobile — `mobile-a.js` / `mobile-b.js`**

`show()` view list: `['loginView','pwView','shiftView','appView','saView','secView','qaView']` and `inApp` includes `view==='qaView'` (so the menu button and chat work).
Add after `startSecurity`:
```js
    let _qaMount=null;
    function startQA(){
      $('#teamName').textContent=headerName(); show('qaView'); startComms();
      if(_qaMount){ _qaMount.refresh(); return; }
      const api=QaApi.create(sb,{username:myTeam,supaUrl:SUPA_URL});
      _qaMount=MobileQA.mount($('#qaView'),{api,user:{username:myTeam,display_name:myName},deps:{toast,compressImage,buildStamp,getPos:()=>_getPos().then(p=>p&&p.coords?{lat:p.coords.latitude,lng:p.coords.longitude}:null)}});
    }
```
`enterFlow` (mobile-b.js): after the `security` line add `if(myRole==='qa_inspector'){ startQA(); return; }`.
Logout path: where `myRole` is reset on sign-out, add `if(_qaMount){ _qaMount.destroy(); _qaMount=null; }`.

- [ ] **Step 7: Version bumps + lint + push branch (no merge)**

`APP_VERSION` in `app.js` and `mobile-a.js` → next `2026-09-XX.N`; `version.json` in both repos to match; every new `?v=` equal to it.
Run in each clone: `node --check app.js ahba-cloud.js qa-core.js qa-api.js console-qa.js` / `node --check mobile-a.js mobile-b.js qa-core.js qa-api.js mobile-qa.js`.
```bash
git add -A && git commit -m "feat(qa): QA Audit page + QA inspector role (files: qa-core, qa-api, console-qa/mobile-qa) — version bump" && git push -u origin qa-audit
```
Owner merges/deploys per the rollout below. After deploy: cache-busted fetch of the deployed files, confirm `APP_VERSION` and the new script tags, open QA Audit page as a GC user.

---

## Rollout runbook (each phase = explicit owner go; nothing here runs during the dry run)

**Phase 0 — SQL (invisible to users).** Supabase SQL editor, in order: `qa-01-schema.sql` → `qa-02-seed.sql` → `qa-03-rls.sql` → `qa-04-functions.sql` → `VERIFY-qa.sql` (all OK). Dashboard → API → Exposed schemas: add `qa`. Set `initial_cutoff` in `qa.settings` (owner's choice, proposed 2026-08-01). Legacy import happens automatically on the first sync.

**Phase 1 — Console + sync.** Edge Function `qa-sheet-sync` deployed (Verify JWT OFF, secret `QA_SYNC_SECRET` set). Sheet owner installs the Apps Script (README). Task 14 console glue merged + deployed with version bump; live verify. QA Head opens QA Audit → Settings: map contractors → Queue shows subcon rows. Create inspector accounts in Access Control (role `qa_inspector`, AHBA_QA01…). Test with one `ZZ-` sheet row pushed via CSV import, then soft-delete it.

**Phase 2 — Mobile pilot.** Task 14 mobile glue merged + deployed with version bump. ONE inspector, one week, paper kept in parallel. Daily comparison app vs paper; fixes shipped as patch versions.

**Phase 3 — All QA teams.** Paper retired. Weekly review from the Reports tab. Monitor: sync age banner, queued aging, storage size of `qa-photos`.

**Phase 4 — option C (separate spec):** subcon visibility, rectification loop, automatic offense numbering, SLA, monthly scorecard.

## Self-review notes (done while writing)
- Spec coverage: data model → Task 3; config editing → Task 11; sheet mirror + ingest + legacy + FieldOps trigger + dedup → Tasks 5/6/13; inspector flow incl. NPA short form, suggested codes, quick remarks, other violations, found business, signatures, offline → Task 8; QA Head five tabs incl. sampling, board map, reopen, print, daily/weekly + export, CSV fallback, sync banner → Tasks 9–11; RLS/bucket/idempotent submit/log guard → Tasks 4–5; jobs.qa_* mirror → Tasks 3/5 and the JO Detail line in Task 14; push-on-assign is NOT wired in the dry run (needs the live `send-push` function) → add in Task 14 Step 3 at Phase 1: after a successful `assignAudits`, console calls `send-push` with `{team: inspector, title:'New QA assignment', body:n+' inspection(s) for '+date, url:'mobile.html'}` using the existing `DH()` headers.
- Naming consistency checked: `qa.audits` columns ↔ sim `newAudit` ↔ `qa-api` selects; RPC arg names `p_ids/p_inspector/p_date/p_start_seq`, `p_id/p_payload`, `p_from/p_to/p_pct` ↔ `qa-api.js` ↔ contract test; `QaApi` method list ↔ sim ↔ api ↔ UI calls (`queuePool`, `unassignAudits`, `sampleInhouse`, `reopenAudit`, `board`, `weeklyReport`, `syncStatus`, `importRows`, `photoUrl`, `subscribe`).
- Placeholders: the only intentional placeholders are the version stamps `2026-09-XX.N` in Task 14, which are chosen on deploy day.

## Post-review amendments (dry run, 2026-09-08) — the committed files supersede the code blocks above where they differ
- Task 1/2: penalty parsing = leading peso amount per offense level; `penaltyFor` has NO lower-level fallback.
- Task 3: 11 tables (not 10).
- Task 4: inspector UPDATE policy `with check` never allows `status='done'` (only `submit_audit` can finish an audit).
- Task 5: `weekly_report` rewritten with CTEs (nested aggregates removed); ingest alias `ex`; NULL-safe guards in `submit_audit` (visit, assessment, result, wire, qa_gc, subscriber name); per-id active-item check; photos fully replaced per submission and re-sent paths re-owned; acct-link prefers `source='fieldops'` + closest `jo_date_closed`; legacy visit whitelist; `sync_job` clears assessment/inspected_at when not done; `guard_log` security definer + TRUNCATE guard; `revoke execute ... from public, anon, authenticated` then explicit grants (service_role keeps only `ingest_sheet_rows`); VERIFY pins the 10 RPCs, no sequence burn, checks `pg_db_role_setting` for exposed schemas.
- Task 6: sim submit pre-validates codes (atomic); `findJob` prefers latest `updated_at`; Manila-date qfrom/qto; `assignAudits` startSeq `== null`; tests 12 (subscribe asserted, atomicity, recency).
- Task 7: `photoUrl` rejects on error; DELETE realtime payload uses `old`; `QaCore` injected at factory time; inspector/ilike sanitising.
- Task 8: signature pad `(canvas, onEnd)` with `restore/destroy`; GOOD disabled with a Fail; reopen pre-fills from `getAudit` (restored signature paths count as captured; a new stroke replaces them); `flushQueue` never touches the open sheet; retry cap 25; `destroyed` guards.
- Tasks 9–11: board prev/next reuse the map (`S.map.remove()` on tab re-entry); settings rollback on failed save; view-only keeps the catalog filter; single 2-minute fallback poll; board sequence input (reorder); 1,000-row cap notes; `esc(c.kind)`.
- Task 12: browser walkthrough 10/10 PASS; reopen round-trip verified by the controller.
- Final review (READY WITH FOLLOW-UPS) fixes in 3c704ca: `qa.is_head()` = GC **console** user (`is_console()`) or platform admin; `qa.sheet_rows` head-only (PII); `qa.audits` added to `supabase_realtime`; inspector UPDATE policy on audits retired (RPC-only); `ingest_sheet_rows` gated (head/service role) and links JONO-matched FieldOps audits (fills blanks, sets `sheet_row_jo`); non-VISITED submit clears assessment fields; `sync_status` ignores null names; `qa-api` update strips identity/timestamp columns; qfrom Manila offset; mobile thumbs shrunk to 160px after upload; error classifier matches "not assigned". Still open (later phases): soft-delete UI for audits, acct-only trigger dedup (spec decision), searchable code picker, `qa.actor()` for console users = email local part, WINDOW_DAYS hardcoded in Apps Script.
