import { test } from 'node:test';
import assert from 'node:assert/strict';
const Sim = (await import('./qa-sim.js')).default ?? require('./qa-sim.js');
const Api = (await import('./qa-api.js')).default ?? require('./qa-api.js');

const PUBLIC = ['listMyAudits','startAudit','uploadPhoto','uploadSignature','submitAudit','getInstallPhotos','listAudits','assignAudits','unassignAudits','queuePool',
  'sampleInhouse','getAudit','reopenAudit','listInspectors','board','weeklyReport','getConfig','getChecklist','saveChecklistItem','saveCode','saveContractor','saveSetting',
  'syncStatus','syncNow','importRows','subscribe','photoUrl','scheduleAudit',
  'listRectifications','getRectification','setRectDeadline','assignReinspection','closeRectification','overridePenalty','offensePreview','recomputeOffenses','monthlyScorecard','monthViolations','noticesUnseen','markNoticesSeen','subscribeNotices'];

function fakeClient() {
  const calls = [];
  const q = (table) => { const b = { _t: table, _ops: [] }; ['select','eq','is','not','in','gte','lte','lt','ilike','or','order','range','limit','upsert','insert','update','maybeSingle','single']
    .forEach(m => { b[m] = (...a) => { b._ops.push([m, a]); return b; }; }); b.then = (res) => res({ data: [], error: null, count: 0 }); return b; };
  return { calls, schema: (s) => ({ from: (t) => { calls.push(['from', s, t]); return q(t); }, rpc: (n, a) => { calls.push(['rpc', s, n, a]); return Promise.resolve({ data: 0, error: null }); } }),
    from: (t) => { calls.push(['from', 'public', t]); return q(t); },
    storage: { from: (b) => ({ upload: (p, blob) => { calls.push(['upload', b, p]); return Promise.resolve({ error: null }); }, createSignedUrl: (p) => Promise.resolve({ data: { signedUrl: 'https://x/' + p } }) }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {},
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'jwt-123' } }, error: null }) } };
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

test('qa-api phase C routes through the qa-05 RPC names', async () => {
  const c = fakeClient(); const api = Api.create(c, { username: 'HEAD' });
  await api.assignReinspection('RC-1', { inspector: 'AHBA_QA02', date: '2026-09-12', startSeq: 2 });
  assert.deepEqual(c.calls.pop(), ['rpc', 'qa', 'assign_reinspection', { p_rect_id: 'RC-1', p_inspector: 'AHBA_QA02', p_date: '2026-09-12', p_seq: 2 }]);
  await api.closeRectification('RC-1', 'why');
  assert.deepEqual(c.calls.pop(), ['rpc', 'qa', 'close_rectification', { p_id: 'RC-1', p_reason: 'why' }]);
  await api.overridePenalty(7, 0, 'coaching');
  assert.deepEqual(c.calls.pop(), ['rpc', 'qa', 'override_penalty', { p_violation_id: 7, p_amount: 0, p_reason: 'coaching' }]);
  await api.monthlyScorecard('2026-09-01');
  assert.deepEqual(c.calls.pop(), ['rpc', 'qa', 'monthly_scorecard', { p_month: '2026-09-01' }]);
  await api.listRectifications({ status: ['FOR RECTIFICATION'] });
  assert.deepEqual(c.calls.pop(), ['from', 'qa', 'rectifications']);
  await api.getRectification('RC-1');
  assert.deepEqual(c.calls.pop(), ['rpc', 'qa', 'rectification_bundle', { p_id: 'RC-1' }]);
});

test('qa-api final-review additions: month_violations RPC and the labels-only checklist read', async () => {
  const c = fakeClient(); const api = Api.create(c, { username: 'HEAD' });
  await api.monthViolations('2026-09-01');
  assert.deepEqual(c.calls.pop(), ['rpc', 'qa', 'month_violations', { p_month: '2026-09-01' }]);
  // getChecklist is a plain table read (the one config table a subcon console user may select from), not an RPC
  await api.getChecklist();
  assert.deepEqual(c.calls.pop(), ['from', 'qa', 'checklist_items']);
});

test('qa-api: syncNow posts the head-authenticated pull to the qa-sheet-sync Edge Function', async () => {
  const c = fakeClient(); const api = Api.create(c, { username: 'HEAD', supaUrl: 'https://p.supabase.co', anonKey: 'anon-key' });
  const seen = []; const realFetch = globalThis.fetch;
  globalThis.fetch = (url, init) => { seen.push([url, init]); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, mode: 'full', sent: 12, created: 3, more: false }) }); };
  try {
    const r = await api.syncNow('full');
    assert.deepEqual(r, { ok: true, mode: 'full', sent: 12, created: 3, more: false });
    assert.equal(seen.length, 1);
    assert.equal(seen[0][0], 'https://p.supabase.co/functions/v1/qa-sheet-sync');
    assert.equal(seen[0][1].method, 'POST');
    assert.equal(seen[0][1].headers.Authorization, 'Bearer jwt-123');
    assert.equal(seen[0][1].headers.apikey, 'anon-key');
    assert.deepEqual(JSON.parse(seen[0][1].body), { action: 'pull', mode: 'full' });
    // no mode → tail
    await api.syncNow();
    assert.deepEqual(JSON.parse(seen[1][1].body), { action: 'pull', mode: 'tail' });
    // a failing pull surfaces the function's own error text (the console shows it in a toast)
    globalThis.fetch = () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({ error: 'QA_SHEET_WEBAPP_URL not set' }) });
    await assert.rejects(api.syncNow('tail'), /QA_SHEET_WEBAPP_URL not set/);
    // no supaUrl/anonKey → say so instead of firing a request at the console's own origin (or being bounced by the gateway)
    const bare = Api.create(fakeClient(), { username: 'HEAD' });
    let fired = 0; globalThis.fetch = () => { fired++; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) }); };
    await assert.rejects(bare.syncNow('tail'), /Sync not configured \(supaUrl\/anonKey missing\)/);
    assert.equal(fired, 0);
  } finally { globalThis.fetch = realFetch; }
});

// The Edge Function answers 200 with {ok:false,error} for a script-level failure (Apps Script "busy", a bad secret): the HTTP
// status is fine, so only the body says it failed. syncNow must still reject, with that text, or the console toasts "Sync done".
test('qa-api: syncNow rejects a 200 OK whose body is {ok:false,error}', async () => {
  const api = Api.create(fakeClient(), { username: 'HEAD', supaUrl: 'https://p.supabase.co', anonKey: 'anon-key' });
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: false, error: 'busy' }) });
  try {
    await assert.rejects(api.syncNow('tail'), (e) => e instanceof Error && e.message === 'busy');
  } finally { globalThis.fetch = realFetch; }
});

test('qa-api: scheduleAudit routes to the qa-05f schedule_audit RPC', async () => {
  const c = fakeClient(); const api = Api.create(c, { username: 'HEAD' });
  await api.scheduleAudit('QA-1', { inspector: 'AHBA_QA02', date: '2026-09-12', time: '10:30', by: 'HEAD' });
  assert.deepEqual(c.calls.pop(), ['rpc', 'qa', 'schedule_audit', { p_id: 'QA-1', p_inspector: 'AHBA_QA02', p_date: '2026-09-12', p_time: '10:30' }]);
});
