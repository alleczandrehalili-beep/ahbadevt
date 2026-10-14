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

  // ports: ALL port rows of the box [{status, verified_at}], Unverified ones included (total = ports.length). Same rule as the
  // nap.box_status view. A port is checked when its status is not Unverified and verified_at is a valid date.
  //   free        = checked Vacant/Released ports verified within freshnessDays (an old free port does not count)
  //   installable = free > 0
  //   full        = every port checked, all occupied, newest check within freshnessDays x fullMultiplier
  //   issue       = newest check within freshnessDays and a Hi Loss / Defective port
  //   stale       = anything else that was checked; unverified = nothing checked
  function boxStatus(ports, now, o) {
    var c = opt(o), t = toMs(now), all = ports || [];
    var seen = all.filter(function (p) { return p.status !== STATUS.UNVERIFIED && p.verified_at != null && isFinite(toMs(p.verified_at)); });
    if (!seen.length) return { kind: 'unverified', free: 0, checked: 0, bad: 0, total: all.length, ageDays: null };
    var age = function (p) { return (t - toMs(p.verified_at)) / DAY; };
    var newest = Math.max.apply(null, seen.map(function (p) { return toMs(p.verified_at); }));
    var ageFrac = (t - newest) / DAY;
    var free = seen.filter(function (p) { return isUsable(p.status) && age(p) <= c.freshnessDays; }).length;
    var bad = seen.filter(function (p) { return p.status === STATUS.HILOSS || p.status === STATUS.DEFECTIVE; }).length;
    var full = seen.length === all.length && seen.every(function (p) { return isOccupied(p.status); });
    var kind = free > 0 ? 'installable'
      : full && ageFrac <= c.freshnessDays * c.fullMultiplier ? 'full'
      : ageFrac <= c.freshnessDays && bad > 0 ? 'issue'
      : 'stale';
    return { kind: kind, free: free, checked: seen.length, bad: bad, total: all.length, ageDays: Math.max(0, Math.floor(ageFrac)) };
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
      errors.push({ code: 'NAP_PORTS_INCOMPLETE', msg: 'Kailangan ng status ang lahat ng P1 hanggang P8.' });
    var noTag = ports.filter(function (p) { return p.status === STATUS.AWT && !String(p.tag_acct || '').trim(); }).map(function (p) { return 'P' + p.port; });
    if (noTag.length) errors.push({ code: 'NAP_TAG_REQUIRED', msg: 'Ilagay ang acct no. sa label ng ' + noTag.join(', ') + '.' });
    if (!(a.photos >= 1)) errors.push({ code: 'NAP_PHOTO_REQUIRED', msg: 'Kailangan ng kahit isang photo ng NAP reading.' });
    if (a.declaredFull) {
      var free = ports.filter(function (p) { return isUsable(p.status); }).map(function (p) { return 'P' + p.port; });
      if (free.length) errors.push({ code: 'NAP_FULL_HAS_FREE', msg: 'Hindi Full NAP: ' + free.join(', ') + ' ay libre. I-install doon o baguhin ang audit.' });
      if (!String(a.jobId == null ? '' : a.jobId).trim()) errors.push({ code: 'NAP_JOB_REQUIRED', msg: 'Kailangan ng JO para sa Full NAP.' });
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function gpsFlag(distanceM, o) { return distanceM != null && distanceM > opt(o).gpsFlagM; }

  return { STATUS: STATUS, PORT_STATUSES: PORT_STATUSES, DEFAULTS: DEFAULTS, isUsable: isUsable, isOccupied: isOccupied,
    parseStencil: parseStencil, boxStatus: boxStatus, haversineM: haversineM, nearest: nearest, validateAudit: validateAudit, gpsFlag: gpsFlag };
});
