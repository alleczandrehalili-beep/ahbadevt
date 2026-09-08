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

