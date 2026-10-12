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
  const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), get length() { return store.size; }, key: i => Array.from(store.keys())[i] ?? null };
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
    // module timers are captured (flush / banner / SIGNED_IN are driven by the tests); short internal waits (the localStorage mutex) really fire
    setInterval: () => 0, setTimeout: (fn, ms) => { timers.push(fn); if (fn.name !== 'flushWims' && fn.name !== 'renderHeldBar' && (ms || 0) <= 100) setTimeout(fn, Math.min(ms || 0, 5)); return 0; }, clearTimeout() { }, requestAnimationFrame() { }, cancelAnimationFrame() { }, URL: { createObjectURL() { }, revokeObjectURL() { } }, Date, Math, JSON };
  ctx.window.sb = sb;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'mobile-wims.js' });
  const flush0 = timers.find(f => f.name === 'flushWims');   // the module's setTimeout(flushWims, 8000) at load
  const flush = async () => { await new Promise(r => setImmediate(r)); return flush0(); };
  const q = () => qOf(store);
  return { ctx, calls, toasts, listeners, flush, q, setQ: a => store.set('wims_pending_v1', JSON.stringify(a)), store, dom, settle: tick,
    setHandler: fn => { handler = fn; }, signIn: (uid, team) => { session = { user: { id: uid } }; ctx.myTeam = team; authListeners.forEach(fn => fn('SIGNED_IN', session)); }, timers };
}
// RC5 storage: one record per key (wims_pending_v1.i.<qid>) + the legacy array blob (an old client's writes), oldest first
const legacyId = it => it.qid || ('legacy_' + (it.ts || 0) + '_' + (it.jo || '') + '_' + hash(JSON.stringify([it.rpc || '', it.args || null])));
function hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
const qOf = (store) => { const done = id => store.has('wims_pending_v1.d.' + id); const out = []; for (const [k, v] of store) if (k.startsWith('wims_pending_v1.i.') && !done(k.slice(18))) out.push(JSON.parse(v)); for (const it of JSON.parse(store.get('wims_pending_v1') || '[]')) { const id = legacyId(it); if (!done(id) && !out.some(x => x.qid === id)) out.push({ ...it, qid: id }); } return out.sort((a, b) => ((a.ts || 0) - (b.ts || 0)) || String(a.qid).localeCompare(String(b.qid))); };
const tick = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const waitFor = async (pred, ms = 4000) => { const t0 = Date.now(); while (!pred()) { if (Date.now() - t0 > ms) throw new Error('waitFor timeout'); await new Promise(r => setTimeout(r, 5)); } };
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
  let appended = false;
  const b = boot({ handler: newServer(async () => { if (!appended) { appended = true; const cur = JSON.parse(b.store.get('wims_pending_v1') || '[]'); cur.push({ qid: 'B', rpc: 'ticket_usage', args: { p_jo: 'TK-2' }, jo: 'TK-2', ts: 2 }); b.setQ(cur); } return ok({ status: 'filed', receipt: 'rcpt-A' }); }) });   // an OLD client writes the blob once
  b.setQ([{ qid: 'A', rpc: 'complete_install', args: { p_jo: 'R1' }, jo: 'R1', ts: 1 }]);
  await b.flush();
  assert.deepEqual(b.q().map(x => x.qid), ['B'], 'the record an old client appended to the blob during the flush is kept');
  await b.flush(); assert.deepEqual(b.q(), [], 'and migrated + sent on the next round');
  assert.ok(b.store.has('wims_pending_v1'), 'the old client\'s blob is left in place (it still lists A and B for the old client; both are tombstoned here)');
  assert.ok(b.store.has('wims_pending_v1.d.A') && b.store.has('wims_pending_v1.d.B'), 'accepted records are tombstoned');
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
  assert.deepEqual(JSON.parse(JSON.stringify(b.ctx.window.wimsLastOutcome)), { status: 'conflict', message: 'This JO already has a WIMS declaration; your changed entries were recorded', job: 'JOB-1', conflict_id: 'c-9', reason: null, heldLocally: true });
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
  assert.deepEqual(b.calls.filter(c => c.name !== 'my_last_foc').map(c => [c.name, 'p_job_id' in (c.args.p_args || c.args)]), [['file_declaration', true], ['complete_install', true], ['complete_install', false]]);
  assert.deepEqual(b.q().map(x => x.qid).sort(), ['L', 'Z'], 'the other login\'s item and the other tab\'s in-flight item are untouched');
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
  assert.deepEqual(b.q(), []); const last = b.calls.filter(c => c.name === 'file_declaration').pop(); assert.equal(last.args.p_args.p_job_id, 'JOB-77');
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

