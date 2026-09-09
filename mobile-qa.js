// AHBA FieldOps — QA INSPECTOR mobile module. Loaded by mobile.html (production) and qa-demo.html (dry run).
// Mount-only: no globals are read except QaCore. All data goes through the injected QaApi.
(function (root) {
  'use strict';
  var Core = root.QaCore;
  var DRAFT = 'qa_draft_', QUEUE = 'qa_submitq';
  var CSS = '.qa-wrap{font:14px system-ui,-apple-system,sans-serif;color:#0e2b27;padding:10px 12px 90px}.qa-tabs{display:flex;gap:6px;margin:6px 0 10px}.qa-tabs button{flex:1;padding:9px 6px;border:1px solid #cfe0d8;background:#fff;border-radius:10px;font-weight:700;font-size:12px}.qa-tabs button.on{background:#0d3b34;color:#fff;border-color:#0d3b34}' +
    '.qa-card{border:1px solid #dfe7e2;border-radius:12px;padding:11px;margin-bottom:9px;background:#fff}.qa-card .t{font-weight:800;font-size:14px}.qa-card .s{font-size:12px;color:#3a4a45;margin-top:3px}.qa-badge{display:inline-block;font-size:10px;font-weight:800;padding:2px 7px;border-radius:9px;background:#e7f7ef;color:#11825f;margin-left:6px}.qa-badge.done{background:#e8ecff;color:#2d3fa8}.qa-badge.prog{background:#fff3d6;color:#9a6200}' +
    '.qa-btn{display:inline-block;padding:9px 12px;border-radius:10px;border:1px solid #0d3b34;background:#0d3b34;color:#fff;font-weight:800;font-size:13px}.qa-btn.ghost{background:#fff;color:#0d3b34}.qa-btn.warn{background:#c2503a;border-color:#c2503a}.qa-btn[disabled]{opacity:.5}' +
    '.qa-sheet{position:fixed;inset:0;background:#f4f7f5;z-index:9000;overflow:auto;padding:12px 12px 120px}.qa-sec{font:800 11px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#107b5e;margin:16px 0 6px}.qa-field{margin-bottom:9px}.qa-field label{display:block;font-size:11px;font-weight:700;color:#3a4a45;margin-bottom:3px}.qa-field input,.qa-field select,.qa-field textarea{width:100%;padding:9px;border:1px solid #cfd8d3;border-radius:9px;font-size:14px;box-sizing:border-box;text-transform:uppercase}.qa-field textarea{text-transform:none}' +
    '.qa-item{border:1px solid #dfe7e2;border-radius:11px;padding:9px;margin-bottom:8px;background:#fff}.qa-item .lbl{font-weight:700;font-size:13px;margin-bottom:6px}.qa-pfn{display:flex;gap:6px}.qa-pfn button{flex:1;padding:10px 0;border-radius:9px;border:1px solid #cfd8d3;background:#fff;font-weight:800;font-size:13px}.qa-pfn button.pass.on{background:#11825f;color:#fff;border-color:#11825f}.qa-pfn button.fail.on{background:#c2503a;color:#fff;border-color:#c2503a}.qa-pfn button.na.on{background:#5c6b67;color:#fff;border-color:#5c6b67}' +
    '.qa-fail{margin-top:8px;border-top:1px dashed #e3b1a6;padding-top:8px}.qa-thumbs{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.qa-thumbs img{width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid #cfd8d3}.qa-chips{display:flex;gap:5px;flex-wrap:wrap;margin:5px 0}.qa-chips span{font-size:10px;border:1px solid #cfd8d3;border-radius:9px;padding:3px 7px;background:#fff}' +
    '.qa-seg{display:flex;gap:5px;flex-wrap:wrap}.qa-seg button{padding:8px 10px;border-radius:9px;border:1px solid #cfd8d3;background:#fff;font-weight:700;font-size:12px}.qa-seg button.on{background:#0d3b34;color:#fff;border-color:#0d3b34}' +
    '.qa-sig{border:1px solid #cfd8d3;border-radius:10px;background:#fff;width:100%;height:150px;touch-action:none}.qa-cert{font-size:11px;color:#3a4a45;background:#fff;border:1px solid #e3e8e2;border-radius:9px;padding:8px;margin:6px 0}.qa-footer{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #dfe7e2;padding:10px 12px;display:flex;gap:8px;z-index:9001}.qa-footer .qa-btn{flex:1;text-align:center}.qa-err{color:#c2503a;font-size:12px;margin:6px 0;white-space:pre-wrap}.qa-pend{font-size:11px;color:#9a6200;margin:4px 0}' +
    '.qa-re{background:#fff3d6;border:1px solid #f0d28a;border-radius:11px;padding:9px 11px;margin-bottom:9px}.qa-re .t{font-weight:900;color:#9a6200}.qa-hint{font-size:11px;color:#9a6200;margin-top:4px}';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function h(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  function photoTag(p) { return p.thumb ? '<img src="' + esc(p.thumb) + '" alt="">' : '<span style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:8px;border:1px solid #cfd8d3;background:#f4f7f5;font-size:22px">📷</span>'; }
  function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function blobToDataUrl(b) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.readAsDataURL(b); }); }
  function dataUrlToBlob(u) { var p = u.split(','), m = /data:([^;]+)/.exec(p[0]), bin = atob(p[1]), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: m ? m[1] : 'image/jpeg' }); }
  // Drafts live in localStorage (~5MB): a full-size data URL per photo blows the quota. Keep the big one only until the file is safely uploaded, then store a 160px preview.
  function shrinkDataUrl(dataUrl, max) {
    return new Promise(function (res) {
      try {
        var img = new Image();
        img.onload = function () {
          try {
            var s = Math.min(1, max / Math.max(img.width, img.height));
            var cv = document.createElement('canvas');
            cv.width = Math.max(1, Math.round(img.width * s)); cv.height = Math.max(1, Math.round(img.height * s));
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            res(cv.toDataURL('image/jpeg', 0.6));
          } catch (e) { res(dataUrl); }
        };
        img.onerror = function () { res(dataUrl); };
        img.src = dataUrl;
      } catch (e) { res(dataUrl); }
    });
  }
  function mapsUrl(a) { return (a.lat != null && a.lng != null) ? 'https://www.google.com/maps/search/?api=1&query=' + a.lat + ',' + a.lng : (a.sheet_latlong ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a.sheet_latlong) : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((a.address || '') + ' ' + (a.barangay || '') + ' QUEZON CITY')); }
  function fmtDate(d) { return d ? new Date(d).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; }

  function makeSignaturePad(canvas, onEnd) {
    var ctx = canvas.getContext('2d'), drawing = false, empty = true, last = null;
    function size() { var r = canvas.getBoundingClientRect(); if (canvas.width !== Math.round(r.width) || canvas.height !== Math.round(r.height)) { canvas.width = Math.round(r.width); canvas.height = Math.round(r.height); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#0e2b27'; } }
    function pt(e) { var r = canvas.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; }
    function down(e) { size(); drawing = true; last = pt(e); e.preventDefault(); }
    function move(e) { if (!drawing) return; var p = pt(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; empty = false; e.preventDefault(); }
    function up() { var was = drawing; drawing = false; if (was && !empty) { onEnd && onEnd(); } }
    canvas.addEventListener('mousedown', down); canvas.addEventListener('mousemove', move);
    canvas.addEventListener('touchstart', down, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('mouseup', up); window.addEventListener('touchend', up);
    size();
    return { clear: function () { size(); ctx.clearRect(0, 0, canvas.width, canvas.height); empty = true; }, isEmpty: function () { return empty; },
      toBlob: function () { return new Promise(function (res) { canvas.toBlob(function (b) { res(b); }, 'image/png'); }); },
      restore: function (dataUrl) { var img = new Image(); img.onload = function () { size(); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); empty = false; }; img.src = dataUrl; },
      destroy: function () { window.removeEventListener('mouseup', up); window.removeEventListener('touchend', up); canvas.removeEventListener('mousedown', down); canvas.removeEventListener('mousemove', move); canvas.removeEventListener('touchstart', down); canvas.removeEventListener('touchmove', move); } };
  }

  function mount(rootEl, o) {
    var api = o.api, user = o.user || {}, deps = o.deps || {};
    var toast = deps.toast || function (m) { console.log('[qa]', m); };
    var getPos = deps.getPos || function () { return Promise.resolve(null); };
    var compress = deps.compressImage || function (f) { return Promise.resolve(f); };
    var buildStamp = deps.buildStamp || function () { return Promise.resolve(null); };
    var state = { tab: 'today', audits: [], cfg: null, open: null, draft: null, pads: {}, unsub: null, destroyed: false, ctx: null, offense: {}, offenseSeq: 0, offenseSig: null, reGen: 0, roGen: 0 };
    if (!document.getElementById('qaCss')) { var st = document.createElement('style'); st.id = 'qaCss'; st.textContent = CSS; document.head.appendChild(st); }
    rootEl.innerHTML = '<div class="qa-wrap"><div style="display:flex;justify-content:space-between;align-items:center"><div><b>QA Inspections</b><div style="font-size:11px;color:#3a4a45">' + esc(user.username) + (user.display_name ? ' · ' + esc(user.display_name) : '') + '</div></div><div class="qa-pend" id="qaPend"></div></div>' +
      '<div class="qa-tabs"><button data-tab="today" class="on">Today</button><button data-tab="upcoming">Upcoming</button><button data-tab="done">Done</button></div><div id="qaList"></div></div><div id="qaSheet"></div>';
    var $ = function (s) { return rootEl.querySelector(s); };
    rootEl.querySelectorAll('.qa-tabs button').forEach(function (b) { b.onclick = function () { state.tab = b.dataset.tab; rootEl.querySelectorAll('.qa-tabs button').forEach(function (x) { x.classList.toggle('on', x === b); }); renderList(); }; });

    function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); }
    // Removes tickets that vanished from this inspector's list (redispatched elsewhere) from freshList's predecessor:
    // drops any queued offline submission for them (with a toast noting the discard) and closes the sheet if one was open on it.
    function applyGone(prevList, freshList) {
      var gone = prevList.filter(function (p) { return !freshList.some(function (a) { return a.id === p.id; }) && p.status !== 'done'; });
      if (!gone.length) return;
      var q = lsGet(QUEUE, []);
      var wasQueued = {}; gone.forEach(function (p) { wasQueued[p.id] = q.some(function (item) { return item.audit_id === p.id; }); });
      var q2 = q.filter(function (item) { return !gone.some(function (p) { return p.id === item.audit_id; }); });
      lsSet(QUEUE, q2); renderPend();
      gone.forEach(function (p) {
        lsDel(draftKey(p.id));
        toast('Ticket ' + p.id + ' was reassigned or unassigned by the QA Head' + (wasQueued[p.id] ? ' — your unsent inspection was discarded' : ''));
        if (state.open && state.open.id === p.id) closeSheet();
      });
    }
    function checkStillMine() {
      return api.listMyAudits(user.username).then(function (fresh) {
        if (state.destroyed) return;
        applyGone(state.audits, fresh);
        state.audits = fresh; lsSet('qa_cache_' + user.username, state.audits);
      }).catch(function () {});
    }
    function refresh() {
      var prev = state.audits;
      return Promise.all([api.listMyAudits(user.username), state.cfg ? Promise.resolve(state.cfg) : api.getConfig()]).then(function (r) {
        if (state.destroyed) return;
        state.audits = r[0]; state.cfg = r[1]; lsSet('qa_cache_' + user.username, state.audits); renderList();
        applyGone(prev, r[0]);
        return flushQueue();
      }).catch(function (e) {
        if (state.destroyed) return;
        state.audits = lsGet('qa_cache_' + user.username, []); renderList(); toast('Offline — showing cached inspections');
      });
    }
    function renderPend() { var q = lsGet(QUEUE, []); var p = $('#qaPend'); if (p) p.textContent = q.length ? ('⏳ ' + q.length + ' pending upload') : ''; }
    function renderList() {
      renderPend();
      var t = today(), list = state.audits.filter(function (a) {
        if (state.tab === 'done') return a.status === 'done';
        if (a.status === 'done') return false;
        return state.tab === 'today' ? (a.scheduled_date || t) <= t : (a.scheduled_date || t) > t;
      });
      var el = $('#qaList');
      if (!list.length) { el.innerHTML = '<div style="text-align:center;color:#9aa6a2;padding:30px 0">' + (state.tab === 'today' ? 'No inspections assigned for today.' : 'Nothing here.') + '</div>'; return; }
      el.innerHTML = list.map(function (a) {
        var badge = a.status === 'done' ? '<span class="qa-badge done">' + esc(a.visit_status || 'DONE') + (a.assessment ? ' · ' + esc(a.assessment) : '') + '</span>' : a.status === 'in_progress' ? '<span class="qa-badge prog">IN PROGRESS</span>' : '<span class="qa-badge">#' + (a.sequence || '-') + '</span>';
        var re = a.source === 'reinspection' ? '<span class="qa-badge prog">RE-INSPECTION</span>' : '';
        return '<div class="qa-card" data-id="' + esc(a.id) + '"><div class="t">' + esc(a.subscriber || '—') + badge + re + '</div><div class="s">' + esc(a.address || '') + (a.barangay ? ' · ' + esc(a.barangay) : '') + '</div>' +
          '<div class="s">' + esc(a.id) + ' · ' + esc(a.contractor_name || '') + ' · JO ' + esc(a.jo_no || '—') + ' · closed ' + esc(a.jo_date_closed || '—') + '</div>' + (a.installers_text ? '<div class="s">Installers: ' + esc(a.installers_text) + '</div>' : '') +
          '<div style="display:flex;gap:6px;margin-top:8px"><a class="qa-btn ghost" href="' + mapsUrl(a) + '" target="_blank" rel="noopener">🧭 Navigate</a><button class="qa-btn" data-open="' + esc(a.id) + '">' + (a.status === 'done' ? 'View' : a.status === 'in_progress' ? 'Continue' : 'Start inspection') + '</button></div></div>';
      }).join('');
      el.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { openAudit(b.dataset.open); }; });
    }

    // ---------- inspection sheet ----------
    function draftKey(id) { return DRAFT + id; }
    function newDraft(a) { return { audit_id: a.id, submit_key: a.id + '-' + Date.now(), visit_status: 'VISITED', contractor_rep: '', installers_text: a.installers_text || '', wire: '', qa_gc: '', assessment: '', found_business: '', old_plan: '', new_plan: '', remarks: '', items: {}, violations: {}, photos: [], pending: [], subscriber_signed_name: a.subscriber || '', sig_sub: null, sig_ins: null, lat: a.lat, lng: a.lng }; }
    function prefillFromServer(id, a) {
      return api.getAudit(id).then(function (r) {
        if (state.destroyed || state.open !== a) return null;
        var d = newDraft(a), ra = r.audit;
        d.visit_status = ra.visit_status || 'VISITED';
        d.contractor_rep = ra.contractor_rep || '';
        d.installers_text = ra.installers_text || '';
        d.wire = ra.wire || '';
        d.qa_gc = ra.qa_gc || '';
        d.assessment = ra.assessment || '';
        d.found_business = ra.found_business || '';
        d.old_plan = ra.old_plan || '';
        d.new_plan = ra.new_plan || '';
        d.remarks = ra.remarks || '';
        d.subscriber_signed_name = ra.subscriber_signed_name || a.subscriber || '';
        d.items = {}; r.items.forEach(function (i) { d.items[i.item_id] = i.result; });
        d.violations = {}; r.violations.forEach(function (v) { var key = v.item_id != null ? String(v.item_id) : 'x' + v.id; d.violations[key] = { code: v.code, remark: v.remark || '', item_id: v.item_id }; });
        d.photos = r.photos.map(function (p) { return { key: 'p' + p.id, item_id: p.item_id, label: p.label, path: p.path, thumb: null }; });
        d.sig_sub_path = ra.subscriber_signature_path || null;
        d.sig_ins_path = ra.inspector_signature_path || null;
        state.draft = d; saveDraft();
        var pid = d.audit_id; Promise.all(d.photos.map(function (p) { return api.photoUrl(p.path).then(function (u) { p.thumb = u; }).catch(function () {}); })).then(function () { if (state.destroyed || !state.open || state.open.id !== pid) return; saveDraft(); renderSheet(); });
        return d;
      }).catch(function (e) { if (state.destroyed || state.open !== a) return null; toast('Could not load previous submission — starting blank'); return null; });
    }
    function openAudit(id) {
      var a = state.audits.filter(function (x) { return x.id === id; })[0]; if (!a) return;
      state.open = a;
      state.ctx = null;
      if (a.source === 'reinspection') {
        api.getAudit(id).then(function (r) {
          if (state.destroyed || state.open !== a) return;
          state.ctx = { rectification: r.rectification, previous: r.previous, loaded: true };
          renderReBox();
        }).catch(function () {
          if (state.destroyed || state.open !== a) return;
          state.ctx = { loaded: false };
          renderReBox();
        });
      }
      var start = a.status === 'assigned' ? getPos().then(function (p) { return api.startAudit(id, p || {}); }).then(function (r) { Object.assign(a, r); }).catch(function (e) { toast('Could not mark start (offline?) — you can continue'); }) : Promise.resolve();
      start.then(function () {
        if (state.destroyed || state.open !== a) return;
        if (a.status === 'done') { state.draft = null; renderSheet(); return; }
        var localDraft = lsGet(draftKey(id), null);
        var reopened = a.reopened_count > 0 || a.inspected_at;
        var ready = (!localDraft && reopened) ? prefillFromServer(id, a).then(function (d) { return d || newDraft(a); }) : Promise.resolve(localDraft || newDraft(a));
        ready.then(function (d) {
          if (state.destroyed || state.open !== a) return;
          state.draft = d;
          if (!state.draft.lat) getPos().then(function (p) { if (p) { state.draft.lat = p.lat; state.draft.lng = p.lng; saveDraft(); } });
          saveDraft(); renderSheet();
        });
      });
    }
    function saveDraft() { if (state.draft) lsSet(draftKey(state.draft.audit_id), state.draft); }
    function closeSheet() { if (state.pads.sub) state.pads.sub.destroy(); if (state.pads.ins) state.pads.ins.destroy(); $('#qaSheet').innerHTML = ''; state.open = null; state.draft = null; state.pads = {}; state.ctx = null; state.offense = {}; state.offenseSig = null; refresh(); }
    function checklist() { return (state.cfg.checklist || []).filter(function (c) { return c.active; }); }
    function codeOptions(sel) { return state.cfg.codes.filter(function (c) { return c.active !== false; }).map(function (c) { return '<option value="' + esc(c.code) + '"' + (c.code === sel ? ' selected' : '') + '>' + esc(c.code + ' — ' + c.category) + '</option>'; }).join(''); }
    function renderOffenseHints() {
      var a = state.open, d = state.draft; if (!a || !d) return;
      rootEl.querySelectorAll('[data-offhint]').forEach(function (el) { var v = d.violations[el.dataset.offhint]; var o = v && state.offense[v.code]; el.textContent = o ? ('Offense #' + o.offense_no + ' for ' + (a.contractor_name || 'contractor') + (o.penalty_amount != null ? ' · ₱' + Number(o.penalty_amount).toLocaleString() : ' · ' + (o.penalty_text || '')) + ' (auto — QA Head may override)') : ''; });
    }
    function loadOffenseHints() {
      var a = state.open, d = state.draft; if (!a || !d || !api.offensePreview) return;
      var codes = Object.keys(d.violations).map(function (k) { return d.violations[k].code; }).filter(Boolean);
      if (!codes.length) return;
      var sig = codes.slice().sort().join(',');
      if (sig === state.offenseSig) { renderOffenseHints(); return; }
      state.offenseSig = sig;
      var seq = ++state.offenseSeq;
      api.offensePreview(a.contractor_name, codes).then(function (m) {
        if (seq !== state.offenseSeq || state.destroyed || state.open !== a) return;
        state.offense = m || {};
        renderOffenseHints();
      }).catch(function () { if (seq === state.offenseSeq) state.offenseSig = null; });
    }

    function renderSheet() {
      var a = state.open, d = state.draft, ro = !d;
      var hdr = '<div class="qa-card"><div class="t">' + esc(a.id) + ' <span class="qa-badge">' + esc(a.contractor_name || '') + '</span></div><div class="s"><b>' + esc(a.subscriber || '') + '</b> · Acct ' + esc(a.acct_no || '—') + ' · JO ' + esc(a.jo_no || '—') + '</div><div class="s">' + esc(a.address || '') + ' · ' + esc(a.barangay || '') + '</div><div class="s">NAP ' + esc(a.nap_code || '—') + ' · Port ' + esc(a.port_no || '—') + ' · S/N ' + esc(a.serial_no || '—') + '</div><div class="s">Inspector: ' + esc(user.username) + ' · ' + esc(today()) + '</div></div>';
      if (a.source === 'reinspection') hdr += '<div id="qaReBox"></div>';
      var sheet = $('#qaSheet'); sheet.innerHTML = '<div class="qa-sheet">' + hdr + '<div id="qaBody"></div><div class="qa-err" id="qaErr"></div></div><div class="qa-footer"><button class="qa-btn ghost" id="qaBack">' + (ro ? 'Close' : 'Save & back') + '</button>' + (ro ? '' : '<button class="qa-btn" id="qaSubmit">Submit inspection</button>') + '</div>';
      if (a.source === 'reinspection') renderReBox();
      $('#qaBack').onclick = function () { saveDraft(); closeSheet(); };
      if (ro) { renderReadOnly(a); return; }
      $('#qaSubmit').onclick = submit;
      renderForm();
    }
    // Fills #qaReBox from state.ctx without touching the rest of the sheet — the ctx fetch (previous
    // findings) resolves independently of the sheet opening, and re-rendering the whole sheet on
    // arrival would wipe any in-progress pad strokes / form input the inspector has already made.
    function renderReBox() {
      var box = $('#qaReBox'); if (!box) return;
      var a = state.open;
      var gen = ++state.reGen;
      if (!state.ctx) { box.innerHTML = '<div class="qa-re"><div class="s">Loading previous findings…</div></div>'; return; }
      if (state.ctx.loaded === false) { box.innerHTML = '<div class="qa-re"><div class="s">Previous findings unavailable offline.</div></div>'; return; }
      var rc = state.ctx.rectification || {}, pv = state.ctx.previous;
      var labels = {}; checklist().forEach(function (x) { labels[x.id] = x.label; });
      box.innerHTML = '<div class="qa-re"><div class="t">🔁 RE-INSPECTION · cycle ' + esc(rc.cycle || '?') + ' · deadline ' + esc(rc.deadline || '—') + '</div>' +
        (pv ? '<div class="s">Previous visit ' + esc(pv.audit.id) + ' · ' + fmtDate(pv.audit.inspected_at) + ' · ' + esc(pv.audit.inspector || '') + '</div><div class="s"><b>Failed then:</b> ' + (pv.items.filter(function (i) { return i.result === 'fail'; }).map(function (i) { return esc(labels[i.item_id] || i.item_id) + (i.remark ? ' (' + esc(i.remark) + ')' : ''); }).join(' · ') || 'none') + '</div>' +
          (pv.violations.length ? '<div class="s"><b>Violations:</b> ' + pv.violations.map(function (v) { return esc(v.code) + ' #' + (v.offense_no || 1); }).join(', ') + '</div>' : '') + '<div class="qa-thumbs" id="qaPrevThumbs"></div>' : '<div class="s">No previous visit on record.</div>') + '</div>';
      if (pv) {
        pv.photos.filter(function (p) { return pv.items.some(function (i) { return i.item_id === p.item_id && i.result === 'fail'; }); }).forEach(function (p) {
          api.photoUrl(p.path).then(function (u) {
            if (state.destroyed || state.open !== a || gen !== state.reGen) return;
            var reBox = $('#qaReBox'), pt = reBox ? reBox.querySelector('#qaPrevThumbs') : null;
            if (!pt) return;
            var img = h('<img alt="">'); img.src = u; pt.appendChild(img);
          }).catch(function () {});
        });
      }
    }
    function renderReadOnly(a) {
      api.getAudit(a.id).then(function (r) {
        if (state.destroyed || state.open !== a) return;
        var labels = {}; checklist().forEach(function (c) { labels[c.id] = c.label; });
        $('#qaBody').innerHTML = '<div class="qa-sec">Result</div><div class="qa-card"><div class="t">' + esc(r.audit.visit_status || '') + (r.audit.assessment ? ' · ' + esc(r.audit.assessment) : '') + '</div><div class="s">Wire ' + esc(r.audit.wire || '—') + ' · QA/GC ' + esc(r.audit.qa_gc || '—') + ' · Violations ' + r.audit.total_violations + ' · ₱' + Number(r.audit.total_penalty || 0).toLocaleString() + '</div><div class="s">' + esc(r.audit.remarks || '') + '</div><div class="s">Submitted ' + fmtDate(r.audit.inspected_at) + '</div></div>' +
          (r.items.length ? '<div class="qa-sec">Checklist</div>' + r.items.map(function (i) { return '<div class="qa-item"><div class="lbl">' + esc(labels[i.item_id] || i.item_id) + ' <span class="qa-badge ' + (i.result === 'fail' ? 'prog' : '') + '">' + i.result.toUpperCase() + '</span></div>' + (i.remark ? '<div class="s">' + esc(i.remark) + '</div>' : '') + '</div>'; }).join('') : '') +
          (r.violations.length ? '<div class="qa-sec">Violations</div>' + r.violations.map(function (v) { return '<div class="qa-item"><div class="lbl">' + esc(v.code) + ' — ' + esc(v.category || '') + '</div><div class="s">' + esc(v.description || '') + (v.penalty_amount != null ? ' · ₱' + Number(v.penalty_amount).toLocaleString() : '') + '</div></div>'; }).join('') : '') +
          '<div class="qa-sec">Photos</div><div class="qa-thumbs" id="qaRoThumbs"></div>';
        // same generation guard as renderReBox: #qaRoThumbs may exist again for a DIFFERENT ticket by the time a
        // signed URL resolves (close → reopen another read-only sheet), so a stale thumb must not be appended.
        var gen = ++state.roGen;
        r.photos.forEach(function (p) {
          api.photoUrl(p.path).then(function (u) {
            if (state.destroyed || state.open !== a || gen !== state.roGen) return;
            var thumbs = $('#qaRoThumbs'); if (!thumbs) return;
            var img = h('<img alt="">'); img.src = u; thumbs.appendChild(img);
          }).catch(function () {});
        });
      });
    }

    function renderForm() {
      var a = state.open, d = state.draft, body = $('#qaBody');
      var visited = d.visit_status === 'VISITED';
      var html = '<div class="qa-sec">Visit</div><div class="qa-seg" id="qaVisit">' + Core.VISIT.map(function (v) { return '<button data-v="' + esc(v) + '" class="' + (d.visit_status === v ? 'on' : '') + '">' + esc(v) + '</button>'; }).join('') + '</div>';
      html += '<div class="qa-field" style="margin-top:8px"><label>Contractor\'s representative</label><input id="f_rep" value="' + esc(d.contractor_rep) + '"></div><div class="qa-field"><label>Installer/s</label><input id="f_inst" value="' + esc(d.installers_text) + '"></div>';
      if (!visited) {
        html += '<div class="qa-sec">Location photo *</div><div class="qa-thumbs" id="qaLocThumbs"></div><input type="file" accept="image/*" capture="environment" id="f_locphoto" style="margin-top:6px">' +
          '<div class="qa-field" style="margin-top:8px"><label>Remarks *</label><textarea id="f_remarks" rows="3">' + esc(d.remarks) + '</textarea></div>';
      } else {
        var sections = { OUTSIDE: 'Outside segment of installation', PREMISE: 'Client premise segment of installation' };
        ['OUTSIDE', 'PREMISE'].forEach(function (sec) {
          html += '<div class="qa-sec">' + sections[sec] + '</div>';
          checklist().filter(function (c) { return c.section === sec; }).forEach(function (c) {
            var res = d.items[c.id] || '', v = d.violations[c.id] || {}, ph = d.photos.concat(d.pending).filter(function (p) { return p.item_id === c.id; });
            html += '<div class="qa-item" data-item="' + c.id + '"><div class="lbl">' + esc(c.label) + '</div><div class="qa-pfn"><button class="pass ' + (res === 'pass' ? 'on' : '') + '" data-r="pass">PASS</button><button class="fail ' + (res === 'fail' ? 'on' : '') + '" data-r="fail">FAIL</button><button class="na ' + (res === 'na' ? 'on' : '') + '" data-r="na">N/A</button></div>' +
              '<div class="qa-thumbs">' + ph.map(photoTag).join('') + '</div>' +
              (res === 'fail' ? '<div class="qa-fail"><input type="file" accept="image/*" capture="environment" data-photo="' + c.id + '"><div class="qa-field" style="margin-top:6px"><label>Violation code *</label><select data-code="' + c.id + '">' + codeOptions(v.code || c.suggested_code) + '</select><div class="qa-hint" data-offhint="' + c.id + '"></div></div><div class="qa-chips" data-chips="' + c.id + '">' + state.cfg.quickRemarks.map(function (q) { return '<span>' + esc(q.label) + '</span>'; }).join('') + '</div><div class="qa-field"><label>Remark</label><textarea rows="2" data-remark="' + c.id + '">' + esc(v.remark || '') + '</textarea></div></div>' :
               '<div style="margin-top:6px"><input type="file" accept="image/*" capture="environment" data-photo="' + c.id + '" style="font-size:11px"></div>') + '</div>';
          });
        });
        html += '<div class="qa-sec">Other violations</div><div id="qaExtra">' + Object.keys(d.violations).filter(function (k) { return k.indexOf('x') === 0; }).map(function (k) { var v = d.violations[k]; return '<div class="qa-item"><div class="qa-field"><label>Code</label><select data-code="' + k + '">' + codeOptions(v.code) + '</select><div class="qa-hint" data-offhint="' + k + '"></div></div><div class="qa-field"><label>Remark</label><textarea rows="2" data-remark="' + k + '">' + esc(v.remark || '') + '</textarea></div><button class="qa-btn ghost" data-delv="' + k + '">Remove</button></div>'; }).join('') + '</div><button class="qa-btn ghost" id="qaAddV">+ Add other violation</button>';
        var hasFail = Object.values(d.items).some(function (r) { return r === 'fail'; });
        html += '<div class="qa-sec">Assessment</div><div class="qa-field"><label>Wire *</label><div class="qa-seg" data-seg="wire">' + Core.WIRE.map(function (v) { return '<button data-v="' + v + '" class="' + (d.wire === v ? 'on' : '') + '">' + v + '</button>'; }).join('') + '</div></div>' +
          '<div class="qa-field"><label>QA / GC *</label><div class="qa-seg" data-seg="qa_gc">' + Core.QAGC.map(function (v) { return '<button data-v="' + v + '" class="' + (d.qa_gc === v ? 'on' : '') + '">' + v + '</button>'; }).join('') + '</div></div>' +
          '<div class="qa-field"><label>Assessment *</label><div class="qa-seg" data-seg="assessment">' + Core.ASSESS.map(function (v) { return '<button data-v="' + v + '" class="' + (d.assessment === v ? 'on' : '') + '"' + (v === 'GOOD' && hasFail ? ' disabled title="Not allowed with a failed item"' : '') + '>' + v + '</button>'; }).join('') + '</div></div>' +
          '<div class="qa-sec">Found business</div><div class="qa-seg" data-seg="found_business"><button data-v="" class="' + (!d.found_business ? 'on' : '') + '">NONE</button><button data-v="willing" class="' + (d.found_business === 'willing' ? 'on' : '') + '">WILLING TO UPGRADE</button><button data-v="not_willing" class="' + (d.found_business === 'not_willing' ? 'on' : '') + '">NOT WILLING (SUBJECT FOR TERMINATION)</button></div>' +
          '<div style="display:flex;gap:8px;margin-top:8px"><div class="qa-field" style="flex:1"><label>Old plan</label><input id="f_old" value="' + esc(d.old_plan) + '"></div><div class="qa-field" style="flex:1"><label>New plan</label><input id="f_new" value="' + esc(d.new_plan) + '"></div></div>' +
          '<div class="qa-field"><label>General remarks</label><textarea id="f_remarks" rows="2">' + esc(d.remarks) + '</textarea></div>' +
          '<div class="qa-sec">Subscriber acknowledgement</div><div class="qa-cert">I, <b>' + esc(d.subscriber_signed_name || a.subscriber || '__________') + '</b>, the client, understand that there is a non-compliance regarding my subscription and that I need to change and/or upgrade from residential plan to business plan (applies only when a business was found).</div>' +
          '<div class="qa-field"><label>Subscriber\'s name *</label><input id="f_subname" value="' + esc(d.subscriber_signed_name) + '"></div><canvas class="qa-sig" id="sigSub"></canvas><div style="display:flex;justify-content:space-between;align-items:center"><span class="qa-pend">' + ((d.sig_sub || d.sig_sub_path) ? '✓ signature captured' : '') + '</span><button class="qa-btn ghost" id="sigSubClear">Clear</button></div>' +
          '<div class="qa-sec">Inspector certification</div><div class="qa-cert">I, the inspector, hereby certify that the inspection has been performed in a fair, professional, and honest way, and that I have not asked, nor received any favour, compensation or gifts from anyone.</div><canvas class="qa-sig" id="sigIns"></canvas><div style="display:flex;justify-content:space-between;align-items:center"><span class="qa-pend">' + ((d.sig_ins || d.sig_ins_path) ? '✓ signature captured' : '') + '</span><button class="qa-btn ghost" id="sigInsClear">Clear</button></div>';
      }
      if (a.job_id) html += '<div class="qa-sec">Install close-out photos (technician)</div><div class="qa-thumbs" id="qaInstall">Loading…</div>';
      body.innerHTML = html;
      // wiring
      body.querySelectorAll('#qaVisit button').forEach(function (b) { b.onclick = function () { d.visit_status = b.dataset.v; saveDraft(); renderForm(); }; });
      body.querySelectorAll('[data-seg]').forEach(function (seg) { seg.querySelectorAll('button').forEach(function (b) { b.onclick = function () { if (b.disabled) return; d[seg.dataset.seg] = b.dataset.v; seg.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); saveDraft(); }; }); });
      body.querySelectorAll('.qa-pfn button').forEach(function (b) { b.onclick = function () { var item = b.closest('[data-item]').dataset.item; d.items[item] = b.dataset.r; if (b.dataset.r === 'fail' && !d.violations[item]) { var c = checklist().filter(function (x) { return String(x.id) === item; })[0]; d.violations[item] = { code: c.suggested_code || '', remark: '', item_id: c.id }; } if (b.dataset.r !== 'fail') delete d.violations[item]; if (!Object.values(d.items).some(function (r) { return r === 'fail'; })) d.assessment = 'GOOD'; else if (d.assessment === 'GOOD') d.assessment = ''; saveDraft(); renderForm(); }; });
      body.querySelectorAll('[data-code]').forEach(function (s) { s.onchange = function () { d.violations[s.dataset.code].code = s.value; saveDraft(); var hint = body.querySelector('[data-offhint="' + s.dataset.code + '"]'); if (hint) hint.textContent = ''; loadOffenseHints(); }; });
      body.querySelectorAll('[data-remark]').forEach(function (t) { t.oninput = function () { d.violations[t.dataset.remark].remark = t.value; saveDraft(); }; });
      body.querySelectorAll('[data-chips] span').forEach(function (sp) { sp.onclick = function () { var k = sp.parentNode.dataset.chips, t = body.querySelector('[data-remark="' + k + '"]'); t.value = (t.value ? t.value + ', ' : '') + sp.textContent; d.violations[k].remark = t.value; saveDraft(); }; });
      body.querySelectorAll('[data-delv]').forEach(function (b) { b.onclick = function () { delete d.violations[b.dataset.delv]; saveDraft(); renderForm(); }; });
      var addV = $('#qaAddV'); if (addV) addV.onclick = function () { d.violations['x' + Date.now()] = { code: state.cfg.codes[0].code, remark: '', item_id: null }; saveDraft(); renderForm(); };
      body.querySelectorAll('[data-photo]').forEach(function (inp) { inp.onchange = function () { if (inp.files && inp.files[0]) addPhoto(inp.files[0], Number(inp.dataset.photo)); }; });
      var loc = $('#f_locphoto'); if (loc) { loc.onchange = function () { if (loc.files && loc.files[0]) addPhoto(loc.files[0], null); }; var lt = $('#qaLocThumbs'); if (lt) lt.innerHTML = d.photos.concat(d.pending).filter(function (p) { return p.item_id == null; }).map(photoTag).join(''); }
      [['f_rep', 'contractor_rep'], ['f_inst', 'installers_text'], ['f_remarks', 'remarks'], ['f_old', 'old_plan'], ['f_new', 'new_plan'], ['f_subname', 'subscriber_signed_name']].forEach(function (p) { var el = $('#' + p[0]); if (el) el.oninput = function () { d[p[1]] = el.value; saveDraft(); }; });
      if (visited) {
        if (state.pads.sub) state.pads.sub.destroy(); if (state.pads.ins) state.pads.ins.destroy();
        state.pads.sub = makeSignaturePad($('#sigSub'), function () { state.pads.sub.toBlob().then(blobToDataUrl).then(function (u) { d.sig_sub = u; d.sig_sub_path = null; saveDraft(); }); });
        state.pads.ins = makeSignaturePad($('#sigIns'), function () { state.pads.ins.toBlob().then(blobToDataUrl).then(function (u) { d.sig_ins = u; d.sig_ins_path = null; saveDraft(); }); });
        if (d.sig_sub) state.pads.sub.restore(d.sig_sub); if (d.sig_ins) state.pads.ins.restore(d.sig_ins);
        $('#sigSubClear').onclick = function () { state.pads.sub.clear(); d.sig_sub = null; d.sig_sub_path = null; saveDraft(); };
        $('#sigInsClear').onclick = function () { state.pads.ins.clear(); d.sig_ins = null; d.sig_ins_path = null; saveDraft(); };
      }
      if (a.job_id) api.getInstallPhotos(a.job_id).then(function (ps) { if (state.destroyed) return; var el = $('#qaInstall'); if (!el) return; el.innerHTML = ps.length ? ps.map(function (p) { return '<a href="' + esc(p.url) + '" target="_blank" rel="noopener"><img src="' + esc(p.url) + '" alt="" title="' + esc(p.label || '') + '"></a>'; }).join('') : '<span class="qa-pend">No close-out photos uploaded by the technician.</span>'; });
      if (visited) loadOffenseHints();
    }

    function addPhoto(file, itemId) {
      var d = state.draft, a = state.open, label = itemId == null ? 'location' : (checklist().filter(function (c) { return c.id === itemId; })[0] || {}).label;
      toast('Processing photo…');
      buildStamp().then(function (st) { return compress(file, 1000, 90, st); }).then(function (blob) {
        return blobToDataUrl(blob).then(function (thumb) {
          var rec = { key: 'p' + Date.now(), item_id: itemId, label: label, thumb: thumb };
          return api.uploadPhoto(a.id, blob, { itemId: itemId, label: label }).then(function (r) {
            rec.path = r.path;
            return shrinkDataUrl(thumb, 160).then(function (small) { rec.thumb = small; d.photos.push(rec); });   // uploaded → the draft only needs a preview
          }, function () { d.pending.push(rec); toast('No signal — photo saved, will upload later'); });          // pending → keep the full data URL, it is the only copy
        });
      }).then(function () { if (state.destroyed) return; saveDraft(); renderForm(); }).catch(function (e) { toast('Photo failed: ' + e.message); });
    }

    // Upload any pending photos/signatures for a draft, then return the submit payload.
    function materialize(d, auditId) {
      var id = auditId || (state.open && state.open.id) || d.audit_id;
      var ups = d.pending.map(function (p) {
        var full = p.thumb;
        return api.uploadPhoto(id, dataUrlToBlob(full), { itemId: p.item_id, label: p.label })
          .then(function (r) { p.path = r.path; return shrinkDataUrl(full, 160).then(function (small) { p.thumb = small; d.photos.push(p); }); });
      });
      return Promise.all(ups).then(function () {
        d.pending = [];
        var sigs = [];
        if (d.sig_sub && !d.sig_sub_path) sigs.push(api.uploadSignature(id, 'subscriber', dataUrlToBlob(d.sig_sub)).then(function (r) { d.sig_sub_path = r.path; }));
        if (d.sig_ins && !d.sig_ins_path) sigs.push(api.uploadSignature(id, 'inspector', dataUrlToBlob(d.sig_ins)).then(function (r) { d.sig_ins_path = r.path; }));
        return Promise.all(sigs);
      }).then(function () {
        var viol = Object.keys(d.violations).map(function (k) { var v = d.violations[k]; var ph = d.photos.filter(function (p) { return v.item_id != null && p.item_id === v.item_id; })[0]; return { code: v.code, item_id: v.item_id, remark: v.remark || null, photo_path: ph ? ph.path : null }; }).filter(function (v) { return v.code; });
        return { submit_key: d.submit_key, visit_status: d.visit_status, contractor_rep: d.contractor_rep, installers_text: d.installers_text, wire: d.wire, qa_gc: d.qa_gc, assessment: d.assessment,
          found_business: d.found_business || null, old_plan: d.old_plan, new_plan: d.new_plan, remarks: d.remarks, lat: d.lat, lng: d.lng,
          items: Object.keys(d.items).map(function (k) { return { item_id: Number(k), result: d.items[k], remark: (d.violations[k] || {}).remark || null }; }),
          violations: viol, photos: d.photos.map(function (p) { return { path: p.path, item_id: p.item_id, label: p.label }; }),
          subscriber_signed_name: d.subscriber_signed_name, subscriber_signature_path: d.sig_sub_path || null, inspector_signature_path: d.sig_ins_path || null };
      });
    }
    function localCheck(d) {
      var probe = { submit_key: d.submit_key, visit_status: d.visit_status, wire: d.wire, qa_gc: d.qa_gc, assessment: d.assessment, remarks: d.remarks, subscriber_signed_name: d.subscriber_signed_name,
        subscriber_signature_path: (d.sig_sub || d.sig_sub_path) ? 'x' : null, inspector_signature_path: (d.sig_ins || d.sig_ins_path) ? 'x' : null,
        items: Object.keys(d.items).map(function (k) { return { item_id: Number(k), result: d.items[k] }; }),
        violations: Object.keys(d.violations).map(function (k) { return { code: d.violations[k].code, item_id: d.violations[k].item_id }; }),
        photos: d.photos.concat(d.pending).map(function (p) { return { item_id: p.item_id, path: p.path || 'pending' }; }) };
      return Core.validateSubmission(probe, checklist());
    }
    function submit() {
      var d = state.draft, errs = localCheck(d), errEl = $('#qaErr');
      if (errs.length) { errEl.textContent = errs.join('\n'); toast('Please complete the form'); return; }
      if (!confirm('Submit this inspection? It will be locked after submission.')) return;
      errEl.textContent = ''; $('#qaSubmit').disabled = true;
      materialize(d).then(function (payload) { return api.submitAudit(d.audit_id, payload); }).then(function () {
        if (state.destroyed) return;
        lsDel(draftKey(d.audit_id)); toast('✅ Inspection submitted'); closeSheet();
      }).catch(function (e) {
        if (state.destroyed) return;
        var msg = String(e && e.message || e);
        // qa.submit_audit on the server raises exactly these phrases for validation failures;
        // anything else (network drop, timeout, 5xx, ...) is a transport failure and gets queued for retry.
        if (/not submittable|cannot be|required|Unknown|GOOD|signature|photo|items|assigned/i.test(msg)) { errEl.textContent = msg; $('#qaSubmit').disabled = false; return; }
        var q = lsGet(QUEUE, []); if (!q.some(function (x) { return x.audit_id === d.audit_id; })) q.push({ audit_id: d.audit_id, at: Date.now() }); lsSet(QUEUE, q); saveDraft();
        toast('No signal — inspection saved, will submit when online'); closeSheet();
      });
    }
    function flushQueue() {
      var q = lsGet(QUEUE, []); if (!q.length) { renderPend(); return Promise.resolve(); }
      var item = q[0], d = lsGet(draftKey(item.audit_id), null);
      if (!d) { lsSet(QUEUE, q.slice(1)); return flushQueue(); }
      return materialize(d, d.audit_id).then(function (payload) { saveDraftFor(d); return api.submitAudit(d.audit_id, payload); }).then(function () {
        lsDel(draftKey(d.audit_id)); lsSet(QUEUE, q.slice(1)); toast('✅ Queued inspection ' + d.audit_id + ' submitted'); return flushQueue();
      }).catch(function (e) {
        saveDraftFor(d);
        item.attempts = (item.attempts || 0) + 1;
        if (item.attempts >= 25) { q.shift(); lsSet(QUEUE, q); toast('⚠ Inspection ' + d.audit_id + ' could not be submitted after many retries — open it and submit again'); renderPend(); return flushQueue(); }
        lsSet(QUEUE, q); renderPend();
      });
    }
    function saveDraftFor(d) { lsSet(draftKey(d.audit_id), d); }

    if (api.subscribe) state.unsub = api.subscribe(function () { if (!state.open) refresh(); else checkStillMine(); });
    var onOnline = function () { flushQueue().then(refresh); }; window.addEventListener('online', onOnline);
    refresh();
    return { refresh: refresh, destroy: function () { state.destroyed = true; if (state.pads.sub) state.pads.sub.destroy(); if (state.pads.ins) state.pads.ins.destroy(); if (state.unsub) state.unsub(); window.removeEventListener('online', onOnline); rootEl.innerHTML = ''; } };
  }
  root.MobileQA = { mount: mount, makeSignaturePad: makeSignaturePad };
})(typeof self !== 'undefined' ? self : this);
