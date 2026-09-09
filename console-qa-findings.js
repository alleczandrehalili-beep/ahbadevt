// AHBA Console — QA FINDINGS page for subcontractor console users. Read-only view of their own rectification loop.
// Mount-only. Visibility is enforced by RLS (qa.my_org()); the org filter here only narrows the query.
(function (root) {
  'use strict';
  var Core = root.QaCore;
  var CSS = '.cqf{font:13px "DM Sans",system-ui,sans-serif;color:#0e2b27}.cqf-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.cqf-bar select,.cqf-bar input{padding:7px 9px;border:1px solid #cfd8d3;border-radius:9px;font-size:12px}.cqf-btn{padding:7px 12px;border-radius:9px;border:1px solid #0d3b34;background:#fff;color:#0d3b34;font-weight:700;font-size:12px;cursor:pointer}' +
    '.cqf table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e3e8e2;border-radius:12px;overflow:hidden}.cqf th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#8a9894;text-align:left;padding:8px 10px;border-bottom:1px solid #e3e8e2;background:#f8f9f7}.cqf td{padding:8px 10px;border-bottom:1px solid #f0f2ef;font-size:12px;vertical-align:top}' +
    '.cqf-pill{display:inline-block;padding:2px 8px;border-radius:9px;font-size:10px;font-weight:800;background:#eef1ec}.cqf-pill.r-FORRECTIFICATION{background:#fde8e4;color:#b23a25}.cqf-pill.r-FORREINSPECTION{background:#fff3d6;color:#9a6200}.cqf-pill.r-RECTIFIED{background:#e7f7ef;color:#11825f}.cqf-pill.r-CLOSED{background:#e8ecff;color:#2d3fa8}.cqf-over{color:#c2503a;font-weight:800}' +
    '.cqf-stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}.cqf-stat{background:#fff;border:1px solid #e3e8e2;border-radius:12px;padding:10px 14px;min-width:120px}.cqf-stat span{display:block;font-size:10px;color:#8a9894;text-transform:uppercase}.cqf-stat strong{font-size:20px}.cqf-stat.warn strong{color:#c2503a}' +
    '.cqf-modal{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9000;display:flex;align-items:flex-start;justify-content:center;padding:30px 12px;overflow:auto}.cqf-modal>div{background:#fff;border-radius:14px;padding:18px;max-width:900px;width:100%}.cqf-sec{font:800 11px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#107b5e;margin:14px 0 6px}.cqf-age{font-size:11px;color:#8a9894}.cqf-thumbs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.cqf-thumbs img{width:84px;height:84px;object-fit:cover;border-radius:8px;border:1px solid #cfd8d3;cursor:pointer}.cqf-empty{padding:24px;text-align:center;color:#9aa6a2}.cqf-notice{background:#fff3d6;border:1px solid #f0d28a;border-radius:10px;padding:8px 12px;margin-bottom:10px;font-weight:700}';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtWhen(s) { return s ? new Date(s).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; }
  function peso(n) { return '₱' + Number(n || 0).toLocaleString('en-PH'); }
  function rpill(s) { return '<span class="cqf-pill r-' + esc(String(s || '').replace(/[^A-Z]/g, '')) + '">' + esc(s || '') + '</span>'; }

  function mount(rootEl, o) {
    var api = o.api, org = o.org || null, deps = o.deps || {};
    var toast = deps.toast || function (m) { console.log('[cqf]', m); };
    // The host mounts this page once and shows/hides it with the rest of its tabs. Marking notices seen while the
    // page is hidden would silently clear the subcon's badge for updates they never actually saw, so `stats()`
    // only burns the notices when the page is on screen — otherwise it reports the count back through onBadge.
    // The host should call handle.refresh() when it shows the page, which re-runs stats() with isVisible() true.
    var isVisible = deps.isVisible || function () { return !!(rootEl.offsetParent); };
    var S = { status: Core.RECT_OPEN.slice(), page: 1, labels: {}, unsub: null, destroyed: false, openSeq: 0, total: 0 };
    if (!document.getElementById('cqfCss')) { var st = document.createElement('style'); st.id = 'cqfCss'; st.textContent = CSS; document.head.appendChild(st); }
    rootEl.innerHTML = '<div class="cqf"><div id="cqfNotice"></div><div class="cqf-stats" id="cqfStats"></div><div class="cqf-bar"><select id="cqf_status"><option value="FOR RECTIFICATION,FOR RE-INSPECTION">Open</option><option value="FOR RECTIFICATION">FOR RECTIFICATION</option><option value="FOR RE-INSPECTION">FOR RE-INSPECTION</option><option value="RECTIFIED">RECTIFIED</option><option value="CLOSED">CLOSED</option><option value="">All</option></select><input id="cqf_q" placeholder="Search JO / acct / subscriber" style="min-width:220px"><button class="cqf-btn" id="cqf_go">Filter</button><span style="flex:1"></span><button class="cqf-btn" id="cqf_refresh">Refresh</button></div><div id="cqfTable"></div><div class="cqf-bar" style="justify-content:flex-end"><button class="cqf-btn" id="cqf_prev">‹ Prev</button><span id="cqf_page"></span><button class="cqf-btn" id="cqf_next">Next ›</button></div></div><div id="cqfModal"></div>';
    var $ = function (s) { return rootEl.querySelector(s); };
    $('#cqf_go').onclick = function () { S.status = $('#cqf_status').value ? $('#cqf_status').value.split(',') : []; S.q = $('#cqf_q').value; S.page = 1; loadAll(); };
    $('#cqf_q').onkeydown = function (e) { if (e.key === 'Enter') $('#cqf_go').click(); };
    $('#cqf_refresh').onclick = loadAll;
    $('#cqf_prev').onclick = function () { if (S.page > 1) { S.page--; load(); } };
    $('#cqf_next').onclick = function () { if (S.page * 50 < S.total) { S.page++; load(); } };
    function modal(html) { $('#cqfModal').innerHTML = '<div class="cqf-modal"><div>' + html + '</div></div>'; $('#cqfModal .cqf-modal').onclick = function (e) { if (e.target === this) closeModal(); }; }
    function closeModal() { S.openSeq++; $('#cqfModal').innerHTML = ''; }
    function stats() {
      Promise.all([api.listRectifications({ org_id: org, status: Core.RECT_OPEN, pageSize: 1 }), api.listRectifications({ org_id: org, overdue: true, pageSize: 1 }), api.listRectifications({ org_id: org, status: ['FOR RE-INSPECTION'], pageSize: 1 }), api.noticesUnseen ? api.noticesUnseen() : Promise.resolve(0)]).then(function (r) {
        if (S.destroyed) return;
        $('#cqfStats').innerHTML = '<div class="cqf-stat' + (r[0].total ? ' warn' : '') + '"><span>Open findings</span><strong>' + esc(r[0].total) + '</strong></div><div class="cqf-stat' + (r[1].total ? ' warn' : '') + '"><span>Overdue</span><strong>' + esc(r[1].total) + '</strong></div><div class="cqf-stat"><span>Awaiting QA re-inspection</span><strong>' + esc(r[2].total) + '</strong></div>';
        $('#cqfNotice').innerHTML = r[3] ? '<div class="cqf-notice">🔔 ' + esc(r[3]) + ' new QA update(s) since your last visit.</div>' : '';
        var zero = function () { if (!S.destroyed && o.onBadge) o.onBadge(0); };
        if (r[3] && !isVisible()) { if (o.onBadge) o.onBadge(r[3]); return; }        // off-screen: keep the badge, do not mark seen
        if (r[3] && api.markNoticesSeen) api.markNoticesSeen().then(zero).catch(zero); else if (o.onBadge) o.onBadge(0);
      }).catch(function (e) { if (S.destroyed) return; $('#cqfStats').innerHTML = '<div class="cqf-empty">' + esc(e.message) + '</div>'; });
    }
    function load() {
      $('#cqfTable').innerHTML = '<div class="cqf-empty">Loading…</div>';
      api.listRectifications({ org_id: org, status: S.status, q: S.q, page: S.page, pageSize: 50 }).then(function (r) {
        if (S.destroyed) return;
        S.total = r.total;
        $('#cqf_page').textContent = 'Page ' + S.page + ' · ' + r.total + ' rows';
        if (!r.rows.length) { $('#cqfTable').innerHTML = '<div class="cqf-empty">No QA findings in this filter. 🎉</div>'; return; }
        $('#cqfTable').innerHTML = '<table><thead><tr><th>Ref</th><th>Subscriber</th><th>JO / Acct</th><th>Cycle</th><th>Deadline</th><th>Status</th><th>Last update</th><th></th></tr></thead><tbody>' + r.rows.map(function (x) {
          return '<tr><td><b>' + esc(x.id) + '</b></td><td><b>' + esc(x.subscriber || '') + '</b><div class="cqf-age">' + esc(x.address || '') + ' ' + esc(x.barangay || '') + '</div></td><td>' + esc(x.jo_no || '—') + '<div class="cqf-age">' + esc(x.acct_no || '') + '</div></td><td>' + esc(x.cycle) + '</td><td class="' + (x.overdue ? 'cqf-over' : '') + '">' + esc(x.deadline) + (x.overdue ? ' · OVERDUE' : '') + '</td><td>' + rpill(x.status) + '</td><td class="cqf-age">' + fmtWhen(x.updated_at) + '</td><td><button class="cqf-btn" data-v="' + esc(x.id) + '">View findings</button></td></tr>';
        }).join('') + '</tbody></table>';
        rootEl.querySelectorAll('[data-v]').forEach(function (b) { b.onclick = function () { open(b.dataset.v); }; });
      }).catch(function (e) { if (S.destroyed) return; $('#cqfTable').innerHTML = '<div class="cqf-empty">' + esc(e.message) + '</div>'; });
    }
    function loadAll() { load(); stats(); }
    function open(id) {
      var t = ++S.openSeq;
      modal('<div class="cqf-empty">Loading…</div>');
      api.getRectification(id).then(function (r) {
        if (S.destroyed || t !== S.openSeq || !$('#cqfModal')) return;
        var x = r.rect, html = '<div style="display:flex;justify-content:space-between;gap:10px"><div><h3 style="margin:0">' + esc(x.id) + ' · ' + esc(x.subscriber || '') + '</h3><div class="cqf-age">' + esc(x.address || '') + ' ' + esc(x.barangay || '') + ' · JO ' + esc(x.jo_no || '—') + ' · Acct ' + esc(x.acct_no || '—') + '</div><div style="margin-top:6px">' + rpill(x.status) + ' · cycle ' + esc(x.cycle) + ' · deadline <b class="' + (x.overdue ? 'cqf-over' : '') + '">' + esc(x.deadline) + '</b>' + (x.rectified_at ? ' · rectified ' + fmtWhen(x.rectified_at) : '') + (x.closed_at ? ' · closed by QA Head: ' + esc(x.close_reason || '') : '') + '</div></div><button class="cqf-btn" id="cqf_x">Close</button></div>' +
          (x.status === 'FOR RECTIFICATION' ? '<div class="cqf-notice" style="margin-top:10px">Please fix the items below on or before ' + esc(x.deadline) + '. QA will re-inspect after you rectify.</div>' : x.status === 'FOR RE-INSPECTION' ? '<div class="cqf-notice" style="margin-top:10px">A QA re-inspection has been scheduled.</div>' : '');
        r.audits.forEach(function (b, i) {
          var a = b.audit;
          var fails = b.items.filter(function (it) { return it.result === 'fail'; });
          html += '<div class="cqf-sec">' + (i === 0 ? 'QA inspection' : 'QA re-inspection ' + i) + ' · ' + fmtWhen(a.inspected_at) + (a.status !== 'done' ? ' · scheduled ' + esc(a.scheduled_date || '') : '') + (a.assessment ? ' · <b>' + esc(a.assessment) + '</b>' : '') + '</div>';
          if (a.status !== 'done') { html += '<div class="cqf-age">Pending visit.</div>'; return; }
          html += fails.length ? '<table><thead><tr><th>Failed item</th><th>Remark</th><th>Photos</th></tr></thead><tbody>' + fails.map(function (it) { return '<tr><td><b>' + esc(S.labels[it.item_id] || ('Item ' + it.item_id)) + '</b></td><td>' + esc(it.remark || '') + '</td><td><div class="cqf-thumbs" data-ph="' + esc(a.id) + '-' + it.item_id + '"></div></td></tr>'; }).join('') + '</tbody></table>' : '<div class="cqf-age">No failed items — passed. ✅</div>';
          if (b.violations.length) html += '<table><thead><tr><th>Code</th><th>Category</th><th>Description</th><th>Severity</th><th>Offense no.</th><th>Penalty</th></tr></thead><tbody>' + b.violations.map(function (v) { return '<tr><td><b>' + esc(v.code) + '</b></td><td>' + esc(v.category || '') + '</td><td>' + esc(v.description || '') + (v.remark ? '<div class="cqf-age">' + esc(v.remark) + '</div>' : '') + '</td><td>' + esc(v.severity || '') + '</td><td>' + esc(v.offense_no || '—') + '</td><td>' + peso(Core.effectivePenalty(v)) + '</td></tr>'; }).join('') + '<tr><td colspan="5"><b>Total</b></td><td><b>' + peso(b.violations.reduce(function (s, v) { return s + Core.effectivePenalty(v); }, 0)) + '</b></td></tr></tbody></table>';
        });
        modal(html); $('#cqf_x').onclick = closeModal;
        r.audits.forEach(function (b) { b.photos.forEach(function (p) { if (!b.items.some(function (it) { return it.item_id === p.item_id && it.result === 'fail'; })) return; var box = rootEl.querySelector('[data-ph="' + b.audit.id + '-' + p.item_id + '"]'); if (!box) return; var img = document.createElement('img'); img.alt = p.label || ''; box.appendChild(img); api.photoUrl(p.path).then(function (u) { img.src = u; img.onclick = function () { window.open(u, '_blank', 'noopener'); }; }).catch(function () {}); }); });
      }).catch(function (e) {
        if (S.destroyed || t !== S.openSeq || !$('#cqfModal')) return;
        modal('<div class="cqf-empty">Could not load: ' + esc(e.message) + '</div><button class="cqf-btn" id="cqf_x">Close</button>');
        $('#cqf_x').onclick = closeModal;
      });
    }
    // labels only — a subcon console user has no read on the rest of the QA config (see qa_cfg_read / qa_checklist_subcon)
    api.getChecklist().then(function (rows) { (rows || []).forEach(function (x) { S.labels[x.id] = x.label; }); }).catch(function () {}).then(loadAll);
    if (api.subscribeNotices) S.unsub = api.subscribeNotices(function () { clearTimeout(S.t); S.t = setTimeout(function () { if (!S.destroyed) { toast('🔔 May bagong QA finding'); loadAll(); } }, 1500); });
    return { refresh: loadAll, destroy: function () { S.destroyed = true; clearTimeout(S.t); if (S.unsub) S.unsub(); rootEl.innerHTML = ''; } };
  }
  root.ConsoleQAFindings = { mount: mount };
})(typeof self !== 'undefined' ? self : this);