// ---- Codex round-2 residuals ----
const fullQueue = (n) => Array.from({ length: n }, (_, i) => ({ qid: 'old-' + i, rpc: 'complete_install', args: { p_jo: 'OLD-' + i }, jo: 'OLD-' + i, ts: i + 1, held: 'existing review', owner: 'uid-1' }));
const JOB1 = { id: 'J1', job_order_no: 'R1', subscriber: 'S', load_type: 'Install' };
function selectModem(b, id, serial) { const el = { getAttribute: k => ({ 'data-j': id, 'data-wf': 'modem' })[k], value: serial }; b.listeners['doc:change'][0]({ target: { closest: () => el } }); }
function change(b, id, field, value) { const el = { getAttribute: k => ({ 'data-j': id, 'data-wf': field })[k], value }; b.listeners['doc:change'][0]({ target: { closest: () => el } }); }

test('full queue (50) + legacy DECLARED_ALREADY: completion is BLOCKED with the reason, the 50 existing records are untouched; at 49 the report is held', async () => {
  const legacyBackend = (name) => name === 'my_access' ? ok([{ role: 'technician' }]) : name === 'file_declaration' ? missingFn() : err('DECLARED_ALREADY: old backend conflict; new M2 entries NOT filed', 'P0001');
  const b = boot({ jobs: [JOB1], handler: legacyBackend });
  b.setQ(fullQueue(50)); selectModem(b, 'J1', 'M2');
  const r = await b.ctx.window.wimsSubmit('J1', JOB1);
  assert.match(String(r), /HINDI maisave sa phone/, 'completion must be blocked with the reason');
  assert.equal(b.q().length, 50); assert.ok(!b.q().some(x => x.job === 'J1'));
  const b2 = boot({ jobs: [JOB1], handler: legacyBackend });
  b2.setQ(fullQueue(49)); selectModem(b2, 'J1', 'M2');
  assert.equal(await b2.ctx.window.wimsSubmit('J1', JOB1), null, 'at 49 the conflicting report is held and completion proceeds');
  assert.equal(b2.q().length, 50); assert.ok(b2.q().some(x => x.job === 'J1' && x.kind === 'conflict'));
});

test('full queue (50) + wrapper conflict: completion proceeds (the server holds the conflict copy) and the user is told it did not fit locally', async () => {
  const b = boot({ jobs: [JOB1], handler: name => name === 'my_access' ? ok([{ role: 'technician' }]) : ok({ status: 'conflict', receipt: 'orig', conflict_id: 'c-77', message: 'Changed report was NOT filed' }) });
  b.setQ(fullQueue(50)); selectModem(b, 'J1', 'M2');
  assert.equal(await b.ctx.window.wimsSubmit('J1', JOB1), null);
  assert.equal(b.q().length, 50); assert.equal(JSON.parse(JSON.stringify(b.ctx.window.wimsLastOutcome)).heldLocally, false);
  assert.match(b.toasts.at(-1), /server copy c-77/);
});

test('storage write failure: an offline report is NOT reported as queued; a legacy conflict blocks completion', async () => {
  const b = boot({ jobs: [JOB1], handler: name => name === 'my_access' ? ok([{ role: 'technician' }]) : Promise.reject(new TypeError('Failed to fetch')) });
  b.ctx.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  selectModem(b, 'J1', 'M1');
  assert.match(String(await b.ctx.window.wimsSubmit('J1', JOB1)), /could not save the report/);
  assert.deepEqual(b.q(), []);
});

test('a structured conflict does NOT advance the session FOC prefill; a filed report does', async () => {
  const mk = (status) => boot({ jobs: [JOB1], handler: name => name === 'my_access' ? ok([{ role: 'technician' }]) : ok({ status, receipt: 'r', conflict_id: status === 'conflict' ? 'c' : null, message: 'x' }) });
  const b = mk('conflict');
  selectModem(b, 'J1', 'M2'); change(b, 'J1', 'focreel', 'REJECTED-REEL'); change(b, 'J1', 'focstart', '1500'); change(b, 'J1', 'focend', '1300');
  await b.ctx.window.wimsSubmit('J1', JOB1);
  assert.equal(b.ctx.window.wimsSessionFoc(), null, 'conflict: no carry-over');
  const b2 = mk('filed');
  selectModem(b2, 'J1', 'M2'); change(b2, 'J1', 'focreel', 'REEL-A'); change(b2, 'J1', 'focstart', '1500'); change(b2, 'J1', 'focend', '1300');
  await b2.ctx.window.wimsSubmit('J1', JOB1); await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(b2.ctx.window.wimsSessionFoc())), { reel_no: 'REEL-A', end_m: 1300 }, 'filed: carried over');
});

