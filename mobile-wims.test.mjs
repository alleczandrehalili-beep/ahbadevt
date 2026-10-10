// Loads the REAL mobile-wims.js (and the loadJobs slice of mobile-b.js) in a vm sandbox with fake browser/storage/Supabase and
// replays legacy queue fixtures. Live-app continuity evidence (2026-10-10, after the Codex review): stable ids are assigned to
// legacy items BEFORE any await (A/B/C success/success/network keeps C), success/rejection/success holds only the rejected one,
// an item enqueued during a flush survives, server-rejected / conflicting reports are HELD (never dropped) with a visible banner,
// a changed interactive filing is held as an owned report, no replay without a session and a login retries, another login's
// items and another tab's in-flight item are left alone, an old backend gets the signature fallbacks, and the job list keeps the
// original four return columns when only the Gate B pair is missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('./mobile-wims.js', import.meta.url), 'utf8');
const MOBILE_B = fs.readFileSync(new URL('./mobile-b.js', import.meta.url), 'utf8');

function boot(opts) {
  const store = opts.store || new Map();
  const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const calls = []; const timers = []; const toasts = []; const listeners = {}; const authListeners = []; const dom = { els: [] };
  let handler = opts.handler; let session = opts.loggedIn === false ? null : { user: { id: opts.uid || 'uid-1' } };
  const sb = {
    auth: { onAuthStateChange: fn => authListeners.push(fn), getSession: () => Promise.resolve({ data: { session } }) },
    schema: () => ({ rpc: (name, args) => { calls.push({ name, args: JSON.parse(JSON.stringify(args || null)) }); return Promise.resolve(handler(name, args)); },
      from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [] }), eq: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }) })
  };
  const mkEl = () => { const el = { style: {}, children: [], textContent: '', innerHTML: '', remove() { dom.els = dom.els.filter(x => x !== el); }, appendChild(c) { el.children.push(c); }, querySelector: () => ({ onclick: null }), querySelectorAll: () => [] }; return el; };
  const window = { addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); } };
  const document = { addEventListener: (t, f) => { (listeners['doc:' + t] = listeners['doc:' + t] || []).push(f); }, querySelector: () => null, querySelectorAll: () => [],
    getElementById: id => dom.els.find(e => e.id === id) || null, createElement: () => mkEl(), body: { appendChild: el => dom.els.push(el) } };
  const ctx = { window, document, localStorage, navigator: { onLine: true, clipboard: { writeText() { } } }, console: { warn() { }, error() { }, log() { } }, sb, toast: m => toasts.push(m),
    myTeam: opts.loggedIn === false ? '' : (opts.team || 'AHBA_SLI001'), jobs: opts.jobs || [], photoCount: () => 12, shiftAccount: 'ACC-1',
    setInterval: () => 0, setTimeout: (fn) => { timers.push(fn); return 0; }, clearTimeout() { }, requestAnimationFrame() { }, cancelAnimationFrame() { }, URL: { createObjectURL() { }, revokeObjectURL() { } }, Date, Math, JSON };
  ctx.window.sb = sb;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'mobile-wims.js' });
  const flush0 = timers.find(f => f.name === 'flushWims');   // the module's setTimeout(flushWims, 8000) at load
  const flush = async () => { await new Promise(r => setImmediate(r)); return flush0(); };
  const q = () => JSON.parse(store.get('wims_pending_v1') || '[]');
  return { ctx, calls, toasts, listeners, flush, q, setQ: a => store.set('wims_pending_v1', JSON.stringify(a)), store, dom,
    setHandler: fn => { handler = fn; }, signIn: (uid, team) => { session = { user: { id: uid } }; ctx.myTeam = team; authListeners.forEach(fn => fn('SIGNED_IN', session)); }, timers };
}
const ok = (data) => ({ data, error: null });
const err = (message, code) => ({ data: null, error: Object.assign(new Error(message), code ? { code } : {}) });
const missingFn = () => err('Could not find the function wims.file_declaration(p_args, p_kind) in the schema cache', 'PGRST202');
// a NEW backend answers file_declaration with the structured outcome; an OLD backend does not have it
const newServer = (decide) => (name, args) => name === 'my_access' ? ok([{ role: 'technician', team_id: 't1', team_code: 'AHBA_SLI001' }]) : name === 'file_declaration' ? decide(args.p_kind, args.p_args) : err('unexpected ' + name);
const legacyItem = (jo, i) => ({ rpc: 'complete_install', args: { p_jo: jo, p_subscriber: 'OLD', p_account: '1', p_modem_serial: 'M' + i, p_kit: { conn: 2 }, p_materials: { clip5: 2 }, p_photos: 12 }, jo, ts: 1700000000000 + i });

