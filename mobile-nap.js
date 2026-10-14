// AHBA FieldOps — NAP Audit screen (pilot). Self-contained: builds its own modal. Needs NapCore, NapApi and the mobile globals listed in ctx.
(function () {
  'use strict';
  var C = NapCore, S = C.STATUS, api, ctx, role = 'none', gate = false, pos = null, dispatched = [];
  // Phase 2B (whole QC, ~46k boxes): the phone NEVER downloads the box list. With a GPS fix it asks for the boxes near it
  // (nap.boxes_near, 1.5 km, 60 nearest); typing a stencil asks nap.search_boxes (debounced, 3+ characters).
  var NEAR_M = 1500, NEAR_N = 60, SEARCH_MIN = 3, SEARCH_MS = 400;
  var near = [], nearState = 'idle', found = [], findState = 'idle', findSeq = 0, findTimer = null;
  var short = {}; short[S.AWT] = 'Active\nw/ tag'; short[S.AWO] = 'Active\nw/o tag'; short[S.VACANT] = 'Vacant'; short[S.RELEASED] = 'Released'; short[S.HILOSS] = 'Hi Loss'; short[S.DEFECTIVE] = 'Defec-\ntive';
  function q(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); })); }

  // Rejects when the role cannot be read (offline start): the caller may retry init on its next start.
  async function init(c) {
    ctx = c; api = NapApi.create(c.sb); role = 'none';
    role = await api.myRole();
    if (role !== 'field') return;               // only pilot field teams can upload to the nap-photos bucket
    try { gate = await api.gateApplies(); } catch (e) { /* gate unknown: keep default, tile still shows */ }
    mountTile();
  }
  function mountTile() {
    if (q('napTile')) return;
    var b = document.createElement('button'); b.id = 'napTile'; b.className = 'btn-primary'; b.textContent = 'NAP Audit';
    b.style.cssText = 'position:fixed;right:14px;bottom:78px;z-index:50;border-radius:22px;padding:10px 16px';
    b.onclick = function () { open(); }; document.body.appendChild(b);
  }
  // Non-pilot users never pay a network round trip; the server trigger stays the real control.
  async function gateActive() {
    if (role !== 'field' || !api) return false;
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
      '<input id="napSearch" placeholder="Or type the stencil (QCY003 LP114 NP6-7-8)" style="width:100%;margin-top:8px;padding:8px"></div>' +
      '<div id="napForm" hidden>' +
      '<div id="napBox" style="font-weight:600;margin:6px 0"></div><div id="napInfo" style="font-size:12px;opacity:.75"></div>' +
      '<label class="lbl" for="napNp">NAP No.</label><select id="napNp" style="width:100%;padding:8px"></select>' +
      '<div id="napGps" style="font-size:12px;margin:8px 0"></div>' +
      '<label class="lbl">Audited Port</label><div id="napGrid"></div><div id="napTags"></div>' +
      '<label class="lbl" style="margin-top:8px">Photo of the NAP reading <em style="color:#c2503a">*required</em></label>' +
      '<div style="display:flex;gap:8px"><label class="addphoto" style="flex:1">Camera<input type="file" accept="image/*" capture="environment" id="napCam" hidden></label><label class="addphoto" style="flex:1">Album<input type="file" accept="image/*" multiple id="napAlb" hidden></label></div>' +
      '<div id="napThumbs" class="thumbs" style="margin-top:6px"></div>' +
      '<div id="napNf" style="margin-top:8px"><a href="#" id="napNfLink" style="font-size:12px">NAP not found or not accessible</a><div id="napNfBox" hidden><input id="napNfWhy" placeholder="Reason" style="width:100%;padding:8px;margin-top:6px"></div></div>' +
      '<div id="napErr" style="color:#c2503a;font-size:13px;margin-top:8px"></div></div>' +
      '<div style="position:fixed;left:0;right:0;bottom:0;padding:10px 14px;background:var(--bg,#fff);display:flex;gap:8px;border-top:1px solid #d6dde2">' +
      '<button class="btn-ghost" id="napCancel" style="flex:1">Cancel</button><button class="btn-primary" id="napSave" style="flex:1" disabled>Submit audit</button></div>';
    document.body.appendChild(d);
    q('napCancel').onclick = function () { if (st && st.saving) return; close(false); };
    q('napSearch').oninput = onSearchInput;
    q('napNp').onchange = function () { if (st.saving) return; st.np = +q('napNp').value; st.ports = Array(8).fill(null); st.tags = {}; renderForm(); };
    q('napCam').onchange = q('napAlb').onchange = function (e) { addFiles(e.target.files); e.target.value = ''; };
    q('napNfLink').onclick = function (e) { e.preventDefault(); if (st.saving) return; st.notFound = !st.notFound; q('napNfBox').hidden = !st.notFound; validate(); };
    q('napNfWhy').oninput = validate;
    q('napSave').onclick = save;
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
    st = { box: null, np: null, ports: Array(8).fill(null), tags: {}, files: [], notFound: false, job: opts.job || null, full: !!opts.declaredFull, done: opts.onDone || null, clientId: uuid(), saving: false, cancel: opts.onCancel || null };
    var mine = st;
    q('napTitle').textContent = st.full ? 'NAP Details (Full NAP)' : 'NAP Audit';
    q('napSub').textContent = st.job ? 'For JO ' + st.job.id : 'Select the NAP your team visited.';
    q('napPick').hidden = false; q('napForm').hidden = true; q('napErr').textContent = ''; q('napSearch').value = ''; renderThumbs();
    near = []; nearState = 'gps'; found = []; findState = 'idle'; findSeq++; clearTimeout(findTimer);
    q('napModal').hidden = false; q('napSave').disabled = true;
    q('napDisp').innerHTML = '';   // a fresh list (filter cleared) on every open
    renderDisp();   // last known list shows at once; the refresh below never depends on the board list
    loadDispatch(mine);
    // a GPS fix only refreshes the list and the distance line: re-rendering the form would drop focus from the acct no. inputs
    var gpsOk = false;
    try {
      if (navigator.geolocation) {
        gpsOk = true;
        navigator.geolocation.getCurrentPosition(function (p) { if (st !== mine || st.saving) return; pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() }; loadNear(mine); renderDisp(); if (st.box) renderGps(); },
          function () { if (st !== mine || st.saving) return; pos = null; nearState = 'nogps'; renderNear(); renderDisp(); if (st.box) renderGps(); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 });
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
    var p; try { p = Promise.resolve(api.boxesNear({ lat: pos.lat, lng: pos.lng, radius: NEAR_M, limit: NEAR_N })); } catch (e) { p = Promise.reject(e); }
    return p.then(function (rows) { if (st !== mine) return; near = Array.isArray(rows) ? rows : []; nearState = 'ok'; renderNear(); },
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
  function renderNear() {
    var el = q('napNear'); if (!el) return;
    var typed = C.normStencil(q('napSearch').value), list = [], msg = '';
    if (typed) {
      if (findState === 'short') msg = 'Type at least ' + SEARCH_MIN + ' characters of the stencil.';
      else if (findState === 'loading') msg = 'Searching…';
      else if (findState.indexOf('error:') === 0) msg = 'Cannot search: ' + findState.slice(6);
      else { list = found.map(function (b) { return { b: b, d: pos && b.lat != null && b.lng != null ? C.haversineM(pos.lat, pos.lng, b.lat, b.lng) : null }; }); if (!list.length) msg = 'No NAP matches "' + typed + '".'; }
    } else if (nearState === 'ok') {
      list = near.map(function (b) { return { b: b, d: b.distance_m }; });
      if (!list.length) msg = 'No NAP with coordinates within ' + (NEAR_M / 1000) + ' km. Type the stencil.';
    } else if (nearState === 'loading') msg = 'Loading the NAPs near you…';
    else if (nearState === 'error') msg = 'Cannot load the NAPs near you. Type the stencil instead.';
    else if (nearState === 'nogps') msg = 'No GPS. Type the stencil (at least ' + SEARCH_MIN + ' characters), for example QCY003 LP114.';
    else msg = 'Waiting for GPS… or type a stencil.';
    el.innerHTML = list.length ? list.map(function (x, i) { return '<button type="button" data-i="' + i + '" style="display:flex;justify-content:space-between;gap:8px;width:100%;padding:8px;border:0;border-bottom:1px solid #eee;background:none;text-align:left"><span style="font-family:monospace;overflow-wrap:anywhere">' + esc(x.b.stencil) + '</span><span style="opacity:.6;white-space:nowrap">' + (x.d == null ? (x.b.lat == null ? 'no coordinates' : '') : Math.round(x.d) + ' m') + '</span></button>'; }).join('')
      : '<div style="padding:8px;opacity:.6">' + esc(msg) + '</div>';
    el.onclick = function (e) { var b = e.target.closest('button'); if (b && st && !st.saving && list[+b.dataset.i]) pick(list[+b.dataset.i].b); };
  }
  function pick(b, np) {
    st.box = b; st.np = np || b.np_numbers[0]; st.ports = Array(8).fill(null); st.tags = {};
    q('napPick').hidden = true; q('napForm').hidden = false;
    q('napNp').innerHTML = b.np_numbers.map(function (n) { return '<option value="' + n + '"' + (n === st.np ? ' selected' : '') + '>NP' + n + '</option>'; }).join('');
    q('napNf').hidden = false;
    renderForm();
  }
  function renderForm() {
    var b = st.box;
    q('napBox').textContent = b.stencil; q('napInfo').textContent = (b.street || '') + ' · ' + (b.dwelling || '') + ' · Converge: ' + (b.converge_available == null ? '?' : b.converge_available) + ' available (not verified)';
    renderGps();
    var head = '<div style="display:grid;grid-template-columns:30px repeat(6,1fr);gap:2px;font-size:9.5px;text-align:center;white-space:pre-line"><span></span>' + C.PORT_STATUSES.map(function (s) { return '<span>' + short[s] + '</span>'; }).join('');
    var rows = ''; for (var i = 0; i < 8; i++) { rows += '<span style="font-weight:600;align-self:center">P' + (i + 1) + '</span>' + C.PORT_STATUSES.map(function (s) { return '<label style="display:flex;justify-content:center;padding:7px 0"><input type="radio" name="np' + i + '" value="' + esc(s) + '" aria-label="P' + (i + 1) + ' ' + esc(s) + '"' + (st.ports[i] === s ? ' checked' : '') + '></label>'; }).join(''); }
    q('napGrid').innerHTML = head + rows + '</div>'; renderTags(); validate();
  }
  function renderGps() {
    var b = st.box, far = pos && b.lat != null ? C.haversineM(pos.lat, pos.lng, b.lat, b.lng) : null;
    q('napGps').innerHTML = !pos ? '<span style="opacity:.7">No GPS. You can still submit, but it will go to review.</span>'
      : far == null ? '<span style="opacity:.7">This NAP has no coordinates. You can still submit.</span>'
      : C.gpsFlag(far) ? '<span style="color:#d98518">You are more than 50 m (' + Math.round(far) + ' m) from the NAP. You can still submit, but it will go to review.</span>' : '<span style="color:#1c8a4a">You are at the NAP (' + Math.round(far) + ' m).</span>';
  }
  function renderTags() {
    var h = ''; st.ports.forEach(function (v, i) { if (v === S.AWT) h += '<div style="margin-top:6px"><label class="lbl" for="napT' + i + '">Acct no. on the label of P' + (i + 1) + '</label><input id="napT' + i + '" inputmode="numeric" value="' + esc(st.tags[i] || '') + '" style="width:100%;padding:8px"></div>'; });
    q('napTags').innerHTML = h;
    q('napTags').querySelectorAll('input').forEach(function (el) { el.oninput = function () { st.tags[+el.id.slice(4)] = el.value; validate(); }; });
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
    if (st.notFound) { ok = (q('napNfWhy').value || '').trim().length > 2; }
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
    var btn = q('napSave'); btn.disabled = true; btn.textContent = 'Uploading…';
    var team = ctx.team || 'ADMIN', res;
    var fix = await freshFix(cur);   // snapshot: nothing below reads the shared pos
    try {
      var paths = []; if (!cur.notFound) for (var i = 0; i < cur.files.length; i++) paths.push(await api.uploadPhoto(team, cur.clientId, i + 1, cur.files[i]));
      else if (cur.files.length) paths.push(await api.uploadPhoto(team, cur.clientId, 1, cur.files[0]));
      res = await api.submitAudit({ client_id: cur.clientId, box_id: cur.box.box_id, np: cur.np, technicians: ctx.technicians(), job_id: cur.job ? cur.job.id : null,
        gps_lat: fix ? fix.lat : null, gps_lng: fix ? fix.lng : null, gps_acc: fix && fix.acc != null ? fix.acc : null, declared_full: cur.full && !cur.notFound, not_found: cur.notFound, not_found_reason: cur.notFound ? q('napNfWhy').value.trim() : null,
        ports: cur.notFound ? [] : payloadPorts(), photos: paths });
    } catch (e) {
      var m = String(e && e.message || e), coded = /^NAP_[A-Z0-9_]+:\s*/.test(m);
      setSaving(false); q('napErr').textContent = coded ? m.replace(/^NAP_[A-Z0-9_]+:\s*/, '') : 'Not saved: ' + m + '. Please try again.';
      btn.textContent = 'Submit audit'; btn.disabled = false;   // form was valid when save started and is unchanged (inert)
      return;
    }
    // saved: everything below runs outside the save try, so a failing callback can never show "Not saved"
    var done = cur.done, nf = cur.notFound; cur.cancel = null; setSaving(false); btn.textContent = 'Submit audit'; close(true);
    try {
      var reviewOk = res.review_status === 'ok', msg = reviewOk ? 'NAP audit saved' : 'Saved. The audit is under review.';
      if (res.dispatch_done) msg = nf ? msg + ' · dispatcher notified' : reviewOk ? 'Dispatch for this NAP is complete' : msg + ' · dispatch for this NAP is complete';
      if (res.geo_result === 'applied' || res.geo_result === 'moved') msg += ' · NAP location updated';
      else if (res.geo_result === 'proposed') msg += ' · new location submitted for review';
      ctx.toast(msg);
    } catch (e2) { /* toast is cosmetic */ }
    try { api.myDispatch().then(function (rows) { dispatched = Array.isArray(rows) ? rows : dispatched; }, function (e4) { if (window.console) console.warn('NAP my_dispatch', e4); }); } catch (e5) { /* background refresh only */ }
    if (done) { try { done(res, nf); } catch (e3) { if (window.console) console.error('NAP done callback', e3); } }
  }
  function close(saved) {
    if (!saved && st && st.saving) return;
    q('napModal').hidden = true; thumbUrls.forEach(function (u) { URL.revokeObjectURL(u); }); thumbUrls = []; q('napThumbs').innerHTML = '';
    if (!saved && st && st.cancel) { var c = st.cancel; st.cancel = null; c(); }
  }

  // Full NAP flow: resolves true only when an audit with declared_full was saved for this job.
  function submitForJob(job) {
    return new Promise(function (resolve) {
      var prev = st;
      open({ job: job, declaredFull: true, onDone: function (res, notFound) { resolve(!notFound); }, onCancel: function () { resolve(false); } })
        .catch(function () { resolve(false); });   // open() failed: never leave the caller hanging
      if (st === prev) resolve(false);   // open() ignored: a save is in flight
    });
  }
  window.NapMobile = { init: init, open: open, gateActive: gateActive, submitForJob: submitForJob };
})();