test('two tabs flushing the same queue at the same time send the item ONCE (Web Locks serialize the claim)', async () => {
  // a shared store + a shared fake navigator.locks that serializes requests by name, like the browser's Web Locks API
  const store = new Map(); const chain = { p: Promise.resolve() };
  const locks = { request: (name, fn) => { const run = chain.p.then(() => fn()); chain.p = run.catch(() => { }); return run; } };
  const sends = [];
  const mkTab = (tag) => { const b = boot({ store, handler: async (name, args) => { sends.push(tag + ':' + (args.p_args || args).p_jo); await new Promise(r => setImmediate(r)); return ok({ status: 'filed', receipt: 'rcpt' }); } }); b.ctx.navigator.locks = locks; return b; };
  const t1 = mkTab('tab1'), t2 = mkTab('tab2');
  store.set('wims_pending_v1', JSON.stringify([{ qid: 'A', rpc: 'complete_install', args: { p_jo: 'R1' }, jo: 'R1', ts: 1, owner: 'uid-1' }]));
  await Promise.all([t1.flush(), t2.flush()]);
  assert.deepEqual(sends, ['tab1:R1'], 'exactly one send'); assert.deepEqual(qOf(store), []);
});

// ---- Codex RC3 residuals: one ownership rule for every mutation; durable enqueue independent of network waits; FOC chronology ----
const serialLocks = () => { const chain = { p: Promise.resolve() }; return { request: (name, fn) => { const run = chain.p.then(() => fn()); chain.p = run.catch(() => { }); return run; } }; };
const sharedStore = () => new Map();

test('release-held in one tab vs an offline append in another (Web Locks): both records survive, nothing is overwritten by a stale snapshot', async () => {
  const store = sharedStore(); const locks = serialLocks();
  // tab A accepts the released HELD report but is offline for anything else (so B's new report cannot simply be filed by A)
  const A = boot({ store, handler: (name, args) => name === 'my_access' ? ok([{ role: 'technician' }]) : name === 'my_last_foc' ? ok([]) : ((args.p_args || args).p_jo === 'HELD' ? ok({ status: 'filed', receipt: 'r' }) : Promise.reject(new TypeError('Failed to fetch'))) }); A.ctx.navigator.locks = locks;
  const B = boot({ store, jobs: [JOB1], handler: name => name === 'my_access' ? ok([{ role: 'technician' }]) : Promise.reject(new TypeError('Failed to fetch')) }); B.ctx.navigator.locks = locks;
  store.set('wims_pending_v1', JSON.stringify([{ qid: 'H', rpc: 'complete_install', args: { p_jo: 'HELD' }, jo: 'HELD', ts: 1, owner: 'uid-1', held: 'existing conflict', kind: 'conflict' }]));
  selectModem(B, 'J1', 'M1');
  const [, r] = await Promise.all([A.ctx.window.wimsReleaseHeld('H'), B.ctx.window.wimsSubmit('J1', JOB1)]);
  assert.equal(r, null, 'B queued its report'); 
  const q = qOf(store);
  assert.ok(q.some(x => x.job === 'J1'), 'the newly acknowledged offline report is still there');
  assert.ok(!q.some(x => x.qid === 'H'), 'the released report was sent and removed');
});

test('no Web Locks: two tabs append offline reports at the same time — both are retained (localStorage mutex); two flushes send once', async () => {
  const store = sharedStore();
  const mk = (job) => boot({ store, jobs: [job], handler: name => name === 'my_access' ? ok([{ role: 'technician' }]) : Promise.reject(new TypeError('Failed to fetch')) });
  const J2 = { ...JOB1, id: 'J2', job_order_no: 'R2' };
  const A = mk(JOB1), B = mk(J2);
  for (const t of [A, B]) { t.ctx.navigator.locks = undefined; }
  selectModem(A, 'J1', 'M1'); selectModem(B, 'J2', 'M2');
  const [ra, rb] = await Promise.all([A.ctx.window.wimsSubmit('J1', JOB1), B.ctx.window.wimsSubmit('J2', J2)]);
  assert.equal(ra, null); assert.equal(rb, null);
  const q = qOf(store); assert.deepEqual(q.map(x => x.job).sort(), ['J1', 'J2'], 'neither offline report is lost');
  // two flushes without Web Locks (fresh store): one send
  const sends = []; const store2 = sharedStore();
  const mkF = () => { const b = boot({ store: store2, handler: async (name, args) => { sends.push((args.p_args || args).p_jo); await new Promise(r => setTimeout(r, 5)); return ok({ status: 'filed', receipt: 'r' }); } }); b.ctx.navigator.locks = undefined; return b; };
  store2.set('wims_pending_v1', JSON.stringify([{ qid: 'A', rpc: 'complete_install', args: { p_jo: 'R1' }, jo: 'R1', ts: 1, owner: 'uid-1' }]));
  const F1 = mkF(), F2 = mkF();
  await Promise.all([F1.flush(), F2.flush()]);
  assert.deepEqual(sends, ['R1'], 'exactly one send without Web Locks');
});

