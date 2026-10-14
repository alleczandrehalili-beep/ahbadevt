// AHBA FieldOps — NAP monitoring core (pure logic, no I/O). Same rules as supabase/migrations/nap-0N-*.sql: change both together.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NapCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DAY = 86400000;
  var STATUS = {
    AWT: 'Active (w/ tagging)', AWO: 'Active (w/o tagging)', VACANT: 'Vacant',
    RELEASED: 'Released', HILOSS: 'Hi Loss', DEFECTIVE: 'Defective', UNVERIFIED: 'Unverified'
  };
  var PORT_STATUSES = [STATUS.AWT, STATUS.AWO, STATUS.VACANT, STATUS.RELEASED, STATUS.HILOSS, STATUS.DEFECTIVE];
  var DEFAULTS = { freshnessDays: 14, fullMultiplier: 2, gpsFlagM: 50 };

  function opt(o) { var r = {}; for (var k in DEFAULTS) r[k] = (o && o[k] != null) ? o[k] : DEFAULTS[k]; return r; }
  function toMs(v) { return typeof v === 'number' ? v : v instanceof Date ? v.getTime() : Date.parse(v); }
  function isUsable(s) { return s === STATUS.VACANT || s === STATUS.RELEASED; }
  function isOccupied(s) { return s === STATUS.AWT || s === STATUS.AWO; }

  // 'QCY003 LP114 NP6-7-8' -> { prefix:'QCY003 LP114', nps:[6,7,8] }
  function parseStencil(str) {
    var m = /^\s*([A-Z]{3}\d{3} LP\d+) NP(\d+(?:-\d+)*)\s*$/i.exec(String(str || ''));
    if (!m) return null;
    return { prefix: m[1].toUpperCase(), nps: m[2].split('-').map(Number) };
  }

  // ports: the box's port rows [{status, verified_at}]. Same rule as the nap.box_status view. A port is checked when its status is not
  // Unverified and verified_at is a valid date. total = o.total when given (phase 2B: 8 x the box's NAP numbers, because port rows exist
  // only after an audit), else ports.length (boxes with pre-created Unverified rows, like the Bahay Toro pilot).
  //   free        = checked Vacant/Released ports verified within freshnessDays (an old free port does not count)
  //   installable = free > 0
  //   full        = every port checked, all occupied, newest check within freshnessDays x fullMultiplier
  //   issue       = newest check within freshnessDays and a Hi Loss / Defective port
  //   stale       = anything else that was checked; unverified = nothing checked
  function boxStatus(ports, now, o) {
    var c = opt(o), t = toMs(now), all = ports || [], total = o && o.total != null ? o.total : all.length;
    var seen = all.filter(function (p) { return p.status !== STATUS.UNVERIFIED && p.verified_at != null && isFinite(toMs(p.verified_at)); });
    if (!seen.length) return { kind: 'unverified', free: 0, checked: 0, bad: 0, total: total, ageDays: null };
    var age = function (p) { return (t - toMs(p.verified_at)) / DAY; };
    var newest = Math.max.apply(null, seen.map(function (p) { return toMs(p.verified_at); }));
    var ageFrac = (t - newest) / DAY;
    var free = seen.filter(function (p) { return isUsable(p.status) && age(p) <= c.freshnessDays; }).length;
    var bad = seen.filter(function (p) { return p.status === STATUS.HILOSS || p.status === STATUS.DEFECTIVE; }).length;
    var full = seen.length === total && seen.every(function (p) { return isOccupied(p.status); });
    var kind = free > 0 ? 'installable'
      : full && ageFrac <= c.freshnessDays * c.fullMultiplier ? 'full'
      : ageFrac <= c.freshnessDays && bad > 0 ? 'issue'
      : 'stale';
    return { kind: kind, free: free, checked: seen.length, bad: bad, total: total, ageDays: Math.max(0, Math.floor(ageFrac)) };
  }
  // 8 ports per NAP number (nap.box_status.total since phase 2B)
  function boxTotal(npNumbers) { return 8 * (Array.isArray(npNumbers) ? npNumbers.length : 0); }

  // A JO's NAPCODE ('QCY003 LP114 NP6', 'qcy003 lp114 np6 p3' or the full 'QCY003 LP114 NP6-7-8') -> the search_boxes text for its
  // FIRST NAP number and what a matching box must satisfy. null when the code is not a stencil.
  function jobNapQuery(napcode) {
    var p = parseStencil(normStencil(napcode).replace(/ P\d+.*$/, ''));
    if (!p) return null;
    return { q: p.prefix + ' NP' + p.nps[0], prefix: p.prefix, np: p.nps[0] };
  }
  // The box of that NAP number among search results: same LP (prefix + ' NP', so LP11 never matches LP114) and the NAP number listed.
  function matchJobBox(rows, jq) {
    if (!jq) return null;
    return (rows || []).find(function (b) {
      return b && String(b.stencil || '').indexOf(jq.prefix + ' NP') === 0 && Array.isArray(b.np_numbers) && b.np_numbers.indexOf(jq.np) >= 0;
    }) || null;
  }

  // Full NAP flow (phase 7, nap-16): does the saved audit back the FULL NAP close-out? The NAP Details form (declared Full) and the
  // "this job's NAP is deactivated" record do (the server gate accepts both); a "not found" visit does not (open owner decision, DEPLOY-8.md).
  function fullNapOutcome(res, notFound) {
    if (res && res.jo_nap_inactive === true) return true;
    return !!res && !notFound;
  }
  // The deactivated-NAP record needs a JO, the picked (deactivated) NAP, at least one photo and a GPS fix. The server checks the same.
  function validateDeactRecord(o) {
    o = o || {};
    var errors = [];
    if (!o.jobId) errors.push({ code: 'NAP_JOB_REQUIRED', msg: 'A JO is required.' });
    if (!o.boxId) errors.push({ code: 'NAP_BAD_BOX', msg: 'Pick the deactivated NAP.' });
    if (!(o.photos >= 1)) errors.push({ code: 'NAP_PHOTO_REQUIRED', msg: 'Add at least one photo of the spot.' });
    if (!o.gps) errors.push({ code: 'NAP_GPS_REQUIRED', msg: 'GPS is required: turn on location and wait for the fix.' });
    return { ok: errors.length === 0, errors: errors };
  }

  function haversineM(lat1, lng1, lat2, lng2) {
    var R = 6371000, r = Math.PI / 180, dp = (lat2 - lat1) * r, dl = (lng2 - lng1) * r;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // mode 'install' -> installable boxes; 'audit' -> stale + unverified boxes. Nearest first.
  function nearest(boxes, from, mode, limit) {
    if (!from || from.lat == null || from.lng == null) return [];
    var want = mode === 'audit' ? ['stale', 'unverified'] : ['installable'];
    return (boxes || [])
      .filter(function (b) { return want.indexOf(b.kind) >= 0 && b.lat != null && b.lng != null; })
      .map(function (b) { var x = {}; for (var k in b) x[k] = b[k]; x.distance_m = haversineM(from.lat, from.lng, b.lat, b.lng); return x; })
      .sort(function (a, b) { return a.distance_m - b.distance_m; })
      .slice(0, limit == null ? 5 : limit);
  }

  // a: { ports:[{port,status,tag_acct}], photos:number, declaredFull:boolean, jobId?:string }. Server repeats these checks.
  // Errors accumulate in a fixed order: ports, tags, photo, full-has-free, job.
  function validateAudit(a) {
    var errors = [], ports = a.ports || [];
    var nums = {};
    ports.forEach(function (p) { if (Number.isInteger(p.port) && p.port >= 1 && p.port <= 8) nums[p.port] = true; });
    var statusOk = ports.every(function (p) { return PORT_STATUSES.indexOf(p.status) >= 0; });
    var intOk = ports.every(function (p) { return Number.isInteger(p.port); });
    if (ports.length !== 8 || Object.keys(nums).length !== 8 || !statusOk || !intOk)
      errors.push({ code: 'NAP_PORTS_INCOMPLETE', msg: 'Every port from P1 to P8 needs a status.' });
    var noTag = ports.filter(function (p) { return p.status === STATUS.AWT && !String(p.tag_acct || '').trim(); }).map(function (p) { return 'P' + p.port; });
    if (noTag.length) errors.push({ code: 'NAP_TAG_REQUIRED', msg: 'Enter the acct no. on the label of ' + noTag.join(', ') + '.' });
    if (!(a.photos >= 1)) errors.push({ code: 'NAP_PHOTO_REQUIRED', msg: 'At least one photo of the NAP reading is required.' });
    if (a.declaredFull) {
      var free = ports.filter(function (p) { return isUsable(p.status); }).map(function (p) { return 'P' + p.port; });
      if (free.length) errors.push({ code: 'NAP_FULL_HAS_FREE', msg: 'Not a Full NAP: ' + free.join(', ') + ' is free. Install there or change the audit.' });
      if (!String(a.jobId == null ? '' : a.jobId).trim()) errors.push({ code: 'NAP_JOB_REQUIRED', msg: 'A JO is required for a Full NAP.' });
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function gpsFlag(distanceM, o) { return distanceM != null && distanceM > opt(o).gpsFlagM; }

  // ---------- dispatch helpers ----------
  function normStencil(s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toUpperCase(); }

  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function iso(y, m, d) {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
    var t = new Date(Date.UTC(y, m - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return '';
    return t.toISOString().slice(0, 10);
  }
  function parseDueDate(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) {
      if (isNaN(v)) return '';
      // SheetJS (cellDates) returns LOCAL-midnight Dates, sometimes up to <60s early (tz quirks). Add 59s (NOT 12h: that
      // would roll 23:59 over into the next day), then read LOCAL fields. 12h was requested but contradicts the 23:59 case.
      var d = new Date(v.getTime() + 59 * 1000);
      return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
    if (typeof v === 'number') {
      if (!(v > 20000 && v < 80000)) return '';
      return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
    }
    var s = String(v).trim(), m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) return iso(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) return iso(+m[3], +m[1], +m[2]);
    if ((m = /^(\d{1,2})-([A-Za-z]{3})[A-Za-z]*-(\d{2}|\d{4})$/.exec(s))) {
      var mo = MONTHS[m[2].toLowerCase()], y = +m[3]; if (y < 100) y += 2000;
      return mo ? iso(y, mo, +m[1]) : '';
    }
    return '';
  }

  // grid: array of arrays. Header row optional (a cell named stencil / nap...). Returns rows ready for nap.dispatch_match.
  function parseDispatchRows(grid) {
    var rows = [], skipped = 0, warnings = [];
    var data = (grid || []).filter(function (r) { return r && r.some(function (c) { return String(c == null ? '' : c).trim() !== ''; }); });
    var si = 0, ti = 1, di = 2, start = 0;
    var STENCIL_H = /^(nap[ _]?stencil|stencil|nap([ _]?name)?)$/i;
    if (data.length && data[0].some(function (c) { return STENCIL_H.test(String(c == null ? '' : c).trim()); })) {
      var h = data[0].map(function (c) { return String(c == null ? '' : c).trim(); });
      si = h.findIndex(function (c) { return STENCIL_H.test(c); });
      ti = h.findIndex(function (c) { return /^team$/i.test(c); });
      di = h.findIndex(function (c) { return /^(due|due[ _]?date|date|date[ _]?activity|petsa)$/i.test(c); });
      start = 1;
      if (ti < 0 && di < 0) warnings.push('The list has a header but no team or due column was recognized (use TEAM and DUE DATE / DATE ACTIVITY). Rows have no team.');
      else if (ti < 0) warnings.push('No TEAM column recognized in the header. Rows have no team.');
    }
    for (var i = start; i < data.length; i++) {
      var r = data[i], st = normStencil(si >= 0 ? r[si] : '');
      if (!st) { skipped++; continue; }
      var raw = di >= 0 ? r[di] : '', due = parseDueDate(raw);
      if (String(raw == null ? '' : raw).trim() !== '' && !due) warnings.push('Cannot read the date "' + raw + '" in ' + st);
      rows.push({ stencil: st, team: ti >= 0 && r[ti] != null ? String(r[ti]).trim().toUpperCase() : '', due: due });
    }
    return { rows: rows, skipped: skipped, warnings: warnings };
  }

  function splitDelimited(text, delim) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\r' || ch === '\n') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    row.push(cell); rows.push(row);
    return rows;
  }
  function parseDispatchText(text) {
    var t = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    if (!t.trim()) return { rows: [], skipped: 0, warnings: [] };
    var first = t.split(/\r\n|\n|\r/).find(function (l) { return l.trim() !== ''; }) || '';
    var unq = first.replace(/"[^"]*("|$)/g, '');  // ignore delimiters inside double quotes
    var count = function (c) { return unq.split(c).length - 1; };
    var delim = count('\t') > 0 ? '\t' : count(',') >= count(';') && count(',') > 0 ? ',' : count(';') > 0 ? ';' : ',';
    return parseDispatchRows(splitDelimited(t, delim));
  }

  // Mirrors the SQL rule in nap.submit_audit (geo block). accuracyM / distanceM in meters.
  function geoDecision(o) {
    o = o || {};
    var c = { accMaxM: 30, moveMaxM: 300, refineM: 50, minMoveM: 3 };
    for (var k in c) if (o[k] != null) c[k] = o[k];
    if (o.accuracyM == null || !(o.accuracyM >= 0)) return { action: 'none', reason: 'no_accuracy' };
    if (o.accuracyM > c.accMaxM) return { action: 'none', reason: 'low_accuracy' };
    if (!o.hasCoords) return { action: 'applied', reason: 'no_coords' };
    if (typeof o.distanceM !== 'number' || !isFinite(o.distanceM)) return { action: 'none', reason: 'no_distance' };
    if (o.distanceM < c.minMoveM) return { action: 'none', reason: 'no_change' };
    if (o.distanceM <= c.refineM) return { action: 'applied', reason: 'refine' };
    if (o.distanceM <= c.moveMaxM) return { action: 'moved', reason: 'moved' };
    return { action: 'proposed', reason: 'too_far' };
  }

  function within(boxes, from, radiusM) {
    return (boxes || [])
      .filter(function (b) { return b && b.lat != null && b.lng != null; })
      .map(function (b) { var x = {}; for (var k in b) x[k] = b[k]; x.distance_m = haversineM(from.lat, from.lng, b.lat, b.lng); return x; })
      .filter(function (b) { return b.distance_m <= radiusM; })
      .sort(function (a, b) { return a.distance_m - b.distance_m; });
  }
  function parseLatLng(text) {
    var m = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(String(text == null ? '' : text));
    if (!m) return null;
    var lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    if (!(lat >= 4 && lat <= 22 && lng >= 116 && lng <= 128)) return null;
    return { lat: lat, lng: lng };
  }

  return { STATUS: STATUS, PORT_STATUSES: PORT_STATUSES, DEFAULTS: DEFAULTS, isUsable: isUsable, isOccupied: isOccupied,
    parseStencil: parseStencil, boxStatus: boxStatus, haversineM: haversineM, nearest: nearest, validateAudit: validateAudit, gpsFlag: gpsFlag,
    normStencil: normStencil, parseDueDate: parseDueDate, parseDispatchRows: parseDispatchRows, parseDispatchText: parseDispatchText, geoDecision: geoDecision, within: within, parseLatLng: parseLatLng,
    boxTotal: boxTotal, jobNapQuery: jobNapQuery, matchJobBox: matchJobBox, fullNapOutcome: fullNapOutcome, validateDeactRecord: validateDeactRecord };
});
