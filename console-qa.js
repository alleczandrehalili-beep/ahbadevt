// AHBA Console — QA AUDIT page module. Loaded by index.html (production) and qa-demo.html (dry run). Mount-only.
(function (root) {
  'use strict';
  var Core = root.QaCore;
  var CSS = '.cq{font:13px "DM Sans",system-ui,sans-serif;color:#0e2b27}.cq-tabs{display:flex;gap:6px;margin:0 0 12px;flex-wrap:wrap}.cq-tabs button{padding:8px 14px;border-radius:10px;border:1px solid #cfe0d8;background:#fff;font-weight:700}.cq-tabs button.on{background:#0d3b34;color:#fff;border-color:#0d3b34}' +
    '.cq-stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}.cq-stat{background:#fff;border:1px solid #e3e8e2;border-radius:12px;padding:10px 14px;min-width:120px}.cq-stat span{display:block;font-size:10px;color:#8a9894;text-transform:uppercase;letter-spacing:.06em}.cq-stat strong{font-size:20px}.cq-stat.warn strong{color:#c2503a}' +
    '.cq-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.cq-bar input,.cq-bar select{padding:7px 9px;border:1px solid #cfd8d3;border-radius:9px;font-size:12px}.cq-btn{padding:7px 12px;border-radius:9px;border:1px solid #0d3b34;background:#0d3b34;color:#fff;font-weight:700;font-size:12px;cursor:pointer}.cq-btn.ghost{background:#fff;color:#0d3b34}.cq-btn.warn{background:#c2503a;border-color:#c2503a}.cq-btn[disabled]{opacity:.5;cursor:default}' +
    '.cq table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e3e8e2;border-radius:12px;overflow:hidden}.cq th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#8a9894;text-align:left;padding:8px 10px;border-bottom:1px solid #e3e8e2;background:#f8f9f7}.cq td{padding:8px 10px;border-bottom:1px solid #f0f2ef;font-size:12px;vertical-align:top}.cq tr:hover td{background:#f8faf8}' +
    '.cq-pill{display:inline-block;font-size:10px;font-weight:800;padding:2px 8px;border-radius:9px;background:#eef2ec;color:#3a4a45}.cq-pill.queued{background:#fff3d6;color:#9a6200}.cq-pill.assigned{background:#e8ecff;color:#2d3fa8}.cq-pill.in_progress{background:#ffe9d6;color:#a04a00}.cq-pill.done{background:#e7f7ef;color:#11825f}.cq-pill.pool{background:#f1f1f1;color:#777}.cq-pill.fail{background:#fde4df;color:#c2503a}' +
    '.cq-age{font-size:10px;color:#8a9894}.cq-age.late{color:#c2503a;font-weight:800}.cq-map{height:320px;border-radius:12px;border:1px solid #e3e8e2;margin-bottom:12px;background:#eef2ec}.cq-cols{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}.cq-col{background:#fff;border:1px solid #e3e8e2;border-radius:12px;padding:10px}.cq-col h4{margin:0 0 8px;font-size:13px}.cq-row{border:1px solid #f0f2ef;border-radius:9px;padding:7px 9px;margin-bottom:6px;font-size:12px}' +
    '.cq-modal{position:fixed;inset:0;background:rgba(8,28,24,.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px}.cq-modal>div{background:#fff;border-radius:14px;max-width:920px;width:100%;max-height:92vh;overflow:auto;padding:20px}.cq-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;font-size:12px}.cq-grid b{display:block;font-size:10px;color:#8a9894;text-transform:uppercase}.cq-thumbs{display:flex;gap:8px;flex-wrap:wrap}.cq-thumbs img{width:110px;height:110px;object-fit:cover;border-radius:9px;border:1px solid #e3e8e2}.cq-sec{font:800 10px Manrope,system-ui;letter-spacing:.08em;text-transform:uppercase;color:#107b5e;margin:14px 0 6px}.cq-banner{background:#fde4df;color:#8a2c1b;border:1px solid #f0c4b9;border-radius:10px;padding:8px 12px;margin-bottom:10px;font-size:12px}.cq-empty{padding:26px;text-align:center;color:#9aa6a2}' +
    '.cq-disp{display:grid;grid-template-columns:290px 1fr;gap:12px;align-items:start;margin-bottom:12px}.cq-blwrap,.cq-lanewrap{background:#fff;border:1px solid #e3e8e2;border-radius:12px;padding:10px}.cq-blwrap{max-height:72vh;overflow:auto}.cq-blwrap h4{margin:0 0 8px;font-size:13px}.cq-blbar{gap:5px}.cq-blbar select,.cq-blbar input{font-size:11px;padding:5px 7px;width:100%}.cq-lanewrap{overflow-x:auto}' +
    '.cq-blcard{border:1px solid #e3e8e2;border-radius:9px;padding:7px 9px;margin-bottom:6px;font-size:12px;background:#fff;cursor:grab}.cq-blcard:active{cursor:grabbing}#cqBacklog.cq-dropping{outline:2px dashed #18a57b;outline-offset:3px;border-radius:9px;background:#f2faf6}' +
    '.cq-tl-headrow,.cq-tl-row{display:flex;align-items:stretch;min-width:620px}.cq-tl-headrow{padding-bottom:4px;border-bottom:1px solid #e3e8e2}.cq-tl-row{border-bottom:1px solid #f0f2ef;padding:7px 0}.cq-tl-name{width:132px;flex:none;font-size:11px;padding-right:6px}.cq-tl-axis{flex:1;display:flex;margin-left:102px}.cq-tl-h{flex:1;font-size:9px;color:#8a9894;border-left:1px solid #eef0ed;padding-left:3px}' +
    // .cq-tl-name / .cq-tl-none carry padding + a border inside their fixed width — border-box keeps the lane rows
    // aligned with the hour axis above them (which is offset by the same 132+96-ish pixels).
    '.cq-tl-name,.cq-tl-none{box-sizing:border-box}' +
    '.cq-tl-none{width:96px;flex:none;border-right:1px dashed #dfe6e1;padding-right:6px;margin-right:6px;display:flex;flex-direction:column;gap:3px}.cq-tl-track{flex:1;position:relative;min-height:30px;border-radius:8px;background:#fafbfa}.cq-tl-track.cq-dropping{background:#eaf7f1;outline:2px dashed #18a57b}.cq-tl-gl{position:absolute;top:0;bottom:0;width:1px;background:#eef0ed}' +
    '.cq-tl-block{position:absolute;height:22px;line-height:21px;box-sizing:border-box;border-radius:6px;font-size:10px;font-weight:700;padding:0 5px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;cursor:grab;background:#fff;border:1.5px solid #18a57b;color:#0e5c45}.cq-tl-block:active{cursor:grabbing}.cq-tl-block.s-in_progress{border-color:#d08a00;background:#fff6e6;color:#8a5a00}.cq-tl-block.s-done{border-color:#c8d0cb;background:#eceeec;color:#6b7671}.cq-tl-chip{position:static;width:100%;height:auto;line-height:1.35;white-space:normal;padding:2px 5px}.cq-tl-re{display:inline-block;background:#7b2d8a;color:#fff;border-radius:4px;font-size:8px;padding:0 3px;margin-right:3px}' +
    '.cq-pill.r-FORRECTIFICATION{background:#fde8e4;color:#b23a25}.cq-pill.r-FORREINSPECTION{background:#fff3d6;color:#9a6200}.cq-pill.r-RECTIFIED{background:#e7f7ef;color:#11825f}.cq-pill.r-CLOSED{background:#e8ecff;color:#2d3fa8}.cq-over{color:#c2503a;font-weight:800}.cq-ovr{font-size:10px;color:#9a6200}';
  var COLORS = ['#18a57b', '#2d3fa8', '#c2503a', '#9a6200', '#7b2d8a', '#0d7c9a'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); }
  // Manila calendar day of a timestamptz. Every month/day comparison in this file must go through this or `today()`:
  // slicing the raw UTC ISO string puts the Manila evening of the 30th into the following month.
  function mnlDay(ts) { return ts ? new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) : ''; }
  function addDays(d, n) { var x = new Date(d + 'T00:00:00+08:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); }
  function daysSince(d) { return d ? Math.max(0, Math.round((new Date(today()) - new Date(d)) / 86400000)) : 0; }
  function fmtWhen(s) { return s ? new Date(s).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; }
  function pill(s) { return '<span class="cq-pill ' + esc(s) + '">' + esc(String(s || '').replace('_', ' ')) + '</span>'; }
  function rpill(s) { return '<span class="cq-pill r-' + esc(String(s || '').replace(/[^A-Z]/g, '')) + '">' + esc(s || '') + '</span>'; }
  function peso(n) { return '₱' + Number(n || 0).toLocaleString('en-PH'); }

  function mount(rootEl, o) {
    var api = o.api, user = o.user || {}, deps = o.deps || {}, canEdit = deps.canEdit !== false, L = deps.L || root.L;
    var toast = deps.toast || function (m) { console.log('[cq]', m); };
    var S = { tab: 'queue', cfg: null, inspectors: [], sel: {}, filter: { status: ['queued'], page: 1 }, boardDate: today(), bl: {}, board: { rows: [], backlog: [], total: 0 }, drag: null, laneT: null, map: null, layer: null, unsub: null, unsubN: null, submittedToday: 0, results: { page: 1 }, report: { from: addDays(today(), -6), to: today() }, rect: { status: ['FOR RECTIFICATION', 'FOR RE-INSPECTION'], page: 1 } };
    if (!document.getElementById('cqCss')) { var st = document.createElement('style'); st.id = 'cqCss'; st.textContent = CSS; document.head.appendChild(st); }
    rootEl.innerHTML = '<div class="cq"><div id="cqBanner"></div><div class="cq-tabs">' + [['queue', 'Queue'], ['board', 'Dispatch'], ['results', 'Results'], ['rect', 'Rectifications'], ['reports', 'Reports'], ['settings', 'Settings']].map(function (t) { return '<button data-tab="' + t[0] + '" class="' + (t[0] === 'queue' ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div id="cqBody"></div></div><div id="cqModal"></div>';
    var $ = function (s) { return rootEl.querySelector(s); };
    rootEl.querySelectorAll('.cq-tabs button').forEach(function (b) { b.onclick = function () { S.tab = b.dataset.tab; rootEl.querySelectorAll('.cq-tabs button').forEach(function (x) { x.classList.toggle('on', x === b); }); render(); }; });

    function load() {
      return Promise.all([api.getConfig(), api.listInspectors(), api.syncStatus()])
        .then(function (r) { S.cfg = r[0]; S.inspectors = r[1]; S.sync = r[2]; return checkUnmappedOpen(); })
        .then(banner);
    }
    // A subcon with a blank FieldOps org id CANNOT see its own findings: the findings page filter, the RLS policies
    // and the notices are all keyed on contractor_org_id. That is invisible from the head's side — the loop looks
    // perfectly normal here — so warn as soon as such a contractor has at least one OPEN loop.
    function checkUnmappedOpen() {
      S.unmappedOpen = [];
      var cands = ((S.cfg && S.cfg.contractors) || []).filter(function (c) { return c.active && c.kind === 'subcon' && !String(c.org_id == null ? '' : c.org_id).trim(); });
      if (!cands.length) return Promise.resolve();
      return Promise.all(cands.map(function (c) {
        return api.listRectifications({ status: Core.RECT_OPEN, contractor: c.sheet_name, pageSize: 1 })
          .then(function (r) { return r.total > 0 ? c.sheet_name : null; }).catch(function () { return null; });   // a listing failure must not block the console
      })).then(function (names) { S.unmappedOpen = names.filter(Boolean); });
    }
    function unmappedOpenMsg() {
      return S.unmappedOpen && S.unmappedOpen.length
        ? 'Subcon(s) with open findings but no FieldOps org id (they cannot see them): ' + S.unmappedOpen.join(', ') + ' — set the org id in Settings.' : '';
    }
    function banner() {
      var b = $('#cqBanner'), msgs = [];
      var last = S.sync && S.sync.last_sync_at ? (Date.now() - new Date(S.sync.last_sync_at)) / 3600000 : null;
      if (last == null) msgs.push('Sheet sync has never run — install the Apps Script or upload a CSV in Settings.');
      else if (last > 2) msgs.push('Sheet sync is ' + Math.round(last) + ' h old — check the Apps Script trigger.');
      if (S.sync && S.sync.unmapped && S.sync.unmapped.length) msgs.push('Unmapped contractor name(s) in the sheet: ' + S.sync.unmapped.join(', ') + ' — map them in Settings.');
      if (unmappedOpenMsg()) msgs.push(unmappedOpenMsg());
      b.innerHTML = msgs.map(function (m) { return '<div class="cq-banner">⚠ ' + esc(m) + '</div>'; }).join('');
    }
    function render() { var f = TABS[S.tab]; if (f) f(); }
    function modal(html) { $('#cqModal').innerHTML = '<div class="cq-modal"><div>' + html + '</div></div>'; $('#cqModal .cq-modal').onclick = function (e) { if (e.target === this) closeModal(); }; }
    function closeModal() { $('#cqModal').innerHTML = ''; }
    function inspectorOpts(sel) { return S.inspectors.map(function (i) { return '<option value="' + esc(i.username) + '"' + (i.username === sel ? ' selected' : '') + '>' + esc(i.username + (i.display_name ? ' · ' + i.display_name : '')) + '</option>'; }).join(''); }
    function contractorOpts() { return '<option value="">All contractors</option>' + S.cfg.contractors.map(function (c) { return '<option value="' + esc(c.sheet_name) + '">' + esc(c.display_name) + ' (' + esc(c.kind) + ')</option>'; }).join(''); }
    function districtOpts() { return '<option value="">All districts</option>' + ['1', '2', '3', '4', '5', '6'].map(function (d) { return '<option value="' + d + '">District ' + d + '</option>'; }).join(''); }

    // ---------------- QUEUE ----------------
    function renderQueue() {
      var f = S.filter;
      $('#cqBody').innerHTML = '<div class="cq-stats" id="cqQStats"></div><div class="cq-bar">' +
        '<select id="qf_status"><option value="queued">Queued (to assign)</option><option value="pool">Pool (in-house, not selected)</option><option value="assigned,in_progress">Assigned / in progress (redispatch)</option><option value="queued,assigned,in_progress">All open</option></select>' +
        '<select id="qf_contractor">' + contractorOpts() + '</select><select id="qf_kind"><option value="">Subcon + in-house</option><option value="subcon">Subcon only</option><option value="inhouse">In-house only</option></select>' +
        '<select id="qf_district">' + districtOpts() + '</select>' +
        '<select id="qf_brgy"><option value="">All barangays</option></select>' +
        '<input type="date" id="qf_from" title="JO closed from"><input type="date" id="qf_to" title="JO closed to"><input id="qf_q" placeholder="Search name / address / JO / acct" style="min-width:220px"><button class="cq-btn ghost" id="qf_go">Filter</button>' +
        (canEdit ? '<span style="flex:1"></span><button class="cq-btn" id="q_assign" disabled>Assign / redispatch selected</button><button class="cq-btn ghost" id="q_pick" disabled>Queue selected (manual pick)</button><button class="cq-btn ghost" id="q_unassign" disabled>Unassign selected</button><button class="cq-btn ghost" id="q_sample">Random sample in-house…</button>' : '') +
        '</div><div id="cqQTable"></div><div class="cq-bar" style="justify-content:flex-end"><button class="cq-btn ghost" id="q_prev">‹ Prev</button><span id="q_page"></span><button class="cq-btn ghost" id="q_next">Next ›</button></div>';
      $('#qf_status').value = f.status.join(','); if (f.contractor) $('#qf_contractor').value = f.contractor; if (f.kind) $('#qf_kind').value = f.kind; if (f.from) $('#qf_from').value = f.from; if (f.to) $('#qf_to').value = f.to; if (f.q) $('#qf_q').value = f.q;
      if (f.district) $('#qf_district').value = f.district;
      fillBrgyOptions($('#qf_district'), $('#qf_brgy'), f.barangay);
      $('#qf_district').onchange = function () { fillBrgyOptions($('#qf_district'), $('#qf_brgy'), null); };
      $('#qf_go').onclick = function () { S.filter = { status: $('#qf_status').value.split(','), contractor: $('#qf_contractor').value, kind: $('#qf_kind').value, district: $('#qf_district').value, barangay: $('#qf_brgy').value, from: $('#qf_from').value, to: $('#qf_to').value, q: $('#qf_q').value, page: 1 }; S.sel = {}; loadQueue(); };
      $('#qf_q').onkeydown = function (e) { if (e.key === 'Enter') $('#qf_go').click(); };
      $('#q_prev').onclick = function () { if (S.filter.page > 1) { S.filter.page--; loadQueue(); } };
      $('#q_next').onclick = function () { S.filter.page++; loadQueue(); };
      if (canEdit) { $('#q_assign').onclick = function () { assignDialog(); }; $('#q_pick').onclick = function () { act(api.queuePool(selIds(), { by: user.username }), 'queued'); }; $('#q_unassign').onclick = function () { var ids = selIds(); if (!ids.length) return; api.unassignAudits(ids, { by: user.username }).then(function (n) { toast(n ? (n + ' audit(s) unassigned') : 'Nothing unassigned (ticket already moved)'); S.sel = {}; loadQueue(); loadQueueStats(); }).catch(function (e) { toast('Failed: ' + e.message); }); }; $('#q_sample').onclick = sampleDialog; }
      loadQueue(); loadQueueStats();
    }
    // Populates the barangay select from the chosen district (all six districts' barangays, sorted, when none is chosen).
    function fillBrgyOptions(distSel, brgySel, selected) {
      if (!distSel || !brgySel) return;
      var d = distSel.value;
      var list = d ? Core.barangaysOf(d) : Object.keys(Core.QC_DISTRICTS).reduce(function (acc, k) { return acc.concat(Core.QC_DISTRICTS[k]); }, []);
      list = list.slice().sort();
      brgySel.innerHTML = '<option value="">All barangays</option>' + list.map(function (b) { return '<option value="' + esc(b) + '"' + (b === selected ? ' selected' : '') + '>' + esc(b) + '</option>'; }).join('');
    }
    function selIds() { return Object.keys(S.sel).filter(function (k) { return S.sel[k]; }); }
    function act(p, verb) { p.then(function (n) { toast(n + ' audit(s) ' + verb); S.sel = {}; loadQueue(); loadQueueStats(); }).catch(function (e) { toast('Failed: ' + e.message); }); }
    // Assignment hook — host (console) uses it to fire the push notification. Never let a failing hook break the UI.
    function fireAssigned(inspector, date, count) { try { if (o.onAssigned && inspector && date) o.onAssigned({ inspector: inspector, date: date, count: count }); } catch (e) { } }
    function loadQueueStats() {
      var m = today().slice(0, 7) + '-01';
      Promise.all([api.listAudits({ kind: 'subcon', from: m, pageSize: 1 }), api.listAudits({ kind: 'subcon', status: ['done'], from: m, pageSize: 1 }), api.listAudits({ status: ['queued'], pageSize: 1000 }), api.listAudits({ status: ['assigned', 'in_progress'], pageSize: 1 })]).then(function (r) {
        var buckets = { '0-7': 0, '8-14': 0, '15-30': 0, '31+': 0 }; r[2].rows.forEach(function (a) { buckets[Core.agingBucket(daysSince(a.jo_date_closed))]++; });
        var el = $('#cqQStats'); if (!el) return;
        var agingLabel = 'Aging of queued (days since close)' + (r[2].total > r[2].rows.length ? ' (first ' + r[2].rows.length + ' of ' + r[2].total + ')' : '');
        el.innerHTML = '<div class="cq-stat"><span>Subcon closed this month</span><strong>' + r[0].total + '</strong></div><div class="cq-stat"><span>Subcon inspected</span><strong>' + r[1].total + '</strong></div><div class="cq-stat' + (r[2].total > 50 ? ' warn' : '') + '"><span>Queued (not assigned)</span><strong>' + r[2].total + '</strong></div><div class="cq-stat"><span>Assigned / in progress</span><strong>' + r[3].total + '</strong></div>' +
          '<div class="cq-stat' + (buckets['15-30'] + buckets['31+'] > 0 ? ' warn' : '') + '"><span>' + esc(agingLabel) + '</span><strong style="font-size:13px">0-7: ' + buckets['0-7'] + ' · 8-14: ' + buckets['8-14'] + ' · 15-30: ' + buckets['15-30'] + ' · 31+: ' + buckets['31+'] + '</strong></div>';
      });
    }
    function loadQueue() {
      var f = S.filter; $('#cqQTable').innerHTML = '<div class="cq-empty">Loading…</div>';
      api.listAudits({ status: f.status, contractor: f.contractor, kind: f.kind, district: f.district, barangay: f.barangay, from: f.from, to: f.to, q: f.q, page: f.page, pageSize: 50 }).then(function (r) {
        if (S.tab !== 'queue' || !$('#cqQTable')) return;   // tab changed mid-fetch
        $('#q_page').textContent = 'Page ' + f.page + ' · ' + r.total + ' rows';
        if (!r.rows.length) { $('#cqQTable').innerHTML = '<div class="cq-empty">No audits match.</div>'; return; }
        $('#cqQTable').innerHTML = '<table><thead><tr>' + (canEdit ? '<th><input type="checkbox" id="q_all"></th>' : '') + '<th>Audit</th><th>Subscriber</th><th>Address</th><th>District</th><th>Contractor</th><th>JO closed</th><th>Aging</th><th>Status</th><th>Assigned</th></tr></thead><tbody>' + r.rows.map(function (a) {
          var d = daysSince(a.jo_date_closed);
          var dist = Core.districtOf(a.barangay);
          return '<tr>' + (canEdit ? '<td><input type="checkbox" data-sel="' + esc(a.id) + '"' + (S.sel[a.id] ? ' checked' : '') + '></td>' : '') + '<td><b>' + esc(a.id) + '</b><div class="cq-age">' + esc(a.jo_no || '') + (a.job_id ? ' · FieldOps' : '') + (a.unmapped ? ' · <span class="cq-pill fail">unmapped</span>' : '') + '</div></td><td><b>' + esc(a.subscriber || '') + '</b><div class="cq-age">' + esc(a.acct_no || '') + '</div></td><td>' + esc(a.address || '') + '<div class="cq-age">' + esc(a.barangay || '') + '</div></td><td>' + (dist ? 'D' + esc(dist) : '—') + '</td><td>' + esc(a.contractor_name || '') + '<div class="cq-age">' + esc(a.kind || '') + '</div></td><td>' + esc(a.jo_date_closed || '—') + '</td><td class="cq-age ' + (d > 14 ? 'late' : '') + '">' + d + ' d</td><td>' + pill(a.status) + '</td><td>' + esc(a.assigned_to || '') + (a.scheduled_date ? '<div class="cq-age">' + esc(a.scheduled_date) + ' #' + (a.sequence || '') + '</div>' : '') + '</td></tr>';
        }).join('') + '</tbody></table>';
        rootEl.querySelectorAll('[data-sel]').forEach(function (cb) { cb.onchange = function () { S.sel[cb.dataset.sel] = cb.checked; syncButtons(); }; });
        var all = $('#q_all'); if (all) all.onchange = function () { rootEl.querySelectorAll('[data-sel]').forEach(function (cb) { cb.checked = all.checked; S.sel[cb.dataset.sel] = all.checked; }); syncButtons(); };
        syncButtons();
      });
    }
    function syncButtons() { var n = selIds().length; ['q_assign', 'q_pick', 'q_unassign'].forEach(function (id) { var b = $('#' + id); if (b) b.disabled = !n; }); }
    // `ids` defaults to the Queue tab's checked rows; `done` (Dispatch board) replaces the queue-only reload.
    function assignDialog(ids, done) {
      ids = (ids && ids.length) ? ids : selIds(); if (!ids.length) return;
      modal('<h3 style="margin:0 0 10px">Assign / redispatch ' + ids.length + ' audit(s)</h3><div class="cq-bar"><label>Inspector <select id="as_insp">' + inspectorOpts() + '</select></label><label>Date <input type="date" id="as_date" value="' + today() + '"></label><label>Start sequence # <input type="number" id="as_seq" value="1" min="1" style="width:70px"></label></div><div class="cq-age" style="margin-bottom:10px">Sequence = order of visits for that day. The inspector sees them in this order (push notification is wired at deploy). Tickets already assigned or in progress are pulled from their current inspector.</div><div class="cq-bar" style="justify-content:flex-end"><button class="cq-btn ghost" id="as_cancel">Cancel</button><button class="cq-btn" id="as_ok">Assign</button></div>');
      $('#as_cancel').onclick = closeModal;
      $('#as_ok').onclick = function () { var insp = $('#as_insp').value, date = $('#as_date').value, seq = Number($('#as_seq').value || 1); if (!insp || !date) { toast('Pick an inspector and a date'); return; } closeModal();
        var p = api.assignAudits(ids, { inspector: insp, date: date, startSeq: seq, by: user.username }).then(function (n) { fireAssigned(insp, date, ids.length); return n; });
        if (done) p.then(function (n) { toast(n + ' audit(s) assigned to ' + insp); done(); }).catch(function (e) { toast('Failed: ' + e.message); });
        else act(p, 'assigned to ' + insp); };
    }
    function sampleDialog() {
      var pct = (S.cfg.settings || {}).inhouse_sample_pct || '10';
      modal('<h3 style="margin:0 0 10px">Random sample of in-house installs</h3><div class="cq-bar"><label>Closed from <input type="date" id="sm_from" value="' + addDays(today(), -7) + '"></label><label>to <input type="date" id="sm_to" value="' + today() + '"></label><label>Percent <input type="number" id="sm_pct" value="' + esc(pct) + '" min="1" max="100" style="width:70px"></label></div><div class="cq-age" style="margin-bottom:10px">Picks ceil(pool × %) random in-house pool rows closed in the range and moves them to Queued. Manual picks are still possible from the Pool filter.</div><div class="cq-bar" style="justify-content:flex-end"><button class="cq-btn ghost" id="sm_cancel">Cancel</button><button class="cq-btn" id="sm_ok">Sample</button></div>');
      $('#sm_cancel').onclick = closeModal;
      $('#sm_ok').onclick = function () { var o = { from: $('#sm_from').value, to: $('#sm_to').value, pct: Number($('#sm_pct').value), by: user.username }; closeModal(); act(api.sampleInhouse(o), 'sampled into the queue'); };
    }

    // ---------------- DISPATCH BOARD (Clicksoft-style lanes) ----------------
    // Left = "For dispatch" (queued audits, draggable cards). Right = one track per inspector, 07:00–18:00,
    // with 1-hour blocks laid out by Core.laneBlocks. Drop a card on a track to schedule it, drag a block to
    // another track to redispatch, drag it back to the backlog to unassign. Layout math lives in qa-core.js.
    function fmtHour12(h) { var ap = h < 12 ? 'AM' : 'PM'; return (((h + 11) % 12) + 1) + ' ' + ap; }
    function renderBoard() {
      if (S.map) { try { S.map.remove(); } catch (e) {} }
      S.map = null; S.drag = null; S.board = { rows: [], backlog: [], total: 0 };   // the tab is redrawn from scratch — drop the cache so "Loading…" shows
      var b = S.bl;
      var hdr = '<div class="cq-tl-name"></div><div class="cq-tl-axis">' + Array.apply(null, Array(Core.TL.hours)).map(function (_, i) { return '<div class="cq-tl-h">' + fmtHour12(Core.TL.start + i) + '</div>'; }).join('') + '</div>';
      $('#cqBody').innerHTML = '<div class="cq-bar"><label>Date <input type="date" id="bd_date" value="' + esc(S.boardDate) + '"></label><button class="cq-btn ghost" id="bd_prev">‹</button><button class="cq-btn ghost" id="bd_next">›</button><span id="bd_sum" class="cq-age"></span></div>' +
        '<div class="cq-disp"><div class="cq-blwrap"><h4 id="bd_blh">For dispatch</h4>' +
        '<div class="cq-bar cq-blbar"><select id="bl_district">' + districtOpts() + '</select><select id="bl_brgy"><option value="">All barangays</option></select><select id="bl_contractor">' + contractorOpts() + '</select><input id="bl_q" placeholder="Search name / address / JO"><button class="cq-btn ghost" id="bl_go">Filter</button></div>' +
        '<div id="cqBacklog"></div></div>' +
        '<div class="cq-lanewrap"><div class="cq-tl-headrow">' + hdr + '</div><div id="cqLanes"></div></div></div>' +
        '<div class="cq-map" id="cqMap"></div>';
      // The day only moves the lanes — the backlog is every queued audit, which does not depend on the board date.
      $('#bd_date').onchange = function () { S.boardDate = $('#bd_date').value; loadLanes(); };
      $('#bd_prev').onclick = function () { S.boardDate = addDays(S.boardDate, -1); $('#bd_date').value = S.boardDate; loadLanes(); };
      $('#bd_next').onclick = function () { S.boardDate = addDays(S.boardDate, 1); $('#bd_date').value = S.boardDate; loadLanes(); };
      if (b.district) $('#bl_district').value = b.district; if (b.contractor) $('#bl_contractor').value = b.contractor; if (b.q) $('#bl_q').value = b.q;
      fillBrgyOptions($('#bl_district'), $('#bl_brgy'), b.barangay);
      $('#bl_district').onchange = function () { fillBrgyOptions($('#bl_district'), $('#bl_brgy'), null); };
      $('#bl_go').onclick = function () { S.bl = { district: $('#bl_district').value, barangay: $('#bl_brgy').value, contractor: $('#bl_contractor').value, q: $('#bl_q').value }; loadBacklog(); };
      $('#bl_q').onkeydown = function (e) { if (e.key === 'Enter') $('#bl_go').click(); };
      loadBoard();
    }
    // The two halves of the board are fetched separately on purpose. `api.board(date)` is one small day's worth of
    // rows; the backlog is up to 200 queued audits and is what makes a refresh expensive — so realtime events and
    // the fallback timer only ever refetch the lanes. The backlog is refetched on tab render, on a filter change,
    // and after a write that can move a row in or out of the queue (schedule / unassign / assign).
    function loadBoard() { return Promise.all([loadLanes(), loadBacklog()]); }
    function loadLanes() {
      if (S.drag) return Promise.resolve();                                 // never yank the DOM out from under a drag
      var date = S.boardDate;
      var lanesEl = $('#cqLanes'); if (lanesEl && !S.board.rows.length) lanesEl.innerHTML = '<div class="cq-empty">Loading…</div>';
      return api.board(date).then(function (rows) {
        if (S.tab !== 'board' || !$('#cqLanes') || date !== S.boardDate) return;   // the head switched tabs or days while we were loading
        S.board.rows = rows || [];
        if (S.drag) return;                                                 // a drag started while the fetch was in flight
        renderLanes();
      }).catch(function (e) { var el = $('#cqLanes'); if (el) el.innerHTML = '<div class="cq-empty">Could not load the board: ' + esc(e.message) + '</div>'; });
    }
    function loadBacklog() {
      var b = S.bl;
      return api.listAudits({ status: ['queued'], district: b.district, barangay: b.barangay, contractor: b.contractor, q: b.q, pageSize: 200 }).then(function (r) {
        if (S.tab !== 'board' || !$('#cqBacklog')) return;
        S.board.backlog = r.rows || []; S.board.total = r.total;
        if (S.drag) return;
        renderBacklog();
      }).catch(function (e) { var el = $('#cqBacklog'); if (el) el.innerHTML = '<div class="cq-empty" style="padding:14px">Could not load the queue: ' + esc(e.message) + '</div>'; });
    }
    // Coalesce a burst of realtime events (and the 120-s timer) into ONE lane refetch.
    function refreshLanesSoon() {
      if (S.laneT) return;
      S.laneT = setTimeout(function () { S.laneT = null; if (S.tab === 'board') loadLanes(); }, 2000);
    }
    function boardSummary() {
      var rows = S.board.rows, backlog = S.board.backlog, el = $('#bd_sum'); if (!el) return;
      el.textContent = rows.length + ' assigned · ' + rows.filter(function (a) { return a.status === 'done'; }).length + ' done · ' + rows.filter(function (a) { return a.status === 'in_progress'; }).length + ' in progress · ' + backlog.length + ' waiting';
    }
    function renderBacklog() {
      var backlog = S.board.backlog, h = $('#bd_blh'), el = $('#cqBacklog'); if (!el) return;
      if (h) h.innerHTML = 'For dispatch (' + backlog.length + ')' + (S.board.total > backlog.length ? ' <span class="cq-age">first ' + backlog.length + ' of ' + S.board.total + '</span>' : '');
      el.innerHTML = backlog.length ? backlog.map(function (a) {
        var d = daysSince(a.jo_date_closed);
        return '<div class="cq-blcard"' + (canEdit ? ' draggable="true"' : '') + ' data-bl="' + esc(a.id) + '" title="Drag onto an inspector\'s track to schedule"><b>' + esc(a.subscriber || '—') + '</b><div class="cq-age">' + esc(a.address || '') + (a.barangay ? ' · ' + esc(a.barangay) : '') + '</div>' +
          '<div class="cq-age">' + esc(a.contractor_name || '') + ' · JO ' + esc(a.jo_no || '—') + ' · <span class="' + (d > 14 ? 'late' : '') + '">' + d + ' d</span></div>' +
          (canEdit ? '<div style="margin-top:5px"><button class="cq-btn ghost" data-blas="' + esc(a.id) + '" style="padding:2px 7px;font-size:10px">Assign…</button></div>' : '') + '</div>';
      }).join('') : '<div class="cq-empty" style="padding:14px">Nothing waiting for dispatch.</div>';
      rootEl.querySelectorAll('[data-blas]').forEach(function (btn) { btn.onclick = function (e) { e.stopPropagation(); assignDialog([btn.dataset.blas], loadBoard); }; });
      boardSummary();
      if (canEdit) wireBacklogDnD();
    }
    function renderLanes() {
      var rows = S.board.rows, el = $('#cqLanes'); if (!el) return;
      var by = {}; rows.forEach(function (a) { (by[a.assigned_to] = by[a.assigned_to] || []).push(a); });
      var names = S.inspectors.map(function (i) { return i.username; });
      Object.keys(by).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });   // an inspector who left the roster still shows their day
      el.innerHTML = names.length ? names.map(function (n, i) {
        var list = by[n] || [], blocks = Core.laneBlocks(list);
        var timed = blocks.filter(function (x) { return x.left != null; }), none = blocks.filter(function (x) { return x.left == null; });
        var maxRow = timed.reduce(function (m, x) { return Math.max(m, x.row); }, -1);
        var insp = S.inspectors.filter(function (x) { return x.username === n; })[0] || {};
        var grid = Array.apply(null, Array(Core.TL.hours)).map(function (_, k) { return '<i class="cq-tl-gl" style="left:' + (k / Core.TL.hours * 100) + '%"></i>'; }).join('');
        return '<div class="cq-tl-row"><div class="cq-tl-name"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + COLORS[i % COLORS.length] + ';margin-right:5px"></span><b>' + esc(n) + '</b>' +
          (insp.display_name ? '<div class="cq-age">' + esc(insp.display_name) + '</div>' : '') + '<div class="cq-age">' + list.filter(function (a) { return a.status === 'done'; }).length + '/' + list.length + ' done</div></div>' +
          '<div class="cq-tl-none">' + (none.length ? none.map(function (a) { return blockHtml(a, true); }).join('') : '<span class="cq-age">no time</span>') + '</div>' +
          '<div class="cq-tl-track" data-lane="' + esc(n) + '" style="min-height:' + Math.max(30, (maxRow + 1) * 26 + 6) + 'px">' + grid + timed.map(function (a) { return blockHtml(a, false); }).join('') + '</div></div>';
      }).join('') : '<div class="cq-empty">No QA inspector accounts yet — add them in Settings.</div>';
      rootEl.querySelectorAll('[data-blk]').forEach(function (b) { b.onclick = function () { openDetail(b.dataset.blk); }; });
      boardSummary();
      if (canEdit) wireLanesDnD();
      drawMap(rows, names);
    }
    // One scheduled audit as a track block (or a chip in the lane's "no time" bucket).
    function blockHtml(a, chip) {
      var t = a.scheduled_time ? Core.hourToTime(Core.timeToHour(a.scheduled_time)) : null;
      var re = a.source === 'reinspection' ? '<span class="cq-tl-re">RE</span>' : '';
      var label = '#' + (a.sequence || '-') + (t ? ' ' + t : '') + ' · ' + esc(String(a.subscriber || '').slice(0, 18));
      var title = a.id + ' · ' + (a.subscriber || '') + ' · ' + String(a.status).replace('_', ' ') + (t ? ' · ' + t : ' · no time') + ' · ' + (a.contractor_name || '');
      var pos = chip ? '' : 'left:' + a.left + '%;width:' + a.width + '%;top:' + (a.row * 26) + 'px;';
      var movable = canEdit && (a.status === 'assigned' || a.status === 'in_progress');   // a submitted visit is history — it must not be dragged anywhere
      return '<div class="cq-tl-block s-' + esc(a.status) + (chip ? ' cq-tl-chip' : '') + '"' + (movable ? ' draggable="true"' : '') + ' data-blk="' + esc(a.id) + '" data-src="' + esc(a.source || '') + '" style="' + pos + '" title="' + esc(title) + '">' + re + label + '</div>';
    }
    function dragId(e) { var id = S.drag && S.drag.id; if (!id) { try { id = e.dataTransfer.getData('text/plain'); } catch (x) {} } return id; }
    function rowById(id) { return S.board.rows.filter(function (a) { return a.id === id; })[0] || null; }
    // One drop zone. `dragleave` fires every time the pointer crosses into a CHILD of the zone, so the highlight
    // flickers if we just remove the class — count enter/leave pairs instead and only clear it at depth 0.
    function dropZone(el, onDrop) {
      var depth = 0;
      function clear() { depth = 0; el.classList.remove('cq-dropping'); }
      el.ondragenter = function (e) { e.preventDefault(); depth++; el.classList.add('cq-dropping'); };
      el.ondragover = function (e) { e.preventDefault(); el.classList.add('cq-dropping'); };
      el.ondragleave = function () { depth = Math.max(0, depth - 1); if (!depth) el.classList.remove('cq-dropping'); };
      el.ondrop = function (e) { e.preventDefault(); clear(); onDrop(e); };
    }
    function wireLanesDnD() {
      rootEl.querySelectorAll('[data-blk][draggable]').forEach(function (bk) {
        bk.ondragstart = function (e) { e.stopPropagation(); S.drag = { id: bk.dataset.blk, from: 'lane', source: bk.dataset.src || '' }; try { e.dataTransfer.setData('text/plain', bk.dataset.blk); } catch (x) {} };
        bk.ondragend = function () { S.drag = null; };
      });
      rootEl.querySelectorAll('.cq-tl-track').forEach(function (tr) {
        dropZone(tr, function (e) {
          var id = dragId(e), insp = tr.dataset.lane; S.drag = null; if (!id || !insp) return;
          var r = tr.getBoundingClientRect(), time = Core.hourToTime(Core.snapHour(r.width ? (e.clientX - r.left) / r.width : 0));
          api.scheduleAudit(id, { inspector: insp, date: S.boardDate, time: time, by: user.username }).then(function () {
            fireAssigned(insp, S.boardDate, 1); toast(id + ' → ' + insp + ' at ' + time); loadBoard();
          }).catch(function (err) { toast('Failed: ' + err.message); });
        });
      });
    }
    function wireBacklogDnD() {
      rootEl.querySelectorAll('[data-bl]').forEach(function (c) {
        c.ondragstart = function (e) { S.drag = { id: c.dataset.bl, from: 'backlog', source: '' }; try { e.dataTransfer.setData('text/plain', c.dataset.bl); } catch (x) {} };
        c.ondragend = function () { S.drag = null; };
      });
      var bl = $('#cqBacklog'); if (!bl) return;
      dropZone(bl, function (e) {
        var d = S.drag, id = dragId(e); S.drag = null;
        if (!id || (d && d.from === 'backlog')) return;                     // a queued card dropped back on the queue is a no-op
        var row = rowById(id);
        var isRe = (d && d.source === 'reinspection') || !!(row && row.source === 'reinspection');
        // Releasing a re-inspection is not the mirror image of scheduling it: qa.unassign_audits retires the visit
        // (soft-delete) and pushes the loop back to FOR RECTIFICATION. Make the head say yes to that.
        if (isRe && !confirm('This is a re-inspection visit. Releasing it retires the visit and returns the rectification to FOR RECTIFICATION. Continue?')) return;
        api.unassignAudits([id], { by: user.username }).then(function (n) {
          toast(n ? (isRe ? 'Re-inspection visit released' : id + ' returned to the queue') : 'Nothing unassigned (ticket already moved)'); loadBoard();
        }).catch(function (err) { toast('Failed: ' + err.message); });
      });
    }
    function drawMap(rows, names) {
      var el = $('#cqMap'); if (!el || !L) { if (el) el.innerHTML = '<div class="cq-empty">Map unavailable</div>'; return; }
      if (!S.map) { S.map = L.map(el, { zoomControl: true, attributionControl: false }).setView([14.68, 121.06], 12); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(S.map); }
      if (S.layer) S.map.removeLayer(S.layer); S.layer = L.layerGroup().addTo(S.map);
      var pts = [];
      rows.forEach(function (a) {
        var ll = null; if (a.lat != null && a.lng != null) ll = [a.lat, a.lng]; else if (a.sheet_latlong) { var m = /(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/.exec(a.sheet_latlong); if (m) ll = [parseFloat(m[1]), parseFloat(m[2])]; }
        if (!ll) return; pts.push(ll);
        L.circleMarker(ll, { radius: 8, weight: 2, color: COLORS[names.indexOf(a.assigned_to) % COLORS.length], fillColor: a.status === 'done' ? '#fff' : COLORS[names.indexOf(a.assigned_to) % COLORS.length], fillOpacity: .9 }).addTo(S.layer).bindPopup('<b>#' + (a.sequence || '') + ' ' + esc(a.subscriber || '') + '</b><br>' + esc(a.assigned_to) + ' · ' + esc(a.status));
      });
      if (pts.length) S.map.fitBounds(pts, { padding: [20, 20] });
      setTimeout(function () { S.map.invalidateSize(); }, 150);
    }

    // ---------------- stubs replaced in Tasks 10–11 ----------------
    // ---------------- RESULTS ----------------
    function renderResults() {
      var r = S.results;
      $('#cqBody').innerHTML = '<div class="cq-bar"><label>QA date from <input type="date" id="rf_from" value="' + esc(r.qfrom || addDays(today(), -6)) + '"></label><label>to <input type="date" id="rf_to" value="' + esc(r.qto || today()) + '"></label><select id="rf_contractor">' + contractorOpts() + '</select><select id="rf_insp"><option value="">All inspectors</option>' + inspectorOpts() + '</select><select id="rf_assess"><option value="">Any assessment</option>' + Core.ASSESS.map(function (a) { return '<option>' + a + '</option>'; }).join('') + '</select><select id="rf_district">' + districtOpts() + '</select><input id="rf_q" placeholder="Search"><button class="cq-btn ghost" id="rf_go">Filter</button></div><div id="cqRTable"></div><div class="cq-bar" style="justify-content:flex-end"><button class="cq-btn ghost" id="r_prev">‹ Prev</button><span id="r_page"></span><button class="cq-btn ghost" id="r_next">Next ›</button></div>';
      if (r.contractor) $('#rf_contractor').value = r.contractor; if (r.inspector) $('#rf_insp').value = r.inspector; if (r.assessment) $('#rf_assess').value = r.assessment; if (r.district) $('#rf_district').value = r.district;
      $('#rf_go').onclick = function () { S.results = { qfrom: $('#rf_from').value, qto: $('#rf_to').value, contractor: $('#rf_contractor').value, inspector: $('#rf_insp').value, assessment: $('#rf_assess').value, district: $('#rf_district').value, q: $('#rf_q').value, page: 1 }; loadResults(); };
      $('#r_prev').onclick = function () { if (S.results.page > 1) { S.results.page--; loadResults(); } };
      $('#r_next').onclick = function () { S.results.page++; loadResults(); };
      if (!r.qfrom) { S.results.qfrom = addDays(today(), -6); S.results.qto = today(); }
      loadResults();
    }
    function loadResults() {
      var r = S.results; $('#cqRTable').innerHTML = '<div class="cq-empty">Loading…</div>';
      api.listAudits({ status: ['done'], qfrom: r.qfrom, qto: r.qto, contractor: r.contractor, inspector: r.inspector, assessment: r.assessment, district: r.district, q: r.q, page: r.page, pageSize: 50 }).then(function (res) {
        $('#r_page').textContent = 'Page ' + r.page + ' · ' + res.total + ' rows';
        if (!res.rows.length) { $('#cqRTable').innerHTML = '<div class="cq-empty">No results in this range.</div>'; return; }
        $('#cqRTable').innerHTML = '<table><thead><tr><th>Audit</th><th>Subscriber</th><th>Contractor</th><th>Inspector</th><th>QA date</th><th>Visit</th><th>Assessment</th><th>Violations</th><th>Penalty</th><th></th></tr></thead><tbody>' + res.rows.map(function (a) {
          return '<tr><td><b>' + esc(a.id) + '</b><div class="cq-age">' + esc(a.jo_no || '') + (a.source === 'sheet_legacy' ? ' · legacy' : '') + (a.reopened_count ? ' · reopened ×' + a.reopened_count : '') + '</div></td><td><b>' + esc(a.subscriber || '') + '</b><div class="cq-age">' + esc(a.address || '') + '</div></td><td>' + esc(a.contractor_name || '') + '</td><td>' + esc(a.inspector || '') + '</td><td>' + fmtWhen(a.inspected_at) + '</td><td>' + esc(a.visit_status || '') + '</td><td>' + (a.assessment ? '<span class="cq-pill ' + (a.assessment === 'GOOD' ? 'done' : 'fail') + '">' + esc(a.assessment) + '</span>' : '') + '</td><td>' + a.total_violations + '</td><td>' + peso(a.total_penalty) + '</td><td><button class="cq-btn ghost" data-view="' + esc(a.id) + '" style="padding:3px 8px">Open</button></td></tr>';
        }).join('') + '</tbody></table>';
        rootEl.querySelectorAll('[data-view]').forEach(function (b) { b.onclick = function () { openDetail(b.dataset.view); }; });
      });
    }
    function openDetail(id) {
      modal('<div class="cq-empty">Loading ' + esc(id) + '…</div>');
      api.getAudit(id).then(function (r) {
        var a = r.audit;
        var byItem = {}; r.items.forEach(function (i) { byItem[i.item_id] = i; });
        var html = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div><h3 style="margin:0">' + esc(a.id) + ' · ' + esc(a.subscriber || '') + '</h3><div class="cq-age">' + esc(a.contractor_name || '') + ' · ' + pill(a.status) + ' · ' + esc(a.visit_status || '') + (a.assessment ? ' · <b>' + esc(a.assessment) + '</b>' : '') + (a.rectification_id ? ' · <a href="#" id="dt_rect">' + esc(a.rectification_id) + '</a>' : '') + (a.source === 'reinspection' ? ' · <span class="cq-pill queued">RE-INSPECTION' + (r.previous ? ' of ' + esc(r.previous.audit.id) : '') + '</span>' : '') + '</div></div><div style="display:flex;gap:6px"><button class="cq-btn ghost" id="dt_print">🖨 Print / PDF</button>' + (canEdit && a.status === 'done' && a.assigned_to ? '<button class="cq-btn warn" id="dt_reopen">Reopen</button>' : '') + '<button class="cq-btn ghost" id="dt_close">Close</button></div></div>' +
          '<div class="cq-sec">Header</div><div class="cq-grid"><div><b>Inspection date</b>' + fmtWhen(a.inspected_at) + '</div><div><b>Inspector</b>' + esc(a.inspector || '—') + '</div><div><b>Contractor\'s rep</b>' + esc(a.contractor_rep || '—') + '</div><div><b>Installer/s</b>' + esc(a.installers_text || '—') + '</div><div><b>Account no.</b>' + esc(a.acct_no || '—') + '</div><div><b>JO no.</b>' + esc(a.jo_no || '—') + '</div><div><b>Address</b>' + esc(a.address || '') + ' ' + esc(a.barangay || '') + '</div><div><b>NAP / Port / S/N</b>' + esc(a.nap_code || '—') + ' / ' + esc(a.port_no || '—') + ' / ' + esc(a.serial_no || '—') + '</div><div><b>GPS</b>' + (a.lat != null ? '<a href="https://www.google.com/maps/search/?api=1&query=' + a.lat + ',' + a.lng + '" target="_blank" rel="noopener">' + a.lat.toFixed(5) + ', ' + a.lng.toFixed(5) + '</a>' : '—') + '</div><div><b>Wire</b>' + esc(a.wire || '—') + '</div><div><b>QA / GC</b>' + esc(a.qa_gc || '—') + '</div><div><b>Commercial</b>' + (a.found_business ? 'YES' + ((a.old_plan || a.new_plan) ? ' · old ' + esc(a.old_plan || '—') + ' · new ' + esc(a.new_plan || '—') : '') : 'NO') + '</div></div>' +
          (r.previous ? '<div class="cq-sec">Previous inspection · ' + esc(r.previous.audit.id) + ' · ' + fmtWhen(r.previous.audit.inspected_at) + '</div><div class="cq-age">Failed: ' + S.cfg.checklist.filter(function (c) { return r.previous.items.some(function (i) { return i.item_id === c.id && i.result === 'fail'; }); }).map(function (c) { return esc(c.label); }).join(' · ') + '</div>' + (r.previous.violations.length ? violRows(r.previous.violations, false) : '') : '') +
          (r.items.length ? '<div class="cq-sec">Checklist</div><table><thead><tr><th>Item</th><th>Result</th><th>Remark</th><th>Photos</th></tr></thead><tbody>' + S.cfg.checklist.map(function (c) { var i = byItem[c.id] || {}; return '<tr><td>' + esc(c.label) + '<div class="cq-age">' + esc(c.section) + '</div></td><td>' + (i.result ? '<span class="cq-pill ' + (i.result === 'fail' ? 'fail' : i.result === 'pass' ? 'done' : '') + '">' + i.result.toUpperCase() + '</span>' : '—') + '</td><td>' + esc(i.remark || '') + '</td><td><div class="cq-thumbs" data-ph="' + c.id + '"></div></td></tr>'; }).join('') + '</tbody></table>' : '') +
          (r.violations.length ? '<div class="cq-sec">Violations</div>' + violRows(r.violations, canEdit && a.status === 'done') + '<div class="cq-age"><b>TOTAL VIOLATION FOUND: ' + a.total_violations + ' · TOTAL PENALTY ' + peso(a.total_penalty) + '</b></div>' : '') +
          '<div class="cq-sec">Remarks</div><div>' + esc(a.remarks || '—') + '</div><div class="cq-sec">Other photos</div><div class="cq-thumbs" data-ph="x"></div><div class="cq-sec">Signatures</div><div class="cq-thumbs"><div><div class="cq-age">Subscriber: ' + esc(a.subscriber_signed_name || '—') + '</div><img data-sig="' + esc(a.subscriber_signature_path || '') + '" alt="" style="background:#fff"></div><div><div class="cq-age">Inspector: ' + esc(a.inspector || '') + '</div><img data-sig="' + esc(a.inspector_signature_path || '') + '" alt="" style="background:#fff"></div></div>' +
          '<div class="cq-sec">Log</div><table><tbody>' + r.log.map(function (l) { return '<tr><td class="cq-age" style="white-space:nowrap">' + fmtWhen(l.at) + '</td><td><b>' + esc(l.action) + '</b> · ' + esc(l.by) + '</td><td class="cq-age">' + esc(l.detail ? JSON.stringify(l.detail) : '') + '</td></tr>'; }).join('') + '</tbody></table>';
        modal(html);
        $('#dt_close').onclick = closeModal;
        var urls = {};
        var fill = function (path, sel) { if (!path) return; api.photoUrl(path).then(function (u) { urls[path] = u; rootEl.querySelectorAll(sel).forEach(function (img) { img.src = u; }); }); };
        r.photos.forEach(function (p) { var box = rootEl.querySelector('[data-ph="' + (p.item_id || 'x') + '"]'); if (!box) return; var img = document.createElement('img'); img.alt = p.label || ''; img.title = p.label || ''; box.appendChild(img); api.photoUrl(p.path).then(function (u) { urls[p.path] = u; img.src = u; img.onclick = function () { window.open(u, '_blank', 'noopener'); }; }); });
        fill(a.subscriber_signature_path, '[data-sig="' + a.subscriber_signature_path + '"]'); fill(a.inspector_signature_path, '[data-sig="' + a.inspector_signature_path + '"]');
        $('#dt_print').onclick = function () { printForm(r, urls); };
        var re = $('#dt_reopen'); if (re) re.onclick = function () { var why = prompt('Reason for reopening ' + a.id + ' (the inspector will be able to edit and resubmit):'); if (why == null) return; api.reopenAudit(a.id, { by: user.username, reason: why }).then(function () { toast(a.id + ' reopened'); closeModal(); render(); }).catch(function (e) { toast('Failed: ' + e.message); }); };
        wireOverride(rootEl, function () { openDetail(id); });
        var rl = $('#dt_rect'); if (rl) rl.onclick = function (e) { e.preventDefault(); openRect(a.rectification_id); };
      }).catch(function (e) { modal('<div class="cq-empty">Could not load: ' + esc(e.message) + '</div><button class="cq-btn ghost" onclick="this.parentNode.parentNode.innerHTML=\'\'">Close</button>'); });
    }
    // Paper-form replica (QUALITY ASSURANCE INSPECTION FORM) → new window → print/PDF.
    function printForm(r, urls) {
      var a = r.audit, byItem = {}; r.items.forEach(function (i) { byItem[i.item_id] = i; });
      var sec = function (name) { return '<tr class="sec"><td colspan="3">' + esc(name) + '</td></tr>'; };
      var items = [sec('Outside Segment of Installation')].concat(S.cfg.checklist.filter(function (c) { return c.section === 'OUTSIDE'; }).map(function (c) { var i = byItem[c.id] || {}; return '<tr><td>• ' + esc(c.label) + '</td><td class="c">' + (i.result === 'pass' ? '✔' : i.result === 'na' ? 'N/A' : '') + '</td><td class="c">' + (i.result === 'fail' ? '✘ ' + esc(i.remark || '') : '') + '</td></tr>'; }))
        .concat([sec('Client Premise Segment of Installation')]).concat(S.cfg.checklist.filter(function (c) { return c.section === 'PREMISE'; }).map(function (c) { var i = byItem[c.id] || {}; return '<tr><td>• ' + esc(c.label) + '</td><td class="c">' + (i.result === 'pass' ? '✔' : i.result === 'na' ? 'N/A' : '') + '</td><td class="c">' + (i.result === 'fail' ? '✘ ' + esc(i.remark || '') : '') + '</td></tr>'; })).join('');
      var viol = r.violations.map(function (v) { return '<tr><td>' + esc(v.code) + '</td><td>' + esc(v.category || '') + '</td><td>' + esc(v.description || '') + '</td><td>' + esc(v.class || '') + '</td><td>' + esc(v.severity || '') + '</td><td>' + (v.offense_no || '') + '</td><td>' + peso(Core.effectivePenalty(v)) + '</td></tr>'; }).join('') + Array(Math.max(0, 5 - r.violations.length) + 1).join('<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>');
      var photos = r.photos.map(function (p) { return urls[p.path] ? '<div class="ph"><img src="' + esc(urls[p.path]) + '"><div>' + esc(p.label || '') + '</div></div>' : ''; }).join('');
      var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(a.id) + ' QA Inspection Form</title><style>body{font:12px Arial,sans-serif;color:#000;margin:18px}h1{background:#1d9e3f;color:#fff;font-size:14px;text-align:center;padding:5px;margin:0 0 6px}table{width:100%;border-collapse:collapse;margin-bottom:8px}td,th{border:1px solid #000;padding:4px 6px;font-size:11px;vertical-align:top}td.k{width:170px;background:#f3f3f3}tr.sec td{background:#c9e8cf;font-weight:bold}th{background:#1d9e3f;color:#fff}td.c{width:120px;text-align:center}.cert{margin:10px 0;font-size:11px}.sig{display:flex;justify-content:space-between;margin-top:18px}.sig div{width:45%}.sig img{height:60px;display:block}.ph{display:inline-block;width:23%;margin:1%;font-size:9px;text-align:center}.ph img{width:100%;height:120px;object-fit:cover;border:1px solid #999}@media print{.no{display:none}}</style></head><body>' +
        '<div class="no" style="text-align:right;margin-bottom:6px"><button onclick="window.print()">Print / Save as PDF</button></div><h1>QUALITY ASSURANCE INSPECTION FORM</h1>' +
        '<table><tr><td class="k">Inspection/Ticket no.</td><td>' + esc(a.id) + '</td><td class="k">Client\'s Name:</td><td>' + esc(a.subscriber || '') + '</td></tr><tr><td class="k">Inspection Date:</td><td>' + fmtWhen(a.inspected_at) + '</td><td class="k">Client\'s Account No.:</td><td>' + esc(a.acct_no || '') + '</td></tr><tr><td class="k">Inspector\'s Name:</td><td>' + esc(a.inspector || '') + '</td><td class="k">Address:</td><td>' + esc((a.address || '') + ' ' + (a.barangay || '')) + '</td></tr><tr><td class="k">Contractor\'s Representative:</td><td>' + esc(a.contractor_rep || '') + '</td><td class="k">JO / NAP / Port</td><td>' + esc((a.jo_no || '') + ' / ' + (a.nap_code || '') + ' / ' + (a.port_no || '')) + '</td></tr><tr><td class="k">Installer/s:</td><td>' + esc(a.installers_text || '') + '</td><td class="k">Visit / Wire / QA-GC</td><td>' + esc((a.visit_status || '') + ' / ' + (a.wire || '') + ' / ' + (a.qa_gc || '')) + '</td></tr><tr><td class="k">Contractor/ Dept:</td><td>' + esc(a.contractor_name || '') + '</td><td class="k">Assessment</td><td><b>' + esc(a.assessment || '') + '</b></td></tr></table>' +
        '<table><tr><th style="text-align:left">DESCRIPTION</th><th>PASSED</th><th>FAILED</th></tr>' + items + '</table>' +
        '<table><tr><th>CODE</th><th>CATEGORY</th><th>DESCRIPTION</th><th>CLASS</th><th>SEVERITY</th><th>NO. OF OFFENSE</th><th>PENALTY</th></tr>' + viol + '<tr><td colspan="6"><b>TOTAL VIOLATION FOUND:</b> ' + a.total_violations + '</td><td></td></tr><tr><td colspan="6"><b>TOTAL PENALTY:</b></td><td><b>' + peso(a.total_penalty) + '</b></td></tr></table>' +
        '<table><tr class="sec"><td colspan="5">COMMERCIAL</td></tr><tr><td class="c">' + (a.found_business ? '☑' : '☐') + ' YES &nbsp; ' + (!a.found_business ? '☑' : '☐') + ' NO</td><td class="k">OLD PLAN:</td><td>' + esc(a.old_plan || '') + '</td><td class="k">NEW PLAN:</td><td>' + esc(a.new_plan || '') + '</td></tr></table>' +
        '<div class="cert">I, <u>&nbsp;' + esc(a.subscriber_signed_name || '') + '&nbsp;</u> the client, understands that there is a non-compliance regarding my subscription and that I need to change and/or upgrade from residential plan to business plan.</div><div class="cert">I, the inspector, hereby certify that the inspection has been performed in a fair, professional, and honest way, and that I have not asked, nor received any favour, compensation or gifts from anyone.</div>' +
        '<div class="sig"><div><b>Subscriber\'s Name:</b> ' + esc(a.subscriber_signed_name || '') + '<br><b>Signature:</b>' + (urls[a.subscriber_signature_path] ? '<img src="' + esc(urls[a.subscriber_signature_path]) + '">' : '<br><br>') + '</div><div><b>Name of Inspector:</b> ' + esc(a.inspector || '') + '<br><b>Signature:</b>' + (urls[a.inspector_signature_path] ? '<img src="' + esc(urls[a.inspector_signature_path]) + '">' : '<br><br>') + '</div></div>' +
        (a.remarks ? '<div class="cert"><b>Remarks:</b> ' + esc(a.remarks) + '</div>' : '') + (photos ? '<div style="page-break-before:always"><h1>PHOTOS · ' + esc(a.id) + '</h1>' + photos + '</div>' : '') + '</body></html>';
      var w = window.open('', '_blank'); if (!w) { toast('Pop-up blocked — allow pop-ups to print'); return; } w.document.write(html); w.document.close();
    }
    // ---------------- RECTIFICATIONS (phase C) ----------------
    function renderRect() {
      var f = S.rect;
      $('#cqBody').innerHTML = '<div class="cq-stats" id="cqRStats"></div><div class="cq-bar">' +
        '<select id="rc_status"><option value="FOR RECTIFICATION,FOR RE-INSPECTION">Open (both)</option><option value="FOR RECTIFICATION">FOR RECTIFICATION</option><option value="FOR RE-INSPECTION">FOR RE-INSPECTION</option><option value="RECTIFIED">RECTIFIED</option><option value="CLOSED">CLOSED</option><option value="">All</option></select>' +
        '<select id="rc_contractor">' + contractorOpts() + '</select><select id="rc_district">' + districtOpts() + '</select><label><input type="checkbox" id="rc_over"> Overdue only</label><input id="rc_q" placeholder="Search RC / JO / acct / name" style="min-width:220px"><button class="cq-btn ghost" id="rc_go">Filter</button></div>' +
        '<div id="cqRcTable"></div><div class="cq-bar" style="justify-content:flex-end"><button class="cq-btn ghost" id="rc_prev">‹ Prev</button><span id="rc_page"></span><button class="cq-btn ghost" id="rc_next">Next ›</button></div>';
      $('#rc_status').value = (f.status || []).join(','); if (f.contractor) $('#rc_contractor').value = f.contractor; if (f.district) $('#rc_district').value = f.district; $('#rc_over').checked = !!f.overdue; if (f.q) $('#rc_q').value = f.q;
      $('#rc_go').onclick = function () { S.rect = { status: $('#rc_status').value ? $('#rc_status').value.split(',') : [], contractor: $('#rc_contractor').value, district: $('#rc_district').value, overdue: $('#rc_over').checked, q: $('#rc_q').value, page: 1 }; loadRect(); };
      $('#rc_q').onkeydown = function (e) { if (e.key === 'Enter') $('#rc_go').click(); };
      $('#rc_prev').onclick = function () { if (S.rect.page > 1) { S.rect.page--; loadRect(); } };
      $('#rc_next').onclick = function () { S.rect.page++; loadRect(); };
      loadRect(); loadRectStats();
    }
    function loadRectStats() {
      var m = today().slice(0, 7);
      Promise.all([api.listRectifications({ status: Core.RECT_OPEN, pageSize: 1 }), api.listRectifications({ overdue: true, pageSize: 1 }), api.listRectifications({ status: ['FOR RE-INSPECTION'], pageSize: 1 }), api.listRectifications({ status: ['RECTIFIED'], pageSize: 1000 })]).then(function (r) {
        var el = $('#cqRStats'); if (!el) return;
        // Manila month, and an EXACT match: comparing the raw UTC timestamp with `>= <month>-01` both mis-bucketed
        // the Manila evening of the 1st and counted every later month as "this month".
        var thisMonth = r[3].rows.filter(function (x) { return x.rectified_at && mnlDay(x.rectified_at).slice(0, 7) === m; }).length;
        el.innerHTML = '<div class="cq-stat' + (r[0].total ? ' warn' : '') + '"><span>Open loops</span><strong>' + r[0].total + '</strong></div><div class="cq-stat' + (r[1].total ? ' warn' : '') + '"><span>Overdue</span><strong>' + r[1].total + '</strong></div><div class="cq-stat"><span>Awaiting re-inspection</span><strong>' + r[2].total + '</strong></div><div class="cq-stat"><span>Rectified this month</span><strong>' + thisMonth + '</strong></div>';
      }).catch(function (e) { var el = $('#cqRStats'); if (el) el.innerHTML = esc(e.message); });
    }
    function loadRect() {
      var f = S.rect; $('#cqRcTable').innerHTML = '<div class="cq-empty">Loading…</div>';
      api.listRectifications({ status: f.status, contractor: f.contractor, district: f.district, overdue: f.overdue, q: f.q, page: f.page, pageSize: 50 }).then(function (r) {
        var tbl = $('#cqRcTable'), pg = $('#rc_page'); if (!tbl || !pg) return;
        pg.textContent = 'Page ' + f.page + ' · ' + r.total + ' rows';
        if (!r.rows.length) { tbl.innerHTML = '<div class="cq-empty">No rectifications match.</div>'; return; }
        tbl.innerHTML = '<table><thead><tr><th>Rectification</th><th>Subscriber</th><th>Contractor</th><th>Cycle</th><th>Deadline</th><th>Status</th><th>Opened</th><th></th></tr></thead><tbody>' + r.rows.map(function (x) {
          return '<tr><td><b>' + esc(x.id) + '</b><div class="cq-age">' + esc(x.jo_no || '') + ' · ' + esc(x.acct_no || '') + '</div></td><td><b>' + esc(x.subscriber || '') + '</b><div class="cq-age">' + esc(x.address || '') + ' ' + esc(x.barangay || '') + '</div></td><td>' + esc(x.contractor_name || '') + '</td><td>' + x.cycle + '</td><td class="' + (x.overdue ? 'cq-over' : '') + '">' + esc(x.deadline || '—') + (x.overdue ? ' · overdue' : '') + '</td><td>' + rpill(x.status) + '</td><td class="cq-age">' + fmtWhen(x.opened_at) + '</td>' +
            '<td style="white-space:nowrap"><button class="cq-btn ghost" data-rview="' + esc(x.id) + '" style="padding:3px 8px">View</button>' + (canEdit && Core.RECT_OPEN.indexOf(x.status) >= 0 ? ' <button class="cq-btn" data-rre="' + esc(x.id) + '" style="padding:3px 8px">' + (x.status === 'FOR RE-INSPECTION' ? 'Re-assign' : 'Assign re-inspection') + '</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table>';
        rootEl.querySelectorAll('[data-rview]').forEach(function (b) { b.onclick = function () { openRect(b.dataset.rview); }; });
        rootEl.querySelectorAll('[data-rre]').forEach(function (b) { b.onclick = function () { var x = r.rows.filter(function (y) { return y.id === b.dataset.rre; })[0]; reinspectDialog(x); }; });
      }).catch(function (e) { var tbl = $('#cqRcTable'); if (!tbl) return; tbl.innerHTML = '<div class="cq-empty">' + esc(e.message) + '</div>'; });
    }
    function violRows(vs, allowOverride) {
      return '<table><thead><tr><th>Code</th><th>Category</th><th>Description</th><th>Severity</th><th>Offense</th><th>Penalty</th>' + (allowOverride ? '<th></th>' : '') + '</tr></thead><tbody>' + vs.map(function (v) {
        var eff = Core.effectivePenalty(v), ov = v.penalty_override != null;
        return '<tr><td><b>' + esc(v.code) + '</b></td><td>' + esc(v.category || '') + '</td><td>' + esc(v.description || '') + (v.remark ? '<div class="cq-age">' + esc(v.remark) + '</div>' : '') + '</td><td>' + esc(v.severity || '') + '</td><td>' + (v.offense_no || '—') + (v.offense_no >= 2 ? ' <span class="cq-pill fail">repeat</span>' : '') + '</td><td>' + peso(eff) + (ov ? '<div class="cq-ovr">override (catalog ' + peso(v.penalty_amount) + ') · ' + esc(v.override_reason || '') + '</div>' : '') + '</td>' +
          (allowOverride ? '<td><button class="cq-btn ghost" data-ovr="' + esc(v.id) + '" style="padding:3px 8px">' + (ov ? 'Change' : 'Override') + '</button></td>' : '') + '</tr>';
      }).join('') + '</tbody></table>';
    }
    function wireOverride(scope, after) {
      scope.querySelectorAll('[data-ovr]').forEach(function (b) { b.onclick = function () {
        var amt = prompt('Override penalty amount (₱). Leave blank to restore the catalog amount:'); if (amt == null) return;
        var n = amt.trim() === '' ? null : Number(amt.replace(/[₱,\s]/g, ''));
        if (n !== null && !(isFinite(n) && n >= 0)) { toast('Enter a valid amount (numbers only) or leave blank to restore the catalog amount'); return; }
        var why = prompt('Reason for the override (required):'); if (!why || !why.trim()) { toast('Reason required'); return; }
        api.overridePenalty(Number(b.dataset.ovr), n, why.trim()).then(function () { toast('Penalty updated'); after(); }).catch(function (e) { toast('Failed: ' + e.message); });
      }; });
    }
    function openRect(id) {
      modal('<div class="cq-empty">Loading ' + esc(id) + '…</div>');
      api.getRectification(id).then(function (r) {
        var x = r.rect, open = Core.RECT_OPEN.indexOf(x.status) >= 0;
        var html = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div><h3 style="margin:0">' + esc(x.id) + ' · ' + esc(x.subscriber || '') + '</h3><div class="cq-age">' + esc(x.contractor_name || '') + ' · ' + rpill(x.status) + ' · cycle ' + x.cycle + ' · deadline <span class="' + (x.overdue ? 'cq-over' : '') + '">' + esc(x.deadline || '—') + '</span>' + (x.closed_at ? ' · closed by ' + esc(x.closed_by) + ': ' + esc(x.close_reason || '') : '') + (x.rectified_at ? ' · rectified ' + fmtWhen(x.rectified_at) : '') + '</div></div>' +
          '<div style="display:flex;gap:6px">' + (canEdit && open ? '<button class="cq-btn" id="rd_re">' + (x.status === 'FOR RE-INSPECTION' ? 'Re-assign re-inspection' : 'Assign re-inspection') + '</button><button class="cq-btn ghost" id="rd_dl">Set deadline</button><button class="cq-btn warn" id="rd_close">Close (no re-inspection)</button>' : '') + '<button class="cq-btn ghost" id="rd_x">Close window</button></div></div>';
        r.audits.forEach(function (b, i) {
          var a = b.audit, byItem = {}; b.items.forEach(function (it) { byItem[it.item_id] = it; });
          var fails = S.cfg.checklist.filter(function (c) { return (byItem[c.id] || {}).result === 'fail'; });
          html += '<div class="cq-sec">' + (i === 0 ? 'Original inspection' : 'Re-inspection ' + i) + (a.deleted_at ? ' · <span class="cq-pill fail">retired (replaced/released)</span>' : '') + ' · ' + esc(a.id) + ' · ' + fmtWhen(a.inspected_at) + ' · ' + esc(a.inspector || a.assigned_to || '') + ' · ' + esc(a.visit_status || a.status) + (a.assessment ? ' · <b>' + esc(a.assessment) + '</b>' : '') + ' <a href="#" data-aview="' + esc(a.id) + '">open form</a></div>' +
            (a.status !== 'done' ? '<div class="cq-age">Scheduled ' + esc(a.scheduled_date || '—') + ' · ' + pill(a.status) + '</div>' : fails.length ? '<div class="cq-age">Failed: ' + fails.map(function (c) { return esc(c.label) + ((byItem[c.id] || {}).remark ? ' (' + esc(byItem[c.id].remark) + ')' : ''); }).join(' · ') + '</div>' : '<div class="cq-age">No failed items.</div>') +
            (b.violations.length ? violRows(b.violations, canEdit) : '') + '<div class="cq-thumbs" data-rph="' + esc(a.id) + '"></div>';
        });
        modal(html);
        $('#rd_x').onclick = closeModal;
        rootEl.querySelectorAll('[data-aview]').forEach(function (l) { l.onclick = function (e) { e.preventDefault(); openDetail(l.dataset.aview); }; });
        r.audits.forEach(function (b) { var box = rootEl.querySelector('[data-rph="' + b.audit.id + '"]'); if (!box) return; b.photos.filter(function (p) { return b.items.some(function (it) { return it.item_id === p.item_id && it.result === 'fail'; }); }).forEach(function (p) { var img = document.createElement('img'); img.alt = p.label || ''; img.title = p.label || ''; box.appendChild(img); api.photoUrl(p.path).then(function (u) { img.src = u; img.onclick = function () { window.open(u, '_blank', 'noopener'); }; }); }); });
        wireOverride(rootEl, function () { openRect(id); });
        var re = $('#rd_re'); if (re) re.onclick = function () { reinspectDialog(x); };
        var dl = $('#rd_dl'); if (dl) dl.onclick = function () { deadlineDialog(x); };
        var cl = $('#rd_close'); if (cl) cl.onclick = function () { closeRectDialog(x); };
      }).catch(function (e) { modal('<div class="cq-empty">Could not load: ' + esc(e.message) + '</div><button class="cq-btn ghost" onclick="this.parentNode.parentNode.innerHTML=\'\'">Close</button>'); });
    }
    function afterRect(msg) { toast(msg); closeModal(); if (S.tab === 'rect') { loadRect(); loadRectStats(); } else render(); }
    function reinspectDialog(x) {
      modal('<h3 style="margin:0 0 10px">Re-inspection for ' + esc(x.id) + ' · ' + esc(x.subscriber || '') + '</h3><div class="cq-age" style="margin-bottom:8px">Cycle ' + x.cycle + ' · deadline ' + esc(x.deadline) + '. A new audit (source = reinspection) is created for the inspector; the previous findings are shown to them on the phone.' + (x.status === 'FOR RE-INSPECTION' ? ' The pending re-inspection visit will be replaced.' : '') + '</div>' +
        '<div class="cq-bar"><label>Inspector <select id="ri_insp">' + inspectorOpts() + '</select></label><label>Date <input type="date" id="ri_date" value="' + today() + '"></label><label>Sequence # <input type="number" id="ri_seq" value="1" min="1" style="width:70px"></label></div><div class="cq-bar" style="justify-content:flex-end"><button class="cq-btn ghost" id="ri_cancel">Cancel</button><button class="cq-btn" id="ri_ok">Assign</button></div>');
      $('#ri_cancel').onclick = closeModal;
      $('#ri_ok').onclick = function () { var insp = $('#ri_insp').value, date = $('#ri_date').value, seq = Number($('#ri_seq').value || 1); if (!insp || !date) { toast('Pick an inspector and a date'); return; }
        api.assignReinspection(x.id, { inspector: insp, date: date, startSeq: seq, by: user.username }).then(function (a) { fireAssigned(insp, date, 1); afterRect('Re-inspection ' + a.id + ' assigned to ' + insp); }).catch(function (e) { toast('Failed: ' + e.message); }); };
    }
    function deadlineDialog(x) {
      modal('<h3 style="margin:0 0 10px">Deadline for ' + esc(x.id) + '</h3><div class="cq-bar"><label>New deadline <input type="date" id="dl_date" value="' + esc(x.deadline || '') + '"></label><label>Reason <input id="dl_why" placeholder="e.g. materials on order" style="min-width:240px"></label></div><div class="cq-bar" style="justify-content:flex-end"><button class="cq-btn ghost" id="dl_cancel">Cancel</button><button class="cq-btn" id="dl_ok">Save</button></div>');
      $('#dl_cancel').onclick = closeModal;
      $('#dl_ok').onclick = function () { var d = $('#dl_date').value; if (!d) return; api.setRectDeadline(x.id, d, $('#dl_why').value, { by: user.username }).then(function () { afterRect('Deadline set to ' + d); }).catch(function (e) { toast('Failed: ' + e.message); }); };
    }
    function closeRectDialog(x) {
      var why = prompt('Close ' + x.id + ' WITHOUT a GOOD re-inspection? This is recorded as CLOSED BY HEAD. Reason (required):'); if (why == null) return;
      if (!why.trim()) { toast('Reason required'); return; }
      api.closeRectification(x.id, why.trim(), { by: user.username }).then(function () { afterRect(x.id + ' closed'); }).catch(function (e) { toast('Failed: ' + e.message); });
    }
    // ---------------- REPORTS ----------------
    function dl(name, text, mime) { var b = new Blob([text], { type: mime || 'text/csv' }); var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); }
    function exportRows(name, rows) {
      if (!rows.length) { toast('Nothing to export'); return; }
      var cols = Object.keys(rows[0]);
      var toXlsx = deps.ensureXLSX ? deps.ensureXLSX().then(function () { var ws = root.XLSX.utils.json_to_sheet(rows); var wb = root.XLSX.utils.book_new(); root.XLSX.utils.book_append_sheet(wb, ws, 'QA'); root.XLSX.writeFile(wb, name + '.xlsx'); }) : Promise.reject();
      toXlsx.catch(function () { dl(name + '.csv', cols.join(',') + '\n' + rows.map(function (r) { return cols.map(function (c) { return '"' + String(r[c] == null ? '' : r[c]).replace(/"/g, '""') + '"'; }).join(','); }).join('\n')); });
    }
    function renderReports() {
      var rp = S.report;
      $('#cqBody').innerHTML = '<div class="cq-bar"><b>Daily</b><label>Date <input type="date" id="rp_day" value="' + today() + '"></label><button class="cq-btn ghost" id="rp_dayShow">Show</button><button class="cq-btn ghost" id="rp_dayX">Export day</button><button class="cq-btn ghost" id="rp_dayPrint">Print all forms</button></div><div id="rp_dayT"></div>' +
        '<div class="cq-bar" style="margin-top:16px"><b>Weekly review</b><label>From <input type="date" id="rp_from" value="' + esc(rp.from) + '"></label><label>to <input type="date" id="rp_to" value="' + esc(rp.to) + '"></label><button class="cq-btn ghost" id="rp_prevW">‹ week</button><button class="cq-btn ghost" id="rp_nextW">week ›</button><button class="cq-btn" id="rp_run">Run</button><button class="cq-btn ghost" id="rp_x">Export (SUMMARY PER CON)</button></div><div id="rp_week"></div>' +
        '<div class="cq-bar" style="margin-top:16px"><b>Monthly scorecard</b><label>Month <input type="month" id="sc_month" value="' + today().slice(0, 7) + '"></label><button class="cq-btn" id="sc_run">Run</button><button class="cq-btn ghost" id="sc_x">Export Excel (3 sheets)</button><button class="cq-btn ghost" id="sc_pdf">PDF per contractor</button></div><div id="sc_out"></div>';
      $('#rp_dayShow').onclick = loadDay; $('#rp_dayX').onclick = function () { dayRows().then(function (rows) { exportRows('QA-daily-' + $('#rp_day').value, rows); }); };
      $('#rp_dayPrint').onclick = function () { api.listAudits({ status: ['done'], qfrom: $('#rp_day').value, qto: $('#rp_day').value, pageSize: 1000 }).then(function (r) { if (!r.rows.length) { toast('No inspections that day'); return; } if (!confirm('Open ' + r.rows.length + ' print window(s)?')) return; r.rows.forEach(function (a) { api.getAudit(a.id).then(function (b) { var urls = {}; Promise.all(b.photos.map(function (p) { return api.photoUrl(p.path).then(function (u) { urls[p.path] = u; }); }).concat([a.subscriber_signature_path, a.inspector_signature_path].filter(Boolean).map(function (p) { return api.photoUrl(p).then(function (u) { urls[p] = u; }); }))).then(function () { printForm(b, urls); }); }); }); }); };
      $('#rp_prevW').onclick = function () { S.report = { from: addDays(S.report.from, -7), to: addDays(S.report.to, -7) }; renderReports(); };
      $('#rp_nextW').onclick = function () { S.report = { from: addDays(S.report.from, 7), to: addDays(S.report.to, 7) }; renderReports(); };
      $('#rp_run').onclick = function () { S.report = { from: $('#rp_from').value, to: $('#rp_to').value }; loadWeek(); };
      $('#rp_x').onclick = function () { api.weeklyReport(S.report.from, S.report.to).then(function (w) { exportRows('QA-weekly-' + S.report.from + '_' + S.report.to, w.contractors.map(function (c) { return { COMP: c.contractor, INSPECTED: c.inspected, GOOD: c.GOOD, 'FOR RECTIFY': c['FOR RECTIFY'], 'FOR PENALTY': c['FOR PENALTY'], CLAWBACK: c.CLAWBACK, NPA: c.npa, PENALTY: c.penalty, CLOSED: c.closed, 'COVERAGE %': c.closed ? Math.round(c.inspected * 100 / c.closed) : '' }; })); }); };
      $('#sc_run').onclick = loadScorecard;
      $('#sc_x').onclick = function () { scorecardBook().then(function (b) { exportBook('QA-scorecard-' + $('#sc_month').value, b); }).catch(function (e) { toast('Export failed: ' + e.message); }); };
      $('#sc_pdf').onclick = function () { var m = $('#sc_month').value + '-01'; api.monthlyScorecard(m).then(function (rows) { if (!rows.length) { toast('No data'); return; } if (!confirm('Open ' + rows.length + ' print window(s)?')) return; rows.forEach(function (r) { printScorecard(r, m); }); }); };
      loadDay(); loadWeek(); loadScorecard();
    }
    function dayRows() { var d = $('#rp_day').value; return api.listAudits({ status: ['done'], qfrom: d, qto: d, pageSize: 1000 }).then(function (r) { return r.rows.map(function (a) { return { AUDIT: a.id, DATE_QA: a.inspected_at ? a.inspected_at.slice(0, 10) : '', INSPECTOR: a.inspector, COMP: a.contractor_name, JONO: a.jo_no, ACCTNO: a.acct_no, SUBSCRIBER: a.subscriber, ADDRESS: a.address, BARANGAY: a.barangay, NAP: a.nap_code, PORT: a.port_no, VISITED: a.visit_status, WIRE: a.wire, 'QA / GC': a.qa_gc, ASSESSMENT: a.assessment, VIOLATIONS: a.total_violations, PENALTY: a.total_penalty, REMARKS: a.remarks, LATLONG: a.lat != null ? a.lat + ', ' + a.lng : a.sheet_latlong, 'CONTRACTOR REP': a.contractor_rep, INSTALLERS: a.installers_text, COMMERCIAL: a.found_business ? 'YES' : 'NO', 'OLD PLAN': a.old_plan, 'NEW PLAN': a.new_plan }; }); }); }
    function loadDay() { $('#rp_dayT').innerHTML = '<div class="cq-empty">Loading…</div>'; dayRows().then(function (rows) { $('#rp_dayT').innerHTML = rows.length ? '<table><thead><tr>' + ['AUDIT', 'INSPECTOR', 'COMP', 'SUBSCRIBER', 'BARANGAY', 'VISITED', 'ASSESSMENT', 'VIOLATIONS', 'PENALTY'].map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr><td><a href="#" data-view="' + esc(r.AUDIT) + '">' + esc(r.AUDIT) + '</a></td><td>' + esc(r.INSPECTOR) + '</td><td>' + esc(r.COMP) + '</td><td>' + esc(r.SUBSCRIBER) + '</td><td>' + esc(r.BARANGAY) + '</td><td>' + esc(r.VISITED) + '</td><td>' + esc(r.ASSESSMENT) + '</td><td>' + r.VIOLATIONS + '</td><td>' + peso(r.PENALTY) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="cq-empty">No inspections on that day.</div>'; rootEl.querySelectorAll('#rp_dayT [data-view]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); openDetail(a.dataset.view); }; }); }); }
    function loadWeek() {
      $('#rp_week').innerHTML = '<div class="cq-empty">Loading…</div>';
      api.weeklyReport(S.report.from, S.report.to).then(function (w) {
        var tbl = function (title, heads, rows) { return '<div class="cq-sec">' + title + '</div>' + (rows.length ? '<table><thead><tr>' + heads.map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>' : '<div class="cq-empty">No data</div>'); };
        $('#rp_week').innerHTML = tbl('Per contractor (' + esc(S.report.from) + ' → ' + esc(S.report.to) + ')', ['Contractor', 'Closed', 'Inspected', 'Coverage', 'GOOD', 'FOR RECTIFY', 'FOR PENALTY', 'CLAWBACK', 'NPA/other', 'Penalty'], w.contractors.map(function (c) { var pct = c.closed ? Math.round(c.inspected * 100 / c.closed) : null; return '<tr><td><b>' + esc(c.contractor) + '</b></td><td>' + c.closed + '</td><td>' + c.inspected + '</td><td>' + (pct == null ? '—' : '<span class="cq-pill ' + (pct >= 100 ? 'done' : pct >= 50 ? 'queued' : 'fail') + '">' + pct + '%</span>') + '</td><td>' + c.GOOD + '</td><td>' + c['FOR RECTIFY'] + '</td><td>' + c['FOR PENALTY'] + '</td><td>' + c.CLAWBACK + '</td><td>' + c.npa + '</td><td>' + peso(c.penalty) + '</td></tr>'; })) +
          tbl('Checklist pass rate', ['Item', 'Pass', 'Fail', 'N/A', 'Pass rate'], w.items.map(function (i) { return '<tr><td>' + esc(i.label) + '</td><td>' + i.pass + '</td><td>' + i.fail + '</td><td>' + i.na + '</td><td>' + (i.pass_rate == null ? '—' : '<span class="cq-pill ' + (i.pass_rate >= 90 ? 'done' : i.pass_rate >= 70 ? 'queued' : 'fail') + '">' + i.pass_rate + '%</span>') + '</td></tr>'; })) +
          tbl('Top violations', ['Code', 'Category', 'Count'], w.codes.map(function (c) { return '<tr><td><b>' + esc(c.code) + '</b></td><td>' + esc(c.category || '') + '</td><td>' + c.count + '</td></tr>'; })) +
          tbl('Inspectors', ['Inspector', 'Inspections', 'NPA/other'], w.inspectors.map(function (i) { return '<tr><td>' + esc(i.inspector) + '</td><td>' + i.inspections + '</td><td>' + i.npa + '</td></tr>'; }));
      }).catch(function (e) { $('#rp_week').innerHTML = '<div class="cq-empty">' + esc(e.message) + '</div>'; });
    }
    function trendTag(cur, prev, goodWhen) {   // goodWhen: 'up' | 'down'
      var t = Core.trend(cur, prev); if (t.dir == null) return '';
      var good = t.dir === 'flat' ? null : (t.dir === goodWhen);
      return ' <span class="cq-pill ' + (good == null ? '' : good ? 'done' : 'fail') + '" title="vs previous month">' + (t.dir === 'up' ? '▲' : t.dir === 'down' ? '▼' : '=') + (t.delta > 0 ? '+' : '') + t.delta + '</span>';
    }
    function scRows(rows) { return rows.map(function (r) { var p = 0, f = 0; Object.keys(r.items || {}).forEach(function (k) { p += r.items[k].pass; f += r.items[k].fail; }); return Object.assign({ pass: p, fail: f, pass_rate: Core.passRate(p, f), prev_pass_rate: Core.passRate(r.prev_pass, r.prev_fail), coverage: r.closed ? Math.round(r.inspected * 100 / r.closed) : null }, r); }); }
    function loadScorecard() {
      var m = $('#sc_month').value + '-01'; $('#sc_out').innerHTML = '<div class="cq-empty">Loading…</div>';
      api.monthlyScorecard(m).then(function (raw) {
        var rows = scRows(raw); if (!rows.length) { $('#sc_out').innerHTML = '<div class="cq-empty">No data for that month.</div>'; return; }
        $('#sc_out').innerHTML = '<table><thead><tr><th>Contractor</th><th>Closed</th><th>Inspected</th><th>Coverage</th><th>Pass rate</th><th>GOOD</th><th>RECTIFY</th><th>PENALTY</th><th>CLAWBACK</th><th>NPA</th><th>Violations (min/maj/crit)</th><th>Repeat</th><th>Top codes</th><th>Penalty</th><th>Rect opened</th><th>On time</th><th>Late</th><th>Closed by head</th><th>Open at month end</th><th>Overdue</th><th>Avg days</th><th></th></tr></thead><tbody>' + rows.map(function (r) {
          return '<tr' + (r.kind === 'inhouse' ? ' style="background:#f4f7f5"' : '') + '><td><b>' + esc(r.contractor) + '</b><div class="cq-age">' + esc(r.kind) + '</div></td><td>' + r.closed + '</td><td>' + r.inspected + trendTag(r.inspected, r.prev_inspected, 'up') + '</td><td>' + (r.coverage == null ? '—' : r.kind === 'subcon' ? '<span class="cq-pill ' + (r.coverage < 100 ? 'fail' : 'done') + '">' + r.coverage + '%</span>' : r.coverage + '%') + '</td><td>' + (r.pass_rate == null ? '—' : '<span class="cq-pill ' + (r.pass_rate >= 90 ? 'done' : r.pass_rate >= 70 ? 'queued' : 'fail') + '">' + r.pass_rate + '%</span>') + trendTag(r.pass_rate, r.prev_pass_rate, 'up') + '</td><td>' + r.good + '</td><td>' + r.rectify + '</td><td>' + r.penalty_n + '</td><td>' + r.clawback + '</td><td>' + r.npa + '</td><td>' + r.violations + ' <span class="cq-age">(' + r.v_minor + '/' + r.v_major + '/' + r.v_critical + ')</span></td><td>' + r.repeat_offenses + '</td><td class="cq-age">' + (r.top_codes || []).map(function (c) { return esc(c.code) + '×' + c.n; }).join(', ') + '</td><td>' + peso(r.penalty) + trendTag(Number(r.penalty), Number(r.prev_penalty), 'down') + (r.overrides ? '<div class="cq-ovr">' + r.overrides + ' override(s)</div>' : '') + '</td><td>' + r.rect_opened + '</td><td>' + r.rect_on_time + '</td><td>' + r.rect_late + '</td><td>' + r.rect_closed + '</td><td>' + r.rect_open_end + '</td><td class="' + (r.rect_overdue_end ? 'cq-over' : '') + '">' + r.rect_overdue_end + '</td><td>' + (r.avg_days_to_rectify == null ? '—' : r.avg_days_to_rectify) + '</td><td><button class="cq-btn ghost" data-scp="' + esc(r.contractor) + '" style="padding:3px 8px">PDF</button></td></tr>';
        }).join('') + '</tbody></table><div class="cq-age" style="margin-top:6px">Inspected = original inspections done in the month (re-inspections excluded). Penalty = effective (overrides applied). Trend pills compare with the previous month.</div>';
        rootEl.querySelectorAll('[data-scp]').forEach(function (b) { b.onclick = function () { printScorecard(rows.filter(function (r) { return r.contractor === b.dataset.scp; })[0], m); }; });
      }).catch(function (e) { $('#sc_out').innerHTML = '<div class="cq-empty">' + esc(e.message) + '</div>'; });
    }
    function fetchAllRect() {
      var all = [];
      function next(p) {
        return api.listRectifications({ page: p, pageSize: 1000 }).then(function (r) {
          all = all.concat(r.rows);
          if (r.rows.length === 1000 && p < 20) return next(p + 1);
          return all;
        });
      }
      return next(1);
    }
    function scorecardBook() {
      var m = $('#sc_month').value, m0 = m + '-01';
      return Promise.all([api.monthlyScorecard(m0), fetchAllRect(), api.monthViolations(m0)]).then(function (r) {
        var rows = scRows(r[0]);
        var sc = rows.map(function (x) { var o = { CONTRACTOR: x.contractor, KIND: x.kind, CLOSED: x.closed, INSPECTED: x.inspected, 'COVERAGE %': x.coverage, 'PASS RATE %': x.pass_rate, 'PREV PASS RATE %': x.prev_pass_rate, GOOD: x.good, 'FOR RECTIFY': x.rectify, 'FOR PENALTY': x.penalty_n, CLAWBACK: x.clawback, NPA: x.npa, VIOLATIONS: x.violations, MINOR: x.v_minor, MAJOR: x.v_major, CRITICAL: x.v_critical, 'REPEAT OFFENSES': x.repeat_offenses, PENALTY: Number(x.penalty), 'PREV PENALTY': Number(x.prev_penalty), OVERRIDES: x.overrides, 'RECT OPENED': x.rect_opened, 'RECT ON TIME': x.rect_on_time, 'RECT LATE': x.rect_late, 'CLOSED BY HEAD': x.rect_closed, 'OPEN AT MONTH END': x.rect_open_end, 'OVERDUE AT MONTH END': x.rect_overdue_end, 'AVG DAYS TO RECTIFY': x.avg_days_to_rectify }; S.cfg.checklist.forEach(function (c) { var it = (x.items || {})[c.id] || { pass: 0, fail: 0 }; o[c.label + ' PASS %'] = Core.passRate(it.pass, it.fail); }); return o; });
        // the Violations sheet is the LINE-ITEM register the head bills from (top-5 code counts are already on the
        // Scorecard sheet); re-inspection rows are included and told apart by SOURCE.
        var vio = (r[2] || []).map(function (v) {
          return { AUDIT: v.audit_id, SOURCE: v.source, 'DATE QA (Manila)': mnlDay(v.inspected_at), CONTRACTOR: v.contractor_name, SUBSCRIBER: v.subscriber,
            JONO: v.jo_no, ACCTNO: v.acct_no, INSPECTOR: v.inspector, CODE: v.code, CATEGORY: v.category, DESCRIPTION: v.description, SEVERITY: v.severity,
            'OFFENSE NO': v.offense_no, 'CATALOG PENALTY': v.penalty_amount == null ? null : Number(v.penalty_amount),
            OVERRIDE: v.penalty_override == null ? null : Number(v.penalty_override), 'EFFECTIVE PENALTY': Number(v.effective_penalty || 0),
            'OVERRIDE REASON': v.override_reason || '', REMARK: v.remark || '' };
        });
        var rect = r[1].filter(function (x) { return x.opened_at && mnlDay(x.opened_at).slice(0, 7) === m; }).map(function (x) { return { RECTIFICATION: x.id, CONTRACTOR: x.contractor_name, SUBSCRIBER: x.subscriber, JONO: x.jo_no, ACCTNO: x.acct_no, STATUS: x.status, CYCLE: x.cycle, OPENED: (x.opened_at || '').slice(0, 10), DEADLINE: x.deadline, RECTIFIED: (x.rectified_at || '').slice(0, 10), CLOSED: (x.closed_at || '').slice(0, 10), 'CLOSE REASON': x.close_reason || '', 'LAST AUDIT': x.last_audit_id }; });
        return [['Scorecard', sc], ['Violations', vio], ['Rectifications', rect]];
      });
    }
    function exportBook(name, sheets) {
      if (!sheets[0][1].length) { toast('Nothing to export'); return; }
      var toXlsx = deps.ensureXLSX ? deps.ensureXLSX().then(function () { var wb = root.XLSX.utils.book_new(); sheets.forEach(function (s) { root.XLSX.utils.book_append_sheet(wb, root.XLSX.utils.json_to_sheet(s[1].length ? s[1] : [{ note: 'no rows' }]), s[0]); }); root.XLSX.writeFile(wb, name + '.xlsx'); }) : Promise.reject();
      toXlsx.catch(function () { exportRows(name, sheets[0][1]); });   // CSV fallback = first sheet only
    }
    function printScorecard(r, m0) {
      if (!r) return; var month = new Date(m0 + 'T00:00:00+08:00').toLocaleString('en-PH', { month: 'long', year: 'numeric', timeZone: 'Asia/Manila' });
      var items = S.cfg.checklist.map(function (c) { var it = (r.items || {})[c.id] || { pass: 0, fail: 0 }; var pr = Core.passRate(it.pass, it.fail); return '<tr><td>' + esc(c.label) + '</td><td class="c">' + it.pass + '</td><td class="c">' + it.fail + '</td><td class="c">' + (pr == null ? '—' : pr + '%') + '</td></tr>'; }).join('');
      var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(r.contractor) + ' QA Scorecard ' + esc(month) + '</title><style>body{font:12px Arial,sans-serif;color:#000;margin:18px}h1{background:#1d9e3f;color:#fff;font-size:14px;text-align:center;padding:5px;margin:0 0 6px}h2{font-size:12px;margin:12px 0 4px}table{width:100%;border-collapse:collapse;margin-bottom:8px}td,th{border:1px solid #000;padding:4px 6px;font-size:11px}th{background:#1d9e3f;color:#fff}td.k{width:220px;background:#f3f3f3}td.c{text-align:center}@media print{.no{display:none}}</style></head><body>' +
        '<div class="no" style="text-align:right"><button onclick="window.print()">Print / Save as PDF</button></div><h1>MONTHLY QA SCORECARD · ' + esc(r.contractor) + ' · ' + esc(month) + '</h1>' +
        '<table><tr><td class="k">JOs closed / inspected / coverage</td><td>' + r.closed + ' / ' + r.inspected + ' / ' + (r.coverage == null ? '—' : r.coverage + '%') + '</td><td class="k">Checklist pass rate (prev)</td><td>' + (r.pass_rate == null ? '—' : r.pass_rate + '%') + ' (' + (r.prev_pass_rate == null ? '—' : r.prev_pass_rate + '%') + ')</td></tr>' +
        '<tr><td class="k">GOOD / FOR RECTIFY / FOR PENALTY / CLAWBACK / NPA</td><td>' + r.good + ' / ' + r.rectify + ' / ' + r.penalty_n + ' / ' + r.clawback + ' / ' + r.npa + '</td><td class="k">Violations (minor/major/critical) · repeat</td><td>' + r.violations + ' (' + r.v_minor + '/' + r.v_major + '/' + r.v_critical + ') · ' + r.repeat_offenses + '</td></tr>' +
        '<tr><td class="k">Total penalty (prev)</td><td><b>' + peso(r.penalty) + '</b> (' + peso(r.prev_penalty) + ')' + (r.overrides ? ' · ' + r.overrides + ' override(s)' : '') + '</td><td class="k">Rectifications opened / on time / late / closed by head</td><td>' + r.rect_opened + ' / ' + r.rect_on_time + ' / ' + r.rect_late + ' / ' + r.rect_closed + '</td></tr>' +
        '<tr><td class="k">Open at month end / overdue</td><td>' + r.rect_open_end + ' / ' + r.rect_overdue_end + '</td><td class="k">Average days to rectify</td><td>' + (r.avg_days_to_rectify == null ? '—' : r.avg_days_to_rectify) + '</td></tr></table>' +
        '<h2>Checklist</h2><table><tr><th style="text-align:left">ITEM</th><th>PASS</th><th>FAIL</th><th>PASS RATE</th></tr>' + items + '</table>' +
        '<h2>Top violations</h2><table><tr><th>CODE</th><th>COUNT</th></tr>' + ((r.top_codes || []).map(function (c) { return '<tr><td>' + esc(c.code) + '</td><td class="c">' + c.n + '</td></tr>'; }).join('') || '<tr><td colspan="2">None</td></tr>') + '</table>' +
        '<p style="font-size:10px">Generated by AHBA FieldOps QA · ' + esc(new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })) + '</p></body></html>';
      var w = window.open('', '_blank'); if (!w) { toast('Pop-up blocked — allow pop-ups to print'); return; } w.document.write(html); w.document.close();
    }

    // ---------------- SETTINGS ----------------
    function renderSettings() {
      var c = S.cfg, s = c.settings || {};
      var lastSync = S.sync && S.sync.last_sync_at ? fmtWhen(S.sync.last_sync_at) + ' · ' + S.sync.last_sync_rows + ' rows' : 'never';
      $('#cqBody').innerHTML = '<div class="cq-sec">Sheet sync</div><div class="cq-stats"><div class="cq-stat"><span>Last sync</span><strong style="font-size:13px">' + esc(lastSync) + '</strong></div><div class="cq-stat' + (S.sync && S.sync.unmapped.length ? ' warn' : '') + '"><span>Unmapped contractor names</span><strong style="font-size:13px">' + esc((S.sync && S.sync.unmapped.join(', ')) || 'none') + '</strong></div></div>' +
        (canEdit ? '<div class="cq-bar"><label>CSV fallback (same columns as the sheet: COMP, JODATECLOSED, ACCTNO, JONO, …) <input type="file" id="st_csv" accept=".csv"></label><button class="cq-btn ghost" id="st_csvGo">Import CSV</button></div>' : '') +
        '<div class="cq-sec">General</div><div class="cq-bar"><label>In-house sample % <input type="number" id="st_pct" value="' + esc(s.inhouse_sample_pct || '10') + '" min="0" max="100" style="width:70px"' + (canEdit ? '' : ' disabled') + '></label><label>Initial cutoff (rows closed before this are never auto-queued) <input type="date" id="st_cut" value="' + esc(s.initial_cutoff || '') + '"' + (canEdit ? '' : ' disabled') + '></label><label>Rectification deadline (days) <input type="number" id="st_rect" value="' + esc(s.rect_default_days || '7') + '" min="1" max="60" style="width:70px"' + (canEdit ? '' : ' disabled') + '></label>' + (canEdit ? '<button class="cq-btn" id="st_save">Save</button>' : '') + '</div>' +
        (canEdit ? '<div class="cq-sec">Maintenance</div><div class="cq-bar"><button class="cq-btn ghost" id="st_recompute">Recompute offense levels (one-time after Phase C)</button><span class="cq-age">Re-derives offense no. + catalog penalty for every done inspection in date order. Overrides are kept.</span></div>' : '') +
        '<div class="cq-sec">Contractor mapping</div>' + (unmappedOpenMsg() ? '<div class="cq-banner">⚠ ' + esc(unmappedOpenMsg()) + '</div>' : '') +
        '<table><thead><tr><th>Sheet name (COMP)</th><th>Display name</th><th>Kind</th><th>Coverage</th><th>FieldOps org id</th><th>Active</th></tr></thead><tbody>' + c.contractors.map(function (x) { return '<tr data-ct="' + esc(x.sheet_name) + '"><td><b>' + esc(x.sheet_name) + '</b></td><td><input data-f="display_name" value="' + esc(x.display_name) + '"></td><td><select data-f="kind"><option' + (x.kind === 'subcon' ? ' selected' : '') + '>subcon</option><option' + (x.kind === 'inhouse' ? ' selected' : '') + '>inhouse</option></select></td><td><select data-f="coverage"><option' + (x.coverage === 'all' ? ' selected' : '') + '>all</option><option' + (x.coverage === 'sample' ? ' selected' : '') + '>sample</option></select></td><td><input data-f="org_id" value="' + esc(x.org_id || '') + '" placeholder="uuid from Subcontractors page" style="width:260px"></td><td><input type="checkbox" data-f="active"' + (x.active ? ' checked' : '') + '></td></tr>'; }).join('') + (canEdit ? '<tr><td><input id="ct_new" placeholder="NEW SHEET NAME"></td><td colspan="5"><button class="cq-btn ghost" id="ct_add">Add</button></td></tr>' : '') + '</tbody></table>' +
        '<div class="cq-sec">Checklist items</div><table><thead><tr><th>Section</th><th>Label</th><th>Order</th><th>Suggested code</th><th>Active</th></tr></thead><tbody>' + c.checklist.map(function (x) { return '<tr data-ci="' + x.id + '"><td><select data-f="section"><option' + (x.section === 'OUTSIDE' ? ' selected' : '') + '>OUTSIDE</option><option' + (x.section === 'PREMISE' ? ' selected' : '') + '>PREMISE</option></select></td><td><input data-f="label" value="' + esc(x.label) + '" style="width:320px"></td><td><input data-f="sort_order" type="number" value="' + x.sort_order + '" style="width:60px"></td><td><input data-f="suggested_code" value="' + esc(x.suggested_code || '') + '" style="width:90px"></td><td><input type="checkbox" data-f="active"' + (x.active ? ' checked' : '') + '></td></tr>'; }).join('') + (canEdit ? '<tr><td><select id="ci_sec"><option>OUTSIDE</option><option>PREMISE</option></select></td><td><input id="ci_label" placeholder="New item label" style="width:320px"></td><td colspan="3"><button class="cq-btn ghost" id="ci_add">Add</button></td></tr>' : '') + '</tbody></table>' +
        '<div class="cq-sec">Violation catalog (' + c.codes.length + ')</div><div class="cq-bar"><input id="vc_q" placeholder="Filter codes"></div><div id="vc_table"></div>';
      var renderCodes = function () { var q = ($('#vc_q').value || '').toUpperCase(); var rows = c.codes.filter(function (x) { return !q || (x.code + ' ' + x.category + ' ' + x.description).toUpperCase().indexOf(q) >= 0; }).slice(0, 60); $('#vc_table').innerHTML = '<table><thead><tr><th>Code</th><th>Category</th><th>Severity</th><th>L1</th><th>L2</th><th>L3</th><th>Penalty text</th><th>Active</th></tr></thead><tbody>' + rows.map(function (x) { return '<tr data-vc="' + esc(x.code) + '"><td><b>' + esc(x.code) + '</b></td><td><input data-f="category" value="' + esc(x.category) + '" style="width:220px"></td><td><select data-f="severity"><option' + (x.severity === 'MINOR' ? ' selected' : '') + '>MINOR</option><option' + (x.severity === 'MAJOR' ? ' selected' : '') + '>MAJOR</option><option' + (x.severity === 'CRITICAL' ? ' selected' : '') + '>CRITICAL</option></select></td><td><input data-f="penalty_l1" type="number" value="' + (x.penalty_l1 == null ? '' : x.penalty_l1) + '" style="width:70px"></td><td><input data-f="penalty_l2" type="number" value="' + (x.penalty_l2 == null ? '' : x.penalty_l2) + '" style="width:70px"></td><td><input data-f="penalty_l3" type="number" value="' + (x.penalty_l3 == null ? '' : x.penalty_l3) + '" style="width:70px"></td><td class="cq-age">' + esc(String(x.penalty_text || '').slice(0, 80)) + '</td><td><input type="checkbox" data-f="active"' + (x.active !== false ? ' checked' : '') + '></td></tr>'; }).join('') + '</tbody></table>' + (c.codes.length > rows.length ? '<div class="cq-age">Showing ' + rows.length + ' of ' + c.codes.length + ' — use the filter.</div>' : ''); wireRows('[data-vc]', function (tr) { return c.codes.filter(function (x) { return x.code === tr.dataset.vc; })[0]; }, api.saveCode); };
      $('#vc_q').oninput = renderCodes; renderCodes();
      wireRows('[data-ct]', function (tr) { return c.contractors.filter(function (x) { return x.sheet_name === tr.dataset.ct; })[0]; }, api.saveContractor);
      wireRows('[data-ci]', function (tr) { return c.checklist.filter(function (x) { return String(x.id) === tr.dataset.ci; })[0]; }, api.saveChecklistItem);
      if (!canEdit) { rootEl.querySelectorAll('#cqBody input, #cqBody select').forEach(function (el) { if (el.id !== 'vc_q') el.disabled = true; }); return; }
      $('#st_save').onclick = function () { Promise.all([api.saveSetting('inhouse_sample_pct', $('#st_pct').value), api.saveSetting('initial_cutoff', $('#st_cut').value), api.saveSetting('rect_default_days', $('#st_rect').value)]).then(function () { toast('Saved'); return load(); }); };
      $('#st_recompute').onclick = function () { if (!confirm('Recompute offense levels for ALL done inspections? Overrides are kept.')) return; api.recomputeOffenses().then(function (r) { toast('Recomputed ' + r.audits + ' audits · ' + r.violations + ' violations'); }).catch(function (e) { toast('Failed: ' + e.message); }); };
      $('#ct_add').onclick = function () { var n = ($('#ct_new').value || '').trim().toUpperCase(); if (!n) return; api.saveContractor({ sheet_name: n, display_name: n, kind: 'subcon', coverage: 'all', active: true }).then(function () { toast('Added'); load().then(renderSettings); }); };
      $('#ci_add').onclick = function () { var l = ($('#ci_label').value || '').trim(); if (!l) return; api.saveChecklistItem({ section: $('#ci_sec').value, label: l, sort_order: c.checklist.length + 1, active: true, photo_required: false }).then(function () { toast('Added'); load().then(renderSettings); }); };
      $('#st_csvGo').onclick = function () { var f = $('#st_csv').files && $('#st_csv').files[0]; if (!f) { toast('Choose a CSV first'); return; } f.text().then(function (txt) { var rows = parseCsv(txt); if (rows.length < 2) { toast('Empty CSV'); return; } var hdr = rows[0]; var objs = rows.slice(1).map(function (r) { var o = {}; hdr.forEach(function (h, i) { o[h.trim()] = r[i]; }); return o; }); return api.importRows(objs).then(function (r) { toast('Imported ' + r.upserted + ' rows · ' + r.audits_created + ' new audits'); return load().then(renderSettings); }); }).catch(function (e) { toast('Import failed: ' + e.message); }); };
    }
    function wireRows(sel, find, save) { rootEl.querySelectorAll(sel).forEach(function (tr) { tr.querySelectorAll('[data-f]').forEach(function (el) { el.onchange = function () { var row = find(tr); if (!row) return; var prev = row[el.dataset.f]; var v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : (el.value === '' ? null : el.value); row[el.dataset.f] = v; save(row).then(function () { toast('Saved ' + (row.code || row.sheet_name || row.label)); }).catch(function (e) { row[el.dataset.f] = prev; if (el.type === 'checkbox') el.checked = !!prev; else el.value = prev == null ? '' : prev; toast('Save failed: ' + e.message); }); }; }); }); }
    function parseCsv(text) { var rows = [], row = [], cell = '', inQ = false, i, ch; text = String(text || ''); for (i = 0; i < text.length; i++) { ch = text[i]; if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += ch; } else if (ch === '"') inQ = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch; } if (cell !== '' || row.length) { row.push(cell); rows.push(row); } return rows.filter(function (r) { return r.some(function (c) { return c !== ''; }); }); }

    var TABS = { queue: renderQueue, board: renderBoard, results: renderResults, rect: renderRect, reports: renderReports, settings: renderSettings };
    if (api.subscribe) S.unsub = api.subscribe(function (e) { var r = e.row || {}; if (r.status === 'done' && r.inspected_at && r.inspected_at.slice(0, 10) === today()) { S.submittedToday++; toast('✅ ' + r.id + ' submitted by ' + (r.inspector || r.assigned_to) + (r.assessment ? ' · ' + r.assessment : '')); if (o.onBadge) o.onBadge(S.submittedToday); } if (S.tab === 'board') refreshLanesSoon(); if (S.tab === 'queue') loadQueueStats(); if (S.tab === 'rect') { loadRect(); loadRectStats(); } });
    if (api.subscribeNotices) S.unsubN = api.subscribeNotices(function () { if (S.tab === 'rect') { loadRect(); loadRectStats(); } });
    // single fallback timer — realtime is primary
    S.timer = setInterval(function () { if (S.tab === 'board') refreshLanesSoon(); else if (S.tab === 'queue') loadQueueStats(); }, 120000);
    load().then(render).catch(function (e) { rootEl.querySelector('#cqBody').innerHTML = '<div class="cq-empty">Hindi ma-load ang QA data: ' + esc((e && e.message) || e) + '<br><span class="cq-age">Kung "permission denied", mag-sign in ulit (expired ang session) o walang QA Audit access ang account.</span></div>'; });
    return { refresh: function () { return load().then(render).catch(function (e) { toast('QA: ' + ((e && e.message) || e)); }); }, destroy: function () { if (S.unsub) S.unsub(); if (S.unsubN) S.unsubN(); clearInterval(S.timer); if (S.laneT) { clearTimeout(S.laneT); S.laneT = null; } rootEl.innerHTML = ''; }, badge: function () { return S.submittedToday; }, _S: S, _openDetail: function (id) { openDetail(id); }, _openRect: function (id) { openRect(id); } };
  }
  root.ConsoleQA = { mount: mount };
})(typeof self !== 'undefined' ? self : this);
