// mobile-nap.test.mjs — phase 8 NAP VIEW tile (FieldOps -> NAP site handoff). Runs mobile-nap.js in a tiny fake DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const SRC = readFileSync(new URL('./mobile-nap.js', import.meta.url), 'utf8');

function el(tag, doc) {
  const e = { tagName: tag.toUpperCase(), style: {}, children: [], hidden: false, attrs: {}, parent: null, clicks: 0,
    appendChild(c) { c.parent = e; e.children.push(c); doc.all.push(c); return c; },
    remove() { if (e.parent) e.parent.children = e.parent.children.filter((x) => x !== e); doc.all = doc.all.filter((x) => x !== e); e.parent = null; },
    click() { e.clicks++; doc.opened.push({ href: e.href, target: e.target, rel: e.rel, attached: !!e.parent }); },
    addEventListener() {}, setAttribute(k, v) { e.attrs[k] = v; }, querySelector() { return null; }, querySelectorAll() { return []; } };
  Object.defineProperty(e, 'style', { value: { cssText: '' }, writable: true });
  return e;
}
// access: the my_nap_access answer ({audit, view}); 'missing' = a database without nap-17 (PGRST202) -> fallback to my_role
function load({ role = 'field', access, session, refresh, noAuth = false } = {}) {
  if (access === undefined) access = { audit: role === 'field', view: role === 'field' };
  const doc = { all: [], opened: [] };
  doc.body = el('body', doc);
  doc.createElement = (t) => el(t, doc);
  doc.getElementById = (id) => doc.all.find((x) => x.id === id) || null;
  const calls = [];
  const sb = {
    schema: () => ({ rpc: (name) => {
      calls.push(name);
      if (name === 'my_nap_access') return Promise.resolve(access === 'missing' ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function nap.my_nap_access without parameters in the schema cache' }, status: 404 }
        : { data: { audit: access.audit, view: access.view, role }, error: null });
      return Promise.resolve({ data: name === 'my_role' ? role : false, error: null }); }, from: () => ({}) }),
    storage: { from: () => ({}) },
    auth: noAuth ? undefined : {
      getSession: () => { calls.push('getSession'); return Promise.resolve({ data: { session: session === undefined ? null : session }, error: null }); },
      refreshSession: () => { calls.push('refreshSession'); return Promise.resolve(refresh || { data: { session: null }, error: { message: 'no refresh token' } }); },
    },
  };
  const toasts = [];
  const win = { NapCore: req('./nap-core.js'), NapApi: req('./nap-api.js'), document: doc, crypto: globalThis.crypto, URL, console, setTimeout, clearTimeout, Date, Promise };
  win.window = win; win.self = win;
  vm.createContext(win);
  vm.runInContext(SRC, win);
  return { win, doc, sb, calls, toasts, ctx: { sb, team: 'AHBA_QAS001', name: 'x', technicians: () => '', toast: (m) => toasts.push(m) } };
}
const now = () => Math.floor(Date.now() / 1000);
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImFoYmFfcWFzMDAxQGFoYmFmaWVsZC5hcHAifQ.sig_sig-sig';

test('NAP VIEW tile: only when the server says view, next to NAP Audit, no duplicates, plain site link without a token', async () => {
  for (const role of ['none', 'viewer', 'dispatcher', 'admin', 'superadmin']) {
    const m = load({ role });
    await m.win.NapMobile.init(m.ctx);
    assert.equal(m.doc.getElementById('napViewTile'), null, role);
    assert.equal(m.doc.getElementById('napTile'), null, role);
  }
  const m = load({ role: 'field' });
  await m.win.NapMobile.init(m.ctx);
  await m.win.NapMobile.init(m.ctx);
  const t = m.doc.getElementById('napViewTile');
  assert.ok(t && m.doc.getElementById('napTile'));
  assert.equal(m.doc.all.filter((x) => x.id === 'napViewTile').length, 1, 'no duplicate after a second init');
  assert.deepEqual([t.tagName, t.textContent, t.href, t.target, t.rel], ['A', 'NAP VIEW', 'https://nap.ahbadevt.com/', '_blank', 'noopener noreferrer']);
});