test('a pending replay does NOT block another tab from durably enqueueing: the lock is released before the network call', async () => {
  const store = sharedStore(); const locks = serialLocks();
  let release; const pending = new Promise(r => { release = r; });
  const F = boot({ store, handler: () => pending }); F.ctx.navigator.locks = locks;
  store.set('wims_pending_v1', JSON.stringify([{ qid: 'A', rpc: 'complete_install', args: { p_jo: 'R1' }, jo: 'R1', ts: 1, owner: 'uid-1' }]));
  const flushing = F.flush();
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
  const B = boot({ store, jobs: [JOB1], handler: name => name === 'my_access' ? ok([{ role: 'technician' }]) : Promise.reject(new TypeError('Failed to fetch')) }); B.ctx.navigator.locks = locks;
  selectModem(B, 'J1', 'M1');
  const done = await Promise.race([B.ctx.window.wimsSubmit('J1', JOB1).then(() => 'queued'), new Promise(r => setTimeout(() => r('blocked'), 200))]);
  assert.equal(done, 'queued', 'the append completed while the replay was still pending');
  assert.ok(qOf(store).some(x => x.job === 'J1'));
  release(ok({ status: 'filed', receipt: 'r' })); await flushing;
  const q = qOf(store); assert.deepEqual(q.map(x => x.job), ['J1'], 'A sent and removed, B still queued');
});

test('FOC chronology: an accepted ticket, a queued install replay and an older interactive replay all leave the prefill at the SERVER\'s latest accepted end', async () => {
  const server = { reel_no: 'R', end_m: 1200 };   // the team's latest accepted reading on the server
  const mk = (status, extraJobs) => boot({ jobs: [JOB1].concat(extraJobs || []), handler: (name, args) => name === 'my_access' ? ok([{ role: 'technician' }]) : name === 'my_last_foc' ? ok([server]) : ok({ status, receipt: 'r', conflict_id: null, message: 'x' }) });
  // accepted ticket
  const T = mk('filed', [{ ...JOB1, id: 'T1', job_order_no: 'TK-1', load_type: 'SLR-TICKET' }]);
  change(T, 'T1', 'focreel', 'R'); change(T, 'T1', 'focstart', '1500'); change(T, 'T1', 'focend', '1300');
  assert.equal(await T.ctx.window.wimsSubmit('T1', T.ctx.jobs[1]), null); await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(T.ctx.window.wimsSessionFoc())), server, 'ticket: reloaded from the server');
  // queued install replay
  const Q = mk('replay'); Q.setQ([{ qid: 'A', rpc: 'complete_install', args: { p_jo: 'R1', p_foc_reel: 'R', p_foc_start: 1500, p_foc_end: 1300 }, jo: 'R1', ts: 1, owner: 'uid-1' }]);
  await Q.flush(); await tick(); assert.deepEqual(Q.q(), []); assert.deepEqual(JSON.parse(JSON.stringify(Q.ctx.window.wimsSessionFoc())), server, 'queued replay: reloaded from the server');
  // older interactive replay after a newer filing never rewinds
  const O = mk('replay'); selectModem(O, 'J1', 'M1'); change(O, 'J1', 'focreel', 'R'); change(O, 'J1', 'focstart', '1500'); change(O, 'J1', 'focend', '1300');
  await O.ctx.window.wimsSubmit('J1', JOB1); await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(O.ctx.window.wimsSessionFoc())), server, 'older replay: the server chronology wins');
});

// ---- Codex RC4 residuals: atomic per-record persistence (no mutex dependency), fail-closed claim, fenced + non-blocking FOC ----
// every storage write a tab makes, by key
function traced(store) { const writes = []; const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { writes.push(['set', k]); store.set(k, String(v)); }, removeItem: k => { writes.push(['remove', k]); store.delete(k); }, get length() { return store.size; }, key: i => Array.from(store.keys())[i] ?? null }; return { ls, writes }; }
const offlineTab = (store, job) => boot({ store, jobs: [job], handler: name => name === 'my_access' ? ok([{ role: 'technician' }]) : Promise.reject(new TypeError('Failed to fetch')) });

