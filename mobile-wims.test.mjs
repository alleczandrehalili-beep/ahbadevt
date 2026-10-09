// Loads the REAL mobile-wims.js in a vm sandbox (classic-script globals stubbed) and replays legacy queue fixtures against a
// fake Supabase client. Evidence for the live-app continuity rules (2026-10-09): legacy items (no qid/owner) still replay once,
// an item enqueued DURING a flush is never lost, a server-rejected report is HELD (not dropped), DECLARED_ALREADY is held as a
// conflict, an old backend without p_job_id gets the signature fallback, and the interactive filing carries p_job_id + owner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('./mobile-wims.js', import.meta.url), 'utf8');

function boot(opts) {
  const store = new Map();
  const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const calls = []; const timers = []; const toasts = []; const listeners = {};
  const handler = opts.handler;   // (name, args) => Promise<{data,error}>
  const sb = {
    auth: { onAuthStateChange() { }, getSession: () => Promise.resolve({ data: { session: { user: { id: opts.uid || 'uid-1' } } } }) },
    schema: () => ({ rpc: (name, args) => { calls.push({ name, args: JSON.parse(JSON.stringify(args || null)) }); return Promise.resolve(handler(name, args)); },
      from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [] }), eq: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }) })
  };
  const window = { addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); } };
  const document = { addEventListener: (t, f) => { (listeners['doc:' + t] = listeners['doc:' + t] || []).push(f); }, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ style: {}, remove() { } }), body: { appendChild() { } } };
  const ctx = { window, document, localStorage, navigator: { onLine: true }, console, sb, toast: m => toasts.push(m), myTeam: opts.team || 'AHBA_SLI001',
    jobs: opts.jobs || [], photoCount: () => 12, shiftAccount: 'ACC-1', setInterval: () => 0, setTimeout: (fn) => { timers.push(fn); return 0; }, clearTimeout() { }, requestAnimationFrame() { }, cancelAnimationFrame() { }, URL: { createObjectURL() { }, revokeObjectURL() { } } };
  ctx.window.sb = sb; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'mobile-wims.js' });
  const flush0 = timers[timers.length - 1];   // the `setTimeout(flushWims, 8000)` at load
  const flush = async () => { await new Promise(r => setImmediate(r)); return flush0(); };   // let getSession() settle the owner id first, as it has long done on a real phone
  const q = () => JSON.parse(store.get('wims_pending_v1') || '[]');
  return { ctx, calls, toasts, listeners, flush, q, setQ: a => store.set('wims_pending_v1', JSON.stringify(a)), store };
}
const ok = (data) => ({ data, error: null });
const err = (message, code) => ({ data: null, error: Object.assign(new Error(message), code ? { code } : {}) });
const LEGACY = { rpc: 'complete_install', args: { p_jo: 'R3000001', p_subscriber: 'OLD', p_account: '1', p_modem_serial: 'M1', p_kit: { conn: 2 }, p_materials: { clip5: 2 }, p_photos: 12 }, jo: 'R3000001', ts: 1700000000000 };

test('legacy queue fixture (no qid / owner / p_job_id) replays ONCE with its stored arguments and is removed on success', async () => {
  let n = 0;
  const b = boot({ handler: (name) => { n++; return ok('rcpt-1'); } });
  b.setQ([LEGACY]);
  await b.flush(); await b.flush();
  assert.equal(n, 1, 'sent exactly once'); assert.deepEqual(b.q(), []);
  assert.equal(b.calls[0].name, 'complete_install'); assert.equal(b.calls[0].args.p_job_id, undefined); assert.equal(b.calls[0].args.p_jo, 'R3000001');
});

test('an item enqueued DURING a flush is kept; only the acknowledged item is removed (no snapshot overwrite)', async () => {
  const b = boot({ handler: async () => { const cur = b.q(); cur.push({ qid: 'B', rpc: 'ticket_usage', args: { p_jo: 'TK-2' }, jo: 'TK-2', ts: 2 }); b.setQ(cur); return ok('rcpt-A'); } });
  b.setQ([{ qid: 'A', rpc: 'complete_install', args: { p_jo: 'R1' }, jo: 'R1', ts: 1 }]);
  await b.flush();
  assert.deepEqual(b.q().map(x => x.qid), ['B'], 'B (added mid-flush) survives, A removed');
});