test('legacy A/B/C (no ids): A and B succeed, C fails network → C is KEPT with a stable id; A/B removed; each sent once (Codex #1)', async () => {
  const b = boot({ handler: newServer((kind, a) => a.p_jo === 'C' ? Promise.reject(new TypeError('Failed to fetch')) : ok({ status: 'filed', receipt: 'rcpt-' + a.p_jo })) });
  b.setQ([legacyItem('A', 1), legacyItem('B', 2), legacyItem('C', 3)]);
  await b.flush();
  assert.deepEqual(b.calls.filter(c => c.name === 'file_declaration').map(c => c.args.p_args.p_jo), ['A', 'B', 'C']);
  assert.deepEqual(b.q().map(x => x.jo), ['C'], 'C survives'); assert.ok(b.q()[0].qid, 'C has a stable id'); assert.equal(b.q()[0].held, undefined);
  b.setHandler(newServer(() => ok({ status: 'filed', receipt: 'rcpt-C' }))); await b.flush();
  assert.deepEqual(b.q(), []); assert.equal(b.calls.filter(c => c.name === 'file_declaration').length, 4, 'A, B, C, C — never A or B twice');
});

test('success / rejection / success: only the rejected report is held; the others are acknowledged once', async () => {
  const b = boot({ handler: newServer((kind, a) => a.p_jo === 'B' ? ok({ status: 'error', code: 'P0001', message: 'Modem M2 is not released to your team' }) : ok({ status: 'filed', receipt: 'rcpt-' + a.p_jo })) });
  b.setQ([legacyItem('A', 1), legacyItem('B', 2), legacyItem('C', 3)]);
  await b.flush();
  assert.deepEqual(b.q().map(x => [x.jo, x.kind]), [['B', 'rejected']]); assert.match(b.q()[0].held, /not released/);
  assert.equal(b.ctx.window.wimsHeldReports().length, 1);
  assert.ok(b.dom.els.find(e => e.id === 'wimsHeldBar'), 'the ⚠ banner is rendered for the held report');
  const n = b.calls.length; await b.flush(); assert.equal(b.calls.length, n, 'held item is not retried automatically');
  await b.ctx.window.wimsReleaseHeld(b.q()[0].qid);   // the technician taps Retry
  assert.equal(b.q()[0].kind, 'rejected', 'still rejected by the server → held again, never dropped');
});

test('an item enqueued DURING a flush is kept; only the acknowledged item is removed', async () => {
  const b = boot({ handler: newServer(async () => { const cur = b.q(); cur.push({ qid: 'B', rpc: 'ticket_usage', args: { p_jo: 'TK-2' }, jo: 'TK-2', ts: 2 }); b.setQ(cur); return ok({ status: 'filed', receipt: 'rcpt-A' }); }) });
  b.setQ([{ qid: 'A', rpc: 'complete_install', args: { p_jo: 'R1' }, jo: 'R1', ts: 1 }]);
  await b.flush();
  assert.deepEqual(b.q().map(x => x.qid), ['B']);
});