test('RC4 B2 (structural): a tab only ever writes the record it is mutating — no whole-queue rewrite exists any more; another tab\'s acknowledged report can never be erased', async () => {
  const store = sharedStore();
  // tab A: owns record A, mid-flush with the network pending; tab B appends offline while A is "paused" in its network call; A then finalizes
  let release, started; const pending = new Promise(r => { release = r; }), inFlight = new Promise(r => { started = r; });
  const A = boot({ store, handler: (name, args) => (args.p_args || args).p_jo === 'R1' ? (started(), pending) : Promise.reject(new TypeError('Failed to fetch')) }); const tA = traced(store); A.ctx.localStorage = tA.ls; A.ctx.navigator.locks = undefined;
  store.set('wims_pending_v1', JSON.stringify([{ qid: 'A', rpc: 'complete_install', args: { p_jo: 'R1' }, jo: 'R1', ts: 1, owner: 'uid-1' }]));
  const flushing = A.flush(); await inFlight;                          // A is inside its network call (claim done, no lock held)
  const B = offlineTab(store, JOB1); const tB = traced(store); B.ctx.localStorage = tB.ls; B.ctx.navigator.locks = undefined;
  selectModem(B, 'J1', 'M1');
  assert.equal(await B.ctx.window.wimsSubmit('J1', JOB1), null, 'B queued its report (acknowledged QUEUED)');
  const bRec = qOf(store).find(x => x.job === 'J1'); assert.ok(bRec, 'B\'s record is durable');
  assert.deepEqual(tB.writes, [['set', 'wims_pending_v1.i.' + bRec.qid]], 'B made exactly ONE storage write: its own record (no lock token, no blob, no other record)');
  release(ok({ status: 'filed', receipt: 'r' })); await flushing;
  assert.ok(!qOf(store).some(x => x.qid === 'A'), 'A sent and removed its own record');
  assert.ok(qOf(store).some(x => x.job === 'J1'), 'B\'s acknowledged report survived A\'s finalize');
  const aKeys = new Set(tA.writes.map(w => w[1]));
  for (const k of aKeys) assert.ok(k === 'wims_pending_v1.lock' || k === 'wims_pending_v1.i.A' || k === 'wims_pending_v1.d.A', 'A wrote only: the claim token, its own record, its own tombstone — not ' + k);
  assert.ok(!tA.writes.some(w => w[1] === 'wims_pending_v1'), 'the old client\'s array blob is never written or removed');
  assert.ok(!tA.writes.some(w => w[1] === 'wims_pending_v1.i.' + bRec.qid), 'A never touched B\'s record');
});

test('RC4 B2 (expired / stale owner, no Web Locks): a tab that resumes after its claim token expired finalizes only its own record; a report another tab appended meanwhile is intact', async () => {
  const store = sharedStore(); let release, started; const pending = new Promise(r => { release = r; }), inFlight = new Promise(r => { started = r; });
  const A = boot({ store, handler: (name, args) => (args.p_args || args).p_jo === 'R1' ? (started(), pending) : Promise.reject(new TypeError('Failed to fetch')) }); A.ctx.navigator.locks = undefined;
  store.set('wims_pending_v1', JSON.stringify([{ qid: 'A', rpc: 'complete_install', args: { p_jo: 'R1' }, jo: 'R1', ts: 1, owner: 'uid-1' }]));
  const flushing = A.flush(); await inFlight;
  // model the owner paused far past the 8-second lease: the token (if any) is stale, and another tab appends and releases a held record
  const stale = store.get('wims_pending_v1.lock'); if (stale) store.set('wims_pending_v1.lock', JSON.stringify({ ...JSON.parse(stale), at: Date.now() - 9001 }));
  const B = offlineTab(store, JOB1); B.ctx.navigator.locks = undefined; selectModem(B, 'J1', 'M1');
  assert.equal(await B.ctx.window.wimsSubmit('J1', JOB1), null);
  store.set('wims_pending_v1.i.H', JSON.stringify({ qid: 'H', rpc: 'complete_install', args: { p_jo: 'HELD' }, jo: 'HELD', ts: 2, owner: 'uid-1', held: 'x', kind: 'conflict' }));
  release(ok({ status: 'filed', receipt: 'r' })); await flushing;   // the stale owner resumes and finalizes
  const q = qOf(store);
  assert.ok(q.some(x => x.job === 'J1'), 'B\'s acknowledged report is intact'); assert.ok(q.some(x => x.qid === 'H'), 'the record added meanwhile is intact'); assert.ok(!q.some(x => x.qid === 'A'), 'A removed only its own record');
});

test('RC4 B2 (fail closed): without Web Locks a tab that cannot confirm ownership of the claim token does NOT claim or send anything and does not steal the token', async () => {
  const store = sharedStore(); const sends = [];
  store.set('wims_pending_v1.i.A', JSON.stringify({ qid: 'A', rpc: 'complete_install', args: { p_jo: 'R1' }, jo: 'R1', ts: 1, owner: 'uid-1' }));
  store.set('wims_pending_v1.lock', JSON.stringify({ id: 'other-tab_x', at: Date.now() }));   // held by another tab, fresh
  const F = boot({ store, handler: (name, args) => { sends.push((args.p_args || args).p_jo); return ok({ status: 'filed', receipt: 'r' }); } });
  const t = traced(store); F.ctx.localStorage = t.ls; F.ctx.navigator.locks = undefined;
  // keep the token fresh for the whole bounded wait (the other tab is alive and busy)
  const keep = setInterval(() => store.set('wims_pending_v1.lock', JSON.stringify({ id: 'other-tab_x', at: Date.now() })), 500);
  try { await F.flush(); } finally { clearInterval(keep); }
  assert.deepEqual(sends, [], 'nothing sent'); assert.equal(JSON.parse(store.get('wims_pending_v1.i.A')).lock, undefined, 'record not claimed');
  assert.ok(!t.writes.some(w => w[1] === 'wims_pending_v1.lock'), 'the token was not overwritten while another tab held it');
});

