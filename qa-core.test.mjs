import { test } from 'node:test';
import assert from 'node:assert/strict';
const C = (await import('./qa-core.js')).default ?? require('./qa-core.js');
const Core = C; // alias — Task 2 brief's tests refer to the module as `Core`

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
  assert.equal(C.normalizeSheetRow({JONO:'R1', JODATECLOSED:'30/07/2026'}).jo_date_closed, null);   // DD/MM paste → not a valid date, row kept
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


test('offenseNo counts distinct prior done audits of same contractor+code within 12 months, excluding the current audit and legacy rows', () => {
  const now = '2026-09-09T00:00:00Z';
  const rows = [
    { audit_id: 'A1', code: 'HA001', contractor_name: 'J2', status: 'done', source: 'sheet', deleted_at: null, inspected_at: '2026-08-01T00:00:00Z' },
    { audit_id: 'A1', code: 'HA001', contractor_name: 'J2', status: 'done', source: 'sheet', deleted_at: null, inspected_at: '2026-08-01T00:00:00Z' }, // same audit twice → one offense
    { audit_id: 'A2', code: 'HA001', contractor_name: 'J2', status: 'done', source: 'fieldops', deleted_at: null, inspected_at: '2026-07-01T00:00:00Z' },
    { audit_id: 'A3', code: 'HA001', contractor_name: 'J2', status: 'done', source: 'sheet', deleted_at: null, inspected_at: '2025-08-01T00:00:00Z' }, // > 12 months
    { audit_id: 'A4', code: 'HA001', contractor_name: 'RIA', status: 'done', source: 'sheet', deleted_at: null, inspected_at: '2026-08-01T00:00:00Z' }, // other contractor
    { audit_id: 'A5', code: 'HA001', contractor_name: 'J2', status: 'in_progress', source: 'sheet', deleted_at: null, inspected_at: null },
    { audit_id: 'A6', code: 'HA001', contractor_name: 'J2', status: 'done', source: 'sheet_legacy', deleted_at: null, inspected_at: '2026-08-15T00:00:00Z' }, // legacy never counts
    { audit_id: 'A7', code: 'HA001', contractor_name: 'J2', status: 'done', source: 'sheet', deleted_at: '2026-08-20T00:00:00Z', inspected_at: '2026-08-15T00:00:00Z' },
    { audit_id: 'CUR', code: 'HA001', contractor_name: 'J2', status: 'done', source: 'sheet', deleted_at: null, inspected_at: '2026-09-09T00:00:00Z' }
  ];
  assert.equal(Core.offenseNo(rows, 'J2', 'HA001', 'CUR', now), 3);
  assert.equal(Core.offenseNo(rows, 'J2', 'PR003', 'CUR', now), 1);
  assert.equal(Core.offenseNo([], 'J2', 'HA001', null, now), 1);
});

test('offenseNo window: rows at/after the as-of time never count; the floor clamps on a leap day', () => {
  const now = '2026-09-09T00:00:00Z';
  const afterRows = [
    { audit_id: 'A2', code: 'HA001', contractor_name: 'J2', status: 'done', source: 'sheet', deleted_at: null, inspected_at: '2026-09-10T00:00:00Z' } // one day AFTER nowIso → must not count
  ];
  assert.equal(Core.offenseNo(afterRows, 'J2', 'HA001', 'CUR', now), 1);

  const leapNow = '2024-02-29T12:00:00Z';
  const onFloorRows = [
    { audit_id: 'A3', code: 'HA001', contractor_name: 'J2', status: 'done', source: 'sheet', deleted_at: null, inspected_at: '2023-02-28T12:00:00Z' } // SQL floor: 2023-02-28
  ];
  assert.equal(Core.offenseNo(onFloorRows, 'J2', 'HA001', 'CUR', leapNow), 2);

  const belowFloorRows = [
    { audit_id: 'A4', code: 'HA001', contractor_name: 'J2', status: 'done', source: 'sheet', deleted_at: null, inspected_at: '2023-02-27T12:00:00Z' } // one day before the floor → must not count
  ];
  assert.equal(Core.offenseNo(belowFloorRows, 'J2', 'HA001', 'CUR', leapNow), 1);

  const inclusiveNow = '2026-09-09T00:00:00Z';
  const inclusiveFloorRows = [
    { audit_id: 'A5', code: 'HA001', contractor_name: 'J2', status: 'done', source: 'sheet', deleted_at: null, inspected_at: '2025-09-09T00:00:00Z' } // exactly at the floor → inclusive, counts
  ];
  assert.equal(Core.offenseNo(inclusiveFloorRows, 'J2', 'HA001', 'CUR', inclusiveNow), 2);
});

test('effectivePenalty: override wins, null override falls back, nothing → 0', () => {
  assert.equal(Core.effectivePenalty({ penalty_amount: 500, penalty_override: 0 }), 0);
  assert.equal(Core.effectivePenalty({ penalty_amount: 500, penalty_override: null }), 500);
  assert.equal(Core.effectivePenalty({ penalty_amount: null }), 0);
});

