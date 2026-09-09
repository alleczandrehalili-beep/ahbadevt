// AHBA QA Audit — in-memory QaApi implementation (demo + node tests). Mirrors the SQL rules in qa-04-functions.sql.
// Same method set as qa-api.js (enforced by qa-api.test.mjs). No network. Storage = fake paths (+ object URLs in the browser).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./qa-core.js'));
  else root.QaSim = factory(root.QaCore);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  var VISIT = Core.VISIT, ASSESS = Core.ASSESS;
  var CHECKLIST = [
    ['OUTSIDE', 'Maintenance loop above the NAP', 'PR005'], ['OUTSIDE', 'Attachment of S-clamps from every pole', 'PR003'],
    ['PREMISE', 'Attachment of house bracket', 'HA001'], ['PREMISE', 'Maintenance loop beside the house bracket', 'PR005'],
    ['PREMISE', 'Layout of drop cable in client premise', 'INW001'], ['PREMISE', 'Use of tapping clip and/or tie wrap', 'INW001'],
    ['PREMISE', 'NIU box fixed', 'INW002'], ['PREMISE', 'Looping at NIU box', 'INW002'], ['PREMISE', 'Patch cord', 'INW002'], ['PREMISE', 'Modem location', 'INW002']
  ];
  var CODES = [
    ['PR001', 'SAGGING DROP WIRE', 'PR', 500, 1000, 2000], ['PR003', 'MISSING S-CLAMP ON POLE', 'PR', 500, 1000, 2000], ['PR005', 'POOR ROUTING ON NAP', 'PR', 500, 1000, 2000],
    ['PR009', 'MISSING MID-SPAN CLAMP', 'PR', 500, 1000, 2000], ['PR013', 'NO LABEL AT NAP', 'PR', 500, 1000, 2000], ['HA001', 'NO OR POOR BRACKET', 'HA', 500, 1000, 2000],
    ['HA002', 'NO S-CLAMP ON BRACKET', 'HA', 500, 1000, 2000], ['INW001', 'SUBSTANDARD INDOOR CABLING', 'INW', 1000, 2000, 3000], ['INW002', 'POOR NIU / NO PATCH CORD', 'INW', 500, 1000, 2000],
    ['INW003', 'MISSING LABEL IN NIU BOX', 'INW', 500, 1000, 2000], ['CPE001', 'FAILED SIGNAL LEVEL', 'CPE', 500, 1000, 2000], ['MIS005', 'WRONG INSTALL ADDRESS', 'MIS', 1000, 2000, 3000],
    ['STY001', 'NO PPE / UNSAFE SETUP', 'STY', 500, 1000, 2000], ['DOC001', 'INCOMPLETE SAR', 'DOC', 500, 1000, 2000], ['PR012', 'IMPROPER POLE ATTACH', 'PR', null, null, null]
  ];
  var CONTRACTORS = [['AHBA', 'inhouse', 'sample'], ['AVELINE', 'subcon', 'all'], ['J2', 'subcon', 'all'], ['RIA', 'subcon', 'all'], ['MAX - ALLY88', 'subcon', 'all'],
    ['JHANRENZ', 'subcon', 'all'], ['J VANA', 'subcon', 'all'], ['COMWORKS', 'subcon', 'all'], ['JD CRUZ', 'subcon', 'all']];
  var QUICK = ['NO TAGGING NAP-NIU', 'NO HOUSE BRACKET/USED SPAN CLAMP', 'NO MIDSPAN', 'NO S-CLAMP', 'IMPROPER CABLE LAYOUT', 'NO LOOPING IN NIU', 'NO PATCH CORD INSTALLED', 'WRONG ADDRESS', 'FAILED PARAMETERS', 'COMMERCIAL'];
  var BRGYS = ['PAYATAS', 'BATASAN HILLS', 'COMMONWEALTH', 'BAGBAG', 'HOLY SPIRIT', 'KALIGAYAHAN', 'PASONG TAMO', 'CULIAT'];

  function demoSeed() {
    var rows = [], s = 11; var rng = function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    var comps = ['J2', 'AVELINE', 'RIA', 'AHBA', 'AHBA', 'MAX - ALLY88', 'J VANA', 'COMWORKS'];
    for (var i = 0; i < 60; i++) {
      var d = new Date(Date.UTC(2026, 8, 1 + Math.floor(rng() * 7)));
      var legacy = i % 9 === 0;
      rows.push({ COMP: comps[i % comps.length], JODATECLOSED: d.toISOString().slice(0, 10) + ' 00:00:00', ACCTNO: String(1900000000000 + i), JONO: 'R7' + String(100000 + i),
        SSPCODE: 'SKY-DEMO' + i, SUBSCRIBERNAME: 'DEMO SUBSCRIBER ' + (i + 1), MOBILENO: '9' + String(100000000 + i), BARANGAYNAME: BRGYS[i % BRGYS.length],
        COMPLETEADDRESS: (i + 1) + ' DEMO ST ' + BRGYS[i % BRGYS.length], TRANTYPECODE: 'MAINLINE APPLICATION', NAPCODE: 'QCY0' + (i % 9) + ' LP' + i + ' NP' + (i % 8 + 1),
        PORTNO: 'P' + (i % 8 + 1) + '-O', SERIALNO: 'SN' + i, DRIVER: 'DEMO DRIVER ' + (i % 5), TECH: 'DEMO TECH ' + (i % 7), 'TECH 2': '',
        LATLONG: (14.65 + rng() * 0.1).toFixed(6) + ', ' + (121.0 + rng() * 0.1).toFixed(6),
        VISITED: legacy ? 'VISITED' : '', 'DATE QA': legacy ? '2026-09-03 00:00:00' : '', ASSESMENT: legacy ? (i % 2 ? 'GOOD' : 'FOR RECTIFY') : '', 'INSPECTED BY': legacy ? 'DEMO LEGACY QA' : '', OTHERS: legacy && i % 2 === 0 ? 'NO MIDSPAN' : '' });
    }
    return { sheetRows: rows, inspectors: [{ username: 'AHBA_QA01', display_name: 'Demo Inspector 1' }, { username: 'AHBA_QA02', display_name: 'Demo Inspector 2' }, { username: 'AHBA_QA03', display_name: 'Demo Inspector 3' }],
      jobs: rows.slice(0, 20).map(function (r, i) { return { id: 'DEMO-JO-' + i, job_order_no: r.JONO, ibass_acct_no: r.ACCTNO, status: 'completed', subscriber: r.SUBSCRIBERNAME, photos: i % 3 === 0 ? [{ path: 'demo/' + i + '.jpg', label: 'HOUSE BRACKET' }] : [] }; }) };
  }

  function create(opts) {
    opts = opts || {};
    var now = opts.now || function () { return new Date(); };
    var rng = opts.rng || Math.random;
    var db = opts.db || { audits: [], items: [], photos: [], violations: [], log: [], rectifications: [], notices: [], rectSeq: 0, sheetRows: {}, jobs: [],
      settings: { inhouse_sample_pct: '10', initial_cutoff: '2026-08-01', sync_window_days: '60', last_sync_at: '', last_sync_rows: '0', rect_default_days: '7' },
      checklist: CHECKLIST.map(function (c, i) { return { id: i + 1, section: c[0], label: c[1], sort_order: i + 1, active: true, photo_required: false, suggested_code: c[2] }; }),
      codes: CODES.map(function (c) { return { code: c[0], category: c[1], description: c[1], class: c[2], severity: (c[3] || 0) >= 1000 ? 'MAJOR' : 'MINOR', penalty_text: c[3] ? 'OFFENSE LEVEL 1: PHP ' + c[3] : 'CLAWBACK', penalty_l1: c[3], penalty_l2: c[4], penalty_l3: c[5], active: true }; }),
      contractors: CONTRACTORS.map(function (c) { return { sheet_name: c[0], display_name: c[0], org_id: null, kind: c[1], coverage: c[2], active: true }; }),
      quickRemarks: QUICK.map(function (q, i) { return { label: q, sort_order: i + 1 }; }),
      inspectors: [], seq: 0, blobs: {} };
    var viewerOrg = opts.org || null;   // subcon-mode: only own-org loop rows are visible
    // Shared across every create() call that passes the same opts.db (e.g. a subcon-mode instance layered on the
    // head instance's store, as qa-demo.html does) — so a subscriber registered on one instance still hears
    // notices/audit changes emitted by another instance operating on the same underlying data.
    var subs = db._subs || (db._subs = []), noticeSubs = db._noticeSubs || (db._noticeSubs = []);
    var emit = function (row) { subs.forEach(function (f) { try { f({ type: 'audit', row: clone(row) }); } catch (e) {} }); };
    function clone(x) { return JSON.parse(JSON.stringify(x)); }
    function iso() { return now().toISOString(); }
    function mnl(iso) { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); }
    function today() { return iso().slice(0, 10); }
    function codeMap() { var m = {}; db.codes.forEach(function (c) { m[c.code] = c; }); return m; }
    function nextId() { db.seq++; return 'QA-' + iso().slice(0, 4) + '-' + String(db.seq).padStart(6, '0'); }
    function log(id, action, detail, by) { db.log.push({ id: db.log.length + 1, audit_id: id, at: iso(), by: by || 'SYSTEM', action: action, detail: detail || null }); }
    function find(id) { var a = db.audits.filter(function (x) { return x.id === id && !x.deleted_at; })[0]; if (!a) throw new Error('Audit ' + id + ' not found'); return a; }
    function contractor(name) { return db.contractors.filter(function (c) { return c.sheet_name === name; })[0] || null; }
    function syncJob(a) {
      if (!a.job_id) return;
      var j = db.jobs.filter(function (x) { return x.id === a.job_id; })[0]; if (!j) return;
      j.qa_audit_id = a.id;
      j.qa_assessment = a.status === 'done' ? (a.assessment || null) : null;
      j.qa_inspected_at = a.status === 'done' ? (a.inspected_at || null) : null;
      j.qa_status = a.status === 'done' ? (a.visit_status || 'VISITED') : (a.status === 'assigned' || a.status === 'in_progress') ? 'ASSIGNED' : 'FOR VISIT';
      var r = a.rectification_id && db.rectifications.filter(function (x) { return x.id === a.rectification_id; })[0];
      if (a.status === 'done' && r) j.qa_status = r.status === 'CLOSED' ? 'CLOSED BY HEAD' : r.status;
    }
    function syncJobRect(r) { if (!r.job_id) return; var j = db.jobs.filter(function (x) { return x.id === r.job_id; })[0]; if (!j) return; j.qa_audit_id = r.last_audit_id; j.qa_status = r.status === 'CLOSED' ? 'CLOSED BY HEAD' : r.status; }
    function nextRectId() { db.rectSeq++; return 'RC-' + iso().slice(0, 4) + '-' + String(db.rectSeq).padStart(6, '0'); }
    function findRect(id) { var r = db.rectifications.filter(function (x) { return x.id === id && !x.deleted_at && (!viewerOrg || x.contractor_org_id === viewerOrg); })[0]; if (!r) throw new Error('Rectification ' + id + ' not found'); return r; }
    function notify(org, rectId, kind) { if (!org) return; db.notices.push({ id: db.notices.length + 1, org_id: org, rectification_id: rectId, kind: kind, created_at: iso(), seen_at: null }); noticeSubs.forEach(function (f) { try { f({ type: 'notice', row: clone(db.notices[db.notices.length - 1]) }); } catch (e) {} }); }
    function joined() { var byA = {}; db.audits.forEach(function (a) { byA[a.id] = a; }); return db.violations.map(function (v) { var a = byA[v.audit_id] || {}; return { audit_id: v.audit_id, code: v.code, contractor_name: a.contractor_name, status: a.status, source: a.source, deleted_at: a.deleted_at, inspected_at: a.inspected_at }; }); }
    function auditTotal(id) { return db.violations.filter(function (v) { return v.audit_id === id; }).reduce(function (s, v) { return s + Core.effectivePenalty(v); }, 0); }
    function rectDays() { return parseInt(db.settings.rect_default_days, 10) || 7; }
    function plusDays(ymd, n) { var d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
    function afterSubmitRect(a, fails, by) {
      if (Core.INSPECTED.indexOf(a.visit_status) < 0) return;   // unlocated / not exist / h.closed never open or close a loop — and never logged
      var r = a.rectification_id ? db.rectifications.filter(function (x) { return x.id === a.rectification_id; })[0] : null;
      var same = !!(r && r.last_audit_id === a.id);   // this audit already advanced the loop once (reopened + resubmitted) — mirrors SQL v_same
      if (r) {
        // choose the ignore action by SOURCE first, exactly like SQL: a reopened original resubmitted later is
        // always rect_ignored_resubmit, even if the loop has since gone terminal — the terminal check only applies
        // to a late re-inspection submit.
        if (a.source !== 'reinspection') { log(a.id, 'rect_ignored_resubmit', { rect: r.id, fails: fails }, by); return; }
        // …except when THIS re-inspection is the one that rectified the loop and now comes back with fails:
        // that is a correction of its own outcome, not a late submit (see qa.after_submit_rect).
        var reopens = r.status === 'RECTIFIED' && same && fails > 0;
        if ((r.status === 'RECTIFIED' || r.status === 'CLOSED') && !reopens) { log(a.id, 'rect_ignored_late_submit', { rect: r.id, status: r.status, fails: fails }, by); return; }
      }
      var nx = Core.rectNext(r ? { status: r.status, cycle: r.cycle } : null, { type: 'submit', visit_status: a.visit_status, fails: fails, reinspection: a.source === 'reinspection', sameAudit: same });
      if (!nx) return;   // only remaining case: no loop yet and the first inspection was GOOD
      if (!r) {
        r = { id: nextRectId(), audit_id: a.id, last_audit_id: a.id, job_id: a.job_id, jo_no: a.jo_no, acct_no: a.acct_no, contractor_name: a.contractor_name, contractor_org_id: a.contractor_org_id,
          subscriber: a.subscriber, address: a.address, barangay: a.barangay, status: nx.status, deadline: plusDays(mnl(iso()), rectDays()), cycle: 1, opened_at: iso(), rectified_at: null,
          closed_by: null, closed_at: null, close_reason: null, created_at: iso(), updated_at: iso(), deleted_at: null, deleted_by: null };
        db.rectifications.push(r); a.rectification_id = r.id; notify(r.contractor_org_id, r.id, 'opened'); log(a.id, 'rect_opened', { rect: r.id, deadline: r.deadline }, by);
      } else if (nx.reopened) {
        // RECTIFIED → FOR RECTIFICATION in place: same cycle, deadline kept, rectified_at cleared. The loop really
        // did change state, so the subcon IS notified here (unlike the v_same path below, which only repeats itself).
        Object.assign(r, { status: 'FOR RECTIFICATION', rectified_at: null, last_audit_id: a.id, updated_at: iso() });
        notify(r.contractor_org_id, r.id, 'opened'); log(a.id, 'rect_resubmit', { rect: r.id, cycle: r.cycle, deadline: r.deadline }, by);
      } else if (nx.rectified) {
        Object.assign(r, { status: 'RECTIFIED', rectified_at: iso(), last_audit_id: a.id, updated_at: iso() }); notify(r.contractor_org_id, r.id, 'rectified'); log(a.id, 'rect_rectified', { rect: r.id, cycle: r.cycle }, by);
      } else {
        // reopened re-inspection resubmitted, still failing: advance in place (no cycle+1, deadline kept) — mirrors SQL v_same.
        // The loop was already FOR RECTIFICATION and the subcon was already notified for it, so no duplicate 'opened' notice.
        Object.assign(r, { status: 'FOR RECTIFICATION', cycle: same ? r.cycle : nx.cycle, last_audit_id: a.id, deadline: same ? r.deadline : plusDays(mnl(iso()), rectDays()), updated_at: iso() });
        if (!same) notify(r.contractor_org_id, r.id, 'opened');
        log(a.id, same ? 'rect_resubmit' : 'rect_cycle', { rect: r.id, cycle: r.cycle, deadline: r.deadline }, by);
      }
      syncJobRect(r);
    }
    function bundle(a) { return { audit: clone(a), items: clone(db.items.filter(function (i) { return i.audit_id === a.id; })), violations: clone(db.violations.filter(function (v) { return v.audit_id === a.id; })), photos: clone(db.photos.filter(function (p) { return p.audit_id === a.id; })) }; }
    function findJob(jo, acct) {
      var hit = db.jobs.filter(function (j) { return !j.deleted_at && jo && (j.job_order_no || '').toUpperCase() === jo; })[0];
      if (!hit && acct) {
        var matches = db.jobs.map(function (j, i) { return { j: j, i: i }; }).filter(function (m) { return !m.j.deleted_at && m.j.ibass_acct_no === acct; });
        matches.sort(function (x, y) {
          var ux = x.j.updated_at || '', uy = y.j.updated_at || '';
          if (ux !== uy) return uy.localeCompare(ux);
          return y.i - x.i;
        });
        hit = matches.length ? matches[0].j : null;
      }
      return hit ? hit.id : null;
    }
    function parseLatLng(s) { var m = /^\s*(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)\s*$/.exec(s || ''); return m ? [parseFloat(m[1]), parseFloat(m[2])] : [null, null]; }
    function newAudit(base) {
      var a = Object.assign({ id: nextId(), source: 'sheet', job_id: null, jo_no: null, acct_no: null, sheet_row_jo: null, contractor_name: null, contractor_org_id: null, kind: null, unmapped: false, rectification_id: null, reinspection_of: null,
        subscriber: null, mobile_no: null, address: null, barangay: null, nap_code: null, port_no: null, serial_no: null, tran_type: null, jo_date_closed: null, installers_text: null, sheet_latlong: null,
        status: 'queued', assigned_to: null, assigned_by: null, assigned_at: null, scheduled_date: null, sequence: null, started_at: null, inspected_at: null, lat: null, lng: null,
        inspector: null, contractor_rep: null, visit_status: null, qa_gc: null, wire: null, assessment: null, found_business: null, old_plan: null, new_plan: null, remarks: null,
        subscriber_signed_name: null, subscriber_signature_path: null, inspector_signature_path: null, total_violations: 0, total_penalty: 0, submit_key: null, reopened_count: 0,
        created_at: iso(), updated_at: iso(), deleted_at: null, deleted_by: null }, base);
      db.audits.push(a); return a;
    }
    function ingest() {
      var n = 0;
      Object.keys(db.sheetRows).sort().forEach(function (jo) {
        var r = db.sheetRows[jo];
        // a sheet row is still pending while no audit carries its JONO *with* a sheet link (a FieldOps audit with that JONO must still be linked + blank-filled)
        if (db.audits.some(function (a) { return a.jo_no === jo && !a.deleted_at && a.sheet_row_jo; })) return;
        var c = contractor(r.comp);
        var linked = db.audits.filter(function (a) { return !a.deleted_at && a.jo_no === jo && !a.sheet_row_jo && a.source !== 'reinspection'; })[0];
        if (!linked) linked = db.audits.filter(function (a) { return !a.deleted_at && a.source === 'fieldops' && !a.jo_no && a.acct_no && a.acct_no === r.acct_no; })
          .sort(function (x, y) {
            var dx = Math.abs(new Date(x.jo_date_closed || r.jo_date_closed || 0) - new Date(r.jo_date_closed || x.jo_date_closed || 0));
            var dy = Math.abs(new Date(y.jo_date_closed || r.jo_date_closed || 0) - new Date(r.jo_date_closed || y.jo_date_closed || 0));
            if (dx !== dy) return dx - dy;
            return (y.created_at || '').localeCompare(x.created_at || '');
          })[0];
        if (linked) {
          var hadName = linked.contractor_name != null;
          linked.jo_no = linked.jo_no || jo; linked.sheet_row_jo = jo;
          linked.acct_no = linked.acct_no || r.acct_no; linked.tran_type = linked.tran_type || r.tran_type;
          linked.contractor_name = linked.contractor_name || r.comp; linked.kind = linked.kind || (c ? c.kind : null); linked.contractor_org_id = linked.contractor_org_id || (c ? c.org_id : null); linked.unmapped = hadName ? linked.unmapped : (!!r.comp && !c);
          linked.nap_code = linked.nap_code || r.nap_code; linked.port_no = linked.port_no || r.port_no; linked.serial_no = linked.serial_no || r.serial_no;
          linked.installers_text = linked.installers_text || [r.driver, r.tech, r.tech2].filter(Boolean).join(' / ') || null; linked.jo_date_closed = linked.jo_date_closed || r.jo_date_closed;
          linked.sheet_latlong = linked.sheet_latlong || r.sheet_latlong;
          linked.subscriber = linked.subscriber || r.subscriber_name; linked.mobile_no = linked.mobile_no || r.mobile_no; linked.address = linked.address || r.complete_address; linked.barangay = linked.barangay || r.barangay;
          log(linked.id, 'sheet_linked', { jo_no: jo }); return;
        }
        var legacy = Core.hasLegacyQa(r);
        var status = legacy ? 'done' : Core.initialStatus(r, c, db.settings.initial_cutoff);
        var ll = parseLatLng(r.sheet_latlong);
        var a = newAudit({ source: legacy ? 'sheet_legacy' : 'sheet', job_id: findJob(jo, r.acct_no), jo_no: jo, acct_no: r.acct_no, sheet_row_jo: jo, contractor_name: r.comp, contractor_org_id: c ? c.org_id : null,
          kind: c ? c.kind : null, unmapped: !c, subscriber: r.subscriber_name, mobile_no: r.mobile_no, address: r.complete_address, barangay: r.barangay, nap_code: r.nap_code, port_no: r.port_no, serial_no: r.serial_no,
          tran_type: r.tran_type, jo_date_closed: r.jo_date_closed, installers_text: [r.driver, r.tech, r.tech2].filter(Boolean).join(' / ') || null, sheet_latlong: r.sheet_latlong, status: status,
          inspected_at: legacy ? ((r.sheet_date_qa || today()) + 'T08:00:00.000Z') : null, lat: ll[0], lng: ll[1], inspector: legacy ? r.sheet_inspected_by : null,
          visit_status: legacy ? (Core.VISIT.indexOf(r.sheet_visited) >= 0 ? r.sheet_visited : 'VISITED') : null,
          qa_gc: legacy && Core.QAGC.indexOf(r.sheet_qa_gc) >= 0 ? r.sheet_qa_gc : null, wire: legacy && Core.WIRE.indexOf(r.sheet_wire) >= 0 ? r.sheet_wire : null,
          assessment: legacy && (ASSESS.indexOf(r.sheet_assessment) >= 0 || r.sheet_assessment === 'RECTIFIED') ? r.sheet_assessment : null,
          remarks: legacy ? ([r.sheet_others, r.sheet_remarks].filter(Boolean).join(' · ') || null) : null });
        syncJob(a); log(a.id, legacy ? 'imported_legacy' : 'created', { source: 'sheet', status: status, comp: r.comp }); emit(a); n++;
      });
      return n;
    }
    function completeJob(job) {
      if (!db.jobs.some(function (j) { return j.id === job.id; })) db.jobs.push(job);
      var jo = (job.job_order_no || '').toUpperCase() || null, acct = job.ibass_acct_no || null;
      // spec-mandated dedup (mirrors qa.on_job_completed). Final-review note: matching on acct_no ALONE means a transfer / re-install
      // on the same account will not get a second audit — accepted for phase A/B, revisit in phase C.
      if (db.audits.some(function (a) { return !a.deleted_at && (a.job_id === job.id || (jo && a.jo_no === jo) || (acct && a.acct_no === acct)); })) return null;
      var c = contractor(job.assigned_org_code || 'AHBA');
      var closed = (job.completed_at || iso()).slice(0, 10);
      var a = newAudit({ source: 'fieldops', job_id: job.id, jo_no: jo, acct_no: acct, contractor_name: c ? c.sheet_name : (job.assigned_org_code || null), kind: c ? c.kind : null, unmapped: !c,
        subscriber: job.subscriber || null, mobile_no: job.primary_no || null, address: job.address || null, barangay: job.brgy || job.area || null, jo_date_closed: closed,
        installers_text: [job.crew_driver, job.crew_tech1, job.crew_tech2].filter(Boolean).join(' / ') || null, status: Core.initialStatus({ jo_date_closed: closed }, c, db.settings.initial_cutoff) });
      syncJob(a); log(a.id, 'created', { source: 'fieldops', status: a.status }); emit(a); return a;
    }
    function bump(a) { a.updated_at = iso(); emit(a); return clone(a); }
    function inspectorExists(u) { return db.inspectors.some(function (i) { return i.username === u; }); }

    var api = {
      // ----- inspector -----
      listMyAudits: function (username) {
        var cutoff = new Date(now().getTime() - 30 * 86400000).toISOString();
        return Promise.resolve(db.audits.filter(function (a) { return !a.deleted_at && a.assigned_to === username && (a.status === 'assigned' || a.status === 'in_progress' || (a.status === 'done' && a.inspected_at >= cutoff)); })
          .sort(function (x, y) { return (x.scheduled_date || '').localeCompare(y.scheduled_date || '') || (x.sequence || 0) - (y.sequence || 0); }).map(clone));
      },
      startAudit: function (id, pos) {
        var a = find(id); pos = pos || {};
        if (a.status !== 'assigned' && a.status !== 'in_progress') return Promise.reject(new Error('Audit ' + id + ' cannot be started'));
        var first = !a.started_at;
        a.status = 'in_progress'; a.started_at = a.started_at || iso(); if (pos.lat != null) a.lat = pos.lat; if (pos.lng != null) a.lng = pos.lng; a.inspector = a.inspector || a.assigned_to;
        syncJob(a); if (first) log(id, 'started', { lat: pos.lat, lng: pos.lng }, a.assigned_to); return Promise.resolve(bump(a));
      },
      uploadPhoto: function (id, blob, meta) {
        meta = meta || {}; var safe = String(meta.label || 'photo').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
        var path = 'qa/' + id + '/' + safe + '_' + now().getTime() + '_' + Math.floor(rng() * 1e6) + '.jpg'; db.blobs[path] = blob; return Promise.resolve({ path: path });
      },
      uploadSignature: function (id, who, blob) { var path = 'qa/' + id + '/sig_' + who + '_' + now().getTime() + '.png'; db.blobs[path] = blob; return Promise.resolve({ path: path }); },
      submitAudit: function (id, p) {
        try {
          var a = find(id); p = p || {};
          if (!p.submit_key) throw new Error('submit_key required');
          if (a.status === 'done' && a.submit_key === p.submit_key) return Promise.resolve({ ok: true, audit: clone(a), duplicate: true });
          if (a.status !== 'assigned' && a.status !== 'in_progress') throw new Error('Audit ' + id + ' is ' + a.status + ' — not submittable');
          var errs = Core.validateSubmission(p, db.checklist.filter(function (c) { return c.active; }));
          if (errs.length) throw new Error(errs.join(' '));
          var cmPre = codeMap();
          var inspected = Core.INSPECTED.indexOf(p.visit_status) >= 0;
          if (inspected) {
            (p.violations || []).forEach(function (v) { if (!cmPre[v.code]) throw new Error('Unknown violation code ' + v.code); });
          }
          db.items = db.items.filter(function (i) { return i.audit_id !== id; }); db.violations = db.violations.filter(function (v) { return v.audit_id !== id; });
          db.photos = db.photos.filter(function (x) { return x.audit_id !== id; });
          (p.photos || []).forEach(function (ph) { db.photos.push({ id: db.photos.length + 1, audit_id: id, item_id: ph.item_id || null, path: ph.path, label: ph.label || null, created_at: iso() }); });
          var cm = codeMap(), count = 0, pen = 0, fails = 0;
          if (inspected) {
            fails = (p.items || []).filter(function (i) { return i.result === 'fail'; }).length;
            (p.items || []).forEach(function (i) { db.items.push({ audit_id: id, item_id: i.item_id, result: i.result, remark: i.remark || null }); });
            var prior = joined();
            (p.violations || []).forEach(function (v) {
              var c = cm[v.code]; if (!c) throw new Error('Unknown violation code ' + v.code);
              var off = Core.offenseNo(prior, a.contractor_name, c.code, id, iso());
              var amt = Core.penaltyFor(c, off);   // server-computed only; a client-supplied amount is ignored (override goes through overridePenalty)
              db.violations.push({ id: db.violations.length + 1, audit_id: id, code: c.code, item_id: v.item_id || null, description: v.description || c.description, category: c.category, class: c.class, severity: c.severity, offense_no: off, penalty_amount: amt, penalty_override: null, override_by: null, override_at: null, override_reason: null, photo_path: v.photo_path || null, remark: v.remark || null, created_at: iso() });
              count++; pen += amt || 0;
            });
          }
          var vis = inspected;   // the assessment block only exists for an inspected visit (VISITED / VISITED / NPA) — never carry a stale draft value over
          Object.assign(a, { status: 'done', inspected_at: iso(), submit_key: p.submit_key, lat: p.lat != null ? p.lat : a.lat, lng: p.lng != null ? p.lng : a.lng, inspector: a.inspector || a.assigned_to,
            visit_status: p.visit_status, contractor_rep: p.contractor_rep || null, installers_text: p.installers_text || a.installers_text, wire: vis ? (p.wire || null) : null, qa_gc: vis ? (p.qa_gc || null) : null,
            assessment: vis ? (p.assessment || null) : null, found_business: vis ? (p.found_business || null) : null, old_plan: vis ? (p.old_plan || null) : null, new_plan: vis ? (p.new_plan || null) : null, remarks: p.remarks || null,
            subscriber_signed_name: p.subscriber_signed_name || null, subscriber_signature_path: p.subscriber_signature_path || null, inspector_signature_path: p.inspector_signature_path || null,
            total_violations: count, total_penalty: pen });
          syncJob(a); log(id, 'submitted', { visit: p.visit_status, assessment: a.assessment, violations: count, penalty: pen, fails: fails }, a.assigned_to);
          afterSubmitRect(a, fails, a.assigned_to);
          return Promise.resolve({ ok: true, audit: bump(a) });
        } catch (e) { return Promise.reject(e); }
      },
      getInstallPhotos: function (jobId) { var j = db.jobs.filter(function (x) { return x.id === jobId; })[0]; return Promise.resolve(((j && j.photos) || []).map(function (p) { return { path: p.path, label: p.label, url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="140"><rect width="200" height="140" fill="%23cfd8d3"/><text x="10" y="75" font-size="14">' + encodeURIComponent(p.label || 'photo') + '</text></svg>' }; })); },
      // ----- head -----
      listAudits: function (f) {
        f = f || {}; var page = f.page || 1, size = f.pageSize || 50, q = (f.q || '').toUpperCase();
        var rows = db.audits.filter(function (a) {
          if (a.deleted_at) return false;
          if (f.status && f.status.length && f.status.indexOf(a.status) < 0) return false;
          if (f.contractor && a.contractor_name !== f.contractor) return false;
          if (f.kind && a.kind !== f.kind) return false;
          if (f.barangay && a.barangay !== f.barangay) return false;
          if (f.district && Core.barangaysOf(f.district).indexOf(a.barangay) < 0) return false;
          if (f.from && (a.jo_date_closed || '') < f.from) return false;
          if (f.to && (a.jo_date_closed || '9999') > f.to) return false;
          if (f.inspector && a.inspector !== f.inspector && a.assigned_to !== f.inspector) return false;
          if (f.assessment && a.assessment !== f.assessment) return false;
          if ((f.qfrom || f.qto) && !a.inspected_at) return false;
          if (f.qfrom && a.inspected_at && mnl(a.inspected_at) < f.qfrom) return false;
          if (f.qto && a.inspected_at && mnl(a.inspected_at) > f.qto) return false;
          if (q && [a.id, a.subscriber, a.address, a.jo_no, a.acct_no].join(' ').toUpperCase().indexOf(q) < 0) return false;
          return true;
        }).sort(function (x, y) { return (y.jo_date_closed || '').localeCompare(x.jo_date_closed || '') || x.id.localeCompare(y.id); });
        return Promise.resolve({ rows: rows.slice((page - 1) * size, page * size).map(clone), total: rows.length });
      },
      assignAudits: function (ids, o) {
        o = o || {}; if (!inspectorExists(o.inspector)) return Promise.reject(new Error('Not a QA inspector account: ' + o.inspector));
        var n = 0, seq = o.startSeq == null ? 1 : o.startSeq;
        ids.forEach(function (id) { var a = find(id); if (['pool', 'queued', 'assigned', 'in_progress'].indexOf(a.status) < 0) return;
          var prev = a.assigned_to; var same = prev === o.inspector;
          Object.assign(a, { status: same && a.status === 'in_progress' ? 'in_progress' : 'assigned', assigned_to: o.inspector, assigned_by: o.by || 'HEAD', assigned_at: iso(), scheduled_date: o.date, sequence: seq++, started_at: same ? a.started_at : null, inspector: same ? a.inspector : null });
          syncJob(a); log(id, prev && prev !== o.inspector ? 'reassigned' : 'assigned', { from: prev, to: o.inspector, date: o.date, seq: a.sequence }, o.by); bump(a); n++; });
        return Promise.resolve(n);
      },
      unassignAudits: function (ids, o) { var n = 0; ids.forEach(function (id) { var a = find(id); if (a.status !== 'assigned' && a.status !== 'in_progress') return;
        Object.assign(a, { status: 'queued', assigned_to: null, assigned_by: null, assigned_at: null, scheduled_date: null, sequence: null, started_at: null });
        if (a.source === 'reinspection' && a.rectification_id) { a.deleted_at = iso(); a.deleted_by = (o || {}).by || 'HEAD';
          var r = db.rectifications.filter(function (x) { return x.id === a.rectification_id; })[0]; var nx = r && Core.rectNext(r, { type: 'unassign' }); if (nx) { r.status = nx.status; r.updated_at = iso(); syncJobRect(r); } }
        else syncJob(a);
        log(id, 'unassigned', null, (o || {}).by); bump(a); n++; }); return Promise.resolve(n); },
      queuePool: function (ids, o) { var n = 0; ids.forEach(function (id) { var a = find(id); if (a.status !== 'pool') return; a.status = 'queued'; log(id, 'queued_manual', null, (o || {}).by); bump(a); n++; }); return Promise.resolve(n); },
      sampleInhouse: function (o) {
        o = o || {}; var pool = db.audits.filter(function (a) { return !a.deleted_at && a.status === 'pool' && a.kind === 'inhouse' && a.jo_date_closed >= o.from && a.jo_date_closed <= o.to; });
        var pick = Core.pickSample(pool, o.pct, rng); pick.forEach(function (a) { a.status = 'queued'; log(a.id, 'queued_sample', { pct: o.pct, from: o.from, to: o.to }, o.by); bump(a); });
        return Promise.resolve(pick.length);
      },
      getAudit: function (id) { var a = find(id); var out = bundle(a); out.log = clone(db.log.filter(function (l) { return l.audit_id === id; }));
        out.rectification = a.rectification_id ? clone(db.rectifications.filter(function (r) { return r.id === a.rectification_id; })[0] || null) : null;
        var pv = a.reinspection_of && db.audits.filter(function (x) { return x.id === a.reinspection_of; })[0]; out.previous = pv ? bundle(pv) : null; return Promise.resolve(out); },
      reopenAudit: function (id, o) { var a = find(id); if (a.status !== 'done' || !a.assigned_to) return Promise.reject(new Error('Audit ' + id + ' is not done or has no inspector')); a.status = 'in_progress'; a.reopened_count++; a.submit_key = null; syncJob(a); log(id, 'reopened', { reason: (o || {}).reason }, (o || {}).by); return Promise.resolve(bump(a)); },
      listInspectors: function () { return Promise.resolve(clone(db.inspectors)); },
      board: function (date) { return Promise.resolve(db.audits.filter(function (a) { return !a.deleted_at && a.scheduled_date === date && a.assigned_to; }).sort(function (x, y) { return (x.assigned_to || '').localeCompare(y.assigned_to || '') || (x.sequence || 0) - (y.sequence || 0); }).map(clone)); },
      weeklyReport: function (from, to) {
        var done = db.audits.filter(function (a) { return !a.deleted_at && a.status === 'done' && a.inspected_at && a.inspected_at.slice(0, 10) >= from && a.inspected_at.slice(0, 10) <= to; });
        var sheet = Object.values(db.sheetRows).filter(function (r) { return r.jo_date_closed >= from && r.jo_date_closed <= to; });
        var s = Core.weeklySummary(done, db.violations, db.items, sheet, db.checklist);
        var cm = codeMap(); s.codes.forEach(function (c) { c.category = (cm[c.code] || {}).category || ''; });
        return Promise.resolve(s);
      },
      getConfig: function () { return Promise.resolve({ checklist: clone(db.checklist).sort(function (a, b) { return a.sort_order - b.sort_order; }), codes: clone(db.codes), contractors: clone(db.contractors), quickRemarks: clone(db.quickRemarks), settings: clone(db.settings) }); },
      // labels only — the ONE config read a subcon console user is allowed (policy qa_checklist_subcon); getConfig is not.
      getChecklist: function () { return Promise.resolve(clone(db.checklist).sort(function (a, b) { return a.sort_order - b.sort_order; })); },
      saveChecklistItem: function (item) { var ex = db.checklist.filter(function (c) { return c.id === item.id; })[0]; if (ex) Object.assign(ex, item); else db.checklist.push(Object.assign({ id: db.checklist.length + 1, active: true, photo_required: false, sort_order: db.checklist.length + 1 }, item)); return Promise.resolve(clone(ex || db.checklist[db.checklist.length - 1])); },
      saveCode: function (code) { var ex = codeMap()[code.code]; if (ex) Object.assign(ex, code); else db.codes.push(Object.assign({ active: true }, code)); return Promise.resolve(clone(ex || code)); },
      saveContractor: function (c) { var ex = contractor(c.sheet_name); if (ex) Object.assign(ex, c); else db.contractors.push(Object.assign({ active: true, kind: 'subcon', coverage: 'all', org_id: null, display_name: c.sheet_name }, c)); return Promise.resolve(clone(ex || c)); },
      saveSetting: function (k, v) { db.settings[k] = String(v); return Promise.resolve({ key: k, value: String(v) }); },
      syncStatus: function () { var un = {}; db.audits.forEach(function (a) { if (a.unmapped && !a.deleted_at) un[a.contractor_name] = 1; }); return Promise.resolve({ last_sync_at: db.settings.last_sync_at, last_sync_rows: db.settings.last_sync_rows, unmapped: Object.keys(un) }); },
      importRows: function (rows) {
        var up = 0; (rows || []).forEach(function (raw) { var r = Core.normalizeSheetRow(raw); if (!r) return; var ex = db.sheetRows[r.jo_no]; db.sheetRows[r.jo_no] = Object.assign(ex || { first_seen_at: iso() }, r, { raw: raw, updated_at: iso() }); up++; });
        var n = ingest(); db.settings.last_sync_at = iso(); db.settings.last_sync_rows = String(up);
        return Promise.resolve({ upserted: up, audits_created: n });
      },
      subscribe: function (cb) { subs.push(cb); return function () { var i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); }; },
      photoUrl: function (path) {
        var b = db.blobs[path];
        if (b && typeof URL !== 'undefined' && URL.createObjectURL && typeof Blob !== 'undefined' && b instanceof Blob && b.size > 10) return Promise.resolve(URL.createObjectURL(b));
        return Promise.resolve('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="%23dfe7e2"/><text x="12" y="85" font-size="12">' + encodeURIComponent(path.split('/').pop()) + '</text></svg>');
      },
      // ----- phase C: rectification loop -----
      listRectifications: function (f) {
        f = f || {}; var page = f.page || 1, size = f.pageSize || 50, q = (f.q || '').toUpperCase(), td = mnl(iso());
        var rows = db.rectifications.filter(function (r) {
          if (r.deleted_at) return false;
          if (viewerOrg && r.contractor_org_id !== viewerOrg) return false;
          if (f.org_id && r.contractor_org_id !== f.org_id) return false;
          if (f.status && f.status.length && f.status.indexOf(r.status) < 0) return false;
          if (f.contractor && r.contractor_name !== f.contractor) return false;
          if (f.district && Core.barangaysOf(f.district).indexOf(r.barangay) < 0) return false;
          if (f.overdue && !Core.isOverdue(r, td)) return false;
          if (q && [r.id, r.jo_no, r.acct_no, r.subscriber, r.address].join(' ').toUpperCase().indexOf(q) < 0) return false;
          return true;
        }).sort(function (x, y) { return (x.deadline || '').localeCompare(y.deadline || '') || x.id.localeCompare(y.id); });
        return Promise.resolve({ rows: rows.slice((page - 1) * size, page * size).map(function (r) { var c = clone(r); c.overdue = Core.isOverdue(r, td); return c; }), total: rows.length });
      },
      getRectification: function (id) {
        try { var r = findRect(id);
          // head also sees retired re-inspection visits (deleted_at set) — mirrors SQL rectification_bundle
          var list = db.audits.filter(function (a) { return a.rectification_id === id && (!viewerOrg || !a.deleted_at); })
            .sort(function (x, y) { return (x.created_at || '').localeCompare(y.created_at || '') || x.id.localeCompare(y.id); });
          var out = { rect: clone(r), audits: list.map(bundle) }; out.rect.overdue = Core.isOverdue(r, mnl(iso()));
          if (viewerOrg) out.audits.forEach(function (b) {
            ['subscriber_signature_path', 'inspector_signature_path', 'subscriber_signed_name', 'lat', 'lng', 'sheet_latlong', 'submit_key', 'contractor_rep', 'mobile_no'].forEach(function (k) { delete b.audit[k]; });
            b.violations.forEach(function (v) { delete v.override_by; });
            b.photos = b.photos.filter(function (p) { return b.items.some(function (i) { return i.item_id === p.item_id && i.result === 'fail'; }); });
          });
          return Promise.resolve(out); } catch (e) { return Promise.reject(e); }
      },
      setRectDeadline: function (id, date, reason, o) {
        try { var r = findRect(id); if (Core.RECT_OPEN.indexOf(r.status) < 0) throw new Error('Rectification ' + id + ' is not open');
          r.deadline = date; r.updated_at = iso(); notify(r.contractor_org_id, r.id, 'deadline'); log(r.last_audit_id, 'rect_deadline', { rect: r.id, deadline: date, reason: reason }, (o || {}).by); return Promise.resolve(clone(r)); } catch (e) { return Promise.reject(e); }
      },
      assignReinspection: function (id, o) {
        try { o = o || {}; var r = findRect(id); if (!inspectorExists(o.inspector)) throw new Error('Not a QA inspector account: ' + o.inspector);
          if (Core.RECT_OPEN.indexOf(r.status) < 0) throw new Error('Rectification ' + id + ' is not open');
          db.audits.filter(function (x) { return x.rectification_id === id && x.source === 'reinspection' && !x.deleted_at && (x.status === 'assigned' || x.status === 'in_progress'); })
            .forEach(function (x) { x.deleted_at = iso(); x.deleted_by = o.by || 'HEAD'; log(x.id, 'reinspection_replaced', { rect: id }, o.by); });
          var prev = db.audits.filter(function (x) { return x.id === r.last_audit_id; })[0];
          var a = newAudit({ source: 'reinspection', job_id: prev.job_id, jo_no: prev.jo_no, acct_no: prev.acct_no, sheet_row_jo: prev.sheet_row_jo, contractor_name: prev.contractor_name, contractor_org_id: prev.contractor_org_id, kind: prev.kind, unmapped: prev.unmapped,
            subscriber: prev.subscriber, mobile_no: prev.mobile_no, address: prev.address, barangay: prev.barangay, nap_code: prev.nap_code, port_no: prev.port_no, serial_no: prev.serial_no, tran_type: prev.tran_type, jo_date_closed: prev.jo_date_closed,
            installers_text: prev.installers_text, sheet_latlong: prev.sheet_latlong, status: 'assigned', assigned_to: o.inspector, assigned_by: o.by || 'HEAD', assigned_at: iso(), scheduled_date: o.date, sequence: o.startSeq == null ? 1 : o.startSeq, rectification_id: id, reinspection_of: prev.id });
          var nx = Core.rectNext(r, { type: 'assign' }); r.status = nx.status; r.updated_at = iso();
          notify(r.contractor_org_id, r.id, 'reinspect'); log(a.id, 'assigned', { to: o.inspector, date: o.date, seq: a.sequence, rect: id, reinspection_of: prev.id }, o.by); syncJobRect(r);
          return Promise.resolve(bump(a)); } catch (e) { return Promise.reject(e); }
      },
      closeRectification: function (id, reason, o) {
        try { var r = findRect(id); if (!(reason || '').trim()) throw new Error('Reason required'); if (Core.RECT_OPEN.indexOf(r.status) < 0) throw new Error('Rectification ' + id + ' is not open');
          Object.assign(r, { status: 'CLOSED', closed_by: (o || {}).by || 'HEAD', closed_at: iso(), close_reason: reason, updated_at: iso() });
          db.audits.filter(function (x) { return x.rectification_id === id && x.source === 'reinspection' && !x.deleted_at && (x.status === 'assigned' || x.status === 'in_progress'); }).forEach(function (x) { x.deleted_at = iso(); x.deleted_by = r.closed_by; });
          notify(r.contractor_org_id, r.id, 'closed'); log(r.last_audit_id, 'rect_closed', { rect: id, reason: reason }, r.closed_by); syncJobRect(r); return Promise.resolve(clone(r)); } catch (e) { return Promise.reject(e); }
      },
      overridePenalty: function (vid, amount, reason, o) {
        try { if (!(reason || '').trim()) throw new Error('Reason required'); var v = db.violations.filter(function (x) { return x.id === vid; })[0]; if (!v) throw new Error('Violation ' + vid + ' not found');
          // mirrors qa.override_penalty: guard BEFORE writing — an override on a draft audit is wiped by the next
          // submit (which re-inserts the violation rows), and one on a retired audit bills a withdrawn inspection.
          var a = db.audits.filter(function (x) { return x.id === v.audit_id; })[0];
          if (!a || a.status !== 'done' || a.deleted_at) throw new Error('Audit ' + v.audit_id + ' is not done');
          Object.assign(v, { penalty_override: amount == null ? null : Number(amount), override_by: (o || {}).by || 'HEAD', override_at: iso(), override_reason: reason });
          a.total_penalty = auditTotal(a.id); log(a.id, 'penalty_override', { violation: v.id, code: v.code, amount: amount, reason: reason }, v.override_by); bump(a);
          return Promise.resolve({ ok: true, violation: clone(v), total_penalty: a.total_penalty }); } catch (e) { return Promise.reject(e); }
      },
      offensePreview: function (contractor, codes) {
        var prior = joined(), cm = codeMap(), out = {};
        (codes || []).forEach(function (code) { var c = cm[code]; if (!c) return; var n = Core.offenseNo(prior, contractor, code, null, iso()); out[code] = { offense_no: n, penalty_amount: Core.penaltyFor(c, n), penalty_text: c.penalty_text }; });
        return Promise.resolve(out);
      },
      recomputeOffenses: function () {
        var cm = codeMap(), nA = 0, nV = 0;
        db.audits.filter(function (a) { return a.status === 'done' && !a.deleted_at && a.source !== 'sheet_legacy'; }).sort(function (x, y) { return (x.inspected_at || '').localeCompare(y.inspected_at || '') || x.id.localeCompare(y.id); })
          .forEach(function (a) { var prior = joined().filter(function (v) { return v.inspected_at && v.inspected_at < a.inspected_at; });
            var n = 0;
            db.violations.filter(function (v) { return v.audit_id === a.id; }).forEach(function (v) { var lvl = Core.offenseNo(prior, a.contractor_name, v.code, a.id, a.inspected_at); v.offense_no = lvl; v.penalty_amount = Core.penaltyFor(cm[v.code], lvl); n++; nV++; });
            a.total_penalty = auditTotal(a.id); log(a.id, 'offenses_recomputed', { violations: n }); nA++; });
        return Promise.resolve({ audits: nA, violations: nV });
      },
      monthlyScorecard: function (month) {
        var m0 = month.slice(0, 7), pm = new Date(month.slice(0, 7) + '-01T00:00:00Z'); pm.setUTCMonth(pm.getUTCMonth() - 1); var p0 = pm.toISOString().slice(0, 7);
        var nm = new Date(month.slice(0, 7) + '-01T00:00:00Z'); nm.setUTCMonth(nm.getUTCMonth() + 1); var m1 = nm.toISOString().slice(0, 10);
        var inMonth = function (ts, ym) { return !!ts && mnl(ts).slice(0, 7) === ym; };
        var done = db.audits.filter(function (a) { return !a.deleted_at && a.status === 'done' && a.source !== 'reinspection'; });
        var names = {}; db.contractors.forEach(function (c) { if (c.active) names[c.sheet_name] = c.kind; }); done.forEach(function (a) { if (a.contractor_name && inMonth(a.inspected_at, m0) && !names[a.contractor_name]) names[a.contractor_name] = a.kind || 'subcon'; });
        var sheet = Object.values(db.sheetRows);
        var rows = Object.keys(names).map(function (n) {
          var ins = done.filter(function (a) { return a.contractor_name === n && inMonth(a.inspected_at, m0); }), prev = done.filter(function (a) { return a.contractor_name === n && inMonth(a.inspected_at, p0); });
          var ids = {}; ins.forEach(function (a) { ids[a.id] = 1; }); var pids = {}; prev.forEach(function (a) { pids[a.id] = 1; });
          var viol = db.violations.filter(function (v) { return ids[v.audit_id]; }), pviol = db.violations.filter(function (v) { return pids[v.audit_id]; });
          var items = db.items.filter(function (i) { return ids[i.audit_id]; }), pitems = db.items.filter(function (i) { return pids[i.audit_id]; });
          var byItem = {}; items.forEach(function (i) { var k = byItem[i.item_id] = byItem[i.item_id] || { pass: 0, fail: 0 }; if (i.result === 'pass') k.pass++; if (i.result === 'fail') k.fail++; });
          var codes = {}; viol.forEach(function (v) { codes[v.code] = (codes[v.code] || 0) + 1; });
          var rect = db.rectifications.filter(function (r) { return !r.deleted_at && r.contractor_name === n && inMonth(r.opened_at, m0); });
          var openEnd = db.rectifications.filter(function (r) { return !r.deleted_at && r.contractor_name === n && r.opened_at < m1 && (!r.rectified_at || r.rectified_at >= m1) && (!r.closed_at || r.closed_at >= m1); });
          var cnt = function (arr, fn) { return arr.filter(fn).length; }, sum = function (arr) { return arr.reduce(function (s, v) { return s + Core.effectivePenalty(v); }, 0); };
          var rectified = rect.filter(function (r) { return r.status === 'RECTIFIED'; });
          return { contractor: n, kind: names[n], closed: cnt(sheet, function (r) { return r.comp === n && (r.jo_date_closed || '').slice(0, 7) === m0; }), inspected: ins.length,
            good: cnt(ins, function (a) { return a.assessment === 'GOOD'; }), rectify: cnt(ins, function (a) { return a.assessment === 'FOR RECTIFY'; }), penalty_n: cnt(ins, function (a) { return a.assessment === 'FOR PENALTY'; }),
            clawback: cnt(ins, function (a) { return a.assessment === 'CLAWBACK'; }), npa: cnt(ins, function (a) { return a.visit_status && a.visit_status !== 'VISITED'; }), items: byItem,
            violations: viol.length, v_minor: cnt(viol, function (v) { return v.severity === 'MINOR'; }), v_major: cnt(viol, function (v) { return v.severity === 'MAJOR'; }), v_critical: cnt(viol, function (v) { return v.severity === 'CRITICAL'; }),
            repeat_offenses: cnt(viol, function (v) { return (v.offense_no || 1) >= 2; }), top_codes: Object.keys(codes).map(function (c) { return { code: c, n: codes[c] }; }).sort(function (x, y) { return y.n - x.n; }).slice(0, 5),
            penalty: sum(viol), overrides: cnt(viol, function (v) { return v.penalty_override != null; }),
            rect_opened: rect.length, rect_on_time: cnt(rectified, function (r) { return mnl(r.rectified_at) <= r.deadline; }), rect_late: cnt(rectified, function (r) { return mnl(r.rectified_at) > r.deadline; }),
            rect_closed: cnt(rect, function (r) { return r.status === 'CLOSED'; }), rect_open_end: openEnd.length, rect_overdue_end: cnt(openEnd, function (r) { return r.deadline < m1; }),
            avg_days_to_rectify: rectified.length ? Math.round(rectified.reduce(function (s, r) { return s + (new Date(r.rectified_at) - new Date(r.opened_at)) / 86400000; }, 0) / rectified.length * 10) / 10 : null,
            prev_closed: cnt(sheet, function (r) { return r.comp === n && (r.jo_date_closed || '').slice(0, 7) === p0; }), prev_inspected: prev.length, prev_penalty: sum(pviol),
            prev_pass: cnt(pitems, function (i) { return i.result === 'pass'; }), prev_fail: cnt(pitems, function (i) { return i.result === 'fail'; }) };
        }).sort(function (x, y) { return (x.kind === 'inhouse') - (y.kind === 'inhouse') || x.contractor.localeCompare(y.contractor); });
        return Promise.resolve(rows);
      },
      // line-item register for the monthly export. Mirrors qa.month_violations(): re-inspection violations are
      // INCLUDED and marked by `source` (the scorecard's aggregates are the ones that exclude them).
      monthViolations: function (month) {
        var m0 = String(month).slice(0, 7), byA = {}; db.audits.forEach(function (a) { byA[a.id] = a; });
        var hits = db.violations.filter(function (v) { var a = byA[v.audit_id]; return !!a && a.status === 'done' && !a.deleted_at && !!a.inspected_at && mnl(a.inspected_at).slice(0, 7) === m0; });
        var s = function (x) { return x == null ? '' : String(x); };
        hits.sort(function (x, y) {
          var ax = byA[x.audit_id], ay = byA[y.audit_id];
          return s(ax.contractor_name).localeCompare(s(ay.contractor_name)) || s(ax.inspected_at).localeCompare(s(ay.inspected_at)) || s(ax.id).localeCompare(s(ay.id)) || (x.id - y.id);
        });
        return Promise.resolve(hits.map(function (v) {
          var a = byA[v.audit_id];
          return { audit_id: a.id, source: a.source, inspected_at: a.inspected_at, contractor_name: a.contractor_name, subscriber: a.subscriber,
            jo_no: a.jo_no, acct_no: a.acct_no, inspector: a.inspector, code: v.code, category: v.category, description: v.description,
            severity: v.severity, offense_no: v.offense_no, penalty_amount: v.penalty_amount, penalty_override: v.penalty_override,
            effective_penalty: Core.effectivePenalty(v), override_reason: v.override_reason, override_at: v.override_at, remark: v.remark };
        }));
      },
      noticesUnseen: function () { return Promise.resolve(db.notices.filter(function (n) { return n.org_id === viewerOrg && !n.seen_at; }).length); },
      markNoticesSeen: function () { var k = 0; db.notices.forEach(function (n) { if (n.org_id === viewerOrg && !n.seen_at) { n.seen_at = iso(); k++; } }); return Promise.resolve(k); },
      subscribeNotices: function (cb) { noticeSubs.push(cb); return function () { var i = noticeSubs.indexOf(cb); if (i >= 0) noticeSubs.splice(i, 1); }; },
      // ----- test / demo hooks -----
      _db: db, _ingest: ingest, _completeJob: completeJob
    };
    if (viewerOrg) {
      // subcon-mode: reject everything an RLS-guarded / head-only RPC would reject for a contractor console user.
      // getConfig/listInspectors are special-cased below (labels-only / empty, mirroring the narrowed config RLS);
      // getChecklist, listRectifications, getRectification, noticesUnseen, markNoticesSeen, subscribeNotices and photoUrl stay as-is.
      var DENIED = ['listMyAudits', 'startAudit', 'uploadPhoto', 'uploadSignature', 'submitAudit', 'getInstallPhotos', 'listAudits', 'assignAudits', 'unassignAudits',
        'queuePool', 'sampleInhouse', 'getAudit', 'reopenAudit', 'board', 'weeklyReport', 'saveChecklistItem', 'saveCode', 'saveContractor', 'saveSetting', 'syncStatus',
        'importRows', 'setRectDeadline', 'assignReinspection', 'closeRectification', 'overridePenalty', 'offensePreview', 'recomputeOffenses', 'monthlyScorecard',
        'monthViolations', 'subscribe'];
      DENIED.forEach(function (k) { api[k] = function () { return Promise.reject(new Error('Not allowed for a subcontractor console user')); }; });
      api.getConfig = function () { return Promise.resolve({ checklist: clone(db.checklist).sort(function (a, b) { return a.sort_order - b.sort_order; }), codes: [], contractors: [], quickRemarks: [], settings: {} }); };
      api.listInspectors = function () { return Promise.resolve([]); };
    }
    var seed = opts.seed;
    if (seed) { db.inspectors = clone(seed.inspectors || []); (seed.jobs || []).forEach(function (j) { db.jobs.push(clone(j)); }); if (seed.sheetRows && seed.sheetRows.length) api.importRows(seed.sheetRows); }
    if (!db.inspectors.length) db.inspectors = [{ username: 'AHBA_QA01', display_name: 'QA Inspector 1' }, { username: 'AHBA_QA02', display_name: 'QA Inspector 2' }];
    return api;
  }
  return { create: create, demoSeed: demoSeed };
});
