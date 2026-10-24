// AHBA FieldOps — NAP Audit screen (pilot). Self-contained: builds its own modal. Needs NapCore, NapApi and the mobile globals listed in ctx.
(function () {
  'use strict';
  var C = NapCore, S = C.STATUS, api, ctx, role = 'none', gate = false, pos = null, dispatched = [];
  // Phase 2B (whole QC, ~46k boxes): the phone NEVER downloads the box list. With a GPS fix it asks for the boxes near it
  // (nap.boxes_near, 1.5 km, 60 nearest); typing a stencil asks nap.search_boxes (debounced, 3+ characters).
  var NEAR_M = 1500, NEAR_N = 60, SEARCH_MIN = 3, SEARCH_MS = 400;
  var rangeStep = 0, near = [], nearState = 'idle', found = [], findState = 'idle', findSeq = 0, findTimer = null;
  // Phase 7 (nap-16): Full NAP flow only, "This job's NAP is deactivated": a search over DEACTIVATED boxes (nap.search_inactive_boxes)
  var deactFound = [], deactState = 'idle', deactSeq = 0, deactTimer = null;
  var SAVE_LABEL = 'Submit audit', SAVE_LABEL_DEACT = 'Submit deactivated-NAP record';
  var short = {}; short[S.AWT] = 'Active\nw/ tag'; short[S.AWO] = 'Active\nw/o tag'; short[S.VACANT] = 'Vacant'; short[S.RELEASED] = 'Released'; short[S.HILOSS] = 'Hi Loss'; short[S.DEFECTIVE] = 'Defec-\ntive';
  function q(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); })); }

  // Rejects when the role cannot be read (offline start): the caller may retry init on its next start.
  // Phase 8: ONE server call decides both entries (nap.my_nap_access: {audit, view, role}): NAP Audit for NAP technicians (pilot teams, or
  // every GC technician when the owner set tech_access_scope = 'gc'), NAP VIEW (the view-only Board on the NAP site) likewise.
  var canAudit = false, canView = false;
  async function init(c) {
    ctx = c; api = NapApi.create(c.sb); role = 'none'; canAudit = false; canView = false;
    var acc = await api.myNapAccess();
    role = acc.role; canAudit = acc.audit === true; canView = acc.view === true;
    if (canView) mountViewTile();
    if (!canAudit) return;                      // only NAP technicians can upload to the nap-photos bucket / submit audits
    p12LocInit();                               // phase 12: "Update NAP location from my GPS" (async; hidden until the server says yes)
    p14Init();                                  // phase 14: stage / remark / PDS controls in the audit form (async; hidden until the server says yes)
    try { gate = await api.gateApplies(); } catch (e) { /* gate unknown: keep default, tile still shows */ }
    mountTile();
  }
  function mountTile() {
    if (q('napTile')) return;
    var b = document.createElement('button'); b.id = 'napTile'; b.className = 'btn-primary'; b.textContent = 'NAP Audit';
    b.style.cssText = 'position:fixed;right:14px;bottom:78px;z-index:50;border-radius:22px;padding:10px 16px';
    b.onclick = function () { open(); }; document.body.appendChild(b);
  }

  // ---------- Phase 8: NAP VIEW = the view-only NAP Board on the NAP site, signed in with this phone's session ----------
  // Shown when the server says view = true (nap.my_nap_access). It opens https://nap.ahbadevt.com/ in a new tab with the phone's ACCESS
  // token in the URL FRAGMENT (#h=..., never the query string: a fragment is not sent to any server). Never the refresh token (a second
  // client using it would trip Supabase's refresh-token reuse detection and could sign the phone out). The dashboard removes the fragment
  // at once and keeps the token in memory only (about an hour). No token / refresh failed: the plain site opens and a toast says to sign in.
  var NAP_SITE = 'https://nap.ahbadevt.com/', HO_MIN_LEFT_S = 120, viewBusy = false;
  function handoffHref(token) { return NAP_SITE + (token ? '#h=' + encodeURIComponent(token) : ''); }
  function mountViewTile() {
    if (q('napViewTile')) return;
    var a = document.createElement('a'); a.id = 'napViewTile'; a.className = 'btn-primary'; a.textContent = 'NAP VIEW';
    a.href = NAP_SITE; a.target = '_blank'; a.rel = 'noopener noreferrer';   // the plain site if the script below cannot run
    a.style.cssText = 'position:fixed;right:14px;bottom:126px;z-index:50;border-radius:22px;padding:10px 16px;text-decoration:none;text-align:center';
    a.onclick = function (e) { if (e && e.preventDefault) e.preventDefault(); openView(); };
    document.body.appendChild(a);
  }
  // the phone's current access token with at least HO_MIN_LEFT_S left: read at click time, refreshed first (the phone's OWN session) when
  // it is missing or about to expire. '' when there is none.
  async function freshToken() {
    var auth = ctx && ctx.sb && ctx.sb.auth;
    if (!auth) return '';
    var left = function (s) { return s && s.access_token ? Number(s.expires_at) - Date.now() / 1000 : -1; };
    var r = await auth.getSession(), s = r && r.data && r.data.session;
    if (!(left(s) > HO_MIN_LEFT_S)) { r = await auth.refreshSession(); s = r && r.data && r.data.session; }
    return left(s) > HO_MIN_LEFT_S ? String(s.access_token) : '';
  }
  // a real link click (target _blank, noopener): window.open with noopener returns null and some browsers block it after an await
  function openLink(href) {
    var a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.display = 'none';
    document.body.appendChild(a);
    try { a.click(); } finally { a.remove(); }
  }
  async function openView() {
    if (viewBusy) return;
    viewBusy = true;
    var tok = '';
    try { tok = await freshToken(); } catch (e) { tok = ''; } finally { viewBusy = false; }
    if (!canView || !q('napViewTile')) return;   // signed off meanwhile (signOff removes the tile)
    var had = !!tok;
    openLink(handoffHref(tok));
    tok = '';
    if (!had) { try { ctx.toast('Sign in on the NAP site with your FieldOps username and password'); } catch (e) { /* toast is cosmetic */ } }
  }
  // Non-pilot users never pay a network round trip; the server trigger stays the real control.
  async function gateActive() {
    if (!canAudit || !api) return false;
    try { gate = await api.gateApplies(); } catch (e) { /* keep last value */ }
    return gate;
  }

  // ---------- modal ----------
  var st = null;   // current audit state
  function ensureModal() {
    if (q('napModal')) return;
    var d = document.createElement('div'); d.id = 'napModal'; d.hidden = true;
    d.style.cssText = 'position:fixed;inset:0;z-index:100;background:var(--bg,#fff);overflow:auto;padding:14px 14px 90px';
    d.innerHTML = '<style>#napModal input[type=text],#napModal input:not([type]),#napModal input[inputmode],#napModal select{box-sizing:border-box;max-width:100%}</style>' +
      '<h3 id="napTitle" style="margin:0 0 4px">NAP Audit</h3><p id="napSub" style="font-size:12px;opacity:.7;margin:0 0 10px"></p>' +
      '<div id="napPick"><div id="napDisp"></div><label class="lbl">Nearby NAPs (team GPS)</label><div id="napNear" style="max-height:200px;overflow:auto;border:1px solid #d6dde2;border-radius:8px"></div>' +
      '<div id="napRange" hidden style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px;font-size:12.5px"><span id="napRangeLbl"></span><span><button type="button" id="napRangeMore" style="padding:6px 10px">Expand range</button> <button type="button" id="napRangeReset" style="padding:6px 10px">Reset</button></span></div>' +
      '<input id="napSearch" placeholder="Or type the stencil (QCY003 LP114 NP6-7-8)" style="width:100%;margin-top:8px;padding:8px">' +
      '<div id="napDeactLinkWrap" hidden style="margin-top:14px;padding-top:10px;border-top:1px dashed #d6dde2"><a href="#" id="napDeactLink" style="font-size:13px">This job\'s NAP is deactivated</a>' +
      '<div style="font-size:11.5px;opacity:.7;margin-top:2px">Only when the JO\'s NAP was removed or deactivated in the NAP master. Needs GPS and a photo; the dispatcher reviews it.</div></div></div>' +
      '<div id="napDeactPick" hidden><label class="lbl" for="napDeactSearch">Deactivated NAPs</label>' +
      '<input id="napDeactSearch" placeholder="Type the stencil of the JO\'s NAP (QCY003 LP114)" style="width:100%;padding:8px">' +
      '<div id="napDeactList" style="max-height:240px;overflow:auto;border:1px solid #d6dde2;border-radius:8px;margin-top:8px"></div>' +
      '<a href="#" id="napDeactBack" style="display:inline-block;font-size:12px;margin-top:10px">Back: the NAP is active (pick it from the list)</a></div>' +
      '<div id="napForm" hidden>' +
      '<div id="napBox" style="font-weight:600;margin:6px 0;overflow-wrap:anywhere"></div><div id="napInfo" style="font-size:12px;opacity:.75"></div>' +
      '<div id="napDeactInfo" hidden style="margin:8px 0;padding:8px;border:1px solid #c2503a;border-radius:8px;font-size:12.5px">' +
      '<div><b style="color:#c2503a">DEACTIVATED NAP</b>: no port reading. Saving this record lets you close the JO as FULL NAP; the dispatcher reviews it.</div>' +
      '<label class="lbl" for="napDeactNote" style="display:block;margin-top:6px">Note (optional)</label><input id="napDeactNote" maxlength="300" placeholder="What you saw on site" style="width:100%;padding:8px">' +
      '<a href="#" id="napDeactRepick" style="display:inline-block;font-size:12px;margin-top:6px">Pick a different NAP</a></div>' +
      '<div id="napPortsWrap"><label class="lbl" for="napNp">NAP No.</label><select id="napNp" style="width:100%;padding:8px"></select></div>' +
      '<div id="napGps" style="font-size:12px;margin:8px 0"></div>' +
      '<div id="napLocWrap" hidden style="margin:0 0 8px"><button type="button" class="btn-ghost" id="napLocBtn" style="width:100%">Update NAP location from my GPS</button>' +
      '<div id="napLocMsg" role="status" aria-live="polite" style="font-size:12px;margin-top:4px;overflow-wrap:anywhere"></div></div>' +
      '<div id="napGridWrap"><label class="lbl">Audited Port</label><div id="napGrid"></div><div id="napTags"></div><div id="napP14" hidden></div></div>' +
      '<label class="lbl" id="napPhotoLbl" style="margin-top:8px">Photo of the NAP reading <em style="color:#c2503a">*required</em></label>' +
      '<div style="display:flex;gap:8px"><label class="addphoto" style="flex:1">Camera<input type="file" accept="image/*" capture="environment" id="napCam" hidden></label><label class="addphoto" style="flex:1">Album<input type="file" accept="image/*" multiple id="napAlb" hidden></label></div>' +
      '<div id="napThumbs" class="thumbs" style="margin-top:6px"></div>' +
      '<div id="napNf" style="margin-top:8px"><a href="#" id="napNfLink" style="font-size:12px">NAP not found or not accessible</a><div id="napNfBox" hidden><input id="napNfWhy" placeholder="Reason" style="width:100%;padding:8px;margin-top:6px"></div></div>' +
      '<div id="napErr" style="color:#c2503a;font-size:13px;margin-top:8px"></div></div>' +
      '<div style="position:fixed;left:0;right:0;bottom:0;padding:10px 14px;background:var(--bg,#fff);display:flex;gap:8px;border-top:1px solid #d6dde2">' +
      '<button class="btn-ghost" id="napCancel" style="flex:1">Cancel</button><button class="btn-primary" id="napSave" style="flex:1" disabled>Submit audit</button></div>';
    document.body.appendChild(d);
    q('napCancel').onclick = function () { if (st && st.saving) return; close(false); };
    q('napSearch').oninput = onSearchInput;
    q('napRangeMore').onclick = function () { setRange(C.nextPhoneRange(rangeStep).step); };
    q('napRangeReset').onclick = function () { setRange(0); };
    q('napNp').onchange = function () { if (st.saving) return; st.np = +q('napNp').value; st.ports = Array(8).fill(null); st.tags = {}; renderForm(); };
    q('napCam').onchange = q('napAlb').onchange = function (e) { addFiles(e.target.files); e.target.value = ''; };
    q('napNfLink').onclick = function (e) { e.preventDefault(); if (st.saving) return; st.notFound = !st.notFound; q('napNfBox').hidden = !st.notFound; validate(); };
    q('napNfWhy').oninput = validate;
    q('napDeactLink').onclick = function (e) { e.preventDefault(); if (st && !st.saving) enterDeact(); };
    q('napDeactBack').onclick = function (e) { e.preventDefault(); if (st && !st.saving) leaveDeact(); };
    q('napDeactRepick').onclick = function (e) { e.preventDefault(); if (st && !st.saving) enterDeact(); };
    q('napDeactSearch').oninput = onDeactSearch;
    q('napGps').addEventListener('click', function (e) { if (e.target.id === 'napGpsRetry') { e.preventDefault(); if (st && !st.saving) requestGps(st); } });
    q('napSave').onclick = save;
    q('napLocBtn').onclick = function () { p12LocUpdate(); };
    q('napGrid').addEventListener('change', function (e) { var r = e.target; if (!st.saving && r.name && r.name.indexOf('np') === 0) { st.ports[+r.name.slice(2)] = r.value; renderTags(); validate(); } });
  }

  var thumbUrls = [];
  function renderThumbs() {
    thumbUrls.forEach(function (u) { URL.revokeObjectURL(u); }); thumbUrls = [];
    q('napThumbs').innerHTML = (st ? st.files : []).map(function (b) { var u = URL.createObjectURL(b); thumbUrls.push(u); return '<img src="' + u + '" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:6px;margin-right:6px">'; }).join('');
  }
  function setSaving(on) { st.saving = on; q('napForm').inert = on; q('napCancel').disabled = on; }

  async function open(opts) {
    ensureModal(); opts = opts || {};
    if (st && st.saving) return;                                   // never disturb an in-flight save
    if (st && st.cancel) { var pc = st.cancel; st.cancel = null; pc(); }   // resolve the stranded submitForJob promise (false)
    pos = null;
    q('napForm').inert = false; q('napCancel').disabled = false;
    st = { box: null, np: null, ports: Array(8).fill(null), tags: {}, files: [], notFound: false, deact: false, job: opts.job || null, full: !!opts.declaredFull, done: opts.onDone || null, clientId: uuid(), saving: false, cancel: opts.onCancel || null };
    var mine = st;
    q('napTitle').textContent = st.full ? 'NAP Details (Full NAP)' : 'NAP Audit';
    q('napSub').textContent = st.job ? 'For JO ' + st.job.id : 'Select the NAP your team visited.';
    q('napPick').hidden = false; q('napForm').hidden = true; q('napErr').textContent = ''; q('napSearch').value = ''; renderThumbs();
    q('napDeactPick').hidden = true; q('napDeactLinkWrap').hidden = !(st.full && st.job); q('napSave').textContent = SAVE_LABEL;
    deactFound = []; deactState = 'idle'; deactSeq++; clearTimeout(deactTimer);
    rangeStep = 0; near = []; nearState = 'gps'; found = []; findState = 'idle'; findSeq++; clearTimeout(findTimer);
    q('napModal').hidden = false; q('napSave').disabled = true;
    q('napDisp').innerHTML = '';   // a fresh list (filter cleared) on every open
    renderDisp();   // last known list shows at once; the refresh below never depends on the board list
    loadDispatch(mine);
    // a GPS fix only refreshes the list and the distance line: re-rendering the form would drop focus from the acct no. inputs
    var gpsOk = false;
    try {
      if (navigator.geolocation) {
        gpsOk = true;
        navigator.geolocation.getCurrentPosition(function (p) { if (st !== mine || st.saving) return; pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() }; loadNear(mine); renderDisp(); if (st.box) { renderGps(); if (st.deact) validate(); } },
          function () { if (st !== mine || st.saving) return; pos = null; nearState = 'nogps'; renderNear(); renderDisp(); if (st.box) { renderGps(); if (st.deact) validate(); } }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 });
      }
    } catch (e) { gpsOk = false; }
    if (!gpsOk) nearState = 'nogps';
    renderNear();
    // Full NAP flow: the JO's NAPCODE names one NAP number; find its box with one small search (never the whole list)
    var jq = st.job && st.job.napcode ? C.jobNapQuery(st.job.napcode) : null;
    if (jq) {
      try {
        var rows = await api.searchBoxes(jq.q, 10);
        if (st !== mine || st.box || st.saving) return;
        var hit = C.matchJobBox(rows, jq);
        if (hit) pick(hit, jq.np);
        else q('napSub').textContent = 'For JO ' + st.job.id + ': NAP ' + jq.q + ' was not found. Pick the NAP below or type its stencil.';
      } catch (e) {
        if (st === mine && !st.box) q('napErr').textContent = 'Cannot look up the JO NAP: ' + (e && e.message || e) + '. Type the stencil instead.';
      }
    }
  }
  // Boxes near the phone (server-side radius search). A failure keeps the typed search working.
  function loadNear(mine) {
    if (!pos) return Promise.resolve();
    nearState = 'loading'; renderNear();
    var p; try { p = Promise.resolve(api.boxesNear({ lat: pos.lat, lng: pos.lng, radius: C.phoneRange(rangeStep).m, limit: C.phoneRange(rangeStep).n })); } catch (e) { p = Promise.reject(e); }
    return p.then(function (rows) { if (st !== mine) return; near = Array.isArray(rows) ? rows : []; nearState = 'ok'; renderNear(); p14FillNear(mine, near); },
      function (e) { if (st !== mine) return; near = []; nearState = 'error'; if (window.console) console.warn('NAP boxes_near', e); renderNear(); });
  }
  function onSearchInput() {
    var term = C.normStencil(q('napSearch').value), mine = st, seq = ++findSeq;
    clearTimeout(findTimer);
    if (term.length < SEARCH_MIN) { found = []; findState = term ? 'short' : 'idle'; renderNear(); return; }
    findState = 'loading'; renderNear();
    findTimer = setTimeout(function () {
      var p; try { p = Promise.resolve(api.searchBoxes(term, 12)); } catch (e) { p = Promise.reject(e); }
      p.then(function (rows) { if (st !== mine || seq !== findSeq) return; found = Array.isArray(rows) ? rows : []; findState = 'ok'; renderNear(); },
        function (e) { if (st !== mine || seq !== findSeq) return; found = []; findState = 'error:' + String(e && e.message || e).replace(/^NAP_[A-Z0-9_]+:\s*/, ''); renderNear(); });
    }, SEARCH_MS);
  }
  // "Dispatched to your team": independent of the board list. A failing my_dispatch is logged and shows nothing.
  function loadDispatch(mine) {
    var p; try { p = Promise.resolve(api.myDispatch()); } catch (e) { p = Promise.reject(e); }
    return p.then(function (rows) { dispatched = Array.isArray(rows) ? rows : []; }, function (e) { if (window.console) console.warn('NAP my_dispatch', e); dispatched = []; })
      .then(function () { if (st === mine) renderDisp(); });
  }
  function fmtDue(d) { return d ? String(d).slice(0, 10) : ''; }
  function dispBox(it) { return { box_id: it.box_id, stencil: it.stencil, street: [it.street, it.barangay].filter(Boolean).join(', '), barangay: it.barangay, dwelling: it.dwelling, lat: it.lat, lng: it.lng, np_numbers: Array.isArray(it.np_numbers) && it.np_numbers.length ? it.np_numbers : [1], converge_available: it.converge_available }; }
  // A team may now hold 50-400 items (dispatch plans): compact rows in a scrolling box, nearest first when the phone has a fix (else by
  // due date, then stencil), a count per barangay that filters with one tap, and a text filter (stencil / street / barangay).
  // Only DISP_MAX rows are drawn at a time; the filter reaches the rest. The filter box is built once per open, so typing keeps focus.
  var DISP_MAX = 150, dispQ = '', dispB = '';
  function dispSorted() {
    var withD = dispatched.map(function (it, i) { var has = it.lat != null && it.lng != null; return { it: it, i: i, d: pos && has ? C.haversineM(pos.lat, pos.lng, +it.lat, +it.lng) : null }; });
    return withD.sort(function (a, b) {
      if (pos && (a.d == null) !== (b.d == null)) return a.d == null ? 1 : -1;
      if (pos && a.d != null && a.d !== b.d) return a.d - b.d;
      var da = a.it.due_date || '9999', db = b.it.due_date || '9999';
      return da < db ? -1 : da > db ? 1 : String(a.it.stencil) < String(b.it.stencil) ? -1 : String(a.it.stencil) > String(b.it.stencil) ? 1 : 0;
    });
  }
  function renderDisp() {
    var el = q('napDisp'); if (!el) return;
    if (!dispatched.length) { el.innerHTML = ''; el.onclick = null; el.oninput = null; return; }
    if (!q('napDispList')) {
      dispQ = ''; dispB = '';
      el.innerHTML = '<label class="lbl" id="napDispH"></label><div id="napDispB" style="display:flex;flex-wrap:wrap;gap:4px;margin:2px 0 6px"></div>' +
        '<input id="napDispQ" type="search" placeholder="Filter your list: stencil, street or barangay" style="width:100%;box-sizing:border-box;padding:7px;margin-bottom:6px" hidden>' +
        '<div id="napDispList" style="max-height:45vh;overflow:auto;border:1px solid #d6dde2;border-radius:8px;margin-bottom:10px"></div>';
      q('napDispQ').oninput = function () { dispQ = C.normStencil(this.value); renderDisp(); };
      el.onclick = function (e) {
        var c = e.target.closest('[data-b]');
        if (c) { dispB = dispB === c.dataset.b ? '' : c.dataset.b; renderDisp(); return; }
        var b = e.target.closest('[data-i]');
        if (b && st && !st.saving && dispatched[+b.dataset.i]) pick(dispBox(dispatched[+b.dataset.i]));
      };
    }
    var counts = {}; dispatched.forEach(function (it) { var k = String(it.barangay || '').trim() || 'UNASSIGNED'; counts[k] = (counts[k] || 0) + 1; });
    var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || (a < b ? -1 : a > b ? 1 : 0); });
    if (dispB && !counts[dispB]) dispB = '';
    var rows = dispSorted().filter(function (x) {
      var it = x.it, k = String(it.barangay || '').trim() || 'UNASSIGNED';
      if (dispB && k !== dispB) return false;
      return !dispQ || C.normStencil([it.stencil, it.street, it.barangay].join(' ')).indexOf(dispQ) >= 0;
    });
    q('napDispH').textContent = 'Dispatched to your team (' + dispatched.length + ')' + (rows.length !== dispatched.length ? ': showing ' + rows.length : '');
    q('napDispB').innerHTML = names.length > 1 ? names.map(function (k) {
      var on = k === dispB;
      return '<button type="button" data-b="' + esc(k) + '" style="border:1px solid ' + (on ? '#0f5f8c' : '#d6dde2') + ';background:' + (on ? '#0f5f8c' : 'none') + ';color:' + (on ? '#fff' : 'inherit') + ';border-radius:12px;padding:3px 9px;font-size:12px">' + esc(k) + ' ' + counts[k] + '</button>';
    }).join('') : '';
    q('napDispQ').hidden = dispatched.length <= 8;
    q('napDispList').innerHTML = rows.slice(0, DISP_MAX).map(function (x) {
      var it = x.it, has = it.lat != null && it.lng != null, d = x.d != null ? Math.round(x.d) + ' m' : '';
      return '<button type="button" data-i="' + x.i + '" style="display:block;width:100%;padding:6px 8px;border:0;border-bottom:1px solid #eee;background:none;text-align:left;box-sizing:border-box">' +
        '<span style="display:flex;justify-content:space-between;gap:8px"><span style="font-family:monospace;font-size:13px;overflow-wrap:anywhere">' + esc(it.stencil) + '</span><span style="opacity:.6;white-space:nowrap;font-size:12px">' + esc(d) + '</span></span>' +
        '<span style="display:block;font-size:11.5px;opacity:.75;overflow-wrap:anywhere">' + esc([it.street, it.barangay].filter(Boolean).join(', ')) + (it.due_date ? ' · due ' + esc(fmtDue(it.due_date)) : '') +
        (has ? '' : ' · <span style="color:#d98518">no coordinates yet</span>') + '</span></button>';
    }).join('') + (rows.length > DISP_MAX ? '<div style="padding:8px;font-size:12px;opacity:.7">' + (rows.length - DISP_MAX) + ' more: filter by barangay or type to narrow the list.</div>' : '') +
      (!rows.length ? '<div style="padding:8px;opacity:.6">Nothing matches the filter.</div>' : '');
  }
  // Expand range (1.5 -> 3 -> 5 km): hidden without GPS or while a stencil is typed. The busy lock is nearState 'loading'; no polling.
  function renderRange() {
    var w = q('napRange'); if (!w) return;
    var r = C.phoneRange(rangeStep), show = !!pos && nearState !== 'gps' && nearState !== 'nogps' && !C.normStencil(q('napSearch').value);
    w.hidden = !show; w.style.display = show ? 'flex' : 'none';
    q('napRangeLbl').textContent = r.label;
    var busy = nearState === 'loading';
    q('napRangeMore').hidden = r.last; q('napRangeMore').disabled = busy; q('napRangeReset').hidden = rangeStep === 0; q('napRangeReset').disabled = busy;
  }
  function setRange(step) {
    if (!pos || nearState === 'loading' || !st || st.saving) return;
    rangeStep = step; loadNear(st);
  }
  function renderNear() {
    renderRange();
    var el = q('napNear'); if (!el) return;
    var typed = C.normStencil(q('napSearch').value), list = [], msg = '';
    if (typed) {
      if (findState === 'short') msg = 'Type at least ' + SEARCH_MIN + ' characters of the stencil.';
      else if (findState === 'loading') msg = 'Searching…';
      else if (findState.indexOf('error:') === 0) msg = 'Cannot search: ' + findState.slice(6);
      else { list = found.map(function (b) { return { b: b, d: pos && b.lat != null && b.lng != null ? C.haversineM(pos.lat, pos.lng, b.lat, b.lng) : null }; }); if (!list.length) msg = 'No NAP matches "' + typed + '".'; }
    } else if (nearState === 'ok') {
      list = near.map(function (b) { return { b: b, d: b.distance_m }; });
      if (!list.length) msg = 'No NAP with coordinates within ' + C.fmtRange(C.phoneRange(rangeStep).m) + '. Type the stencil.';
    } else if (nearState === 'loading') msg = 'Loading the NAPs near you…';
    else if (nearState === 'error') msg = 'Cannot load the NAPs near you. Type the stencil instead.';
    else if (nearState === 'nogps') msg = 'No GPS. Type the stencil (at least ' + SEARCH_MIN + ' characters), for example QCY003 LP114.';
    else msg = 'Waiting for GPS… or type a stencil.';
    el.innerHTML = list.length ? list.map(function (x, i) { return '<button type="button" data-i="' + i + '" style="display:flex;justify-content:space-between;gap:8px;width:100%;padding:8px;border:0;border-bottom:1px solid #eee;background:none;text-align:left"><span style="font-family:monospace;overflow-wrap:anywhere">' + esc(x.b.stencil) + p14Chip(x.b) + '</span><span style="opacity:.6;white-space:nowrap">' + (x.d == null ? (x.b.lat == null ? 'no coordinates' : '') : Math.round(x.d) + ' m') + '</span></button>'; }).join('')
      : '<div style="padding:8px;opacity:.6">' + esc(msg) + '</div>';
    el.onclick = function (e) { var b = e.target.closest('button'); if (b && st && !st.saving && list[+b.dataset.i]) pick(list[+b.dataset.i].b); };
  }
  function pick(b, np) {
    st.box = b; st.np = np || b.np_numbers[0]; st.ports = Array(8).fill(null); st.tags = {};
    q('napPick').hidden = true; q('napForm').hidden = false;
    q('napNp').innerHTML = b.np_numbers.map(function (n) { return '<option value="' + n + '"' + (n === st.np ? ' selected' : '') + '>NP' + n + '</option>'; }).join('');
    q('napNf').hidden = false; setFormMode(false);
    st.remarks = null; st.locCid = null; st.locFix = null; st.locBusy = false; p12LoadRemarks(st);
    p14Pick(st);   // phase 14: the NAP's stage + PDS marks, fresh
    renderForm();
  }
  function renderForm() {
    var b = st.box;
    q('napBox').textContent = b.stencil; q('napInfo').textContent = (b.street || '') + ' · ' + (b.dwelling || '') + ' · Converge: ' + (b.converge_available == null ? '?' : b.converge_available) + ' available (not verified)';
    renderGps();
    var head = '<div style="display:grid;grid-template-columns:30px repeat(6,1fr);gap:2px;font-size:9.5px;text-align:center;white-space:pre-line"><span></span>' + C.PORT_STATUSES.map(function (s) { return '<span>' + short[s] + '</span>'; }).join('');
    var rows = ''; for (var i = 0; i < 8; i++) { rows += '<span style="font-weight:600;align-self:center">P' + (i + 1) + '</span>' + C.PORT_STATUSES.map(function (s) { return '<label style="display:flex;justify-content:center;padding:7px 0"><input type="radio" name="np' + i + '" value="' + esc(s) + '" aria-label="P' + (i + 1) + ' ' + esc(s) + '"' + (st.ports[i] === s ? ' checked' : '') + '></label>'; }).join('') +
      '<span data-rmk="' + (i + 1) + '" hidden style="grid-column:1/-1;font-size:11.5px;color:#0f5f8c;padding:0 0 4px 4px;overflow-wrap:anywhere"></span>'; }   // phase 12: the port's remark (read only)
    q('napGrid').innerHTML = head + rows + '</div>'; renderTags(); validate(); p12ShowRemarks(); p12LocShow();
  }
  function renderGps() {
    if (st.deact) {
      q('napGps').innerHTML = pos ? '<span style="color:#1c8a4a">GPS ready' + (pos.acc != null ? ' (±' + Math.round(pos.acc) + ' m)' : '') + '. The distance to the old NAP is recorded for the review.</span>'
        : '<span style="color:#c2503a">Waiting for GPS. GPS is required for this record.</span> <a href="#" id="napGpsRetry">Try again</a>';
      return;
    }
    var b = st.box, far = pos && b.lat != null ? C.haversineM(pos.lat, pos.lng, b.lat, b.lng) : null;
    q('napGps').innerHTML = !pos ? '<span style="opacity:.7">No GPS. You can still submit, but it will go to review.</span>'
      : far == null ? '<span style="opacity:.7">This NAP has no coordinates. You can still submit.</span>'
      : C.gpsFlag(far) ? '<span style="color:#d98518">You are more than 50 m (' + Math.round(far) + ' m) from the NAP. You can still submit, but it will go to review.</span>' : '<span style="color:#1c8a4a">You are at the NAP (' + Math.round(far) + ' m).</span>';
  }
  function renderTags() {
    var h = ''; st.ports.forEach(function (v, i) { if (v === S.AWT) h += '<div style="margin-top:6px"><label class="lbl" for="napT' + i + '">Acct no. on the label of P' + (i + 1) + '</label><input id="napT' + i + '" inputmode="numeric" value="' + esc(st.tags[i] || '') + '" style="width:100%;padding:8px"></div>'; });
    q('napTags').innerHTML = h;
    q('napTags').querySelectorAll('input').forEach(function (el) { el.oninput = function () { st.tags[+el.id.slice(4)] = el.value; validate(); p14Hints(); }; });
    p14Render();   // phase 14: stage / remark / PDS section follows the port statuses
  }
  async function addFiles(files) {
    files = Array.prototype.slice.call(files);   // the input's FileList is live and is emptied by value=''
    var cur = st; if (cur.saving) return;
    for (var i = 0; i < files.length; i++) { var blob = await shrink(files[i]); if (st !== cur || cur.saving) return; st.files.push(blob); }
    renderThumbs(); validate();
  }
  // Photos go up over a weak signal: shrink to 1280 px JPEG q0.7 before upload.
  function shrink(file) {
    return new Promise(function (res) {
      var img = new Image(); img.onload = function () {
        var k = Math.min(1, 1280 / Math.max(img.width, img.height)), cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); cv.toBlob(function (b) { URL.revokeObjectURL(img.src); res(b || file); }, 'image/jpeg', 0.7);
      }; img.onerror = function () { res(file); }; img.src = URL.createObjectURL(file);
    });
  }
  function payloadPorts() { return st.ports.map(function (s, i) { return { port: i + 1, status: s, tag_acct: (st.tags[i] || '').trim() || null }; }); }
  function validate() {
    var ok, err = '';
    if (st.saving) { q('napSave').disabled = true; return false; }
    if (st.deact) { var dv = C.validateDeactRecord({ jobId: st.job && st.job.id, boxId: st.box && st.box.box_id, photos: st.files.length, gps: pos }); ok = dv.ok; err = dv.errors.map(function (e) { return e.msg; }).join(' '); }
    else if (st.notFound) { ok = (q('napNfWhy').value || '').trim().length > 2; }
    else { var v = C.validateAudit({ ports: payloadPorts().map(function (p) { return p.status ? p : { port: p.port, status: null }; }), photos: st.files.length, declaredFull: st.full, jobId: st.job && st.job.id }); ok = v.ok; err = v.errors.map(function (e) { return e.msg; }).join(' '); }
    q('napErr').textContent = err; q('napSave').disabled = !ok; return ok;
  }
  // GPS fix for ONE audit attempt: the first one is kept on cur.fix and reused by every retry of the same audit (same client_id), so a retry
  // never submits different coordinates. A recent open-time fix is used as is; otherwise one fresh high-accuracy fix is requested.
  // Never blocks or fails the save, and never touches the shared pos (open-time callbacks are ignored while saving).
  function freshFix(cur) {
    if (cur.fix) return Promise.resolve(cur.fix);
    var p0 = pos;
    if (p0 && p0.t && Date.now() - p0.t <= 60000) { cur.fix = p0; return Promise.resolve(p0); }
    return new Promise(function (resolve) {
      var fin = false, tm = setTimeout(function () { done(); }, 7000);
      function done() { if (fin) return; fin = true; clearTimeout(tm); resolve(cur.fix || null); }
      try {
        if (!navigator.geolocation) return done();
        navigator.geolocation.getCurrentPosition(function (p) { if (!fin) cur.fix = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() }; done(); }, done, { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 });
      } catch (e) { done(); }
    });
  }
  async function save() {
    var cur = st;
    if (!cur || cur.saving) return;
    if (!validate()) return;
    setSaving(true);
    var btn = q('napSave'), label = cur.deact ? SAVE_LABEL_DEACT : SAVE_LABEL; btn.disabled = true; btn.textContent = 'Uploading…';
    var team = ctx.team || 'ADMIN', res;
    var fix = await freshFix(cur);   // snapshot: nothing below reads the shared pos
    if (cur.deact && !fix) {         // the deactivated-NAP record needs GPS (the server refuses it too)
      setSaving(false); q('napErr').textContent = 'GPS is required for this record: turn on location, wait for the fix, then submit again.';
      btn.textContent = label; btn.disabled = false; return;
    }
    try {
      if (cur.deact) {
        var dpaths = []; for (var k = 0; k < cur.files.length; k++) dpaths.push(await api.uploadPhoto(team, cur.clientId, k + 1, cur.files[k]));
        res = await api.submitAudit({ client_id: cur.clientId, box_id: cur.box.box_id, technicians: ctx.technicians(), job_id: cur.job.id, jo_nap_inactive: true,
          gps_lat: fix.lat, gps_lng: fix.lng, gps_acc: fix.acc != null ? fix.acc : null, not_found_reason: (q('napDeactNote').value || '').trim() || null, photos: dpaths });
      } else {
      var paths = []; if (!cur.notFound) for (var i = 0; i < cur.files.length; i++) paths.push(await api.uploadPhoto(team, cur.clientId, i + 1, cur.files[i]));
      else if (cur.files.length) paths.push(await api.uploadPhoto(team, cur.clientId, 1, cur.files[0]));
      res = await api.submitAudit({ client_id: cur.clientId, box_id: cur.box.box_id, np: cur.np, technicians: ctx.technicians(), job_id: cur.job ? cur.job.id : null,
        gps_lat: fix ? fix.lat : null, gps_lng: fix ? fix.lng : null, gps_acc: fix && fix.acc != null ? fix.acc : null, declared_full: cur.full && !cur.notFound, not_found: cur.notFound, not_found_reason: cur.notFound ? q('napNfWhy').value.trim() : null,
        ports: cur.notFound ? [] : payloadPorts(), photos: paths });
      }
    } catch (e) {
      var m = String(e && e.message || e), coded = /^NAP_[A-Z0-9_]+:\s*/.test(m);
      setSaving(false); q('napErr').textContent = coded ? m.replace(/^NAP_[A-Z0-9_]+:\s*/, '') : 'Not saved: ' + m + '. Please try again.';
      btn.textContent = label; btn.disabled = false;   // form was valid when save started and is unchanged (inert)
      return;
    }
    // saved: everything below runs outside the save try, so a failing callback can never show "Not saved"
    var done = cur.done, nf = cur.notFound; cur.cancel = null; setSaving(false); btn.textContent = label; close(true);
    p14After(cur);   // phase 14: stage / remarks / PDS as separate calls AFTER the saved audit (never part of it, never undo it)
    try {
      if (cur.deact) ctx.toast('Saved: deactivated-NAP record for JO ' + cur.job.id + '. The dispatcher will review it.');
      else {
        var reviewOk = res.review_status === 'ok', msg = reviewOk ? 'NAP audit saved' : 'Saved. The audit is under review.';
        if (res.dispatch_done) msg = nf ? msg + ' · dispatcher notified' : reviewOk ? 'Dispatch for this NAP is complete' : msg + ' · dispatch for this NAP is complete';
        if (res.geo_result === 'applied' || res.geo_result === 'moved') msg += ' · NAP location updated';
        else if (res.geo_result === 'proposed') msg += ' · new location submitted for review';
        ctx.toast(msg);
      }
    } catch (e2) { /* toast is cosmetic */ }
    try { api.myDispatch().then(function (rows) { dispatched = Array.isArray(rows) ? rows : dispatched; }, function (e4) { if (window.console) console.warn('NAP my_dispatch', e4); }); } catch (e5) { /* background refresh only */ }
    if (done) { try { done(res, nf); } catch (e3) { if (window.console) console.error('NAP done callback', e3); } }
  }
  // ---------- phase 7: "This job's NAP is deactivated" (Full NAP flow only) ----------
  function setFormMode(deact) {
    q('napPortsWrap').hidden = deact; q('napGridWrap').hidden = deact; q('napDeactInfo').hidden = !deact;
    q('napPhotoLbl').innerHTML = deact ? 'Photo of the spot (where the NAP was) <em style="color:#c2503a">*required</em>' : 'Photo of the NAP reading <em style="color:#c2503a">*required</em>';
    q('napSave').textContent = deact ? SAVE_LABEL_DEACT : SAVE_LABEL;
    p12LocShow(); p14Render();
  }
  function enterDeact() {
    if (!(st.full && st.job)) return;
    st.deact = true; st.box = null; st.notFound = false; q('napNfBox').hidden = true;
    q('napPick').hidden = true; q('napForm').hidden = true; q('napDeactPick').hidden = false; q('napErr').textContent = ''; q('napSave').disabled = true;
    q('napTitle').textContent = 'NAP Details (Full NAP): NAP deactivated';
    q('napSub').textContent = 'For JO ' + st.job.id + '. Search the JO\'s deactivated NAP, then add a photo. GPS is required.';
    renderDeactList();
    if (!pos) requestGps(st);
    try { q('napDeactSearch').focus(); } catch (e) { /* focus is cosmetic */ }
  }
  function leaveDeact() {
    st.deact = false; st.box = null;
    q('napDeactPick').hidden = true; q('napForm').hidden = true; q('napPick').hidden = false; q('napErr').textContent = ''; q('napSave').disabled = true;
    q('napTitle').textContent = 'NAP Details (Full NAP)'; q('napSub').textContent = 'For JO ' + st.job.id;
    setFormMode(false);
  }
  // one more GPS attempt for this open (the record cannot be saved without a fix)
  function requestGps(mine) {
    try {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(function (p) { if (st !== mine || st.saving) return; pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() }; if (st.box) { renderGps(); validate(); } },
        function () { if (st !== mine || st.saving) return; if (st.box) renderGps(); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 });
    } catch (e) { /* no GPS API: the GPS line keeps saying it is required */ }
  }
  function onDeactSearch() {
    var term = C.normStencil(q('napDeactSearch').value), mine = st, seq = ++deactSeq;
    clearTimeout(deactTimer);
    if (term.length < SEARCH_MIN) { deactFound = []; deactState = term ? 'short' : 'idle'; renderDeactList(); return; }
    deactState = 'loading'; renderDeactList();
    deactTimer = setTimeout(function () {
      var p; try { p = Promise.resolve(api.searchInactiveBoxes(term, 10)); } catch (e) { p = Promise.reject(e); }
      p.then(function (rows) { if (st !== mine || seq !== deactSeq) return; deactFound = Array.isArray(rows) ? rows : []; deactState = 'ok'; renderDeactList(); },
        function (e) { if (st !== mine || seq !== deactSeq) return; deactFound = []; deactState = 'error:' + String(e && e.message || e).replace(/^NAP_[A-Z0-9_]+:\s*/, ''); renderDeactList(); });
    }, SEARCH_MS);
  }
  function renderDeactList() {
    var el = q('napDeactList'); if (!el) return;
    var typed = C.normStencil(q('napDeactSearch').value), msg = '', list = deactState === 'ok' ? deactFound : [];
    if (!typed || deactState === 'idle') msg = 'Type at least ' + SEARCH_MIN + ' characters of the stencil, for example QCY003 LP114.';
    else if (deactState === 'short') msg = 'Type at least ' + SEARCH_MIN + ' characters of the stencil.';
    else if (deactState === 'loading') msg = 'Searching…';
    else if (deactState.indexOf('error:') === 0) msg = 'Cannot search: ' + deactState.slice(6);
    else if (!list.length) msg = 'No deactivated NAP matches "' + typed + '". If the NAP is still active, go back and pick it from the list.';
    el.innerHTML = list.length ? list.map(function (b, i) {
      return '<button type="button" data-i="' + i + '" style="display:block;width:100%;padding:8px;border:0;border-bottom:1px solid #eee;background:none;text-align:left;box-sizing:border-box">' +
        '<span style="font-family:monospace;overflow-wrap:anywhere">' + esc(b.stencil) + '</span> <span style="font-size:11px;color:#c2503a;font-weight:600">DEACTIVATED</span>' +
        '<span style="display:block;font-size:11.5px;opacity:.75;overflow-wrap:anywhere">' + esc([b.street, b.barangay].filter(Boolean).join(', ')) + '</span></button>';
    }).join('') : '<div style="padding:8px;opacity:.6">' + esc(msg) + '</div>';
    el.onclick = function (e) { var b = e.target.closest('button'); if (b && st && st.deact && !st.saving && list[+b.dataset.i]) pickDeact(list[+b.dataset.i]); };
  }
  function pickDeact(b) {
    st.box = { box_id: b.box_id, stencil: b.stencil, street: b.street, barangay: b.barangay, lat: null, lng: null };
    st.np = null; st.ports = Array(8).fill(null); st.tags = {};
    q('napDeactPick').hidden = true; q('napForm').hidden = false; q('napNf').hidden = true; q('napDeactNote').value = '';
    q('napBox').textContent = b.stencil + ' · DEACTIVATED';
    q('napInfo').textContent = [b.street, b.barangay].filter(Boolean).join(', ') || 'No street / barangay on file';
    setFormMode(true); renderGps(); validate();
  }

  // ---------- phase 12 (nap-21): port remarks (read only) + "Update NAP location from my GPS" ----------
  // Remarks: the dispatcher's note per port (nap.port_remarks), shown under the port in the grid; text only (escaped by textContent).
  // Location: the team's GPS fix becomes the NAP's coordinates through nap.set_box_location (method 'gps'), WITHOUT saving an audit.
  // Needs accuracy <= 30 m (geo_acc_max_m); a move over 300 m is only a proposal for the admin. One request id per GPS fix (a retry of the
  // same fix cannot save twice). Offline: an error, never queued. No map picker on the phone: the dashboard's Edit location has the map.
  // A database without nap-21 (or a team the server refuses): the button stays hidden and no remarks show.
  var locOk = false, locTok = 0;
  function p12LocInit() {
    var tok = ++locTok; locOk = false;
    if (!api || typeof api.myLocationAccess !== 'function') return;
    Promise.resolve().then(function () { return api.myLocationAccess(); }).then(function (v) { if (tok === locTok) { locOk = v === true; p12LocShow(); } }, function () { /* hidden */ });
  }
  function p12LocShow() {
    var w = q('napLocWrap'); if (!w) return;
    var on = locOk && !!(st && st.box && st.box.box_id) && !st.deact;
    w.hidden = !on;
    if (on) { q('napLocBtn').disabled = !!(st.saving || st.locBusy); }
  }
  function p12LoadRemarks(mine) {
    if (!api || typeof api.portRemarks !== 'function' || !mine.box) return;
    var id = mine.box.box_id;
    Promise.resolve().then(function () { return api.portRemarks(id); }).then(function (rows) {
      if (st !== mine || !st.box || st.box.box_id !== id) return;
      st.remarks = Array.isArray(rows) ? rows : []; p12ShowRemarks();
    }, function (e) { if (window.console) console.warn('NAP port_remarks', e); });
  }
  function p12ShowRemarks() {
    var g = q('napGrid'); if (!g || !st) return;
    var list = (st.remarks || []).filter(function (r) { return Number(r.np) === Number(st.np); });
    for (var i = 1; i <= 8; i++) {
      var el = g.querySelector('[data-rmk="' + i + '"]'); if (!el) continue;
      var r = list.filter(function (x) { return Number(x.port) === i; })[0];
      el.textContent = r ? 'Remark: ' + r.remark : ''; el.hidden = !r;
    }
    p14Render();   // phase 14: the remark inputs start from the saved remarks
  }
  function p12LocMsg(t, bad) { var m = q('napLocMsg'); if (m) { m.textContent = t || ''; m.style.color = bad ? '#c2503a' : ''; } }
  function p12LocUpdate() {
    var mine = st;
    if (!mine || !mine.box || mine.deact || mine.saving || mine.locBusy || !locOk) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { p12LocMsg('You are offline. Connect to the internet, then try again (location updates are not queued).', true); return; }
    if (!navigator.geolocation) { p12LocMsg('GPS is not available on this phone.', true); return; }
    mine.locBusy = true; p12LocShow(); p12LocMsg('Getting a GPS fix…');
    function done(t, bad) { mine.locBusy = false; if (st === mine) { p12LocMsg(t, bad); p12LocShow(); } }
    function send(fix) {
      if (!mine.locCid || mine.locFix !== fix) { mine.locCid = uuid(); mine.locFix = fix; }
      p12LocMsg('GPS ±' + Math.round(fix.acc) + ' m. Saving the location…');
      Promise.resolve().then(function () {
        return api.setBoxLocation(C.p12.locPayload({ clientId: mine.locCid, boxId: mine.box.box_id, lat: fix.lat, lng: fix.lng, method: 'gps', accuracyM: fix.acc }));
      }).then(function (res) {
        if (res && (res.result === 'applied' || res.result === 'moved') && res.lat != null) { mine.box.lat = Number(res.lat); mine.box.lng = Number(res.lng); if (st === mine) renderGps(); }
        mine.locFix = null; mine.locCid = null;   // saved: the next tap is a new update
        done(C.p12.locResultText(res), res && res.result === 'proposed');
      }, function (e) {
        var m = String(e && e.message || e), coded = /^NAP_[A-Z0-9_]+:\s*/.test(m);
        if (coded) { mine.locFix = null; mine.locCid = null; }   // refused by the server: the next tap takes a new fix
        done(coded ? m.replace(/^NAP_[A-Z0-9_]+:\s*/, '') : 'Not saved: ' + m + '. Tap again to retry.', true);
      });
    }
    // a retry after a failed send reuses the same fix and request id
    if (mine.locFix && mine.locCid) { send(mine.locFix); return; }
    try {
      navigator.geolocation.getCurrentPosition(function (p) {
        if (st !== mine) { mine.locBusy = false; return; }
        var fix = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
        var bad = C.p12.accuracyError(fix.acc) || (C.p12.inQC(fix.lat, fix.lng) ? '' : 'Your GPS position is outside Quezon City: it cannot be used for this NAP.');
        if (bad) { done(bad, true); return; }
        send(fix);
      }, function (err) {
        done(err && err.code === 1 ? 'Location permission is off: allow location for FieldOps, then try again.' : 'No GPS fix. Go under open sky and try again.', true);
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    } catch (e) { done('GPS failed. Try again.', true); }
  }

  // ---------- phase 14 (nap-23): NAP stage, port remarks and PDS marks in the NAP Audit form; the stage chip on the nearby list ----------
  // Rights: nap.my_stage_access (null = a database without nap-23, or no access: every control hidden). The stage is set only on a NAP that
  // has none (a NAP with a stage shows it read-only: only an admin moves it on the dashboard). Remarks: one input per port (port_remark_roles).
  // PDS: a checkbox per Active (w/ tagging) port; it needs the 13-digit account typed for that port. All of these are SEPARATE calls sent
  // AFTER the audit saved (fresh client_ids, NapCore.p14.afterAuditCalls): submit_audit and its payload are unchanged, a failure here never
  // undoes the audit and only shows a notice. Text from the server is escaped (labels / remarks) or set with textContent.
  var p14Rights = C.p14 ? C.p14.rights(null) : null, p14Tok = 0, p14Stages = {};
  function p14Init() {
    var tok = ++p14Tok; p14Rights = C.p14 ? C.p14.rights(null) : null;
    if (!C.p14 || !api || typeof api.myStageAccess !== 'function') return;
    Promise.resolve().then(function () { return api.myStageAccess(); }).then(function (a) { if (tok === p14Tok) { p14Rights = C.p14.rights(a); if (st && st.box) p14Render(); } }, function () { /* hidden */ });
  }
  function p14Chip(b) {
    var code = b && (b.stage !== undefined ? b.stage : p14Stages[b.box_id]), s = code && C.p14 ? C.p14.stage(code) : null;
    if (!s) return '';
    return ' <span title="' + esc(s.label) + '" style="display:inline-block;font-family:sans-serif;font-size:10.5px;font-weight:700;color:#fff;background:' + esc(s.color) + ';border-radius:9px;padding:1px 7px;white-space:nowrap">' + esc(s.letter + ' ' + s.short) + '</span>';
  }
  // the nearby list (boxes_near rows carry no stage): one box_stages call per list
  function p14FillNear(mine, rows) {
    if (!C.p14 || !api || typeof api.boxStages !== 'function') return;
    var ids = (rows || []).map(function (b) { return b.box_id; }).filter(function (id) { return id && !Object.prototype.hasOwnProperty.call(p14Stages, id); });
    if (!ids.length) return;
    Promise.resolve().then(function () { return api.boxStages(ids); }).then(function (got) {
      if (!got || got.missing) return;
      ids.forEach(function (id) { p14Stages[id] = null; });
      got.forEach(function (g) { p14Stages[g.box_id] = g.stage || null; });
      if (st === mine) renderNear();
    }, function () { /* no chips */ });
  }
  function p14Pick(mine) {
    mine.p14 = { stage: mine.box && mine.box.stage !== undefined ? mine.box.stage : (mine.box ? p14Stages[mine.box.box_id] : null) || null, stageNew: '', byNp: {}, pdsOn: {}, loaded: false };
    if (!C.p14 || !api || typeof api.boxStages !== 'function' || !mine.box) return;
    var id = mine.box.box_id;
    Promise.all([Promise.resolve().then(function () { return api.boxStages([id]); }), Promise.resolve().then(function () { return api.portFlags(id); })]).then(function (r) {
      if (st !== mine || !mine.box || mine.box.box_id !== id) return;
      if (r[0] && !r[0].missing) { mine.p14.stage = (r[0][0] && r[0][0].stage) || null; p14Stages[id] = mine.p14.stage; }
      (r[1] || []).forEach(function (f) { mine.p14.pdsOn[Number(f.np) + ':' + Number(f.port)] = true; });
      mine.p14.loaded = true; p14Render();
    }, function () { /* the section stays as it is */ });
  }
  function p14Np(mine) { var k = String(mine.np); return mine.p14.byNp[k] || (mine.p14.byNp[k] = { rmk: {}, pds: {} }); }
  function p14OrigRemark(mine, port) {
    var r = (mine.remarks || []).filter(function (x) { return Number(x.np) === Number(mine.np) && Number(x.port) === port; })[0];
    return r ? String(r.remark) : '';
  }
  function p14Render() {
    var w = q('napP14'); if (!w || !st) return;
    var r = p14Rights, mine = st;
    var on = !!(C.p14 && r && mine.box && mine.p14 && !mine.deact && (r.stageSet || r.remark || r.pdsMark || mine.p14.stage));
    w.hidden = !on; if (!on) { w.innerHTML = ''; return; }
    var cur = p14Np(mine), s = mine.p14.stage ? C.p14.stage(mine.p14.stage) : null, h = '';
    h += '<div style="margin-top:10px;padding-top:8px;border-top:1px dashed #d6dde2"><label class="lbl">NAP stage</label>';
    if (s) h += '<div style="font-size:12.5px">' + p14Chip({ stage: s.code }) + ' <span>' + esc(s.label) + '</span><div style="font-size:11.5px;opacity:.7">Only an admin can change or clear it (on the NAP dashboard).</div></div>';
    else if (r.stageSet) h += '<select id="napP14Stage" style="width:100%;padding:8px"><option value="">No stage</option>' + C.p14.STAGES.map(function (x) { return '<option value="' + esc(x.code) + '"' + (mine.p14.stageNew === x.code ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('') + '</select>' +
      '<div style="font-size:11.5px;opacity:.7;margin-top:2px">Optional. Saved after the audit. Once set, only an admin can change it.</div>';
    else h += '<div style="font-size:12px;opacity:.7">No stage.</div>';
    h += '</div>';
    if (r.remark || r.pdsMark) {
      h += '<label class="lbl" style="margin-top:8px">Port remarks' + (r.pdsMark ? ' and PDS' : '') + ' (optional, saved after the audit)</label><div style="display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:4px 6px;align-items:center">';
      for (var i = 1; i <= 8; i++) {
        var k = mine.np + ':' + i, val = Object.prototype.hasOwnProperty.call(cur.rmk, i) ? cur.rmk[i] : p14OrigRemark(mine, i), awt = mine.ports[i - 1] === S.AWT, marked = !!mine.p14.pdsOn[k];
        h += '<span style="font-weight:600">P' + i + '</span>' +
          (r.remark ? '<input type="text" data-p14r="' + i + '" maxlength="200" autocomplete="off" placeholder="Remark" value="' + esc(val) + '" style="width:100%;padding:6px">' : '<span></span>') +
          (r.pdsMark && marked ? '<span style="font-size:11px;font-weight:700;color:#fff;background:#c23b3b;border-radius:4px;padding:1px 5px">PDS</span>'
            : r.pdsMark && awt ? '<label style="font-size:12px;display:flex;gap:4px;align-items:center;white-space:nowrap"><input type="checkbox" data-p14p="' + i + '"' + (cur.pds[i] ? ' checked' : '') + '>PDS</label>' : '<span></span>') +
          '<span data-p14h="' + i + '" hidden style="grid-column:2/-1;font-size:11px;color:#c2503a"></span>';
      }
      h += '</div><div style="font-size:11.5px;opacity:.7;margin-top:2px">PDS = the account status in IBAS is PDS (pending / permanent disconnection). Needs the 13-digit account number above. Only an admin can clear it.</div>';
    }
    w.innerHTML = h;
    var sel = q('napP14Stage'); if (sel) sel.onchange = function () { if (!mine.saving) mine.p14.stageNew = sel.value; };
    w.querySelectorAll('[data-p14r]').forEach(function (el) { el.oninput = function () { if (!mine.saving) p14Np(mine).rmk[+el.getAttribute('data-p14r')] = el.value; }; });
    w.querySelectorAll('[data-p14p]').forEach(function (el) { el.onchange = function () { if (!mine.saving) { p14Np(mine).pds[+el.getAttribute('data-p14p')] = el.checked; p14Hints(); } }; });
    p14Hints();
  }
  // a ticked PDS box without a 13-digit account: say so (the box is ignored at send time)
  function p14Hints() {
    var w = q('napP14'); if (!w || !st || !st.p14) return;
    var cur = p14Np(st);
    w.querySelectorAll('[data-p14h]').forEach(function (el) {
      var i = +el.getAttribute('data-p14h'), bad = !!cur.pds[i] && st.ports[i - 1] === S.AWT && !C.p14.acctOk(st.tags[i - 1]);
      el.textContent = bad ? 'PDS: type the 13-digit account number of P' + i + ' first.' : ''; el.hidden = !bad;
    });
  }
  // after a SAVED audit (not a not-found visit, not the deactivated-NAP record): the extra calls, one after the other, then one notice
  function p14After(cur) {
    if (!C.p14 || !cur || !cur.p14 || cur.deact || cur.notFound || !cur.box || !p14Rights) return;
    var by = p14Np(cur), remarks = [], pds = [];
    for (var i = 1; i <= 8; i++) {
      if (Object.prototype.hasOwnProperty.call(by.rmk, i)) remarks.push({ port: i, remark: by.rmk[i], changed: C.p14.reasonNorm(by.rmk[i]) !== C.p14.reasonNorm(p14OrigRemark(cur, i)) });
      if (by.pds[i] && cur.ports[i - 1] === S.AWT && !cur.p14.pdsOn[cur.np + ':' + i]) pds.push({ port: i, on: true, tag_acct: cur.tags[i - 1] || '' });
    }
    var calls = C.p14.afterAuditCalls({ rights: p14Rights, newId: uuid, boxId: cur.box.box_id, np: cur.np, stage: cur.p14.stageNew, currentStage: cur.p14.stage, remarks: remarks, pds: pds });
    if (!calls.length) return;
    var fn = { set_box_stage: 'setBoxStage', set_port_remark: 'setPortRemark', set_port_pds: 'setPortPds' }, okN = 0, bad = [];
    calls.reduce(function (p, c) {
      return p.then(function () { return api[fn[c.rpc]](c.payload); }).then(function () { okN++; }, function (e) {
        bad.push((c.rpc === 'set_box_stage' ? 'stage' : c.rpc === 'set_port_remark' ? 'remarks' : 'PDS P' + c.payload.port) + ' (' + String(e && e.message || e).replace(/^NAP_[A-Z0-9_]+:\s*/, '') + ')');
      });
    }, Promise.resolve()).then(function () {
      if (cur.p14.stageNew && !bad.some(function (b) { return b.indexOf('stage') === 0; })) p14Stages[cur.box.box_id] = cur.p14.stageNew;
      try { ctx.toast(bad.length ? 'The audit is saved. Not saved: ' + bad.join('; ') + '. Ask the dispatcher, or try again later.' : 'Also saved: ' + okN + ' stage / remark / PDS update' + (okN === 1 ? '' : 's') + '.'); } catch (e) { /* toast is cosmetic */ }
    });
  }

  function close(saved) {
    if (!saved && st && st.saving) return;
    q('napModal').hidden = true; thumbUrls.forEach(function (u) { URL.revokeObjectURL(u); }); thumbUrls = []; q('napThumbs').innerHTML = '';
    if (!saved && st && st.cancel) { var c = st.cancel; st.cancel = null; c(); }
  }

  // Full NAP flow: resolves true only when an audit with declared_full, or a deactivated-NAP record (phase 7), was saved for this job.
  function submitForJob(job) {
    return new Promise(function (resolve) {
      var prev = st;
      open({ job: job, declaredFull: true, onDone: function (res, notFound) { resolve(C.fullNapOutcome(res, notFound)); }, onCancel: function () { resolve(false); } })
        .catch(function () { resolve(false); });   // open() failed: never leave the caller hanging
      if (st === prev) resolve(false);   // open() ignored: a save is in flight
    });
  }
  window.NapMobile = { init: init, open: open, gateActive: gateActive, submitForJob: submitForJob, openView: openView, NAP_SITE: NAP_SITE };
})();