test('NAP VIEW click: fresh session token goes in the fragment (#h=), never the query string; no refresh needed', async () => {
  const m = load({ session: { access_token: TOKEN, refresh_token: 'REFRESH-SECRET', expires_at: now() + 3000 } });
  await m.win.NapMobile.init(m.ctx);
  let prevented = false;
  m.doc.getElementById('napViewTile').onclick({ preventDefault() { prevented = true; } });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(prevented, true);
  assert.equal(m.doc.opened.length, 1);
  const o = m.doc.opened[0];
  assert.equal(o.href, 'https://nap.ahbadevt.com/#h=' + encodeURIComponent(TOKEN));
  assert.ok(!o.href.includes('?'), 'no query string');
  assert.ok(!o.href.includes('REFRESH-SECRET'), 'never the refresh token');
  assert.deepEqual([o.target, o.rel, o.attached], ['_blank', 'noopener noreferrer', true]);
  assert.equal(m.doc.all.filter((x) => x.tagName === 'A').length, 1, 'the temporary link is removed again');
  assert.equal(m.calls.includes('refreshSession'), false);
  assert.deepEqual(m.toasts, []);
  assert.equal(m.doc.getElementById('napViewTile').href, 'https://nap.ahbadevt.com/', 'the tile itself never carries the token');
});

test('NAP VIEW click: token expiring within 2 minutes (or missing) -> the phone refreshes its own session first', async () => {
  for (const session of [{ access_token: 'OLD', expires_at: now() + 100 }, null, { expires_at: now() + 3000 }]) {
    const m = load({ session, refresh: { data: { session: { access_token: TOKEN, expires_at: now() + 3600 } }, error: null } });
    await m.win.NapMobile.init(m.ctx);
    await m.win.NapMobile.openView();
    assert.deepEqual(m.calls.filter((c) => c === 'getSession' || c === 'refreshSession'), ['getSession', 'refreshSession'], JSON.stringify(session));
    assert.equal(m.doc.opened[0].href, 'https://nap.ahbadevt.com/#h=' + encodeURIComponent(TOKEN));
    assert.deepEqual(m.toasts, []);
  }
});

test('NAP VIEW click: refresh fails / still short / throws -> plain site + toast to sign in there', async () => {
  const cases = [
    { session: null },
    { session: { access_token: 'OLD', expires_at: now() + 30 }, refresh: { data: { session: { access_token: 'NEW', expires_at: now() + 60 } }, error: null } },
    { session: null, refresh: Promise.reject(new Error('offline')) },
    { noAuth: true },
  ];
  for (const c of cases) {
    const m = load(c);
    await m.win.NapMobile.init(m.ctx);
    await m.win.NapMobile.openView();
    assert.equal(m.doc.opened.length, 1);
    assert.equal(m.doc.opened[0].href, 'https://nap.ahbadevt.com/');
    assert.deepEqual(m.toasts, ['Sign in on the NAP site with your FieldOps username and password']);
  }
});

test('NAP VIEW: nothing opens after sign-off removed the tile, nor twice for a double tap', async () => {
  const m = load({ session: { access_token: TOKEN, expires_at: now() + 3000 } });
  await m.win.NapMobile.init(m.ctx);
  const p1 = m.win.NapMobile.openView(), p2 = m.win.NapMobile.openView();
  await Promise.all([p1, p2]);
  assert.equal(m.doc.opened.length, 1, 'double tap opens one tab');
  m.doc.getElementById('napViewTile').remove();   // what signOff does
  await m.win.NapMobile.openView();
  assert.equal(m.doc.opened.length, 1, 'no tab after sign-off');
});

test('two entries, each from the server answer (nap.my_nap_access), one RPC decides both', async () => {
  const cases = [[{ audit: true, view: true }, true, true], [{ audit: true, view: false }, true, false], [{ audit: false, view: true }, false, true], [{ audit: false, view: false }, false, false],
    [{ audit: 'true', view: 1 }, false, false]];
  for (const [access, audit, view] of cases) {
    const m = load({ role: 'field', access });
    await m.win.NapMobile.init(m.ctx);
    assert.deepEqual([!!m.doc.getElementById('napTile'), !!m.doc.getElementById('napViewTile')], [audit, view], JSON.stringify(access));
    assert.equal(m.calls.filter((c) => c === 'my_nap_access').length, 1);
    assert.equal(m.calls.includes('my_role'), false, 'no second role call when my_nap_access answers');
  }
});

test('database without nap-17: falls back to my_role (pilot field = both entries, others none)', async () => {
  for (const [role, want] of [['field', true], ['none', false], ['dispatcher', false]]) {
    const m = load({ role, access: 'missing' });
    await m.win.NapMobile.init(m.ctx);
    assert.deepEqual([!!m.doc.getElementById('napTile'), !!m.doc.getElementById('napViewTile')], [want, want], role);
    assert.deepEqual(m.calls.filter((c) => c === 'my_nap_access' || c === 'my_role'), ['my_nap_access', 'my_role']);
  }
});