test('server CONFLICT on replay = held as a conflict with the server conflict id; DECLARED_ALREADY from an old backend = held too', async () => {
  const b = boot({ handler: newServer(() => ok({ status: 'conflict', receipt: 'rcpt-1', conflict_id: 'c-1', message: 'This JO already has a WIMS declaration; your changed entries were recorded for warehouse review and NOT filed' })) });
  b.setQ([{ qid: 'A', rpc: 'complete_install', args: { p_jo: 'R1', p_modem_serial: 'M2' }, jo: 'R1', ts: 1 }]);
  await b.flush();
  assert.equal(b.q()[0].kind, 'conflict'); assert.equal(b.q()[0].conflict_id, 'c-1'); assert.match(b.toasts.join('\n'), /may WIMS declaration NA/);
  const b2 = boot({ handler: (name) => name === 'file_declaration' ? missingFn() : err('DECLARED_ALREADY: JO R1 already has a WIMS declaration (modem M1)', 'P0001') });
  b2.setQ([{ qid: 'A', rpc: 'complete_install', args: { p_jo: 'R1', p_modem_serial: 'M2' }, jo: 'R1', ts: 1 }]);
  await b2.flush();
  assert.equal(b2.q()[0].kind, 'rejected'); assert.match(b2.q()[0].held, /^DECLARED_ALREADY/);
});

test('changed INTERACTIVE filing on a job that already has its declaration: held as an owned report, completion allowed, warning visible (Codex #7)', async () => {
  const job = { id: 'JOB-1', job_order_no: 'R1', subscriber: 'S', load_type: 'Install' };
  const b = boot({ jobs: [job], handler: newServer(() => ok({ status: 'conflict', receipt: 'rcpt-orig', conflict_id: 'c-9', message: 'This JO already has a WIMS declaration; your changed entries were recorded' })) });
  const el = { getAttribute: k => ({ 'data-j': 'JOB-1', 'data-wf': 'modem' })[k], value: 'M2' };
  b.listeners['doc:change'][0]({ target: { closest: () => el } });
  const r = await b.ctx.window.wimsSubmit('JOB-1', job);
  assert.equal(r, null, 'completion proceeds (the original declaration stands)');
  const held = b.q(); assert.equal(held.length, 1); assert.equal(held[0].kind, 'conflict'); assert.equal(held[0].owner, 'uid-1'); assert.equal(held[0].args.p_modem_serial, 'M2'); assert.equal(held[0].args.p_job_id, 'JOB-1');
  assert.deepEqual(JSON.parse(JSON.stringify(b.ctx.window.wimsLastOutcome)), { status: 'conflict', message: 'This JO already has a WIMS declaration; your changed entries were recorded', job: 'JOB-1' });
  assert.ok(b.dom.els.find(e => e.id === 'wimsHeldBar'));
});

test('no session → nothing is attempted (not held either); SIGNED_IN retries and the report files', async () => {
  const b = boot({ loggedIn: false, handler: () => err('permission denied for function complete_install', '42501') });
  b.setQ([{ rpc: 'complete_install', args: { p_jo: 'R1' }, jo: 'R1', ts: 1 }]);
  await b.flush();
  assert.equal(b.calls.length, 0, 'no replay without a session'); assert.equal(b.q().length, 1); assert.equal(b.q()[0].held, undefined);
  b.setHandler(newServer(() => ok({ status: 'filed', receipt: 'rcpt-R1' })));
  b.signIn('uid-1', 'AHBA_SLI001');
  await b.timers[b.timers.length - 1]();   // the setTimeout(flushWims, 1500) scheduled by SIGNED_IN
  await new Promise(r => setImmediate(r));
  assert.deepEqual(b.q(), []);
  // a 42501 / JWT failure while "logged in" is temporary: kept, not held
  const b2 = boot({ handler: () => err('permission denied for function file_declaration', '42501') });
  b2.setQ([{ qid: 'A', rpc: 'complete_install', args: { p_jo: 'R1' }, jo: 'R1', ts: 1 }]);
  await b2.flush(); assert.equal(b2.q()[0].held, undefined, 'auth failure stays retryable');
});

