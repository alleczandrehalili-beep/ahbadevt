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

test('FieldOps audit WITH job_order_no gets linked and blank-filled when the sheet row arrives', async () => {
  const api = mk();
  api._completeJob({ id: 'JO-9', job_order_no: 'R9000030', ibass_acct_no: '1000000000030', status: 'completed', assigned_org_code: 'J2', subscriber: 'X' });
  await api.importRows([SHEET({ JONO: 'R9000030', ACCTNO: '1000000000030', NAPCODE: 'NAP-30' })]);
  const all = await api.listAudits({});
  assert.equal(all.total, 1);
  assert.equal(all.rows[0].sheet_row_jo, 'R9000030'); assert.equal(all.rows[0].nap_code, 'NAP-30'); assert.equal(all.rows[0].source, 'fieldops');
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
  // Phase C: a failed VISITED submit opens a rectification loop, which then owns jobs.qa_status (mirrors qa.sync_job_rect)
  assert.equal(job(api, 'JO-5').qa_status, 'FOR RECTIFICATION'); assert.equal(job(api, 'JO-5').qa_assessment, 'FOR RECTIFY');
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

test('non-VISITED submit clears assessment fields even if the draft carried them', async () => {
  const api = mk();
  await api.importRows([SHEET({ JONO: 'R9000031', ACCTNO: '1000000000031' })]);
  const id = (await api.listAudits({ status: ['queued'] })).rows[0].id;
  await api.assignAudits([id], { inspector: 'AHBA_QA01', date: '2026-09-08', by: 'HEAD' });
  await api.startAudit(id, {});
  const r = await api.submitAudit(id, { submit_key: 'v', visit_status: 'H.CLOSED', remarks: 'sarado', wire: 'STANDARD', assessment: 'GOOD', photos: [{ path: 'qa/' + id + '/x.jpg' }] });
  assert.equal(r.audit.wire, null); assert.equal(r.audit.assessment, null);
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
  await api.assignAudits([ids[1]], { inspector: 'AHBA_QA02', date: '2026-09-09', by: 'HEAD' });
  assert.equal(events.length, 1); assert.equal(events[0].type, 'audit'); assert.equal(events[0].row.id, ids[1]); assert.equal(events[0].row.assigned_to, 'AHBA_QA02');
  off();
  await api.unassignAudits([ids[1]], { by: 'HEAD' });
  assert.equal(events.length, 1);   // no events after unsubscribe
});

test('a rejected submit (unknown violation code) leaves no child rows behind', async () => {
  const api = mk();
  await api.importRows([SHEET({ JONO: 'R9000012', ACCTNO: '1000000000012' })]);
  const id = (await api.listAudits({ status: ['queued'] })).rows[0].id;
  await api.assignAudits([id], { inspector: 'AHBA_QA01', date: '2026-09-08', by: 'HEAD' });
  await api.startAudit(id, {});
  const cfg = await api.getConfig();
  const items = cfg.checklist.map((c, i) => ({ item_id: c.id, result: i === 0 ? 'fail' : 'pass' }));
  const bad = { submit_key: 'bad', visit_status: 'VISITED', assessment: 'FOR PENALTY', wire: 'STANDARD', qa_gc: 'COMPLETED', items,
    violations: [{ code: 'HA001', item_id: cfg.checklist[0].id }, { code: 'NOPE-999', item_id: cfg.checklist[0].id }],
    photos: [{ path: 'qa/' + id + '/p.jpg', item_id: cfg.checklist[0].id }], subscriber_signed_name: 'A', subscriber_signature_path: 's', inspector_signature_path: 'i' };
  await assert.rejects(api.submitAudit(id, bad), /Unknown violation code/);
  const d = await api.getAudit(id);
  assert.equal(d.audit.status, 'in_progress'); assert.equal(d.items.length, 0); assert.equal(d.violations.length, 0); assert.equal(d.photos.length, 0);
});

test('findJob prefers the most recently updated JO on an acct-only match', async () => {
  const api = mk();
  api._db.jobs.push({ id: 'JO-OLD', job_order_no: null, ibass_acct_no: '1000000000020', status: 'completed', updated_at: '2026-05-01T00:00:00Z' });
  api._db.jobs.push({ id: 'JO-NEW', job_order_no: null, ibass_acct_no: '1000000000020', status: 'completed', updated_at: '2026-08-01T00:00:00Z' });
  await api.importRows([SHEET({ JONO: 'R9000020', ACCTNO: '1000000000020' })]);
  assert.equal((await api.listAudits({})).rows[0].job_id, 'JO-NEW');
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

async function assignedAudit(sim, comp) {
  const { rows } = await sim.listAudits({ status: ['queued'], contractor: comp });
  await sim.assignAudits([rows[0].id], { inspector: 'AHBA_QA01', date: '2026-09-09', by: 'HEAD' });
  return rows[0].id;
}
function payload(sim, id, fails, key) {
  const items = sim._db.checklist.map((c, i) => ({ item_id: c.id, result: i < fails ? 'fail' : 'pass' }));
  const photos = items.filter(i => i.result === 'fail').map(i => ({ item_id: i.item_id, path: 'qa/' + id + '/p' + i.item_id + '.jpg', label: 'x' }));
  const violations = items.filter(i => i.result === 'fail').map(i => ({ item_id: i.item_id, code: 'HA001' }));
  return { submit_key: key || ('k' + Math.random()), visit_status: 'VISITED', items, photos, violations, assessment: fails ? 'FOR RECTIFY' : 'GOOD', wire: 'STANDARD', qa_gc: 'COMPLETED',
    subscriber_signed_name: 'S', subscriber_signature_path: 'qa/' + id + '/s.png', inspector_signature_path: 'qa/' + id + '/i.png' };
}

test('loop: failed submit opens FOR RECTIFICATION with default deadline, notice, JO mirror; GOOD opens nothing', async () => {
  let t = new Date('2026-09-09T02:00:00Z'); const sim = Sim.create({ now: () => t, seed: Sim.demoSeed() });
  sim._db.contractors.find(c => c.sheet_name === 'J2').org_id = 'ORG-J2';
  sim._db.audits.forEach(a => { if (a.contractor_name === 'J2') a.contractor_org_id = 'ORG-J2'; });   // contractor_org_id is frozen on the audit at ingest time (mirrors qa.ingest_sheet_rows) — resync like the listRectifications test below
  const id = await assignedAudit(sim, 'J2');
  await sim.startAudit(id, {});
  const r = await sim.submitAudit(id, payload(sim, id, 2));
  const { rectification } = await sim.getAudit(id);
  assert.equal(rectification.status, 'FOR RECTIFICATION'); assert.equal(rectification.cycle, 1);
  assert.equal(rectification.deadline, '2026-09-16'); assert.match(rectification.id, /^RC-2026-\d{6}$/);
  assert.equal(r.audit.rectification_id, rectification.id);
  assert.equal(sim._db.notices.filter(n => n.org_id === 'ORG-J2' && n.kind === 'opened').length, 1);
  const good = await assignedAudit(sim, 'AVELINE'); await sim.submitAudit(good, payload(sim, good, 0));
  assert.equal((await sim.getAudit(good)).rectification, null);
  // Phase A mirror still holds for a loop-less done audit: no rectification means jobs.qa_status stays the plain visit-status mirror.
  const goodAudit = sim._db.audits.find(x => x.id === good);
  const withJob = goodAudit.job_id ? goodAudit : sim._db.audits.find(x => x.job_id && x.status === 'done' && !x.rectification_id);
  assert.ok(withJob, 'demo seed gives jobs to the first 20 sheet rows — expected at least one loop-less done audit with a job_id');
  const j = job(sim, withJob.job_id);
  assert.ok(j);
  assert.equal(j.qa_status, 'VISITED');
});

test('NPA: a failed VISITED / NPA inspection stores items + assessment and opens the loop', async () => {
  let t = new Date('2026-09-09T02:00:00Z'); const sim = Sim.create({ now: () => t, seed: Sim.demoSeed() });
  const id = await assignedAudit(sim, 'J2');
  await sim.startAudit(id, {});
  const p = payload(sim, id, 1);
  // subscriber absent: no name, no subscriber signature, no location photo — the checklist still applies
  delete p.subscriber_signed_name; delete p.subscriber_signature_path;
  const r = await sim.submitAudit(id, { ...p, visit_status: 'VISITED / NPA' });
  assert.equal(r.audit.visit_status, 'VISITED / NPA');
  assert.equal(r.audit.assessment, 'FOR RECTIFY'); assert.equal(r.audit.wire, 'STANDARD'); assert.equal(r.audit.qa_gc, 'COMPLETED');
  assert.equal(r.audit.subscriber_signature_path, null);
  assert.equal(sim._db.items.filter(i => i.audit_id === id).length, sim._db.checklist.length);
  assert.equal(r.audit.total_violations, 1);
  const { rectification } = await sim.getAudit(id);
  assert.ok(rectification, 'an NPA visit with a fail opens a rectification loop');
  assert.equal(rectification.status, 'FOR RECTIFICATION'); assert.equal(rectification.cycle, 1); assert.equal(rectification.deadline, '2026-09-16');
  // the inspector signature is still required on an NPA visit
  const id2 = await assignedAudit(sim, 'AVELINE');
  const p2 = payload(sim, id2, 0); delete p2.subscriber_signed_name; delete p2.subscriber_signature_path;
  await assert.rejects(sim.submitAudit(id2, { ...p2, visit_status: 'VISITED / NPA', inspector_signature_path: null }), /[Ii]nspector/);
});

test('NPA: a clean VISITED / NPA inspection stores GOOD, opens nothing, and mirrors qa_status on the JO', async () => {
  let t = new Date('2026-09-09T02:00:00Z'); const sim = Sim.create({ now: () => t, seed: Sim.demoSeed() });
  const withJob = (await sim.listAudits({ status: ['queued'] })).rows.filter(a => a.job_id)[0];
  assert.ok(withJob, 'demo seed links the first sheet rows to JOs');
  await sim.assignAudits([withJob.id], { inspector: 'AHBA_QA01', date: '2026-09-09', by: 'HEAD' });
  const p = payload(sim, withJob.id, 0); delete p.subscriber_signed_name; delete p.subscriber_signature_path;
  const r = await sim.submitAudit(withJob.id, { ...p, visit_status: 'VISITED / NPA' });
  assert.equal(r.audit.assessment, 'GOOD');
  assert.equal((await sim.getAudit(withJob.id)).rectification, null);
  assert.equal(job(sim, withJob.job_id).qa_status, 'VISITED / NPA');
  assert.equal(job(sim, withJob.job_id).qa_assessment, 'GOOD');
  // Commercial is Yes/No only: found_business must be a valid value even on an NPA visit
  const id2 = await assignedAudit(sim, 'AVELINE');
  const p2 = payload(sim, id2, 0); delete p2.subscriber_signed_name; delete p2.subscriber_signature_path;
  await assert.rejects(sim.submitAudit(id2, { ...p2, visit_status: 'VISITED / NPA', found_business: 'bogus' }), /Invalid found_business/);
  const ok = await sim.submitAudit(id2, { ...p2, visit_status: 'VISITED / NPA', found_business: 'yes', new_plan: 'BIZ 100' });
  assert.equal(ok.audit.found_business, 'yes'); assert.equal(ok.audit.new_plan, 'BIZ 100');
});

test('loop: assign re-inspection → new audit source=reinspection; GOOD closes as RECTIFIED; head cannot close RECTIFIED', async () => {
  let t = new Date('2026-09-09T02:00:00Z'); const sim = Sim.create({ now: () => t, seed: Sim.demoSeed() });
  const id = await assignedAudit(sim, 'J2'); await sim.submitAudit(id, payload(sim, id, 1));
  const rect = (await sim.getAudit(id)).rectification;
  const re = await sim.assignReinspection(rect.id, { inspector: 'AHBA_QA02', date: '2026-09-12', by: 'HEAD' });
  assert.equal(re.source, 'reinspection'); assert.equal(re.reinspection_of, id); assert.equal(re.rectification_id, rect.id); assert.equal(re.status, 'assigned');
  assert.equal((await sim.getRectification(rect.id)).rect.status, 'FOR RE-INSPECTION');
  const mine = await sim.listMyAudits('AHBA_QA02'); assert.equal(mine[0].id, re.id);
  const prev = (await sim.getAudit(re.id)).previous; assert.equal(prev.audit.id, id); assert.equal(prev.violations.length, 1);
  await sim.submitAudit(re.id, payload(sim, re.id, 0));
  const done = await sim.getRectification(rect.id);
  assert.equal(done.rect.status, 'RECTIFIED'); assert.equal(done.rect.last_audit_id, re.id); assert.equal(done.audits.length, 2);
  const rectJob = job(sim, done.rect.job_id); if (rectJob) assert.equal(rectJob.qa_status, 'RECTIFIED');
  await assert.rejects(sim.closeRectification(rect.id, 'x'), /not open/);
});

test('loop: a RECTIFIED re-inspection reopened by the head and resubmitted with a fail returns the loop to FOR RECTIFICATION in place', async () => {
  let t = new Date('2026-09-09T02:00:00Z'); const sim = Sim.create({ now: () => t, seed: Sim.demoSeed() });
  sim._db.contractors.find(c => c.sheet_name === 'J2').org_id = 'ORG-J2';
  sim._db.audits.forEach(a => { if (a.contractor_name === 'J2') a.contractor_org_id = 'ORG-J2'; });   // frozen at ingest — resync so the notice path is live
  const id = await assignedAudit(sim, 'J2'); await sim.submitAudit(id, payload(sim, id, 1));
  const rect = (await sim.getAudit(id)).rectification;
  const re = await sim.assignReinspection(rect.id, { inspector: 'AHBA_QA02', date: '2026-09-12', by: 'HEAD' });
  t = new Date('2026-09-12T02:00:00Z');
  await sim.submitAudit(re.id, payload(sim, re.id, 0));
  let r = (await sim.getRectification(rect.id)).rect;
  assert.equal(r.status, 'RECTIFIED'); assert.ok(r.rectified_at); assert.equal(r.cycle, 1);
  const deadline = r.deadline;
  const opened = () => sim._db.notices.filter(n => n.rectification_id === rect.id && n.kind === 'opened').length;
  const openedBefore = opened();

  // the head spots the mistake, reopens that same re-inspection, and the inspector resubmits it WITH a fail
  await sim.reopenAudit(re.id, { by: 'HEAD', reason: 'photo shows the drop wire still sagging' });
  t = new Date('2026-09-13T02:00:00Z');
  await sim.submitAudit(re.id, payload(sim, re.id, 1));
  r = (await sim.getRectification(rect.id)).rect;
  assert.equal(r.status, 'FOR RECTIFICATION', 'the corrected outcome reopens the loop instead of being ignored as a late submit');
  assert.equal(r.cycle, 1, 'a correction does not burn a cycle');
  assert.equal(r.deadline, deadline, 'and does not push the deadline out');
  assert.equal(r.rectified_at, null);
  assert.equal(r.last_audit_id, re.id);
  assert.equal(sim._db.log.filter(l => l.audit_id === re.id && l.action === 'rect_resubmit').length, 1);
  assert.equal(sim._db.log.filter(l => l.audit_id === re.id && l.action === 'rect_ignored_late_submit').length, 0);
  assert.equal(opened(), openedBefore + 1, 'the reopened loop is a real state change → exactly one new "opened" notice');
  const j = r.job_id && job(sim, r.job_id); if (j) assert.equal(j.qa_status, 'FOR RECTIFICATION');

  // correcting it back the other way still works: resubmit GOOD → RECTIFIED again, same cycle
  await sim.reopenAudit(re.id, { by: 'HEAD', reason: 'wrong photo attached' });
  await sim.submitAudit(re.id, payload(sim, re.id, 0));
  r = (await sim.getRectification(rect.id)).rect;
  assert.equal(r.status, 'RECTIFIED'); assert.equal(r.cycle, 1); assert.ok(r.rectified_at);
});

test('loop: failed re-inspection → cycle 2 with a fresh deadline; unassign pending re-inspection returns to FOR RECTIFICATION; close requires reason', async () => {
  let t = new Date('2026-09-09T02:00:00Z'); const sim = Sim.create({ now: () => t, seed: Sim.demoSeed() });
  const id = await assignedAudit(sim, 'J2'); await sim.submitAudit(id, payload(sim, id, 1));
  const rect = (await sim.getAudit(id)).rectification;
  const re = await sim.assignReinspection(rect.id, { inspector: 'AHBA_QA02', date: '2026-09-12', by: 'HEAD' });
  t = new Date('2026-09-12T02:00:00Z');
  await sim.submitAudit(re.id, payload(sim, re.id, 1));
  let r = (await sim.getRectification(rect.id)).rect;
  assert.equal(r.status, 'FOR RECTIFICATION'); assert.equal(r.cycle, 2); assert.equal(r.deadline, '2026-09-19');
  const re2 = await sim.assignReinspection(rect.id, { inspector: 'AHBA_QA02', date: '2026-09-15', by: 'HEAD' });
  await sim.unassignAudits([re2.id], { by: 'HEAD' });
  r = (await sim.getRectification(rect.id)).rect; assert.equal(r.status, 'FOR RECTIFICATION');
  assert.ok(sim._db.audits.find(a => a.id === re2.id).deleted_at, 'released re-inspection is retired');
  await sim.setRectDeadline(rect.id, '2026-09-25', 'materials on order', { by: 'HEAD' });
  assert.equal((await sim.getRectification(rect.id)).rect.deadline, '2026-09-25');
  assert.equal(sim._db.notices.filter(n => n.kind === 'deadline').length, 0, 'J2 has no org in this test → no notice');
  await assert.rejects(sim.closeRectification(rect.id, ''), /Reason/);
  const closed = await sim.closeRectification(rect.id, 'Subscriber disconnected', { by: 'HEAD' });
  assert.equal(closed.status, 'CLOSED'); assert.equal(closed.close_reason, 'Subscriber disconnected');
  const closedJob = job(sim, closed.job_id); if (closedJob) assert.equal(closedJob.qa_status, 'CLOSED BY HEAD');
});

test('offense: 2nd audit with same contractor+code within 12 months → offense 2 / level-2 penalty; same code twice in one audit shares offense; other contractor stays at 1', async () => {
  let t = new Date('2026-09-09T02:00:00Z'); const sim = Sim.create({ now: () => t, seed: Sim.demoSeed() });
  const a1 = await assignedAudit(sim, 'J2'); await sim.submitAudit(a1, payload(sim, a1, 2));  // two HA001 in one audit
  let v = sim._db.violations.filter(x => x.audit_id === a1); assert.deepEqual(v.map(x => x.offense_no), [1, 1]); assert.equal(v[0].penalty_amount, 500);
  t = new Date('2026-09-10T02:00:00Z');
  const a2 = await assignedAudit(sim, 'J2'); await sim.submitAudit(a2, payload(sim, a2, 1));
  v = sim._db.violations.filter(x => x.audit_id === a2); assert.equal(v[0].offense_no, 2); assert.equal(v[0].penalty_amount, 1000);
  t = new Date(t.getTime() + 1000);   // advance past a2's inspected_at — offenseNo's as-of upper bound excludes rows at/after "now" (mirrors a real request's now() always being later than a prior transaction's)
  const prev = await sim.offensePreview('J2', ['HA001', 'PR003']);
  assert.equal(prev.HA001.offense_no, 3); assert.equal(prev.HA001.penalty_amount, 2000); assert.equal(prev.PR003.offense_no, 1);
  const b1 = await assignedAudit(sim, 'RIA'); await sim.submitAudit(b1, payload(sim, b1, 1));
  assert.equal(sim._db.violations.find(x => x.audit_id === b1).offense_no, 1);
});

test('override: head sets amount with reason, total_penalty recomputed, offense_no untouched; recomputeOffenses keeps overrides', async () => {
  let t = new Date('2026-09-09T02:00:00Z'); const sim = Sim.create({ now: () => t, seed: Sim.demoSeed() });
  const a1 = await assignedAudit(sim, 'J2'); await sim.submitAudit(a1, payload(sim, a1, 2));
  const vid = sim._db.violations.find(x => x.audit_id === a1).id;
  await assert.rejects(sim.overridePenalty(vid, 0, ''), /Reason/);
  const r = await sim.overridePenalty(vid, 0, 'First-time coaching', { by: 'HEAD' });
  assert.equal(r.total_penalty, 500); assert.equal(r.violation.penalty_override, 0); assert.equal(r.violation.offense_no, 1);
  const rc = await sim.recomputeOffenses(); assert.equal(rc.audits, 1); assert.equal(rc.violations, 2);
  assert.equal(sim._db.violations.find(x => x.id === vid).penalty_override, 0);
  assert.equal(sim._db.audits.find(a => a.id === a1).total_penalty, 500);
});

test('listRectifications filters (status, overdue, org) and subcon-mode sim only sees own org; notices unseen/seen', async () => {
  let t = new Date('2026-09-09T02:00:00Z'); const sim = Sim.create({ now: () => t, seed: Sim.demoSeed() });
  sim._db.contractors.find(c => c.sheet_name === 'J2').org_id = 'ORG-J2'; sim._db.contractors.find(c => c.sheet_name === 'RIA').org_id = 'ORG-RIA';
  sim._db.audits.forEach(a => { const c = sim._db.contractors.find(x => x.sheet_name === a.contractor_name); if (c) a.contractor_org_id = c.org_id; });
  const a = await assignedAudit(sim, 'J2'); await sim.submitAudit(a, payload(sim, a, 1));
  const b = await assignedAudit(sim, 'RIA'); await sim.submitAudit(b, payload(sim, b, 1));
  assert.equal((await sim.listRectifications({})).total, 2);
  assert.equal((await sim.listRectifications({ org_id: 'ORG-J2' })).total, 1);
  t = new Date('2026-09-20T02:00:00Z');
  assert.equal((await sim.listRectifications({ overdue: true })).total, 2);
  assert.equal((await sim.listRectifications({ status: ['RECTIFIED'] })).total, 0);
  const sub = Sim.create({ now: () => t, org: 'ORG-J2', db: sim._db });   // subcon-mode view over the same store
  assert.equal((await sub.listRectifications({})).total, 1);
  const j2RectId = sim._db.rectifications.find(r => r.contractor_org_id === 'ORG-J2').id;
  await assert.rejects(sub.getRectification(sim._db.rectifications.find(r => r.contractor_org_id === 'ORG-RIA').id), /not found/);
  assert.equal(await sub.noticesUnseen(), 1); assert.equal(await sub.markNoticesSeen(), 1); assert.equal(await sub.noticesUnseen(), 0);
  // subcon strip parity (mirrors qa.rectification_bundle's column exclusions)
  const subBundle = await sub.getRectification(j2RectId);
  const subAudit = subBundle.audits[0].audit;
  ['subscriber_signature_path', 'inspector_signature_path', 'subscriber_signed_name', 'lat', 'lng', 'sheet_latlong', 'submit_key', 'contractor_rep', 'mobile_no']
    .forEach(k => assert.ok(!(k in subAudit), 'subcon bundle audit should not carry ' + k));
  const headBundle = await sim.getRectification(j2RectId);
  assert.ok('subscriber_signed_name' in headBundle.audits[0].audit, 'head bundle audit should keep subscriber_signed_name');
  // subcon-mode boundary: head-only / RLS-guarded methods reject, getConfig/listInspectors mirror the narrowed RLS
  await assert.rejects(sub.listAudits({}), /Not allowed/);
  await assert.rejects(sub.submitAudit('x', {}), /Not allowed/);
  assert.deepEqual((await sub.getConfig()).codes, []);
  assert.deepEqual(await sub.listInspectors(), []);
  // subscribers are shared across create() calls over the same store: a callback registered on the subcon
  // instance must still fire when the head instance opens a new loop (mirrors the demo's live subcon toast).
  let fired = 0;
  const unsubNotices = sub.subscribeNotices(() => { fired++; });
  const c = await assignedAudit(sim, 'J2'); await sim.submitAudit(c, payload(sim, c, 1));
  assert.equal(fired, 1);
  unsubNotices();
});

test('monthlyScorecard: per-contractor counts, penalty uses overrides, re-inspections excluded from inspected, rect on-time/late', async () => {
  let t = new Date('2026-09-09T02:00:00Z'); const sim = Sim.create({ now: () => t, seed: Sim.demoSeed() });
  sim._db.audits = sim._db.audits.filter(x => !(x.contractor_name === 'J2' && x.status === 'done'));   // demoSeed() plants one legacy J2 audit this month; isolate this test's own 2-inspection scenario
  const a = await assignedAudit(sim, 'J2'); await sim.submitAudit(a, payload(sim, a, 1));
  const rect = (await sim.getAudit(a)).rectification;
  const re = await sim.assignReinspection(rect.id, { inspector: 'AHBA_QA02', date: '2026-09-12', by: 'HEAD' });
  t = new Date('2026-09-12T02:00:00Z'); await sim.submitAudit(re.id, payload(sim, re.id, 0));
  const g = await assignedAudit(sim, 'J2'); await sim.submitAudit(g, payload(sim, g, 0));
  await sim.overridePenalty(sim._db.violations.find(x => x.audit_id === a).id, 250, 'partial', { by: 'HEAD' });
  const rows = await sim.monthlyScorecard('2026-09-01');
  const j2 = rows.find(r => r.contractor === 'J2');
  assert.equal(j2.inspected, 2); assert.equal(j2.good, 1); assert.equal(j2.rectify, 1); assert.equal(j2.violations, 1); assert.equal(j2.penalty, 250); assert.equal(j2.overrides, 1);
  assert.equal(j2.rect_opened, 1); assert.equal(j2.rect_on_time, 1); assert.equal(j2.rect_late, 0); assert.equal(j2.rect_open_end, 0);
  assert.equal(j2.top_codes[0].code, 'HA001'); assert.ok(j2.closed >= 2);
  assert.ok(rows.every(r => r.kind === 'inhouse' ? rows.indexOf(r) === rows.length - 1 || rows[rows.indexOf(r) + 1].kind === 'inhouse' : true), 'subcons first');
});

test('redispatch: an in_progress ticket can be assigned to another inspector (started_at cleared, log reassigned); district filter', async () => {
  const sim = Sim.create({ seed: Sim.demoSeed() });
  const { rows } = await sim.listAudits({ status: ['queued'], district: '2' });
  assert.ok(rows.length > 0); assert.ok(rows.every(a => ['BAGONG SILANGAN', 'BATASAN HILLS', 'COMMONWEALTH', 'HOLY SPIRIT', 'PAYATAS'].includes(a.barangay)));
  assert.equal((await sim.listAudits({ status: ['queued'], district: '9' })).total, 0);
  const id = rows[0].id;
  await sim.assignAudits([id], { inspector: 'AHBA_QA01', date: '2026-09-09', by: 'HEAD' });
  await sim.startAudit(id, { lat: 1, lng: 2 });
  assert.equal(await sim.assignAudits([id], { inspector: 'AHBA_QA02', date: '2026-09-10', by: 'HEAD' }), 1);
  const a = sim._db.audits.find(x => x.id === id);
  assert.equal(a.status, 'assigned'); assert.equal(a.assigned_to, 'AHBA_QA02'); assert.equal(a.started_at, null); assert.equal(a.inspector, null);
  assert.equal(sim._db.log.filter(l => l.audit_id === id && l.action === 'reassigned').length, 1);
  assert.equal((await sim.listMyAudits('AHBA_QA01')).some(x => x.id === id), false);
  assert.equal((await sim.listMyAudits('AHBA_QA02')).some(x => x.id === id), true);
  // same-inspector re-sequence of an in_progress ticket: status stays in_progress, inspector/started_at untouched
  await sim.startAudit(id, { lat: 3, lng: 4 });
  assert.equal(sim._db.audits.find(x => x.id === id).status, 'in_progress');
  assert.equal(await sim.assignAudits([id], { inspector: 'AHBA_QA02', date: '2026-09-10', startSeq: 5, by: 'HEAD' }), 1);
  const a2 = sim._db.audits.find(x => x.id === id);
  assert.equal(a2.status, 'in_progress'); assert.equal(a2.inspector, 'AHBA_QA02'); assert.ok(a2.started_at); assert.equal(a2.sequence, 5);
});