test('a server-REJECTED report is HELD for review, never dropped; a network failure stays retryable; held items are not re-sent', async () => {
  let mode = 'net';
  const b = boot({ handler: () => mode === 'net' ? Promise.reject(new TypeError('Failed to fetch')) : err('Modem M9 is not released to your team', 'P0001') });
  b.setQ([{ qid: 'A', rpc: 'complete_install', args: { p_jo: 'R1', p_modem_serial: 'M9' }, jo: 'R1', ts: 1 }]);
  await b.flush();
  assert.equal(b.q().length, 1); assert.equal(b.q()[0].held, undefined, 'network error → still pending');
  mode = 'reject'; await b.flush();
  assert.equal(b.q().length, 1); assert.match(b.q()[0].held, /not released/); assert.equal(b.q()[0].kind, 'rejected');
  const sent = b.calls.length; await b.flush();
  assert.equal(b.calls.length, sent, 'held item is not retried automatically');
  assert.equal(b.ctx.window.wimsHeldReports().length, 1);
  assert.match(b.toasts.join('\n'), /naka-hold para sa warehouse review/);
  // release → retried
  mode = 'ok2'; b.ctx.window.wimsReleaseHeld = b.ctx.window.wimsReleaseHeld; const h = () => ok('rcpt');
  b.ctx.sb.schema = () => ({ rpc: (name, args) => { b.calls.push({ name, args }); return Promise.resolve(h()); } });
  await b.ctx.window.wimsReleaseHeld('A');
  assert.deepEqual(b.q(), []);
});

test('DECLARED_ALREADY on replay = held as a CONFLICT (the original filing stands; nothing is lost silently)', async () => {
  const b = boot({ handler: () => err('DECLARED_ALREADY: JO R1 already has a WIMS declaration (modem M1, filed Oct 08 09:00) — your new entries were NOT filed', 'P0001') });
  b.setQ([{ qid: 'A', rpc: 'complete_install', args: { p_jo: 'R1', p_modem_serial: 'M2' }, jo: 'R1', ts: 1 }]);
  await b.flush();
  assert.equal(b.q()[0].kind, 'conflict'); assert.match(b.q()[0].held, /^DECLARED_ALREADY/);
  assert.match(b.toasts.join('\n'), /may WIMS declaration NA/);
});

test('old backend (no p_job_id yet): replay strips p_job_id and files; items of ANOTHER login on the same phone are held, not replayed', async () => {
  const b = boot({ uid: 'uid-1', handler: (name, args) => ('p_job_id' in (args || {})) ? err('Could not find the function wims.complete_install(p_job_id, p_jo, ...) in the schema cache', 'PGRST202') : ok('rcpt') });
  b.setQ([{ qid: 'A', rpc: 'complete_install', args: { p_jo: 'R1', p_job_id: 'JOB-1', p_modem_serial: 'M1' }, jo: 'R1', ts: 1, owner: 'uid-1' },
          { qid: 'Z', rpc: 'complete_install', args: { p_jo: 'R9' }, jo: 'R9', ts: 1, owner: 'uid-OTHER' }]);
  await b.flush();
  assert.deepEqual(b.calls.map(c => [c.name, 'p_job_id' in c.args]), [['complete_install', true], ['complete_install', false]]);
  assert.deepEqual(b.q().map(x => x.qid), ['Z'], 'the other login’s item is untouched');
});

test('interactive filing carries p_job_id and, when offline, queues an owned item with the canonical job id', async () => {
  let net = false;
  const b = boot({ handler: (name, args) => { if (name === 'my_access') return ok([{ role: 'technician', team_id: 't1', team_code: 'AHBA_SLI001' }]); if (!net) return Promise.reject(new TypeError('Failed to fetch')); return ok('rcpt'); },
    jobs: [{ id: 'JOB-77', job_order_no: 'R7700001', subscriber: 'S', load_type: 'Install' }] });
  // set the modem through the module's own 'change' listener (as the DOM would)
  const change = b.listeners['doc:change'][0];
  const el = { getAttribute: k => ({ 'data-j': 'JOB-77', 'data-wf': 'modem' })[k], value: 'M1' };
  change({ target: { closest: () => el } });
  const r1 = await b.ctx.window.wimsSubmit('JOB-77', b.ctx.jobs[0]);
  assert.equal(r1, null, 'offline → queued, completion allowed');
  const it = b.q()[0];
  assert.equal(it.rpc, 'complete_install'); assert.equal(it.args.p_job_id, 'JOB-77'); assert.equal(it.args.p_jo, 'R7700001'); assert.equal(it.owner, 'uid-1'); assert.equal(it.job, 'JOB-77'); assert.ok(it.qid);
  net = true; await b.flush();
  assert.deepEqual(b.q(), []);
  const last = b.calls[b.calls.length - 1]; assert.equal(last.name, 'complete_install'); assert.equal(last.args.p_job_id, 'JOB-77');
});