test('RC4 FOC: an OLDER background my_last_foc response landing after a newer accepted filing is dropped (fence); the accepted filing never waits for the read', async () => {
  let n = 0, resolveOld, startedOld; const oldResponse = new Promise(r => { resolveOld = r; }), oldStarted = new Promise(r => { startedOld = r; });
  const b = boot({ jobs: [JOB1], handler: name => {
    if (name === 'my_access') return ok([{ role: 'technician' }]);
    if (name === 'my_last_foc') { if (++n === 1) { startedOld(); return oldResponse; } return ok([{ reel_no: 'R', end_m: 1200 }]); }
    return ok({ status: 'filed', receipt: 'r' }); } });
  b.ctx.navigator.locks = serialLocks();
  b.setQ([{ qid: 'A', rpc: 'complete_install', args: { p_jo: 'OLD-JO', p_foc_reel: 'R', p_foc_start: 1500, p_foc_end: 1300 }, jo: 'OLD-JO', ts: 1, owner: 'uid-1' }]);
  const flushing = b.flush(); await oldStarted;                       // the queued replay's reload is pending (older request)
  change(b, 'J1', 'modem', 'M1'); change(b, 'J1', 'focreel', 'R'); change(b, 'J1', 'focstart', '1300'); change(b, 'J1', 'focend', '1200');
  const done = await Promise.race([b.ctx.window.wimsSubmit('J1', JOB1).then(() => 'completed'), new Promise(r => setTimeout(() => r('blocked'), 200))]);
  assert.equal(done, 'completed', 'the accepted filing returned although a my_last_foc read is still pending');
  await tick(); assert.equal(b.ctx.window.wimsSessionFoc().end_m, 1200, 'the newer filing set the prefill');
  resolveOld(ok([{ reel_no: 'R', end_m: 1300 }])); await flushing; await tick();
  assert.equal(b.ctx.window.wimsSessionFoc().end_m, 1200, 'the older response landing late did not overwrite the newer chronology');
});

test('RC4 FOC: a filing whose own my_last_foc read never answers still completes; the freshly filed reading stays as the prefill', async () => {
  const b = boot({ jobs: [JOB1], handler: name => name === 'my_access' ? ok([{ role: 'technician' }]) : name === 'my_last_foc' ? new Promise(() => { }) : ok({ status: 'filed', receipt: 'accepted' }) });
  change(b, 'J1', 'modem', 'M1'); change(b, 'J1', 'focreel', 'R'); change(b, 'J1', 'focstart', '1500'); change(b, 'J1', 'focend', '1300');
  const done = await Promise.race([b.ctx.window.wimsSubmit('J1', JOB1).then(r => r === null ? 'completed' : 'error:' + r), new Promise(r => setTimeout(() => r('blocked'), 300))]);
  assert.equal(done, 'completed');
  assert.deepEqual(JSON.parse(JSON.stringify(b.ctx.window.wimsSessionFoc())), { reel_no: 'R', end_m: 1300 });
});

test('RC4 storage migration: a legacy blob is moved record by record with DETERMINISTIC ids (two tabs agree), removed only when every record is in its key; a blob an old client writes later is read again', async () => {
  const store = sharedStore(); const locks = serialLocks();
  store.set('wims_pending_v1', JSON.stringify([legacyItem('A', 1), legacyItem('B', 2)]));
  const mk = () => { const b = boot({ store, handler: () => Promise.reject(new TypeError('Failed to fetch')) }); b.ctx.navigator.locks = locks; return b; };
  const t1 = mk(), t2 = mk(); await Promise.all([t1.flush(), t2.flush()]);
  assert.equal(store.has('wims_pending_v1'), true, 'the old client\'s blob is NEVER deleted by this client'); assert.equal(qOf(store).length, 2, 'no duplicate records from two tabs migrating the same blob');
  assert.deepEqual(qOf(store).map(x => x.qid), [legacyId(legacyItem('A', 1)), legacyId(legacyItem('B', 2))], 'content identity, not array position');
  assert.equal([...store.keys()].filter(k => k.startsWith('wims_pending_v1.i.')).length, 2, 'both records copied to their keys');
  // an old client (still running) appends to the blob afterwards → listed and migrated on the next round
  store.set('wims_pending_v1', JSON.stringify([legacyItem('A', 1), legacyItem('B', 2), legacyItem('C', 3)]));
  assert.deepEqual(t1.q().map(x => x.jo), ['A', 'B', 'C']); await t1.flush(); assert.equal(qOf(store).length, 3); assert.equal([...store.keys()].filter(k => k.startsWith('wims_pending_v1.i.')).length, 3);
});

