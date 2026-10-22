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
  // Today's date in the Philippines (Asia/Manila, UTC+8, no daylight saving) as YYYY-MM-DD, whatever the computer's time zone.
  // The server's "overdue" uses the same day (nap.team_load: due_date < Manila today).
  function manilaToday(now) {
    var t = now == null ? Date.now() : now instanceof Date ? now.getTime() : Number(now);
    if (!isFinite(t)) return '';
    return new Date(t + 8 * 3600000).toISOString().slice(0, 10);
  }
  // true when dateStr (YYYY-MM-DD, as <input type=date> and parseDueDate give it) is before today in Manila: such a dispatch is
  // accepted but is overdue immediately. Blank or invalid dates are never past due.
  function isPastDue(dateStr, now) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr == null ? '' : dateStr).trim());
    if (!m || iso(+m[1], +m[2], +m[3]) !== m[0]) return false;
    var today = manilaToday(now);
    return !!today && m[0] < today;
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
  // tab if the first non-blank line has one, else comma / semicolon (whichever appears more; comma on a tie), ignoring quoted text
  function detectDelimiter(t) {
    var first = String(t || '').split(/\r\n|\n|\r/).find(function (l) { return l.trim() !== ''; }) || '';
    var unq = first.replace(/"[^"]*("|$)/g, '');  // ignore delimiters inside double quotes
    var count = function (c) { return unq.split(c).length - 1; };
    return count('\t') > 0 ? '\t' : count(',') >= count(';') && count(',') > 0 ? ',' : count(';') > 0 ? ';' : ',';
  }
  function parseDispatchText(text) {
    var t = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    if (!t.trim()) return { rows: [], skipped: 0, warnings: [] };
    return parseDispatchRows(splitDelimited(t, detectDelimiter(t)));
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
  // ---- Range expansion (radius presets, clamp, labels, phone steps). Pure; the server (nap.boxes_near) allows 1..5000 m, <= 500 rows.
  var RANGE_PRESETS = [150, 300, 500, 1000, 2000], RANGE_MIN = 50, RANGE_MAX = 2000, RANGE_DEFAULT = 150, RANGE_PAGE = 300;
  var PHONE_RANGES = [{ m: 1500, n: 60 }, { m: 3000, n: 100 }, { m: 5000, n: 100 }];
  function clampRange(v) { var n = Math.round(Number(v)); return v === '' || v == null || !isFinite(n) ? null : Math.min(RANGE_MAX, Math.max(RANGE_MIN, n)); }
  function fmtRange(m) {
    var n = Math.round(Number(m));
    if (!isFinite(n)) return '';
    return n < 1000 ? n + ' m' : String(Math.round(n / 100) / 10).replace(/\.0$/, '') + ' km';
  }
  function rangeCapped(count, limit) { return limit > 0 && count >= limit; }
  function rangeCapMsg(count, limit) { return rangeCapped(count, limit) ? 'Showing the nearest ' + limit + ': reduce the range to see all.' : ''; }
  function phoneRange(i) { var k = Math.min(PHONE_RANGES.length - 1, Math.max(0, Math.floor(Number(i)) || 0)); return { step: k, m: PHONE_RANGES[k].m, n: PHONE_RANGES[k].n, label: 'Within ' + fmtRange(PHONE_RANGES[k].m), last: k === PHONE_RANGES.length - 1 }; }
  function nextPhoneRange(i) { return phoneRange((Math.floor(Number(i)) || 0) + 1); }
  function parseLatLng(text) {
    var m = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(String(text == null ? '' : text));
    if (!m) return null;
    var lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    if (!(lat >= 4 && lat <= 22 && lng >= 116 && lng <= 128)) return null;
    return { lat: lat, lng: lng };
  }

  // ---------- NAP Master (import / export) helpers. The server (nap._master_run, nap-12) validates every row: these only read files. ----------
  var MASTER_IMPORT_COLS = ['stencil', 'barangay', 'district', 'dwelling', 'street', 'olt', 'lat', 'lng', 'converge_available', 'active', 'note'];
  var MASTER_EXPORT_COLS = ['stencil', 'barangay', 'district', 'dwelling', 'street', 'olt', 'lat', 'lng', 'geo_source', 'geo_updated_at', 'np_numbers',
    'total_ports', 'status', 'checked_ports', 'free_ports', 'bad_ports', 'age_days', 'last_audit_at', 'last_audit_team', 'converge_available', 'active'];
  // grey (computed) export columns: recognized and ignored on import, so an exported file can be imported back as is
  var MASTER_COMPUTED = MASTER_EXPORT_COLS.filter(function (c) { return MASTER_IMPORT_COLS.indexOf(c) < 0; });
  var MASTER_NUMERIC = { lat: 1, lng: 1, total_ports: 1, checked_ports: 1, free_ports: 1, bad_ports: 1, age_days: 1, converge_available: 1 };
  var MASTER_MAX_ROWS = 5000, MASTER_BATCH = 1000;
  // header spellings (after headerKey: lower case, non-alphanumerics -> '_')
  var MASTER_ALIAS = {
    stencil: /^(nap_?stencil|stencil|nap|nap_?name)$/, barangay: /^(barangay|brgy|barangay_?name)$/, district: /^(district|dist|district_?no)$/,
    dwelling: /^(dwelling|dwelling_?type)$/, street: /^(street|street_?name|street_?area)$/, olt: /^(olt|olt_?name)$/,
    lat: /^(lat|latitude)$/, lng: /^(lng|lon|long|longitude)$/, converge_available: /^(converge_?available|converge|available|avail)$/,
    active: /^(active|is_?active)$/, note: /^(note|notes|remark|remarks)$/
  };
  // READ ME sheet of the dashboard's .xlsx export. JSON-style strings on purpose: scripts/nap-build-templates.py reads this same list
  // for docs/nap-monitoring/templates/NAP-Export-Template.xlsx, so the template and the real export never disagree.
  var MASTER_EXPORT_README = [
    "NAP MASTER EXPORT (NAP Dashboard, tab NAP Master)",
    "",
    "One row = one NAP box (the physical box, as in the Converge POI list). The red column (stencil) is the key: never change it.",
    "Master columns (blue, editable, imported back): stencil, barangay, district, dwelling, street, olt, lat, lng, converge_available, active.",
    "Computed columns (grey, read-only, IGNORED when this file is imported back): geo_source (seed | audit | manual), geo_updated_at, np_numbers,",
    "  total_ports (8 per NAP number), status (installable | full | issue | stale | unverified | inactive), checked_ports, free_ports (fresh Vacant/Released only),",
    "  bad_ports (Hi Loss/Defective), age_days (days since the newest check), last_audit_at and last_audit_team (the newest real audit: not-found visits",
    "  are skipped, so both are empty for a box that was only ever reported not found).",
    "",
    "TO UPDATE BOXES: edit the blue columns, save as .xlsx or .csv, then NAP Master > Import > preview > Apply. Up to 5,000 rows per import file,",
    "  so import one barangay (or a 5,000-row part of the whole-QC file) at a time.",
    "- A blank cell never erases existing data.",
    "- TEAM GPS WINS: a box whose geo_source is audit (its location came from a team's GPS) keeps its coordinates; imported lat/lng are ignored for it.",
    "- active: YES or NO. NO deactivates the NAP: hidden from every list, map, search and dispatch, open dispatches cancelled, no new audits;",
    "  its history is kept. YES brings it back with its history. Deactivated boxes appear only in this export (status inactive).",
    "- Port statuses, audits, photos and dispatch history are never changed by an import.",
    "Dates and times are in the time zone of the computer that made the export (Philippine time on AHBA computers)."
  ];
  // same rule as nap._master_run: PREFIX LP## NP#(-#)*, NAP numbers of 1 to 4 digits
  var MASTER_STENCIL = /^[A-Z0-9]+ LP[0-9]+ NP[0-9]{1,4}(-[0-9]{1,4})*$/;

  function headerKey(c) { return String(c == null ? '' : c).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
  // canonical import column for a header cell, '#computed' for a known export-only column, or null
  function masterColumn(h) {
    var k = headerKey(h);
    if (!k) return null;
    for (var c in MASTER_ALIAS) if (MASTER_ALIAS[c].test(k)) return c;
    return MASTER_COMPUTED.indexOf(k) >= 0 ? '#computed' : null;
  }
  function isMasterStencil(s) { return MASTER_STENCIL.test(normStencil(s)); }
  // 'QCY003 LP114 NP6-8-7-7' -> [6,7,8] (sorted, unique), as the server stores np_numbers; null when not a valid stencil
  function stencilNps(s) {
    var t = normStencil(s);
    if (!MASTER_STENCIL.test(t)) return null;
    var seen = {};
    return t.split(' NP')[1].split('-').map(Number).filter(function (n) { if (seen[n]) return false; seen[n] = true; return true; }).sort(function (a, b) { return a - b; });
  }
  // One cell as text for the server: booleans TRUE/FALSE, finite numbers as written by JS, whitespace collapsed, trimmed. A leading
  // apostrophe that our CSV export put in front of = + - @ (formula guard) is removed again.
  function masterCell(v) {
    if (v == null) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    if (v instanceof Date) return isNaN(v) ? '' : v.toISOString();
    var s = String(v).replace(/[\s\u00a0\ufeff]+/g, ' ').trim();
    return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
  }
  function isBlankRow(r) { return !r || !r.some(function (c) { return masterCell(c) !== ''; }); }
  // index of the header row (the first row, among the first 20 non-blank ones, that has a stencil column), or -1
  function findMasterHeader(grid) {
    var seen = 0;
    for (var i = 0; i < (grid || []).length && seen < 20; i++) {
      var r = grid[i]; if (isBlankRow(r)) continue; seen++;
      if (r.some(function (c) { return masterColumn(c) === 'stencil'; })) return i;
    }
    return -1;
  }
  // grid: array of arrays (one sheet / CSV). firstRow = spreadsheet row number of grid[0] (default 1).
  // Returns { rows:[{row, stencil, ...only the columns the file has}], blank, columns:[canonical], ignored:[computed headers], unknown:[headers],
  //           warnings:[], error } . Rows are never dropped except fully blank ones (counted in `blank`): a row without a stencil is still
  // sent, so the preview reports it (bad_stencil).
  function parseMasterGrid(grid, firstRow) {
    var out = { rows: [], blank: 0, columns: [], ignored: [], unknown: [], warnings: [], error: null };
    var base = firstRow == null ? 1 : firstRow, hi = findMasterHeader(grid);
    if (hi < 0) { out.error = 'No header row with a "stencil" column was found. Use the NAP Master import template (or an exported file).'; return out; }
    var map = {}, head = grid[hi];
    head.forEach(function (c, j) {
      var col = masterColumn(c), label = masterCell(c);
      if (!label) return;
      if (col === '#computed') { out.ignored.push(label); return; }
      if (!col) { out.unknown.push(label); return; }
      if (map[col] != null) { out.warnings.push('Column "' + label + '" appears twice; the first one is used.'); return; }
      map[col] = j; out.columns.push(col);
    });
    for (var i = hi + 1; i < grid.length; i++) {
      var r = grid[i] || [];
      if (isBlankRow(r)) { out.blank++; continue; }
      var o = { row: base + i };
      for (var col in map) o[col] = col === 'stencil' ? normStencil(masterCell(r[map[col]])) : masterCell(r[map[col]]);
      out.rows.push(o);
    }
    if (out.rows.length > MASTER_MAX_ROWS) out.error = 'Up to ' + MASTER_MAX_ROWS.toLocaleString('en-US') + ' rows per file (this file has ' + out.rows.length.toLocaleString('en-US') + '). Split it into smaller files.';
    else if (!out.rows.length) out.error = 'The file has a header but no rows.';
    return out;
  }
  // a .csv / .tsv file of the NAP Master: same splitter and delimiter rule as Dispatch; blank lines are kept so row numbers match the file
  function parseMasterText(text) { var t = String(text == null ? '' : text).replace(/^\uFEFF/, ''); return parseMasterGrid(splitDelimited(t, detectDelimiter(t)), 1); }
  function splitBatches(arr, n) { var out = [], size = Math.max(1, n || MASTER_BATCH); for (var i = 0; i < (arr || []).length; i += size) out.push(arr.slice(i, i + size)); return out; }

  // CSV: every cell quoted; text that a spreadsheet would run as a formula (= + - @ tab CR) gets a leading apostrophe (numbers never do)
  function csvCell(v, numeric) {
    var t = v == null ? '' : String(v);
    if (!numeric && /^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return '"' + t.replace(/"/g, '""') + '"';
  }
  function toCsv(head, rows, numericCols) {
    var num = numericCols || {};
    return [head.map(function (h) { return csvCell(h); }).join(',')].concat((rows || []).map(function (r) {
      return r.map(function (v, j) { return csvCell(v, !!num[head[j]] && typeof v === 'number'); }).join(',');
    })).join('\r\n');
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  // ISO timestamp -> 'YYYY-MM-DD HH:MM' in the browser's time zone ('' when empty / unreadable)
  function fmtStamp(v) {
    if (v == null || v === '') return '';
    var d = new Date(v); if (isNaN(d)) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  // one export_boxes row -> the export sheet's cells, in MASTER_EXPORT_COLS order (numbers stay numbers, timestamps become local text)
  function masterExportCells(b) {
    return MASTER_EXPORT_COLS.map(function (c) {
      var v = b ? b[c] : null;
      if (c === 'geo_updated_at' || c === 'last_audit_at') return fmtStamp(v);
      if (MASTER_NUMERIC[c]) return v == null || v === '' || !isFinite(Number(v)) ? '' : Number(v);
      return v == null ? '' : String(v);
    });
  }
  function masterFileName(scope, ext, now) {
    var d = now instanceof Date ? now : new Date();
    var slug = String(scope || 'whole-qc').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'whole-qc';
    return 'nap-master-' + slug + '-' + d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + '.' + ext;
  }
  // error rows of a preview / apply -> CSV text (row, stencil, reason codes, reason text)
  function masterErrorsCsv(results) {
    var rows = (results || []).filter(function (r) { return r && r.status === 'error'; }).map(function (r) {
      var rs = r.reasons || [];
      return [r.row, r.stencil, rs.map(function (x) { return x.code; }).join('; '), rs.map(function (x) { return x.text; }).join('; ')];
    });
    return toCsv(['row', 'stencil', 'reason', 'details'], rows, {});
  }

  // ---------- dispatch basket + plan (phase 4; server: nap.dispatch_plan, same caps) ----------
  // The basket is an ordered list of box ids (strings). Box details live outside it (info: id -> box row) so the basket itself can be
  // stored as ids only. A plan is an ordered list of {team, due, box_ids}; the dashboard sends it to nap.dispatch_plan as is.
  var BASKET_MAX = 2000, PLAN_MAX_TEAMS = 20;
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function isUuid(s) { return typeof s === 'string' && UUID_RE.test(s); }
  function uniq(list) { var seen = {}, out = []; (list || []).forEach(function (x) { if (x != null && x !== '' && !seen[x]) { seen[x] = true; out.push(x); } }); return out; }
  // Adds ids in order, skipping ones already there and stopping at cap. {ids (new array), added, dup, over}
  function basketAdd(ids, add, cap) {
    var max = cap == null ? BASKET_MAX : cap, cur = (ids || []).slice(), have = {}, added = 0, dup = 0, over = 0;
    cur.forEach(function (x) { have[x] = true; });
    (add || []).forEach(function (x) {
      if (x == null || x === '') return;
      if (have[x]) { dup++; return; }
      if (cur.length >= max) { over++; return; }
      have[x] = true; cur.push(x); added++;
    });
    return { ids: cur, added: added, dup: dup, over: over };
  }
  function basketRemove(ids, rm) { var gone = {}; (rm || []).forEach(function (x) { gone[x] = true; }); return (ids || []).filter(function (x) { return !gone[x]; }); }
  function brgyName(b) { return b ? (String(b.barangay == null ? '' : b.barangay).trim() || 'UNASSIGNED') : 'UNKNOWN'; }
  // [{barangay, n}] most NAPs first, then by name. An id without info counts as UNKNOWN (still loading, or not in the master).
  function basketGroups(ids, info) {
    var m = {};
    (ids || []).forEach(function (id) { var k = brgyName(info && info[id]); m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map(function (k) { return { barangay: k, n: m[k] }; }).sort(function (a, b) { return b.n - a.n || (a.barangay < b.barangay ? -1 : a.barangay > b.barangay ? 1 : 0); });
  }
  // sessionStorage text -> ids (uuids only, de-duplicated, capped); anything unreadable -> []
  function basketParse(text, cap) {
    var arr; try { arr = JSON.parse(text); } catch (e) { return []; }
    if (!Array.isArray(arr)) return [];
    return uniq(arr.filter(isUuid)).slice(0, cap == null ? BASKET_MAX : cap);
  }
  // Position of a point on a Hilbert curve (65,536 x 65,536 cells) laid over a square frame: points close on the curve are close on the
  // ground, so cutting the curve into contiguous pieces gives compact areas. The frame defaults to Quezon City; walkOrder fits it to the
  // boxes being split (a tighter frame = a finer curve over them). Outside the frame a point is clamped to the edge.
  var QC_FRAME = { lat0: 14.55, lng0: 120.95, size: 0.25 }, HN = 65536;
  function hilbertIndex(lat, lng, frame) {
    var f = frame || QC_FRAME, n = HN;
    function cell(v, a) { var c = Math.floor((v - a) / f.size * n); return c < 0 ? 0 : c >= n ? n - 1 : c; }
    var x = cell(lng, f.lng0), y = cell(lat, f.lat0), d = 0, s, rx, ry, t;
    for (s = n / 2; s >= 1; s = s / 2) {
      rx = (x & s) > 0 ? 1 : 0; ry = (y & s) > 0 ? 1 : 0;
      d += s * s * ((3 * rx) ^ ry);
      if (ry === 0) { if (rx === 1) { x = n - 1 - x; y = n - 1 - y; } t = x; x = y; y = t; }
    }
    return d;
  }
  // the smallest square frame around the points (a little margin), or the QC frame when there is nothing to fit
  function fitFrame(pts) {
    if (!pts.length) return QC_FRAME;
    var la0 = Infinity, la1 = -Infinity, ln0 = Infinity, ln1 = -Infinity;
    pts.forEach(function (p) { la0 = Math.min(la0, p[0]); la1 = Math.max(la1, p[0]); ln0 = Math.min(ln0, p[1]); ln1 = Math.max(ln1, p[1]); });
    var size = Math.max(la1 - la0, ln1 - ln0, 1e-6) * 1.001;
    return { lat0: la0, lng0: ln0, size: size };
  }
  function hasXY(b) { return b && b.lat != null && b.lng != null && b.lat !== '' && b.lng !== '' && isFinite(Number(b.lat)) && isFinite(Number(b.lng)); }
  function cmpStr(a, b) { a = String(a == null ? '' : a); b = String(b == null ? '' : b); return a < b ? -1 : a > b ? 1 : 0; }
  // Boxes in "walking order": barangay by barangay (barangays ordered by where their boxes are, along the same curve; barangays with no
  // coordinates at all last, by name), inside a barangay the boxes with coordinates along the curve, then the ones without coordinates
  // by street then stencil. Ties by stencil then id: the order never depends on the input order.
  function walkOrder(boxes) {
    var groups = {}, list = [], all = uniqBy(boxes);
    var frame = fitFrame(all.filter(hasXY).map(function (b) { return [Number(b.lat), Number(b.lng)]; }));
    all.forEach(function (b) { var k = brgyName(b); (groups[k] = groups[k] || []).push(b); });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k], xy = [], no = [], sx = 0, sy = 0;
      g.forEach(function (b) { if (hasXY(b)) { xy.push({ b: b, h: hilbertIndex(Number(b.lat), Number(b.lng), frame) }); sx += Number(b.lat); sy += Number(b.lng); } else no.push(b); });
      xy.sort(function (p, q) { return p.h - q.h || cmpStr(p.b.stencil, q.b.stencil) || cmpStr(p.b.box_id, q.b.box_id); });
      no.sort(function (p, q) { return cmpStr(p.street, q.street) || cmpStr(p.stencil, q.stencil) || cmpStr(p.box_id, q.box_id); });
      list.push({ name: k, key: xy.length ? hilbertIndex(sx / xy.length, sy / xy.length, frame) : null, boxes: xy.map(function (p) { return p.b; }).concat(no) });
    });
    list.sort(function (a, b) {
      if ((a.key == null) !== (b.key == null)) return a.key == null ? 1 : -1;
      return (a.key == null ? 0 : a.key - b.key) || cmpStr(a.name, b.name);
    });
    return [].concat.apply([], list.map(function (g) { return g.boxes; }));
  }
  function uniqBy(boxes) { var seen = {}; return (boxes || []).filter(function (b) { if (!b || b.box_id == null || seen[b.box_id]) return false; seen[b.box_id] = true; return true; }); }
  // Splits the boxes over the teams (in the order given): walking order, cut into contiguous pieces whose sizes differ by at most 1
  // (the first n % k teams get one more). Deterministic. -> [{team, box_ids}] (one entry per team, possibly empty).
  function splitEvenly(boxes, teams) {
    var tl = uniq((teams || []).map(function (t) { return t == null ? '' : String(t); }));
    if (!tl.length) return [];
    var order = walkOrder(boxes), n = order.length, k = tl.length, base = Math.floor(n / k), extra = n % k, at = 0;
    return tl.map(function (t, i) {
      var size = base + (i < extra ? 1 : 0), part = order.slice(at, at + size); at += size;
      return { team: t, box_ids: part.map(function (b) { return b.box_id; }) };
    });
  }
  // Moves ids to toTeam (appended in the given order; the team entry is added when missing). toTeam '' / null = unassign (remove only).
  function moveBoxes(plan, ids, toTeam) {
    var mv = uniq(ids), gone = {}; mv.forEach(function (x) { gone[x] = true; });
    var out = (plan || []).map(function (e) { var c = {}; for (var k in e) c[k] = e[k]; c.box_ids = (e.box_ids || []).filter(function (x) { return !gone[x]; }); return c; });
    if (toTeam) {
      var t = out.find(function (e) { return e.team === toTeam; });
      if (!t) { t = { team: toTeam, box_ids: [] }; out.push(t); }
      t.box_ids = t.box_ids.concat(mv);
    }
    return out;
  }
  // Per team: NAP count (excluded ones apart), barangays covered (most first). excluded: id -> reason (open item, inactive, unknown).
  // A box listed under two teams counts for the first only (the server rule: first assignment wins).
  function planSummary(plan, info, excluded) {
    var seen = {}, total = 0, out = (plan || []).map(function (e) {
      var ids = [], ex = 0, dup = 0;
      (e.box_ids || []).forEach(function (id) { if (seen[id]) { dup++; return; } seen[id] = true; if (excluded && excluded[id]) ex++; else ids.push(id); });
      total += ids.length;
      return { team: e.team, due: e.due || '', count: ids.length, excluded: ex, duplicate: dup, barangays: basketGroups(ids, info) };
    });
    return { teams: out, total: total };
  }
  // The nap.dispatch_plan payload: excluded and repeated ids dropped, teams without NAPs dropped, blank due = null.
  function planPayload(plan, excluded, o) {
    o = o || {};
    var seen = {}, as = [];
    (plan || []).forEach(function (e) {
      var ids = (e.box_ids || []).filter(function (id) { if (seen[id] || (excluded && excluded[id])) return false; seen[id] = true; return true; });
      if (ids.length && e.team) as.push({ team: e.team, due: e.due ? String(e.due) : null, box_ids: ids });
    });
    var p = { source: 'plan', assignments: as };
    if (o.note) p.note = String(o.note);
    return p;
  }

  // ---------- dashboard access (phase 5; phase 8 adds FieldOps accounts) ----------
  // What the NAP Dashboard shows for a nap.my_role() value. The server is the real guard; this only decides the screens.
  //   superadmin / admin: every tab (Pilot included); dispatcher: every tab but Pilot;
  //   viewer (granted GC console user) and field (an ACTIVE pilot field team: nap.pilot_access role 'field', phase 8): the Board only,
  //   read-only (no basket / checkboxes, no CSV export, no audit history / photos / account numbers in the NAP detail);
  //   anything else: no access ({ok: false, message}). viewerFlag (nap.is_viewer()) is no longer needed for 'field' (kept for callers).
  //   o.email: the signed-in email; a FieldOps account (@ahbafield.app) without access gets FIELD_NO_ACCESS_MSG (the pilot is the gate).
  var DASH_TABS = ['board', 'audits', 'dispatch', 'master', 'pilot'];
  // Shown to a signed-in account that may not open the dashboard (phase 5: view-only access is the Access Control entry 'napboard',
  // granted by the superadmin to GC console users; phase 8: FieldOps accounts need an active NAP pilot row).
  var NO_ACCESS_MSG = 'You do not have access to NAP Board. Ask the superadmin to grant it in Access Control.';
  var FIELD_NO_ACCESS_MSG = 'You do not have access to NAP Monitoring. Ask the dispatcher/superadmin to add your account to the NAP pilot.';
  function dashAccess(role, viewerFlag, o) {
    var r = typeof role === 'string' ? role : 'none';
    // o.handoff: a session handed over from the FieldOps phone app is ALWAYS the view-only Board, whatever stronger role the account has
    if (o && o.handoff === true && (r === 'superadmin' || r === 'admin' || r === 'dispatcher' || r === 'viewer')) r = 'field';
    var full = { ok: true, viewOnly: false, canExport: true, canBasket: true, canHistory: true, canTagAcct: true };
    if (r === 'superadmin' || r === 'admin') return Object.assign({ role: r, tabs: DASH_TABS.slice() }, full);
    if (r === 'dispatcher') return Object.assign({ role: r, tabs: DASH_TABS.filter(function (t) { return t !== 'pilot'; }) }, full);
    var ro = { viewOnly: true, canExport: false, canBasket: false, canHistory: false, canTagAcct: false };
    if (r === 'viewer') return Object.assign({ ok: true, role: 'viewer', tabs: ['board'] }, ro);
    if (r === 'field') return Object.assign({ ok: true, role: 'field', tabs: ['board'] }, ro);
    var msg = isFieldEmail(o && o.email) ? FIELD_NO_ACCESS_MSG : NO_ACCESS_MSG;
    return Object.assign({ ok: false, role: r, tabs: [], message: msg }, ro);
  }

  // ---------- sign-in (phase 8): console and FieldOps accounts on one form ----------
  // Console accounts are username@ahbadash.app (app.js dashEmailFor), FieldOps accounts team@ahbafield.app (mobile-a.js emailFor): both
  // trim + lower-case the username. A bare username tries the console account first, then the FieldOps account; an email is used as typed
  // (trimmed, lower-cased like before). The form shows ONE generic error whichever failed, so it never tells which account exists.
  var DASH_DOMAIN = 'ahbadash.app', FIELD_DOMAIN = 'ahbafield.app';
  var SIGNIN_ERR_MSG = 'Wrong username or password';
  function signInEmails(input) {
    var s = String(input == null ? '' : input).trim().toLowerCase();
    if (!s || s.length > 254) return [];
    if (s.indexOf('@') >= 0) return [s];
    if (/\s/.test(s)) return [];
    return [s + '@' + DASH_DOMAIN, s + '@' + FIELD_DOMAIN];
  }
  function isFieldEmail(email) {
    var e = String(email == null ? '' : email).trim().toLowerCase(), i = e.lastIndexOf('@');
    return i > 0 && e.slice(i + 1) === FIELD_DOMAIN;
  }
  // the team code a FieldOps account works as (public.my_team(): upper-case email local part); '' for any other account
  function teamOfEmail(email) {
    return isFieldEmail(email) ? String(email).trim().split('@')[0].toUpperCase() : '';
  }

  // ---------- FieldOps -> NAP site handoff (phase 8) ----------
  // The phone opens https://nap.ahbadevt.com/#h=<access token>. The fragment never reaches a server. The dashboard reads it ONCE, removes
  // it from the address bar before anything else, and keeps the token in memory only. Only a FieldOps account's token is accepted.
  var HANDOFF_MAX = 8192, HANDOFF_MIN_LEFT_S = 60;
  // the h= value of a location.hash ('#h=...' or '#a=1&h=...'), or '' when there is none. Never throws.
  function handoffToken(hash) {
    var h = String(hash == null ? '' : hash);
    if (h.length > HANDOFF_MAX * 2) return '';
    var parts = h.replace(/^#/, '').split('&');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].slice(0, 2) === 'h=') { try { return decodeURIComponent(parts[i].slice(2)); } catch (e) { return ''; } }
    }
    return '';
  }
  function b64urlJson(part) {
    var b = part.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    var bin = typeof atob === 'function' ? atob(b) : Buffer.from(b, 'base64').toString('binary');
    var txt;
    try { txt = decodeURIComponent(bin.split('').map(function (c) { return '%' + ('0' + c.charCodeAt(0).toString(16)).slice(-2); }).join('')); } catch (e) { txt = bin; }
    return JSON.parse(txt);
  }
  // {ok: true, token, email, team, exp} or {ok: false, reason}. now = ms (default Date.now()). Checks the SHAPE and the claims only: the
  // signature is checked by Supabase on every request (a forged token gets 401 there). reason never contains the token.
  function checkHandoff(token, now) {
    var t = String(token == null ? '' : token);
    if (!t) return { ok: false, reason: 'missing' };
    if (t.length < 40 || t.length > HANDOFF_MAX) return { ok: false, reason: 'length' };
    var p = t.split('.');
    if (p.length !== 3 || !p.every(function (x) { return /^[A-Za-z0-9_-]+$/.test(x); })) return { ok: false, reason: 'shape' };
    var c;
    try { c = b64urlJson(p[1]); } catch (e) { return { ok: false, reason: 'payload' }; }
    if (!c || typeof c !== 'object' || Array.isArray(c)) return { ok: false, reason: 'payload' };
    var aud = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (aud.indexOf('authenticated') < 0 || c.role !== 'authenticated') return { ok: false, reason: 'role' };
    if (typeof c.email !== 'string' || !isFieldEmail(c.email)) return { ok: false, reason: 'not-fieldops' };
    var nowS = (now == null ? Date.now() : Number(now)) / 1000;
    if (typeof c.exp !== 'number' || !isFinite(c.exp) || !isFinite(nowS)) return { ok: false, reason: 'exp' };
    if (c.exp - nowS < HANDOFF_MIN_LEFT_S) return { ok: false, reason: 'expired' };
    var em = c.email.trim().toLowerCase();
    return { ok: true, token: t, email: em, team: teamOfEmail(em), exp: c.exp };
  }
  // ms left before the handed-over token expires (negative = expired)
  function handoffMsLeft(exp, now) { return Number(exp) * 1000 - (now == null ? Date.now() : Number(now)); }

  // ---------- Audits tab filters + filtered export (phase 10; server: nap.list_audits, nap-19, same caps and messages) ----------
  // chips: '' All, flagged GPS flag, not_found Not found, awo Active w/o tagging, deact NAP deactivated, desk Desk update (phase 11:
  // audits.source = 'desk'; none before nap-20) (the server also accepts 'reviewed')
  var AUDIT_KINDS = ['', 'flagged', 'not_found', 'reviewed', 'awo', 'deact', 'desk'];
  var AUDIT_KIND_LABEL = { flagged: 'GPS flag', not_found: 'Not found', reviewed: 'Reviewed', awo: 'Active w/o tagging', deact: 'NAP deactivated', desk: 'Desk update' };
  var AUDIT_PAGE = 200, AUDIT_EXPORT_PAGE = 1000, AUDIT_EXPORT_MAX = 50000, AUDIT_STREET_MIN = 3, AUDIT_Q_MIN = 2;
  var AUDIT_MAXLEN = { district: 40, barangay: 100, street: 100, q: 80 };
  function auditFilterDefaults() { return { kind: '', district: '', barangay: '', street: '', from: '', to: '', q: '' }; }
  function oneLine(v) { return String(v == null ? '' : v).replace(/[\s ]+/g, ' ').trim(); }
  function validYmd(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return !!m && iso(+m[1], +m[2], +m[3]) === s; }
  function nextYmd(s) { var t = new Date(Date.parse(s + 'T00:00:00Z') + DAY); return t.toISOString().slice(0, 10); }
  // the filter state of the Audits tab -> { ok, error, params } (params = the nap.list_audits arguments without paging). Dates are Philippine
  // days: From = 00:00 of that day (+08:00), To = 00:00 of the NEXT day (the server's p_to is exclusive), whatever the computer's time zone.
  // A barangay implies its district, so the district is sent only without a barangay.
  function auditFilterParams(f) {
    f = f || {};
    var kind = oneLine(f.kind).toLowerCase(), d = oneLine(f.district), b = oneLine(f.barangay), s = oneLine(f.street), q = normStencil(f.q);
    var from = oneLine(f.from), to = oneLine(f.to);
    function bad(msg) { return { ok: false, error: msg, params: null }; }
    if (AUDIT_KINDS.indexOf(kind) < 0) return bad('Unknown audit filter.');
    if (d.length > AUDIT_MAXLEN.district || b.length > AUDIT_MAXLEN.barangay || s.length > AUDIT_MAXLEN.street || q.length > AUDIT_MAXLEN.q) return bad('A filter is too long.');
    if (s && !b && s.length < AUDIT_STREET_MIN) return bad('Street: type at least ' + AUDIT_STREET_MIN + ' characters, or choose a barangay first.');
    if (q && q.length < AUDIT_Q_MIN) return bad('NAP stencil: type at least ' + AUDIT_Q_MIN + ' characters.');
    if ((from && !validYmd(from)) || (to && !validYmd(to))) return bad('Dates must be valid (YYYY-MM-DD).');
    if (from && to && from > to) return bad('The date range is reversed: From is after To.');
    return { ok: true, error: null, params: { p_district: b ? null : (d || null), p_barangay: b || null, p_street: s || null, p_kind: kind || null,
      p_from: from ? from + 'T00:00:00+08:00' : null, p_to: to ? nextYmd(to) + 'T00:00:00+08:00' : null, p_q: q || null } };
  }
  // true when a filter beyond the chips is set (the old list before nap-19 cannot apply those)
  function auditNewFilters(f) { f = f || {}; return !!(oneLine(f.district) || oneLine(f.barangay) || oneLine(f.street) || oneLine(f.from) || oneLine(f.to) || oneLine(f.q)); }
  // the active filters in words, for the line above the list (plain text: the dashboard escapes it)
  function auditFilterSummary(f) {
    f = f || {};
    var out = [], b = oneLine(f.barangay), d = oneLine(f.district), s = oneLine(f.street), q = normStencil(f.q), from = oneLine(f.from), to = oneLine(f.to);
    if (AUDIT_KIND_LABEL[oneLine(f.kind).toLowerCase()]) out.push(AUDIT_KIND_LABEL[oneLine(f.kind).toLowerCase()]);
    if (d) out.push('District ' + d);
    if (b) out.push('Barangay ' + b);
    if (s) out.push('Street contains "' + s + '"');
    if (from && to) out.push(from === to ? 'On ' + from : from + ' to ' + to); else if (from) out.push('From ' + from); else if (to) out.push('Up to ' + to);
    if (q) out.push('Stencil contains "' + q + '"');
    return out;
  }
  // keyset cursor of the next page = the last row received (rows are newest first: created_at desc, id desc)
  function auditCursor(rows) {
    var r = rows && rows.length ? rows[rows.length - 1] : null;
    return r && r.created_at && r.id ? { p_before_at: r.created_at, p_before_id: r.id } : null;
  }
  function slugPart(v, dflt) { var t = String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); return t || dflt; }
  // nap-audits-<district|all>-<barangay|all>-<from|all>-<to|all>-<today, Philippine date>.<ext>
  function auditExportName(f, ext, now) {
    f = f || {};
    var d = oneLine(f.district);
    return 'nap-audits-' + (d ? 'district-' + slugPart(d, 'x') : 'all') + '-' + slugPart(f.barangay, 'all') + '-' + (validYmd(oneLine(f.from)) ? oneLine(f.from) : 'all') + '-' +
      (validYmd(oneLine(f.to)) ? oneLine(f.to) : 'all') + '-' + manilaToday(now == null ? Date.now() : now) + '.' + (ext === 'xlsx' ? 'xlsx' : 'csv');
  }
  // 'YYYY-MM-DD HH:MM' in Philippine time (UTC+8, no daylight saving), whatever the computer's time zone; '' when empty / unreadable
  function fmtManila(v) {
    if (v == null || v === '') return '';
    var t = toMs(v); if (!isFinite(t)) return '';
    var s = new Date(t + 8 * 3600000).toISOString();
    return s.slice(0, 10) + ' ' + s.slice(11, 16);
  }
  // export columns: no account numbers (tag_acct) and no photo paths, by design. source = 'field' (a team's visit) or 'desk' (phase 11 desk update)
  var AUDIT_EXPORT_COLS = ['audit_at_ph', 'stencil', 'np', 'district', 'barangay', 'street', 'team', 'technicians', 'review_status', 'free_ports', 'checked_ports',
    'gps_distance_m', 'gps_flag', 'declared_full', 'nap_deactivated', 'job_id', 'geo_result', 'photo_count', 'reviewed', 'source'];
  var AUDIT_EXPORT_NUMERIC = { np: 1, free_ports: 1, checked_ports: 1, gps_distance_m: 1, photo_count: 1 };
  var AUDIT_EXPORT_WIDTHS = { audit_at_ph: 17, stencil: 24, np: 5, district: 9, barangay: 22, street: 24, team: 10, technicians: 28, review_status: 13, free_ports: 10,
    checked_ports: 13, gps_distance_m: 14, gps_flag: 9, declared_full: 13, nap_deactivated: 15, job_id: 14, geo_result: 11, photo_count: 11, reviewed: 9, source: 8 };
  function yn(v) { return v === true ? 'YES' : 'NO'; }
  function numOr(v) { return v == null || v === '' || !isFinite(Number(v)) ? '' : Number(v); }
  // one nap.list_audits row -> the export cells, in AUDIT_EXPORT_COLS order (numbers stay numbers; a not-found visit or a deactivated-NAP
  // record has no port reading, and a desk update holds only the ports it changed, so their free_ports is blank, as the list shows "-";
  // checked_ports of a desk update = the number of ports it changed)
  function auditExportCells(r) {
    r = r || {};
    var desk = r.source === 'desk', noPorts = r.review_status === 'not_found' || r.jo_nap_inactive === true || desk;
    return [fmtManila(r.created_at), r.stencil == null ? '' : String(r.stencil), numOr(r.np), r.district == null ? '' : String(r.district),
      r.barangay == null ? '' : String(r.barangay), r.street == null ? '' : String(r.street), r.team == null ? '' : String(r.team),
      r.technicians == null ? '' : String(r.technicians), r.review_status == null ? '' : String(r.review_status), noPorts ? '' : numOr(r.free_ports),
      numOr(r.checked_ports), r.distance_m == null || r.distance_m === '' ? '' : Math.round(Number(r.distance_m) * 10) / 10, yn(r.gps_flag), yn(r.declared_full),
      yn(r.jo_nap_inactive), r.job_id == null ? '' : String(r.job_id), r.geo_result == null ? '' : String(r.geo_result), numOr(r.photo_count), yn(r.review_status === 'reviewed'), desk ? 'desk' : 'field'];
  }
  function auditExportCsv(rows) { return '﻿' + toCsv(AUDIT_EXPORT_COLS, (rows || []).map(auditExportCells), AUDIT_EXPORT_NUMERIC); }
  // an audit as the old PostgREST list returned it (embedded boxes / audit_ports / audit_photos) -> the nap.list_audits row shape, for the
  // fallback while nap-19 is not on the database yet (district / barangay unknown there)
  function auditRowFromLegacy(a) {
    a = a || {};
    var ports = a.audit_ports || [], bx = a.boxes || {};
    return { id: a.id, created_at: a.created_at, box_id: a.box_id, stencil: bx.stencil == null ? null : bx.stencil, district: null, barangay: null,
      street: bx.street == null ? null : bx.street, np: a.np, team: a.team, technicians: a.technicians == null ? null : a.technicians, review_status: a.review_status,
      gps_flag: a.gps_flag === true, distance_m: a.distance_m == null ? null : a.distance_m, has_gps: a.gps_lat != null && a.gps_lng != null,
      declared_full: a.declared_full === true, job_id: a.job_id == null ? null : a.job_id, geo_result: a.geo_result == null ? null : a.geo_result,
      jo_nap_inactive: a.jo_nap_inactive === true, free_ports: ports.filter(function (p) { return isUsable(p.status); }).length, checked_ports: ports.length,
      photo_count: (a.audit_photos || []).length, total_count: null, source: a.source === 'desk' ? 'desk' : 'field' };
  }

  // ======================================================================================================================
  // ---------- phase 11: DESK UPDATE of ports (nap-20, nap.desk_update_ports). Self-contained block; exported as NapCore.desk ----------
  // Same rules as the server (change both together): the six statuses (never 'Unverified'); 'Active (w/ tagging)' needs EXACTLY 13 digits
  // (spaces and dashes stripped); every other status sends no account number; reason 3..200 characters (trimmed); 1..8 distinct ports;
  // ports whose status and account are unchanged are not sent.
  var DESK = (function () {
    var REASON_MIN = 3, REASON_MAX = 200, ACCT_LEN = 13;
    // ' 1234-5678 90123 ' -> '1234567890123' (paste-friendly: spaces, tabs, dashes removed; anything else is kept so it fails the check)
    function normAcct(s) { return String(s == null ? '' : s).replace(/[\s-]+/g, ''); }
    function isAcct(s) { return /^[0-9]{13}$/.test(normAcct(s)); }
    // '' when fine, else the message for one port {status, tag_acct}
    function portError(p) {
      if (!p || PORT_STATUSES.indexOf(p.status) < 0) return 'Choose a status.';
      if (p.status === STATUS.AWT) {
        var a = normAcct(p.tag_acct);
        if (!a) return 'Enter the 13-digit account number.';
        if (!/^[0-9]+$/.test(a)) return 'Digits only.';
        if (a.length !== ACCT_LEN) return 'Exactly 13 digits (' + a.length + ' entered).';
      }
      return '';
    }
    function reasonError(r) {
      var t = String(r == null ? '' : r).trim();
      if (t.length < REASON_MIN) return 'Enter the reason (at least ' + REASON_MIN + ' characters).';
      if (t.length > REASON_MAX) return 'The reason is too long (at most ' + REASON_MAX + ' characters).';
      return '';
    }
    // the value a port is saved with: the account only for 'Active (w/ tagging)'
    function clean(p) { return { port: Number(p.port), status: p.status, tag_acct: p.status === STATUS.AWT ? normAcct(p.tag_acct) : null }; }
    // current: [{port, status, tag_acct}] of ONE NAP number; edits: {port: {status, tag_acct}}. Returns the ports that change, P1..P8 order.
    function diff(current, edits) {
      var cur = {};
      (current || []).forEach(function (p) { cur[Number(p.port)] = p; });
      var out = [];
      Object.keys(edits || {}).map(Number).filter(function (n) { return Number.isInteger(n) && n >= 1 && n <= 8; }).sort(function (a, b) { return a - b; }).forEach(function (n) {
        var e = edits[n]; if (!e || !e.status) return;
        var next = clean({ port: n, status: e.status, tag_acct: e.tag_acct }), was = cur[n];
        if (was && was.status === next.status && String(was.tag_acct || '') === String(next.tag_acct || '')) return;
        out.push(next);
      });
      return out;
    }
    // {ok, errors: {port: message}, reason: message, changed: [...]} for the editor (the Save button is enabled only when ok)
    function validate(current, edits, reason) {
      var changed = diff(current, edits), errors = {}, any = false;
      changed.forEach(function (p) { var m = portError({ status: p.status, tag_acct: edits[p.port].tag_acct }); if (m) { errors[p.port] = m; any = true; } });
      var rm = reasonError(reason);
      return { ok: changed.length > 0 && !any && !rm, errors: errors, reason: rm, changed: changed, nothing: changed.length === 0 };
    }
    function payload(o) {
      return { client_id: o.clientId, box_id: o.boxId, np: Number(o.np), reason: String(o.reason == null ? '' : o.reason).trim(),
               ports: (o.changed || []).map(function (p) { return { port: p.port, status: p.status, tag_acct: p.tag_acct }; }) };
    }
    // a fresh idempotency key (crypto.randomUUID when there is one); one per Save attempt series of the same edit
    function newClientId() {
      try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* fall through */ }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
    }
    // the warning text for the server's duplicate_acct list (never blocks)
    function duplicateText(list) {
      if (!list || !list.length) return '';
      return 'The same account number is also on: ' + list.slice(0, 5).map(function (d) { return d.stencil + ' (NP' + d.np + ' P' + d.port + ')'; }).join(', ') +
        (list.length > 5 ? ' and ' + (list.length - 5) + ' more' : '') + '. Check that it is not a typo.';
    }
    return { REASON_MIN: REASON_MIN, REASON_MAX: REASON_MAX, ACCT_LEN: ACCT_LEN, normAcct: normAcct, isAcct: isAcct, portError: portError,
             reasonError: reasonError, diff: diff, validate: validate, payload: payload, newClientId: newClientId, duplicateText: duplicateText, SOURCE_DESK: 'desk', LABEL: 'Desk update' };
  })();
  // ======================================================================================================================
  // ======================================================================================================================
  // ---------- phase 12: REMARKS per port, LOCATION edit, STENCIL rename + merge (nap-21). Self-contained block; NapCore.p12 ----------
  // Same rules as the server (change both together): remark = whitespace collapsed, trimmed, at most 200 characters, '' = clear;
  // coordinates inside Quezon City (lat 14.60..14.80, lng 120.90..121.20); GPS accuracy <= geo_acc_max_m (30); map / typed need a reason
  // (3..200); the bands of nap.set_box_location; the master import's stencil pattern.
  var P12 = (function () {
    var REMARK_MAX = 200, REASON_MIN = 3, REASON_MAX = 200;
    var QC = { latMin: 14.60, latMax: 14.80, lngMin: 120.90, lngMax: 121.20 };
    var BANDS = { minMoveM: 3, refineM: 50, moveMaxM: 300, accMaxM: 30 };
    function str(v) { return String(v == null ? '' : v); }

    // ----- remarks -----
    function remarkNorm(t) { return str(t).replace(/\s+/g, ' ').trim(); }
    function remarkError(t) { var n = remarkNorm(t).length; return n > REMARK_MAX ? 'At most ' + REMARK_MAX + ' characters (' + n + ' entered).' : ''; }
    // rows [{np, port, remark}] -> {'np:port': remark}
    function remarkMap(rows) { var m = {}; (rows || []).forEach(function (r) { if (r && r.remark != null && r.remark !== '') m[Number(r.np) + ':' + Number(r.port)] = String(r.remark); }); return m; }
    // current = remarkMap of the box; edits = {'np:port': text}. Returns the ports whose (normalized) remark changes, in NP / port order.
    function remarkDiff(current, edits) {
      var cur = current || {}, out = [];
      Object.keys(edits || {}).forEach(function (k) {
        var mt = /^(\d{1,4}):([1-8])$/.exec(k); if (!mt) return;
        var next = remarkNorm(edits[k]), was = cur[k] == null ? '' : remarkNorm(cur[k]);
        if (next !== was) out.push({ np: Number(mt[1]), port: Number(mt[2]), remark: next });
      });
      return out.sort(function (a, b) { return a.np - b.np || a.port - b.port; });
    }
    function remarkPayload(o) {
      return { client_id: o.clientId, box_id: o.boxId, items: (o.items || []).slice(0, 8).map(function (x) { return { np: Number(x.np), port: Number(x.port), remark: remarkNorm(x.remark) }; }) };
    }
    // 'P1: text; P5: text' for one NAP number (or every port when np is null: 'NP1 P1: text; ...')
    function remarkText(rows, np) {
      return (rows || []).filter(function (r) { return r && r.remark && (np == null || Number(r.np) === Number(np)); })
        .sort(function (a, b) { return a.np - b.np || a.port - b.port; })
        .map(function (r) { return (np == null ? 'NP' + r.np + ' ' : '') + 'P' + r.port + ': ' + remarkNorm(r.remark); }).join('; ');
    }

    // ----- location -----
    function num(v) { if (v === '' || v == null || typeof v === 'boolean') return NaN; var n = typeof v === 'number' ? v : Number(String(v).trim()); return isFinite(n) ? n : NaN; }
    function inQC(lat, lng) { lat = num(lat); lng = num(lng); return lat >= QC.latMin && lat <= QC.latMax && lng >= QC.lngMin && lng <= QC.lngMax; }
    // 'lat, lng' as typed or pasted ('14.65, 121.03', '14.65 121.03', '(14.65,121.03)', a Google Maps '@14.65,121.03,17z' link);
    // a pair given lng-first is swapped when only that reading falls in QC. Returns {lat, lng} or null.
    function parseCoords(text) {
      var t = str(text).trim(), mt = /@(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(t);
      if (!mt) mt = /^\(?\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?$/.exec(t);
      if (!mt) return null;
      var a = parseFloat(mt[1]), b = parseFloat(mt[2]);
      if (inQC(a, b)) return { lat: a, lng: b };
      if (inQC(b, a)) return { lat: b, lng: a, swapped: true };
      return { lat: a, lng: b, outside: true };
    }
    function coordsError(lat, lng) {
      var a = num(lat), b = num(lng);
      if (!isFinite(a) || !isFinite(b)) return 'Enter both latitude and longitude as decimal numbers.';
      if (!inQC(a, b)) return 'That point is outside Quezon City (lat ' + QC.latMin.toFixed(2) + ' to ' + QC.latMax.toFixed(2) + ', lng ' + QC.lngMin.toFixed(2) + ' to ' + QC.lngMax.toFixed(2) + ').';
      return '';
    }
    function accuracyError(acc, max) {
      var m = max == null ? BANDS.accMaxM : Number(max), a = num(acc);
      if (!isFinite(a) || a < 0) return 'The GPS accuracy is unknown. Wait for a GPS fix.';
      if (a > m) return 'GPS accuracy is ' + Math.round(a) + ' m; it must be ' + m + ' m or better. Go under open sky, wait a moment, then try again.';
      return '';
    }
    function locReasonError(method, reason) {
      var t = str(reason).replace(/\s+/g, ' ').trim();
      if (t.length > REASON_MAX) return 'The reason is too long (at most ' + REASON_MAX + ' characters).';
      if (method !== 'gps' && t.length < REASON_MIN) return 'Enter the reason for the new location (at least ' + REASON_MIN + ' characters).';
      return '';
    }
    // {ok, errors: {coords, accuracy, reason, method}} for the editor; o = {lat, lng, method, accuracyM, reason, accMaxM}
    function locValidate(o) {
      o = o || {};
      var e = { method: ['map', 'gps', 'typed'].indexOf(o.method) >= 0 ? '' : 'Choose how the location was found.',
                coords: coordsError(o.lat, o.lng), accuracy: o.method === 'gps' ? accuracyError(o.accuracyM, o.accMaxM) : '', reason: locReasonError(o.method, o.reason) };
      return { ok: !e.method && !e.coords && !e.accuracy && !e.reason, errors: e };
    }
    function round7(v) { return Math.round(num(v) * 1e7) / 1e7; }
    function locPayload(o) {
      var p = { client_id: o.clientId, box_id: o.boxId, lat: round7(o.lat), lng: round7(o.lng), method: o.method };
      if (o.method === 'gps') p.accuracy_m = Math.round(num(o.accuracyM) * 10) / 10;
      var r = str(o.reason).replace(/\s+/g, ' ').trim(); if (r) p.reason = r;
      return p;
    }
    // what the server will decide (mirrors nap.set_box_location): applied | unchanged | moved | proposed
    function locBand(o) {
      o = o || {};
      var c = {}; for (var k in BANDS) c[k] = o[k] != null ? o[k] : BANDS[k];
      if (!o.hasCoords) return 'applied';
      var d = num(o.distanceM); if (!isFinite(d)) return 'applied';
      if (d < c.minMoveM) return 'unchanged';
      if (d <= c.refineM) return 'applied';
      if (o.isAdmin || d <= c.moveMaxM) return 'moved';
      return 'proposed';
    }
    function fmtDistance(m) { var d = num(m); if (!isFinite(d)) return ''; return d < 1000 ? Math.round(d) + ' m' : (Math.round(d / 100) / 10) + ' km'; }
    // the user-facing sentence for a server answer {result, distance_m, stencil}
    function locResultText(r) {
      r = r || {};
      var d = r.distance_m == null ? '' : ' (' + fmtDistance(r.distance_m) + ')', s = r.stencil ? r.stencil + ': ' : '';
      if (r.result === 'applied') return s + 'location saved' + d + '.';
      if (r.result === 'moved') return s + 'location saved' + d + '. It moved more than 50 m, so it is listed for the admin\'s review (the admin can revert it).';
      if (r.result === 'proposed') return s + 'the new location is ' + (d ? d.slice(2, -1) + ' away' : 'far') + ': sent to the admin for review. The NAP stays at its old location until an admin accepts it.';
      if (r.result === 'unchanged') return s + 'less than 3 m from the saved location: nothing changed.';
      return s + 'saved.';
    }

    // ----- stencil -----
    var STENCIL_RE = MASTER_STENCIL;
    function stencilError(s) {
      var t = normStencil(s);
      if (!t) return 'Enter the stencil.';
      if (t.length > 120) return 'The stencil is too long.';
      if (!STENCIL_RE.test(t)) return 'The stencil must look like QCY003 LP114 NP6-7-8.';
      return '';
    }
    // box = {stencil, np_numbers}; text = the new stencil as typed. {ok, stencil, same, message, added, removed}
    function renameCheck(box, text) {
      var t = normStencil(text), m = stencilError(t), cur = (box && box.np_numbers || []).map(Number);
      if (m) return { ok: false, stencil: t, same: false, message: m, added: [], removed: [] };
      if (box && t === box.stencil) return { ok: false, stencil: t, same: true, message: 'This is already the stencil.', added: [], removed: [] };
      var next = stencilNps(t) || [];
      var added = next.filter(function (n) { return cur.indexOf(n) < 0; }), removed = cur.filter(function (n) { return next.indexOf(n) < 0; });
      var note = (added.length ? 'Adds NP' + added.join(', NP') + '. ' : '') + (removed.length ? 'Removes NP' + removed.join(', NP') + ' (only possible when it has no readings, remarks or audits). ' : '');
      return { ok: true, stencil: t, same: false, message: note.trim(), added: added, removed: removed };
    }
    function confirmOk(typed, target) { return !!target && normStencil(typed) === normStencil(target); }
    function n0(v) { return Number(v || 0); }
    // lines of plain text for the merge preview (the dashboard escapes them)
    function mergeLines(pv) {
      if (!pv || !pv.from || !pv.to) return [];
      var c = pv.counts || {}, out = [];
      out.push('Moves from ' + pv.from.stencil + ' into ' + pv.to.stencil + ': ' + n0(c.audits) + ' audit' + (n0(c.audits) === 1 ? '' : 's') + ' (' + n0(c.photos) + ' photo' + (n0(c.photos) === 1 ? '' : 's') + '), ' +
        n0(c.ports_checked) + ' port reading' + (n0(c.ports_checked) === 1 ? '' : 's') + ', ' + n0(c.remarks) + ' remark' + (n0(c.remarks) === 1 ? '' : 's') + ', ' +
        (n0(c.dispatch_open) + n0(c.dispatch_other)) + ' dispatch item' + (n0(c.dispatch_open) + n0(c.dispatch_other) === 1 ? '' : 's') + ', ' + n0(c.geo_history) + ' location change' + (n0(c.geo_history) === 1 ? '' : 's') + '.');
      if (n0(c.dispatch_open) && n0(c.target_dispatch_open)) out.push('Both NAPs have an open dispatch item: the target\'s is kept, the other one is cancelled.');
      if (pv.needs_np_union) out.push('NAP numbers: ' + pv.to.stencil + ' will have NP' + (pv.np_union || []).join(', NP') + ' (' + n0(pv.total_ports_after) + ' ports).' +
        (pv.suggested_stencil ? ' You can rename it to ' + pv.suggested_stencil + ' afterwards.' : ''));
      var cf = pv.conflicts || [];
      if (cf.length) out.push(cf.length + ' port' + (cf.length === 1 ? ' is' : 's are') + ' on both NAPs: the newer reading wins (' +
        cf.slice(0, 6).map(function (x) { return 'NP' + x.np + ' P' + x.port + ' from ' + (x.winner === 'from' ? pv.from.stencil : pv.to.stencil); }).join(', ') + (cf.length > 6 ? ', …' : '') + ').');
      var ca = pv.coords_after || {};
      out.push('Location after the merge: ' + (ca.lat == null ? 'none' : Number(ca.lat).toFixed(6) + ', ' + Number(ca.lng).toFixed(6)) + ' (from ' + (pv.coords_from === 'from' ? pv.from.stencil : pv.to.stencil) + ').');
      out.push(pv.from.stencil + ' is then deactivated ("Merged into ' + pv.to.stencil + '") and keeps its stencil for the history.');
      return out;
    }
    var BLOCKED = { same_box: 'Pick two different NAPs.', target_inactive: 'The target NAP is deactivated: merge into an active NAP.', source_already_merged: 'This NAP was already merged into another NAP.' };
    function mergeBlocked(pv) { return ((pv && pv.blocked) || []).map(function (k) { return BLOCKED[k] || k; }); }
    // errors the server sends, in one sentence for the screens (NAP_ codes stripped elsewhere)
    return { REMARK_MAX: REMARK_MAX, REASON_MIN: REASON_MIN, REASON_MAX: REASON_MAX, QC: QC, BANDS: BANDS,
             remarkNorm: remarkNorm, remarkError: remarkError, remarkMap: remarkMap, remarkDiff: remarkDiff, remarkPayload: remarkPayload, remarkText: remarkText,
             inQC: inQC, parseCoords: parseCoords, coordsError: coordsError, accuracyError: accuracyError, locReasonError: locReasonError, locValidate: locValidate,
             locPayload: locPayload, locBand: locBand, fmtDistance: fmtDistance, locResultText: locResultText,
             stencilError: stencilError, renameCheck: renameCheck, confirmOk: confirmOk, mergeLines: mergeLines, mergeBlocked: mergeBlocked,
             newClientId: function () { return DESK.newClientId(); } };
  })();
  // ======================================================================================================================

  // ---------- .xlsx exports off the page (2026-10-20.4): a Web Worker builds the workbook, page by page ----------
  // The NAP Master and Audits .xlsx exports used to build the whole workbook on the page (2-12 s frozen tab, 0.5-0.7 GB at the peak). Now
  // the page sends each fetched page of cells (an array of arrays, 1,000 rows) to a worker as it arrives; the worker appends it to the one
  // data sheet, adds READ ME, writes the file and TRANSFERS the bytes back. The worker is a Blob made of the SheetJS source (fetched by the
  // page WITH its subresource integrity hash) + xlsxWorkerSource's glue. If no worker can run, the same builder runs on the page (fallback).
  // xlsxBuilder(X): X = the SheetJS object. spec = { sheet, head: [column names], cols: [{ wch }], readmeCols? }. add(aoa) appends rows under
  // the header at an explicit origin (no concat of one giant array); finish(readme) returns the file (ArrayBuffer, compression on) and drops
  // every reference. Both paths (worker and page) use this builder, so they write the same cells. Self-contained: it is also stringified
  // into the worker, so it must not use anything outside its own body.
  function xlsxBuilder(X) {
    var wb = null, ws = null, spec = null, n = 0;
    return {
      start: function (s) { spec = s; wb = X.utils.book_new(); ws = X.utils.aoa_to_sheet([s.head]); n = 0; return n; },
      add: function (aoa) {
        if (!ws) throw new Error('the Excel builder was not started');
        if (!Array.isArray(aoa)) throw new Error('a page of rows must be an array');
        if (aoa.length) { X.utils.sheet_add_aoa(ws, aoa, { origin: { r: n + 1, c: 0 } }); n += aoa.length; }
        return n;
      },
      rows: function () { return n; },
      finish: function (readme) {
        if (!ws) throw new Error('the Excel builder was not started');
        ws['!cols'] = spec.cols;
        X.utils.book_append_sheet(wb, ws, spec.sheet);
        var rm = X.utils.aoa_to_sheet(readme || []);
        rm['!cols'] = spec.readmeCols || [{ wch: 150 }];
        X.utils.book_append_sheet(wb, rm, 'READ ME');
        var out = X.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
        wb = ws = spec = null;
        return out;
      }
    };
  }
  // the worker's message loop (stringified by xlsxWorkerSource; runs in the worker, where xlsxBuilder and XLSX are globals).
  // in:  { t: 'start', spec } | { t: 'rows', rows: [[...], ...] } | { t: 'finish', readme: [[...], ...] }
  // out: { t: 'ready', ok } | { t: 'progress', rows } | { t: 'writing', rows } | { t: 'done', rows, buf (transferred) } | { t: 'error', message }
  function xlsxWorkerGlue() {
    var X = typeof XLSX !== 'undefined' ? XLSX : null, B = null;
    self.onmessage = function (e) {
      var m = e.data || {};
      try {
        if (m.t === 'start') { B = xlsxBuilder(X); B.start(m.spec); }
        else if (m.t === 'rows') { var k = B.add(m.rows); m = e = null; self.postMessage({ t: 'progress', rows: k }); }
        else if (m.t === 'finish') {
          var n = B.rows();
          self.postMessage({ t: 'writing', rows: n });
          var out = B.finish(m.readme), buf = out instanceof ArrayBuffer ? out : out.buffer;
          B = null;
          self.postMessage({ t: 'done', rows: n, buf: buf }, [buf]);
        }
      } catch (err) { B = null; self.postMessage({ t: 'error', message: String((err && err.message) || err) }); }
    };
    self.postMessage({ t: 'ready', ok: !!(X && X.utils && X.write) });
  }
  // the worker script: the SheetJS source (lib, as fetched with integrity) + the builder + the glue
  function xlsxWorkerSource(lib) {
    return String(lib || '') + '\n;\nvar xlsxBuilder = ' + xlsxBuilder.toString() + ';\n(' + xlsxWorkerGlue.toString() + ')();\n';
  }
  // One .xlsx export. o.createWorker() -> a Worker (or throws / returns null: no worker); o.loadMain() -> Promise of the page's SheetJS (the
  // fallback); o.onProgress({ phase: 'rows' | 'writing', rows }); o.onFallback(reason) when the page builds it; o.readyMs (default 15 s).
  // open(spec) -> Promise of 'worker' | 'main'. add(aoa) -> Promise (rejects NAP_XLSX_WORKER once the worker failed, NAP_CANCELLED after
  // cancel). finish(readme) -> Promise of the file (ArrayBuffer). cancel() terminates the worker at once (also mid-build); close() releases it.
  // A worker that fails AFTER open (rows already sent) rejects with NAP_XLSX_WORKER: the caller exports again on the page (never lost).
  function xlsxExportJob(o) {
    o = o || {};
    var w = null, B = null, mode = null, failed = null, cancelled = false, pending = null, opening = null, sent = 0;
    function err(code, msg) { var e = new Error(code + ': ' + msg); e.code = code; return e; }
    function progress(p) { if (o.onProgress) { try { o.onProgress(p); } catch (e) { /* progress only */ } } }
    function kill() { if (w) { try { w.onmessage = w.onerror = w.onmessageerror = null; w.terminate(); } catch (e) { /* gone */ } w = null; } }
    function fail(e) {
      if (failed) return;
      failed = e; kill();
      if (pending) { var p = pending; pending = null; p.reject(e); }
    }
    function openWorker(spec) {
      return new Promise(function (resolve, reject) {
        var t = null, ready = false;
        opening = function (e) { if (!ready) { clearTimeout(t); ready = true; reject(e); } };
        try { w = o.createWorker ? o.createWorker() : null; } catch (e) { w = null; return reject(e); }
        if (!w) return reject(new Error('no worker'));
        w.onmessage = function (ev) {
          var m = ev.data || {};
          if (!ready) {
            clearTimeout(t); ready = true;
            if (m.t === 'ready' && m.ok) { w.postMessage({ t: 'start', spec: spec }); resolve(); }
            else reject(new Error(m.message || 'the Excel writer did not load in the worker'));
            return;
          }
          if (m.t === 'progress' || m.t === 'writing') progress({ phase: m.t === 'progress' ? 'rows' : 'writing', rows: m.rows });
          else if (m.t === 'done') {
            if (m.rows !== sent) return fail(err('NAP_XLSX_WORKER', 'the background Excel builder wrote ' + m.rows + ' of ' + sent + ' rows'));   // never a short file
            if (pending) { var p = pending; pending = null; p.resolve(m.buf); }
            kill();
          }
          else if (m.t === 'error') fail(err('NAP_XLSX_WORKER', m.message || 'the background Excel builder failed'));
        };
        w.onerror = function (ev) {
          if (ev && ev.preventDefault) ev.preventDefault();
          var e = new Error((ev && ev.message) || 'the background Excel builder failed');
          if (!ready) { clearTimeout(t); ready = true; reject(e); } else fail(err('NAP_XLSX_WORKER', e.message));
        };
        w.onmessageerror = w.onerror;
        t = setTimeout(function () { if (!ready) { ready = true; reject(new Error('the background Excel builder did not start')); } }, o.readyMs || 15000);
      });
    }
    return {
      mode: function () { return mode; },
      open: function (spec) {
        function main(reason) {
          kill();
          if (o.onFallback) { try { o.onFallback(reason); } catch (e) { /* notice only */ } }
          return Promise.resolve(o.loadMain()).then(function (X) {
            if (cancelled) throw err('NAP_CANCELLED', 'export cancelled');
            B = xlsxBuilder(X); B.start(spec); mode = 'main'; return mode;
          });
        }
        if (!o.createWorker) return main('no worker');
        return openWorker(spec).then(function () {
          opening = null;
          if (cancelled) { kill(); throw err('NAP_CANCELLED', 'export cancelled'); }
          mode = 'worker'; return mode;
        }, function (e) { opening = null; if (cancelled) throw err('NAP_CANCELLED', 'export cancelled'); return main(String((e && e.message) || e)); });
      },
      add: function (aoa) {
        if (cancelled) return Promise.reject(err('NAP_CANCELLED', 'export cancelled'));
        if (failed) return Promise.reject(failed);
        if (mode === 'worker') { sent += aoa.length; w.postMessage({ t: 'rows', rows: aoa }); return Promise.resolve(); }
        var n = B.add(aoa); progress({ phase: 'rows', rows: n });
        return Promise.resolve();
      },
      finish: function (readme) {
        if (cancelled) return Promise.reject(err('NAP_CANCELLED', 'export cancelled'));
        if (failed) return Promise.reject(failed);
        if (mode === 'worker') {
          return new Promise(function (resolve, reject) { pending = { resolve: resolve, reject: reject }; w.postMessage({ t: 'finish', readme: readme }); });
        }
        progress({ phase: 'writing', rows: B.rows() });
        var out = B.finish(readme); B = null;
        return Promise.resolve(out);
      },
      cancel: function () {
        if (cancelled) return;
        cancelled = true; B = null; kill();
        if (opening) { var op = opening; opening = null; op(err('NAP_CANCELLED', 'export cancelled')); }
        if (pending) { var p = pending; pending = null; p.reject(err('NAP_CANCELLED', 'export cancelled')); }
      },
      close: function () { kill(); B = null; pending = null; }
    };
  }

  return {
    p12: P12,
    desk: DESK, AUDIT_KINDS: AUDIT_KINDS, AUDIT_KIND_LABEL: AUDIT_KIND_LABEL, AUDIT_PAGE: AUDIT_PAGE, AUDIT_EXPORT_PAGE: AUDIT_EXPORT_PAGE, AUDIT_EXPORT_MAX: AUDIT_EXPORT_MAX,
    AUDIT_STREET_MIN: AUDIT_STREET_MIN, AUDIT_MAXLEN: AUDIT_MAXLEN, auditFilterDefaults: auditFilterDefaults, auditFilterParams: auditFilterParams, auditNewFilters: auditNewFilters,
    auditFilterSummary: auditFilterSummary, auditCursor: auditCursor, auditExportName: auditExportName, fmtManila: fmtManila, AUDIT_EXPORT_COLS: AUDIT_EXPORT_COLS,
    AUDIT_EXPORT_NUMERIC: AUDIT_EXPORT_NUMERIC, AUDIT_EXPORT_WIDTHS: AUDIT_EXPORT_WIDTHS, auditExportCells: auditExportCells, auditExportCsv: auditExportCsv, auditRowFromLegacy: auditRowFromLegacy, STATUS: STATUS, PORT_STATUSES: PORT_STATUSES, DEFAULTS: DEFAULTS, isUsable: isUsable, isOccupied: isOccupied,
    BASKET_MAX: BASKET_MAX, PLAN_MAX_TEAMS: PLAN_MAX_TEAMS, isUuid: isUuid, basketAdd: basketAdd, basketRemove: basketRemove, basketGroups: basketGroups,
    basketParse: basketParse, hilbertIndex: hilbertIndex, walkOrder: walkOrder, splitEvenly: splitEvenly, moveBoxes: moveBoxes, planSummary: planSummary, planPayload: planPayload,
    MASTER_IMPORT_COLS: MASTER_IMPORT_COLS, MASTER_EXPORT_COLS: MASTER_EXPORT_COLS, MASTER_COMPUTED: MASTER_COMPUTED, MASTER_NUMERIC: MASTER_NUMERIC,
    MASTER_MAX_ROWS: MASTER_MAX_ROWS, MASTER_BATCH: MASTER_BATCH, MASTER_EXPORT_README: MASTER_EXPORT_README, headerKey: headerKey, masterColumn: masterColumn, isMasterStencil: isMasterStencil,
    stencilNps: stencilNps, masterCell: masterCell, findMasterHeader: findMasterHeader, parseMasterGrid: parseMasterGrid, parseMasterText: parseMasterText, splitBatches: splitBatches,
    csvCell: csvCell, toCsv: toCsv, fmtStamp: fmtStamp, masterExportCells: masterExportCells, masterFileName: masterFileName, masterErrorsCsv: masterErrorsCsv,
    parseStencil: parseStencil, boxStatus: boxStatus, haversineM: haversineM, nearest: nearest, validateAudit: validateAudit, gpsFlag: gpsFlag,
    normStencil: normStencil, parseDueDate: parseDueDate, manilaToday: manilaToday, isPastDue: isPastDue, parseDispatchRows: parseDispatchRows, parseDispatchText: parseDispatchText, geoDecision: geoDecision, within: within, parseLatLng: parseLatLng,
    RANGE_PRESETS: RANGE_PRESETS, RANGE_MIN: RANGE_MIN, RANGE_MAX: RANGE_MAX, RANGE_DEFAULT: RANGE_DEFAULT, RANGE_PAGE: RANGE_PAGE, PHONE_RANGES: PHONE_RANGES, clampRange: clampRange, fmtRange: fmtRange, rangeCapped: rangeCapped, rangeCapMsg: rangeCapMsg, phoneRange: phoneRange, nextPhoneRange: nextPhoneRange,
    boxTotal: boxTotal, jobNapQuery: jobNapQuery, matchJobBox: matchJobBox, fullNapOutcome: fullNapOutcome, validateDeactRecord: validateDeactRecord, DASH_TABS: DASH_TABS, NO_ACCESS_MSG: NO_ACCESS_MSG, dashAccess: dashAccess,
    FIELD_NO_ACCESS_MSG: FIELD_NO_ACCESS_MSG, SIGNIN_ERR_MSG: SIGNIN_ERR_MSG, signInEmails: signInEmails, isFieldEmail: isFieldEmail, teamOfEmail: teamOfEmail,
    handoffToken: handoffToken, checkHandoff: checkHandoff, handoffMsLeft: handoffMsLeft,
    xlsxBuilder: xlsxBuilder, xlsxWorkerSource: xlsxWorkerSource, xlsxExportJob: xlsxExportJob };
});
