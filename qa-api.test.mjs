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
