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
  function toMs(v) { return typeof v === 'number' ? v : Date.parse(v); }
  function isUsable(s) { return s === STATUS.VACANT || s === STATUS.RELEASED; }
  function isOccupied(s) { return s === STATUS.AWT || s === STATUS.AWO; }

  // 'QCY003 LP114 NP6-7-8' -> { prefix:'QCY003 LP114', nps:[6,7,8] }
  function parseStencil(str) {
    var m = /^\s*([A-Z]{3}\d{3} LP\d+) NP(\d+(?:-\d+)*)\s*$/i.exec(String(str || ''));
    if (!m) return null;
    return { prefix: m[1].toUpperCase(), nps: m[2].split('-').map(Number) };
  }

  // ports: [{status, verified_at}] for the whole box. Never-seen ports (Unverified) do not count.
  function boxStatus(ports, now, o) {
    var c = opt(o), t = toMs(now);
    var seen = (ports || []).filter(function (p) { return p.status !== STATUS.UNVERIFIED && p.verified_at != null; });
    if (!seen.length) return { kind: 'unverified', free: 0, checked: 0, bad: 0, ageDays: null };
    var newest = Math.max.apply(null, seen.map(function (p) { return toMs(p.verified_at); }));
    var free = seen.filter(function (p) { return isUsable(p.status); }).length;
    var bad = seen.filter(function (p) { return p.status === STATUS.HILOSS || p.status === STATUS.DEFECTIVE; }).length;
    var full = seen.every(function (p) { return isOccupied(p.status); });
    var windowDays = full ? c.freshnessDays * c.fullMultiplier : c.freshnessDays;
    var ageFrac = (t - newest) / DAY;
    var kind = ageFrac > windowDays ? 'stale' : free > 0 ? 'installable' : full ? 'full' : 'issue';
    return { kind: kind, free: free, checked: seen.length, bad: bad, ageDays: Math.max(0, Math.floor(ageFrac)) };
  }

  function haversineM(lat1, lng1, lat2, lng2) {
    var R = 6371000, r = Math.PI / 180, dp = (lat2 - lat1) * r, dl = (lng2 - lng1) * r;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // mode 'install' -> installable boxes; 'audit' -> stale + unverified boxes. Nearest first.
  function nearest(boxes, from, mode, limit) {
    var want = mode === 'audit' ? ['stale', 'unverified'] : ['installable'];
    return (boxes || [])
      .filter(function (b) { return want.indexOf(b.kind) >= 0 && b.lat != null && b.lng != null; })
      .map(function (b) { var x = {}; for (var k in b) x[k] = b[k]; x.distance_m = haversineM(from.lat, from.lng, b.lat, b.lng); return x; })
      .sort(function (a, b) { return a.distance_m - b.distance_m; })
      .slice(0, limit == null ? 5 : limit);
  }

  // a: { ports:[{port,status,tag_acct}], photos:number, declaredFull:boolean, jobId?:string }. Server repeats these checks.
  function validateAudit(a) {
    var errors = [], ports = a.ports || [];
    var nums = {};
    ports.forEach(function (p) { if (p.port >= 1 && p.port <= 8) nums[p.port] = true; });
    var statusOk = ports.every(function (p) { return PORT_STATUSES.indexOf(p.status) >= 0; });
    if (ports.length !== 8 || Object.keys(nums).length !== 8 || !statusOk)
      errors.push({ code: 'NAP_PORTS_INCOMPLETE', msg: 'Kailangan ng status ang lahat ng P1 hanggang P8.' });
    var noTag = ports.filter(function (p) { return p.status === STATUS.AWT && !String(p.tag_acct || '').trim(); }).map(function (p) { return 'P' + p.port; });
    if (noTag.length) errors.push({ code: 'NAP_TAG_REQUIRED', msg: 'Ilagay ang acct no. sa label ng ' + noTag.join(', ') + '.' });
    if (!(a.photos >= 1)) errors.push({ code: 'NAP_PHOTO_REQUIRED', msg: 'Kailangan ng kahit isang photo ng NAP reading.' });
    if (a.declaredFull) {
      var free = ports.filter(function (p) { return isUsable(p.status); }).map(function (p) { return 'P' + p.port; });
      if (free.length) errors.push({ code: 'NAP_FULL_HAS_FREE', msg: 'Hindi Full NAP: ' + free.join(', ') + ' ay libre. I-install doon o baguhin ang audit.' });
      if (!a.jobId) errors.push({ code: 'NAP_JOB_REQUIRED', msg: 'Kailangan ng JO para sa Full NAP.' });
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function gpsFlag(distanceM, o) { return distanceM != null && distanceM > opt(o).gpsFlagM; }

  return { STATUS: STATUS, PORT_STATUSES: PORT_STATUSES, DEFAULTS: DEFAULTS, isUsable: isUsable, isOccupied: isOccupied,
    parseStencil: parseStencil, boxStatus: boxStatus, haversineM: haversineM, nearest: nearest, validateAudit: validateAudit, gpsFlag: gpsFlag };
});