test('RC4: an under-review number (reused / duplicated generation) comes back as a recorded conflict with NO receipt — the report is held with the server\'s reason, completion proceeds', async () => {
  const b = boot({ jobs: [JOB1], handler: name => name === 'my_access' ? ok([{ role: 'technician' }]) : ok({ status: 'conflict', receipt: null, conflict_id: 'c-ur', reason: 'under_review', message: 'This JO number has an earlier WIMS declaration under warehouse review (re-used / duplicated number); your report was recorded and NOT filed — stock was not deducted. The warehouse must bind the earlier declaration first.' }) });
  selectModem(b, 'J1', 'M1');
  assert.equal(await b.ctx.window.wimsSubmit('J1', JOB1), null, 'completion proceeds; the server holds the attempt and the case');
  const held = b.q(); assert.equal(held.length, 1); assert.equal(held[0].kind, 'conflict'); assert.equal(held[0].conflict_id, 'c-ur'); assert.match(held[0].held, /under warehouse review/);
  assert.equal(JSON.parse(JSON.stringify(b.ctx.window.wimsLastOutcome)).reason, 'under_review');
  assert.match(b.toasts.at(-1), /under warehouse review/);
  // the queued path says the real reason too
  const q = boot({ handler: () => ok({ status: 'conflict', receipt: null, conflict_id: 'c-ur2', reason: 'under_review', message: 'under warehouse review' }) });
  q.setQ([{ qid: 'A', rpc: 'complete_install', args: { p_jo: 'R1' }, jo: 'R1', ts: 1, owner: 'uid-1' }]);
  await q.flush(); assert.equal(q.q()[0].kind, 'conflict'); assert.match(q.toasts.join('\n'), /nasa warehouse review ang mas naunang WIMS declaration/);
});

// ---- Codex RC5: non-destructive legacy handoff, durable terminal state, fenced finalize ----
const OLD_REV = '33f290b483ea32fa69e8a2ef93a601a10db000d8';   // the array-writing client Codex pinned
function oldClientAppend(store, item) {   // what the OLD client does on an offline report: read the array, push, write the array (no lock, no keys)
  const cur = JSON.parse(store.get('wims_pending_v1') || '[]'); cur.push(item); store.set('wims_pending_v1', JSON.stringify(cur));
}
test('RC5 B1: an OLD client appends to the blob AFTER the new tab copied it and BEFORE anything else — nothing is ever deleted, the append is listed, migrated and sent on the next round (migration vs old append)', async () => {
  const store = sharedStore(); const locks = serialLocks();
  store.set('wims_pending_v1', JSON.stringify([{ qid: 'H', rpc: 'complete_install', args: { p_jo: 'HELD' }, jo: 'HELD', ts: 1, owner: 'uid-1', held: 'existing conflict', kind: 'conflict' }]));
  const sends = [];
  const A = boot({ store, handler: (name, args) => { sends.push((args.p_args || args).p_jo); return ok({ status: 'filed', receipt: 'r' }); } }); A.ctx.navigator.locks = locks;
  // the new tab hydrates (copies H) …
  await A.flush();
  assert.ok(store.has('wims_pending_v1.i.H'), 'H copied to its key'); assert.ok(store.has('wims_pending_v1'), 'blob NOT removed');
  // … the old tab (pinned revision ' + OLD_REV + ') saves J-B into the array and shows QUEUED
  oldClientAppend(store, { rpc: 'complete_install', args: { p_jo: 'R-JB', p_modem_serial: 'M-JB' }, jo: 'R-JB', ts: 5 });
  assert.ok(JSON.parse(store.get('wims_pending_v1')).some(x => x.jo === 'R-JB'), 'the old client\'s acknowledged append is in the blob');
  // the new tab keeps going: J-B is visible, migrated and sent; the blob is still untouched by the new tab
  assert.ok(A.q().some(x => x.jo === 'R-JB'), 'listed from the blob at once');
  await A.ctx.window.wimsReleaseHeld('H');
  assert.deepEqual(sends.sort(), ['HELD', 'R-JB'], 'both sent');
  assert.ok(store.has('wims_pending_v1'), 'blob still present'); assert.ok(JSON.parse(store.get('wims_pending_v1')).some(x => x.jo === 'R-JB'), 'blob content untouched by the new client');
  assert.deepEqual(A.q(), [], 'both terminal (tombstoned) — nothing active');
  const idJB = legacyId({ rpc: 'complete_install', args: { p_jo: 'R-JB', p_modem_serial: 'M-JB' }, jo: 'R-JB', ts: 5 });
  assert.ok(store.has('wims_pending_v1.d.' + idJB) && store.has('wims_pending_v1.d.H'), 'tombstones carry the stable identities');
  await A.flush(); assert.deepEqual(sends.length, 2, 'a later round does not re-send tombstoned blob records');
});