test('rectNext: first fail opens, GOOD re-inspection rectifies, failed re-inspection cycles, NPA never moves the loop', () => {
  assert.deepEqual(Core.rectNext(null, { type: 'submit', visit_status: 'VISITED', fails: 2 }), { status: 'FOR RECTIFICATION', cycle: 1, rectified: false });
  assert.equal(Core.rectNext(null, { type: 'submit', visit_status: 'VISITED', fails: 0 }), null);
  assert.equal(Core.rectNext(null, { type: 'submit', visit_status: 'VISITED / NPA', fails: 0 }), null);
  const open = { status: 'FOR RE-INSPECTION', cycle: 1 };
  assert.deepEqual(Core.rectNext(open, { type: 'submit', visit_status: 'VISITED', fails: 0, reinspection: true }), { status: 'RECTIFIED', cycle: 1, rectified: true });
  assert.deepEqual(Core.rectNext(open, { type: 'submit', visit_status: 'VISITED', fails: 1, reinspection: true }), { status: 'FOR RECTIFICATION', cycle: 2, rectified: false });
  assert.equal(Core.rectNext(open, { type: 'submit', visit_status: 'VISITED', fails: 0, reinspection: false }), null, 'a reopened original never rectifies');
  assert.equal(Core.rectNext(open, { type: 'submit', visit_status: 'UNLOCATED', fails: 0, reinspection: true }), null);
  assert.deepEqual(Core.rectNext({ status: 'FOR RECTIFICATION', cycle: 1 }, { type: 'assign' }), { status: 'FOR RE-INSPECTION', cycle: 1, rectified: false });
  assert.deepEqual(Core.rectNext(open, { type: 'unassign' }), { status: 'FOR RECTIFICATION', cycle: 1, rectified: false });
  assert.deepEqual(Core.rectNext(open, { type: 'close' }), { status: 'CLOSED', cycle: 1, rectified: false });
  assert.equal(Core.rectNext({ status: 'RECTIFIED', cycle: 1 }, { type: 'close' }), null);
  assert.equal(Core.rectNext({ status: 'CLOSED', cycle: 2 }, { type: 'submit', visit_status: 'VISITED', fails: 1, reinspection: true }), null);
});

test('rectNext: a reopened RECTIFIED re-inspection resubmitted with fails reopens the loop in place; every other terminal read stays null', () => {
  const rectified = { status: 'RECTIFIED', cycle: 3 };
  const ev = (o) => Object.assign({ type: 'submit', visit_status: 'VISITED', reinspection: true }, o);
  // the audit that rectified the loop was reopened and now fails → back to FOR RECTIFICATION, SAME cycle
  assert.deepEqual(Core.rectNext(rectified, ev({ sameAudit: true, fails: 1 })),
    { status: 'FOR RECTIFICATION', cycle: 3, rectified: false, reopened: true });
  // a DIFFERENT (late) audit submitting against a rectified loop changes nothing
  assert.equal(Core.rectNext(rectified, ev({ sameAudit: false, fails: 1 })), null);
  // CLOSED is terminal even for the loop's own last audit — only the head reopens a closed loop
  assert.equal(Core.rectNext({ status: 'CLOSED', cycle: 3 }, ev({ sameAudit: true, fails: 1 })), null);
  // a corrected resubmit that is still GOOD leaves the loop RECTIFIED
  assert.equal(Core.rectNext(rectified, ev({ sameAudit: true, fails: 0 })), null);
  // and the guards still hold: not a re-inspection, or not actually visited
  assert.equal(Core.rectNext(rectified, ev({ sameAudit: true, fails: 1, reinspection: false })), null);
  assert.equal(Core.rectNext(rectified, ev({ sameAudit: true, fails: 1, visit_status: 'UNLOCATED' })), null);
});

test('isOverdue / passRate / trend', () => {
  assert.equal(Core.isOverdue({ status: 'FOR RECTIFICATION', deadline: '2026-09-08' }, '2026-09-09'), true);
  assert.equal(Core.isOverdue({ status: 'FOR RECTIFICATION', deadline: '2026-09-09' }, '2026-09-09'), false);
  assert.equal(Core.isOverdue({ status: 'RECTIFIED', deadline: '2026-09-01' }, '2026-09-09'), false);
  assert.equal(Core.passRate(9, 1), 90); assert.equal(Core.passRate(0, 0), null);
  assert.deepEqual(Core.trend(90, 80), { delta: 10, dir: 'up' });
  assert.deepEqual(Core.trend(80, 90), { delta: -10, dir: 'down' });
  assert.deepEqual(Core.trend(80, 80), { delta: 0, dir: 'flat' });
  assert.deepEqual(Core.trend(80, null), { delta: null, dir: null });
});

test('districtOf / barangaysOf use the QC district table (uppercase, case-insensitive lookup)', () => {
  assert.equal(Core.districtOf('Payatas'), '2'); assert.equal(Core.districtOf('PAYATAS'), '2'); assert.equal(Core.districtOf('Bagbag'), '5');
  assert.equal(Core.districtOf('NOWHERE'), null); assert.equal(Core.districtOf(''), null);
  assert.deepEqual(Core.barangaysOf('2'), ['BAGONG SILANGAN', 'BATASAN HILLS', 'COMMONWEALTH', 'HOLY SPIRIT', 'PAYATAS']);
  assert.deepEqual(Core.barangaysOf('9'), []);
  assert.equal(Object.keys(Core.QC_DISTRICTS).length, 6);
});
