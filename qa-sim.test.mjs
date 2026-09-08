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