test('RC5 B1: no-qid legacy records keep their identity when the OLD writer removes an earlier record (content hash, not array position); an interrupted copy is retried', async () => {
  const store = sharedStore(); const locks = serialLocks();
  store.set('wims_pending_v1', JSON.stringify([legacyItem('A', 1), legacyItem('B', 2)]));
  const b = boot({ store, handler: () => Promise.reject(new TypeError('Failed to fetch')) }); b.ctx.navigator.locks = locks;
  await b.flush(); const ids1 = b.q().map(x => x.qid);
  store.set('wims_pending_v1', JSON.stringify([legacyItem('B', 2)]));   // the old client finalized A itself and rewrote the array
  await b.flush(); const ids2 = b.q().map(x => x.qid);
  assert.deepEqual(ids1, [legacyId(legacyItem('A', 1)), legacyId(legacyItem('B', 2))]); assert.deepEqual(ids2, ids1, 'B keeps its identity although its position changed; A\'s copy remains (the server answers a re-send with the same receipt)');
  // interrupted / partial copy: B's key write fails for storage reasons → B stays visible from the blob and the copy is retried on the next hydrate
  const store2 = sharedStore(); store2.set('wims_pending_v1', JSON.stringify([legacyItem('A', 1), legacyItem('B', 2)]));
  const sends = []; let failB = true;
  const c = boot({ store: store2, handler: (name, args) => { sends.push((args.p_args || args).p_jo); return ok({ status: 'filed', receipt: 'r' }); } }); c.ctx.navigator.locks = locks;
  const rawSet = c.ctx.localStorage.setItem; c.ctx.localStorage.setItem = (k, v) => { if (failB && k === 'wims_pending_v1.i.' + legacyId(legacyItem('B', 2))) throw new Error('QuotaExceededError'); return rawSet(k, v); };
  await c.flush();
  assert.deepEqual(sends, ['A'], 'A sent'); assert.ok(c.q().some(x => x.jo === 'B'), 'B still listed (from the blob)'); assert.match(c.toasts.join('\n'), /could not be copied/);
  await c.flush(); assert.deepEqual(sends, ['A'], 'A is NOT re-imported from the surviving blob (tombstone) — partial migration never resurrects an accepted record');
  failB = false; await c.flush(); assert.deepEqual(sends, ['A', 'B'], 'B is copied and sent once the write succeeds'); assert.deepEqual(c.q(), []);
});

test('RC5 P2: a stale finalizer (lease expired, another tab accepted and removed the record) cannot resurrect it; an accepted record is terminal', async () => {
  const store = sharedStore();
  let release; const pending = new Promise(r => { release = r; });
  const A = boot({ store, handler: () => pending }); A.ctx.navigator.locks = undefined;
  store.set('wims_pending_v1.i.X', JSON.stringify({ qid: 'X', rpc: 'complete_install', args: { p_jo: 'R-X' }, jo: 'R-X', ts: 1, owner: 'uid-1' }));
  const flushing = A.flush(); await waitFor(() => { const r = JSON.parse(store.get('wims_pending_v1.i.X') || '{}'); return !!(r.lock && r.lock.tok); });
  const rec = JSON.parse(store.get('wims_pending_v1.i.X')); assert.ok(rec.lock && rec.lock.tok, 'A claimed X with a token');
  store.set('wims_pending_v1.i.X', JSON.stringify({ ...rec, lock: { ...rec.lock, at: Date.now() - 90001 } }));   // A's lease expired while its call hangs
  const B = boot({ store, handler: () => ok({ status: 'filed', receipt: 'r' }) }); B.ctx.navigator.locks = undefined;
  await B.flush();
  assert.equal(store.has('wims_pending_v1.i.X'), false, 'B accepted and removed X'); assert.ok(store.has('wims_pending_v1.d.X'), 'X is tombstoned');
  release(ok({ status: 'conflict', receipt: null, conflict_id: 'c-old', reason: 'under_review', message: 'under review' })); await flushing;   // A's stale conflict outcome arrives late
  assert.equal(store.has('wims_pending_v1.i.X'), false, 'the stale finalizer wrote nothing (fenced on its claim token + the tombstone)');
  assert.ok(!A.toasts.some(t => /R-X/.test(t)), 'no stale hold message');
  // and even a stale write that slipped in is healed by the next listing
  store.set('wims_pending_v1.i.X', JSON.stringify({ qid: 'X', held: 'stale', kind: 'conflict', owner: 'uid-1' }));
  assert.deepEqual(A.q(), [], 'tombstoned → not listed'); assert.equal(A.ctx.window.wimsHeldReports().length, 0, 'the module\'s listing ignores it'); assert.equal(store.has('wims_pending_v1.i.X'), false, 'and removed it');
});
