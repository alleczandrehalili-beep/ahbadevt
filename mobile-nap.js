// AHBA FieldOps — NAP Audit screen (pilot). Self-contained: builds its own modal. Needs NapCore, NapApi and the mobile globals listed in ctx.
(function () {
  'use strict';
  var C = NapCore, S = C.STATUS, api, ctx, role = 'none', gate = false, boxes = [], pos = null, dispatched = [];
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
      '<div id="napPick"><div id="napDisp"></div><label class="lbl">Malapit na NAP (GPS ng team)</label><div id="napNear" style="max-height:200px;overflow:auto;border:1px solid #d6dde2;border-radius:8px"></div>' +
      '<input id="napSearch" placeholder="O i-type ang stencil (QCY003 LP114 NP6-7-8)" style="width:100%;margin-top:8px;padding:8px"></div>' +
      '<div id="napForm" hidden>' +
      '<div id="napBox" style="font-weight:600;margin:6px 0"></div><div id="napInfo" style="font-size:12px;opacity:.75"></div>' +
      '<label class="lbl" for="napNp">NAP No.</label><select id="napNp" style="width:100%;padding:8px"></select>' +
      '<div id="napGps" style="font-size:12px;margin:8px 0"></div>' +
      '<label class="lbl">Audited Port</label><div id="napGrid"></div><div id="napTags"></div>' +
      '<label class="lbl" style="margin-top:8px">Photo ng NAP reading <em style="color:#c2503a">*required</em></label>' +
      '<div style="display:flex;gap:8px"><label class="addphoto" style="flex:1">Camera<input type="file" accept="image/*" capture="environment" id="napCam" hidden></label><label class="addphoto" style="flex:1">Album<input type="file" accept="image/*" multiple id="napAlb" hidden></label></div>' +
      '<div id="napThumbs" class="thumbs" style="margin-top:6px"></div>' +
      '<div id="napNf" style="margin-top:8px"><a href="#" id="napNfLink" style="font-size:12px">Hindi nahanap o hindi ma-access ang NAP</a><div id="napNfBox" hidden><input id="napNfWhy" placeholder="Dahilan" style="width:100%;padding:8px;margin-top:6px"></div></div>' +
      '<div id="napErr" style="color:#c2503a;font-size:13px;margin-top:8px"></div></div>' +
      '<div style="position:fixed;left:0;right:0;bottom:0;padding:10px 14px;background:var(--bg,#fff);display:flex;gap:8px;border-top:1px solid #d6dde2">' +
      '<button class="btn-ghost" id="napCancel" style="flex:1">Cancel</button><button class="btn-primary" id="napSave" style="flex:1" disabled>I-submit ang audit</button></div>';
    document.body.appendChild(d);
    q('napCancel').onclick = function () { if (st && st.saving) return; close(false); };
    q('napSearch').oninput = renderNear;
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
    q('napSub').textContent = st.job ? 'Para sa JO ' + st.job.id : 'Pipiliin ang NAP na pinuntahan ng team.';
    q('napPick').hidden = false; q('napForm').hidden = true; q('napErr').textContent = ''; q('napSearch').value = ''; renderThumbs();
    q('napModal').hidden = false; q('napSave').disabled = true;
    renderDisp();   // last known list shows at once; the refresh below never depends on the board list
    loadDispatch(mine);
    try { boxes = boxes.length ? boxes : await api.boxStatus(); } catch (e) { q('napErr').textContent = 'Hindi ma-load ang NAP list: ' + e.message; }
    if (st !== mine) return;
    // a GPS fix only refreshes the list and the distance line: re-rendering the form would drop focus from the acct no. inputs
    navigator.geolocation && navigator.geolocation.getCurrentPosition(function (p) { if (st !== mine) return; pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() }; renderNear(); renderDisp(); if (st.box) renderGps(); },
      function () { if (st !== mine) return; pos = null; renderNear(); renderDisp(); if (st.box) renderGps(); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 });
    renderNear();
    if (st.job && st.job.napcode) { var p = C.parseStencil(st.job.napcode.replace(/ P\d+.*$/, '')); if (p) { var hit = boxes.find(function (b) { return b.stencil.indexOf(p.prefix) === 0 && b.np_numbers.indexOf(p.nps[0]) >= 0; }); if (hit) pick(hit, p.nps[0]); } }
  }
  // "Dispatched sa inyo": independent of the board list. A failing my_dispatch is logged and shows nothing.
  function loadDispatch(mine) {
    var p; try { p = Promise.resolve(api.myDispatch()); } catch (e) { p = Promise.reject(e); }
    return p.then(function (rows) { dispatched = Array.isArray(rows) ? rows : []; }, function (e) { if (window.console) console.warn('NAP my_dispatch', e); dispatched = []; })
      .then(function () { if (st === mine) renderDisp(); });
  }
  function fmtDue(d) { return d ? String(d).slice(0, 10) : ''; }
  function dispBox(it) { return { box_id: it.box_id, stencil: it.stencil, street: [it.street, it.barangay].filter(Boolean).join(', '), barangay: it.barangay, dwelling: it.dwelling, lat: it.lat, lng: it.lng, np_numbers: Array.isArray(it.np_numbers) && it.np_numbers.length ? it.np_numbers : [1], converge_available: it.converge_available }; }
  function renderDisp() {
    var el = q('napDisp'); if (!el) return;
    if (!dispatched.length) { el.innerHTML = ''; el.onclick = null; return; }
    el.innerHTML = '<label class="lbl">Dispatched sa inyo (' + dispatched.length + ')</label><div style="border:1px solid #d6dde2;border-radius:8px;margin-bottom:10px">' + dispatched.map(function (it, i) {
      var has = it.lat != null && it.lng != null, d = pos && has ? Math.round(C.haversineM(pos.lat, pos.lng, +it.lat, +it.lng)) + ' m' : '';
      return '<button type="button" data-i="' + i + '" style="display:block;width:100%;padding:8px;border:0;border-bottom:1px solid #eee;background:none;text-align:left;box-sizing:border-box">' +
        '<span style="display:flex;justify-content:space-between;gap:8px"><span style="font-family:monospace;overflow-wrap:anywhere">' + esc(it.stencil) + '</span><span style="opacity:.6;white-space:nowrap">' + esc(d) + '</span></span>' +
        '<span style="display:block;font-size:12px;opacity:.75">' + esc([it.street, it.barangay].filter(Boolean).join(', ')) + (it.due_date ? ' · due ' + esc(fmtDue(it.due_date)) : '') + '</span>' +
        (has ? '' : '<span style="display:block;font-size:12px;color:#d98518">walang coordinates pa: sa unang audit ito itatakda</span>') + '</button>';
    }).join('') + '</div>';
    el.onclick = function (e) { var b = e.target.closest('button'); if (b && st && !st.saving && dispatched[+b.dataset.i]) pick(dispBox(dispatched[+b.dataset.i])); };
  }
  function renderNear() {
    var term = (q('napSearch').value || '').trim().toUpperCase(), list;
    if (term) list = boxes.filter(function (b) { return b.stencil.toUpperCase().indexOf(term) >= 0; }).slice(0, 12).map(function (b) { return { b: b, d: pos && b.lat != null && b.lng != null ? C.haversineM(pos.lat, pos.lng, b.lat, b.lng) : null }; });
    else if (pos) list = C.nearest(boxes.map(function (b) { var x = {}; for (var k in b) x[k] = b[k]; x.kind0 = b.kind; x.kind = 'installable'; return x; }), pos, 'install', 12).map(function (b) { return { b: b, d: b.distance_m }; });
    else list = [];
    q('napNear').innerHTML = list.length ? list.map(function (x, i) { return '<button type="button" data-i="' + i + '" style="display:flex;justify-content:space-between;width:100%;padding:8px;border:0;border-bottom:1px solid #eee;background:none;text-align:left"><span style="font-family:monospace">' + esc(x.b.stencil) + '</span><span style="opacity:.6">' + (x.d == null ? '' : Math.round(x.d) + ' m') + '</span></button>'; }).join('') : '<div style="padding:8px;opacity:.6">' + (pos ? 'Walang NAP na nahanap.' : 'Naghihintay ng GPS… o mag-type ng stencil.') + '</div>';
    q('napNear').onclick = function (e) { var b = e.target.closest('button'); if (b) pick(list[+b.dataset.i].b); };
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
    q('napBox').textContent = b.stencil; q('napInfo').textContent = (b.street || '') + ' · ' + (b.dwelling || '') + ' · Converge: ' + (b.converge_available == null ? '?' : b.converge_available) + ' available (hindi verified)';
    renderGps();
    var head = '<div style="display:grid;grid-template-columns:30px repeat(6,1fr);gap:2px;font-size:9.5px;text-align:center;white-space:pre-line"><span></span>' + C.PORT_STATUSES.map(function (s) { return '<span>' + short[s] + '</span>'; }).join('');
    var rows = ''; for (var i = 0; i < 8; i++) { rows += '<span style="font-weight:600;align-self:center">P' + (i + 1) + '</span>' + C.PORT_STATUSES.map(function (s) { return '<label style="display:flex;justify-content:center;padding:7px 0"><input type="radio" name="np' + i + '" value="' + esc(s) + '" aria-label="P' + (i + 1) + ' ' + esc(s) + '"' + (st.ports[i] === s ? ' checked' : '') + '></label>'; }).join(''); }
    q('napGrid').innerHTML = head + rows + '</div>'; renderTags(); validate();
  }
  function renderGps() {
    var b = st.box, far = pos && b.lat != null ? C.haversineM(pos.lat, pos.lng, b.lat, b.lng) : null;
    q('napGps').innerHTML = !pos ? '<span style="opacity:.7">Walang GPS. Maisusumite pa rin, pero mapupunta sa review.</span>'
      : far == null ? '<span style="opacity:.7">Walang coordinates ang NAP na ito. Maisusumite pa rin.</span>'
      : C.gpsFlag(far) ? '<span style="color:#d98518">Mahigit 50 m (' + Math.round(far) + ' m) ang layo mo sa NAP. Maisusumite pa rin, pero mapupunta sa review.</span>' : '<span style="color:#1c8a4a">Nasa NAP ka (' + Math.round(far) + ' m).</span>';
  }
  function renderTags() {
    var h = ''; st.ports.forEach(function (v, i) { if (v === S.AWT) h += '<div style="margin-top:6px"><label class="lbl" for="napT' + i + '">Acct no. sa label ng P' + (i + 1) + '</label><input id="napT' + i + '" inputmode="numeric" value="' + esc(st.tags[i] || '') + '" style="width:100%;padding:8px"></div>'; });
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
  // Fresh high-accuracy fix right before saving when pos is missing or older than 60 s. Never blocks or fails the save.
  function freshFix() {
    if (pos && pos.t && Date.now() - pos.t <= 60000) return Promise.resolve();
    return new Promise(function (resolve) {
      var fin = false, tm = setTimeout(function () { done(); }, 7000);
      function done() { if (fin) return; fin = true; clearTimeout(tm); resolve(); }
      try {
        if (!navigator.geolocation) return done();
        navigator.geolocation.getCurrentPosition(function (p) { if (!fin) pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() }; done(); }, done, { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 });
      } catch (e) { done(); }
    });
  }
  async function save() {
    var cur = st;
    if (!cur || cur.saving) return;
    if (!validate()) return;
    setSaving(true);
    var btn = q('napSave'); btn.disabled = true; btn.textContent = 'Ina-upload…';
    var team = ctx.team || 'ADMIN', res;
    await freshFix();
    try {
      var paths = []; if (!cur.notFound) for (var i = 0; i < cur.files.length; i++) paths.push(await api.uploadPhoto(team, cur.clientId, i + 1, cur.files[i]));
      else if (cur.files.length) paths.push(await api.uploadPhoto(team, cur.clientId, 1, cur.files[0]));
      res = await api.submitAudit({ client_id: cur.clientId, box_id: cur.box.box_id, np: cur.np, technicians: ctx.technicians(), job_id: cur.job ? cur.job.id : null,
        gps_lat: pos ? pos.lat : null, gps_lng: pos ? pos.lng : null, gps_acc: pos && pos.acc != null ? pos.acc : null, declared_full: cur.full && !cur.notFound, not_found: cur.notFound, not_found_reason: cur.notFound ? q('napNfWhy').value.trim() : null,
        ports: cur.notFound ? [] : payloadPorts(), photos: paths });
    } catch (e) {
      var m = String(e && e.message || e), coded = /^NAP_[A-Z0-9_]+:\s*/.test(m);
      setSaving(false); q('napErr').textContent = coded ? m.replace(/^NAP_[A-Z0-9_]+:\s*/, '') : 'Hindi na-save: ' + m + '. Subukan ulit.';
      btn.textContent = 'I-submit ang audit'; btn.disabled = false;   // form was valid when save started and is unchanged (inert)
      return;
    }
    // saved: everything below runs outside the save try, so a failing callback can never show "Hindi na-save"
    var done = cur.done, nf = cur.notFound; cur.cancel = null; setSaving(false); btn.textContent = 'I-submit ang audit'; close(true);
    try {
      var msg = res.review_status === 'ok' ? 'Na-save ang NAP audit' : 'Na-save. Nasa review ang audit.';
      if (res.dispatch_done) msg = nf ? msg + ' · ipinaalam sa dispatcher' : 'Tapos na ang dispatch ng NAP na ito';
      if (res.geo_result === 'applied' || res.geo_result === 'moved') msg += ' · na-update ang lokasyon ng NAP';
      else if (res.geo_result === 'proposed') msg += ' · isinumite ang bagong lokasyon para sa review';
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
