// AHBA QA Audit — shared pure rules. Loaded by mobile-qa.js, console-qa.js, qa-sim.js AND node tests.
// No DOM, no fetch, no Date.now side effects — every function takes inputs explicitly.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QaCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var VISIT = ['VISITED', 'VISITED / NPA', 'UNLOCATED', 'NOT EXIST', 'H.CLOSED'];
  var ASSESS = ['GOOD', 'FOR RECTIFY', 'FOR PENALTY', 'CLAWBACK'];
  var WIRE = ['STANDARD', 'EXISTING', 'SUBSTANDARD'];
  var QAGC = ['COMPLETED', 'INCOMPLETE', 'NONE'];
  var LEGACY_VISITED = ['VISITED', 'VISITED / NPA', 'UNLOCATED', 'NOT EXIST', 'H.CLOSED', 'GOOD'];

  function defaultAssessment(items) {
    return (items || []).some(function (i) { return i.result === 'fail'; }) ? null : 'GOOD';
  }

  function parsePenalty(text) {
    var out = { l1: null, l2: null, l3: null };
    var re = /OFFENSE LEVEL\s*(\d)\s*:\s*([\s\S]*?)(?=OFFENSE LEVEL\s*\d\s*:|$)/gi, m;
    while ((m = re.exec(String(text || '')))) {
      var lvl = parseInt(m[1], 10), body = m[2].trim();
      var pm = /^(?:FINE OF\s+)?(?:PHP|P|₱)\s*([\d,]+(?:\.\d+)?)(?![\dA-Za-z])/i.exec(body);   // leading amount; trailing qualifiers ("+ WRITTEN WARNING") ignored — same rule as scripts/qa-extract-seed.py
      if (lvl >= 1 && lvl <= 3 && pm) out['l' + lvl] = parseFloat(pm[1].replace(/,/g, ''));
    }
    return out;
  }

  function penaltyFor(codeRow, offenseNo) {
    if (!codeRow) return null;
    var n = Math.max(1, Math.min(3, offenseNo || 1));
    var v = codeRow['penalty_l' + n];          // no fallback to a lower level: a prose level (CLAWBACK, WARNING) is not a peso amount
    return v == null ? null : Number(v);
  }

  function totals(violations, catalogByCode) {
    var count = 0, penalty = 0;
    (violations || []).forEach(function (v) {
      count++;
      var p = v.penalty_amount != null ? Number(v.penalty_amount) : penaltyFor(catalogByCode && catalogByCode[v.code], v.offense_no || 1);
      if (p) penalty += p;
    });
    return { count: count, penalty: penalty };
  }

  function validateSubmission(p, checklist) {
    var errs = [];
    p = p || {};
    if (!p.submit_key) errs.push('Missing submit key.');
    if (VISIT.indexOf(p.visit_status) < 0) errs.push('Visit status is required.');
    var photos = p.photos || [];
    if (p.visit_status !== 'VISITED') {
      if (!photos.length) errs.push('A location photo is required when the subscriber was not visited.');
      if (!(p.remarks || '').trim()) errs.push('Remarks are required when the subscriber was not visited.');
      return errs;
    }
    var items = p.items || [], byItem = {};
    items.forEach(function (i) { byItem[i.item_id] = i; });
    (checklist || []).forEach(function (c) {
      var it = byItem[c.id];
      if (!it || ['pass', 'fail', 'na'].indexOf(it.result) < 0) errs.push('Checklist item "' + c.label + '" has no answer.');
    });
    var fails = items.filter(function (i) { return i.result === 'fail'; });
    fails.forEach(function (f) {
      var label = ((checklist || []).filter(function (c) { return c.id === f.item_id; })[0] || {}).label || ('item ' + f.item_id);
      if (!photos.some(function (ph) { return ph.item_id === f.item_id; })) errs.push('Failed item "' + label + '" needs a photo.');
      if (!(p.violations || []).some(function (v) { return v.item_id === f.item_id && v.code; })) errs.push('Failed item "' + label + '" needs a violation code.');
    });
    if (ASSESS.indexOf(p.assessment) < 0) errs.push('Assessment is required.');
    if (fails.length && p.assessment === 'GOOD') errs.push('Assessment cannot be GOOD when an item failed.');
    if (WIRE.indexOf(p.wire) < 0) errs.push('Wire status is required.');
    if (QAGC.indexOf(p.qa_gc) < 0) errs.push('QA / GC status is required.');
    if (!(p.subscriber_signed_name || '').trim()) errs.push("Subscriber's name is required.");
    if (!p.subscriber_signature_path) errs.push("Subscriber's signature is required.");
    if (!p.inspector_signature_path) errs.push("Inspector's signature is required.");
    return errs;
  }

  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function ymd(y, m, d) { var mi = +m, di = +d; return mi >= 1 && mi <= 12 && di >= 1 && di <= 31 ? y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0') : null; }
  function toDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
    var s = String(v).trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return ymd(m[1], m[2], m[3]);
    m = /^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);          // "July 30, 2026" / "Jul  21, 2026"
    if (m && MONTHS[m[1].toLowerCase()]) return ymd(m[3], String(MONTHS[m[1].toLowerCase()]), m[2]);
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);                                  // "7/30/2026"
    if (m) return ymd(m[3], m[1], m[2]);
    return null;                                                                   // "July 1" (no year) → unknown
  }
  function up(v) { var s = v == null ? '' : String(v).trim(); return s ? s.toUpperCase() : null; }
  function txt(v) { var s = v == null ? '' : String(v).trim(); return s ? s : null; }

  function normalizeSheetRow(raw) {
    raw = raw || {};
    var jo = up(raw.JONO || raw.jo_no);
    if (!jo) return null;
    return {
      jo_no: jo, acct_no: txt(raw.ACCTNO || raw.acct_no) && String(raw.ACCTNO || raw.acct_no).replace(/\.0$/, ''),
      comp: up(raw.COMP || raw.comp), jo_date_closed: toDate(raw.JODATECLOSED || raw.jo_date_closed),
      ssp_code: up(raw.SSPCODE || raw.ssp_code), subscriber_name: up(raw.SUBSCRIBERNAME || raw.subscriber_name),
      mobile_no: txt(raw.MOBILENO || raw.mobile_no), barangay: up(raw.BARANGAYNAME || raw.barangay),
      complete_address: up(raw.COMPLETEADDRESS || raw.complete_address), tran_type: up(raw.TRANTYPECODE || raw.tran_type),
      nap_code: up(raw.NAPCODE || raw.nap_code), port_no: up(raw.PORTNO || raw.port_no), serial_no: up(raw.SERIALNO || raw.serial_no),
      driver: up(raw.DRIVER || raw.driver), tech: up(raw.TECH || raw.tech), tech2: up(raw['TECH 2'] || raw.tech2),
      sheet_qa_gc: up(raw['QA / GC'] || raw.sheet_qa_gc), sheet_visited: up(raw.VISITED || raw.sheet_visited),
      sheet_date_qa: toDate(raw['DATE QA'] || raw.sheet_date_qa), sheet_latlong: txt(raw.LATLONG || raw.sheet_latlong),
      sheet_wire: up(raw.WIRE || raw.sheet_wire), sheet_others: up(raw.OTHERS || raw.sheet_others),
      sheet_assessment: up(raw.ASSESMENT || raw.ASSESSMENT || raw.sheet_assessment), sheet_inspected_by: up(raw['INSPECTED BY'] || raw.sheet_inspected_by),
      sheet_remarks: txt(raw.REMARKS || raw.sheet_remarks)
    };
  }

  function hasLegacyQa(r) {
    r = r || {};
    return LEGACY_VISITED.indexOf(r.sheet_visited) >= 0 || !!r.sheet_assessment || !!r.sheet_date_qa;
  }

  function initialStatus(row, contractor, cutoff) {
    if (cutoff && row && row.jo_date_closed && row.jo_date_closed < cutoff) return 'pool';
    if (!contractor) return 'queued';
    return (contractor.kind === 'subcon' || contractor.coverage === 'all') ? 'queued' : 'pool';
  }

  function pickSample(rows, pct, rng) {
    rows = (rows || []).slice(); rng = rng || Math.random;
    var n = Math.ceil(rows.length * (Number(pct) || 0) / 100);
    if (n <= 0) return [];
    for (var i = rows.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = rows[i]; rows[i] = rows[j]; rows[j] = t; }
    return rows.slice(0, n);
  }

  function agingBucket(days) { return days <= 7 ? '0-7' : days <= 14 ? '8-14' : days <= 30 ? '15-30' : '31+'; }

  function weeklySummary(audits, violations, items, sheetRows, checklist) {
    var byC = {}, byCode = {}, byInsp = {}, byItem = {}, closed = {};
    (sheetRows || []).forEach(function (r) { closed[r.comp] = (closed[r.comp] || 0) + 1; });
    var done = (audits || []).filter(function (a) { return a.status === 'done'; });
    var doneIds = {};
    done.forEach(function (a) {
      doneIds[a.id] = a;
      var c = byC[a.contractor_name] = byC[a.contractor_name] || { contractor: a.contractor_name, inspected: 0, GOOD: 0, 'FOR RECTIFY': 0, 'FOR PENALTY': 0, CLAWBACK: 0, npa: 0, penalty: 0, closed: closed[a.contractor_name] || 0 };
      c.inspected++;
      if (a.assessment && c[a.assessment] != null) c[a.assessment]++;
      if (a.visit_status && a.visit_status !== 'VISITED') c.npa++;
      c.penalty += Number(a.total_penalty || 0);
      var ins = byInsp[a.inspector || '—'] = byInsp[a.inspector || '—'] || { inspector: a.inspector || '—', inspections: 0, npa: 0 };
      ins.inspections++; if (a.visit_status && a.visit_status !== 'VISITED') ins.npa++;
    });
    (violations || []).forEach(function (v) { if (!doneIds[v.audit_id]) return; var k = byCode[v.code] = byCode[v.code] || { code: v.code, count: 0 }; k.count++; });
    (items || []).forEach(function (i) { if (!doneIds[i.audit_id]) return; var k = byItem[i.item_id] = byItem[i.item_id] || { item_id: i.item_id, pass: 0, fail: 0, na: 0 }; k[i.result] = (k[i.result] || 0) + 1; });
    var labels = {}; (checklist || []).forEach(function (c) { labels[c.id] = c.label; });
    var itemRows = Object.keys(byItem).map(function (k) { var r = byItem[k]; var d = r.pass + r.fail; return { item_id: r.item_id, label: labels[r.item_id] || ('#' + r.item_id), pass: r.pass, fail: r.fail, na: r.na, pass_rate: d ? Math.round(r.pass * 100 / d) : null }; });
    var coverage = Object.keys(closed).map(function (k) { var d = (byC[k] || {}).inspected || 0; return { contractor: k, closed: closed[k], inspected: d, pct: closed[k] ? Math.round(d * 100 / closed[k]) : null }; });
    return {
      contractors: Object.values(byC).sort(function (a, b) { return b.inspected - a.inspected; }),
      items: itemRows, codes: Object.values(byCode).sort(function (a, b) { return b.count - a.count; }),
      inspectors: Object.values(byInsp), coverage: coverage
    };
  }

  return { VISIT: VISIT, ASSESS: ASSESS, WIRE: WIRE, QAGC: QAGC, defaultAssessment: defaultAssessment, parsePenalty: parsePenalty,
           penaltyFor: penaltyFor, totals: totals, validateSubmission: validateSubmission, normalizeSheetRow: normalizeSheetRow,
           hasLegacyQa: hasLegacyQa, initialStatus: initialStatus, pickSample: pickSample, agingBucket: agingBucket,
           weeklySummary: weeklySummary, toDate: toDate };
});