test('old backend (no wrapper, no p_job_id): replay uses the signature fallbacks; another login\'s item and another tab\'s in-flight item are left alone', async () => {
  const b = boot({ uid: 'uid-1', handler: (name, args) => name === 'file_declaration' ? missingFn() : ('p_job_id' in (args || {})) ? err('Could not find the function wims.complete_install(p_job_id, ...) in the schema cache', 'PGRST202') : ok('rcpt') });
  b.setQ([{ qid: 'A', rpc: 'complete_install', args: { p_jo: 'R1', p_job_id: 'JOB-1', p_modem_serial: 'M1' }, jo: 'R1', ts: 1, owner: 'uid-1' },
          { qid: 'Z', rpc: 'complete_install', args: { p_jo: 'R9' }, jo: 'R9', ts: 1, owner: 'uid-OTHER' },
          { qid: 'L', rpc: 'complete_install', args: { p_jo: 'R5' }, jo: 'R5', ts: 1, owner: 'uid-1', lock: { by: 'other-tab', at: Date.now() } }]);
  await b.flush();
  assert.deepEqual(b.calls.map(c => [c.name, 'p_job_id' in (c.args.p_args || c.args)]), [['file_declaration', true], ['complete_install', true], ['complete_install', false]]);
  assert.deepEqual(b.q().map(x => x.qid), ['Z', 'L'], 'the other login\'s item and the other tab\'s in-flight item are untouched');
});

test('interactive filing (new backend) goes through file_declaration with p_job_id; offline → owned queued item with the canonical job id', async () => {
  let net = false;
  const b = boot({ handler: (name, args) => { if (name === 'my_access') return ok([{ role: 'technician', team_id: 't1', team_code: 'AHBA_SLI001' }]); if (!net) return Promise.reject(new TypeError('Failed to fetch')); return ok({ status: 'filed', receipt: 'rcpt' }); },
    jobs: [{ id: 'JOB-77', job_order_no: 'R7700001', subscriber: 'S', load_type: 'Install' }] });
  const el = { getAttribute: k => ({ 'data-j': 'JOB-77', 'data-wf': 'modem' })[k], value: 'M1' };
  b.listeners['doc:change'][0]({ target: { closest: () => el } });
  assert.equal(await b.ctx.window.wimsSubmit('JOB-77', b.ctx.jobs[0]), null);
  const it = b.q()[0]; assert.equal(it.rpc, 'complete_install'); assert.equal(it.args.p_job_id, 'JOB-77'); assert.equal(it.owner, 'uid-1'); assert.ok(it.qid);
  net = true; await b.flush();
  assert.deepEqual(b.q(), []); const last = b.calls[b.calls.length - 1]; assert.equal(last.name, 'file_declaration'); assert.equal(last.args.p_args.p_job_id, 'JOB-77');
});

test('job list column tiers: a server with only the ORIGINAL four return columns still loads the return identity (Codex #2)', async () => {
  const selections = [];
  const base = { id: 'J1', status: 'in-progress', team: 'AHBA_SLI001', job_order_no: 'R1' };
  const returned = { qa_returned_at: '2026-10-09T00:00:00.123456+00:00', qa_return_resolved_at: null, qa_return_remarks: 'replace speed test' };
  const sb = { from: () => { let cols = ''; const q = { select: v => { cols = v; selections.push(v); return q; }, eq: () => q, is: () => q, or: () => q,
    order: () => Promise.resolve(cols.includes('qa_return_submitted_at') ? err('column qa_return_submitted_at does not exist', '42703') : ok([{ ...base, ...(cols.includes('qa_returned_at') ? returned : {}) }])) }; return q; } };
  const ctx = { sb, myTeam: 'AHBA_SLI001', Date, JSON }; vm.createContext(ctx);
  const end = MOBILE_B.indexOf('    async function loadPhotos');
  vm.runInContext(MOBILE_B.slice(0, end) + '\nglobalThis.runLoad = loadJobs;', ctx, { filename: 'mobile-b.js' });
  const loaded = await ctx.runLoad();
  const tiers = selections.map(c => c.split(',').filter(x => x.startsWith('qa_return')).length);
  assert.deepEqual(tiers, [6, 4], 'tries the six, then keeps the original four');
  assert.equal(loaded[0].qa_returned_at, returned.qa_returned_at, 'the returned JO keeps its return identity');
});
