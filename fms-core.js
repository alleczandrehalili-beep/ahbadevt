// AHBA FieldOps — FMS (Fleet Management) pure rules. UMD, no DOM/fetch.
// Shared by fms-sim.js (in-memory backend), console-fms.js / mobile-fms.js (UI) and the node tests.
// The SQL in fms-02-functions.sql encodes the SAME rules; change both together. Spec: docs/superpowers/specs/2026-09-17-fleet-management-design.md (Rev 2 + Rev 3)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FmsCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // ---- requests ----
  var REQ_STATUS = ['reported', 'for_canvass', 'for_approval', 'approved', 'funded', 'ongoing', 'done', 'closed', 'rejected'];
  var STATUS_LABEL = { reported: 'Reported', for_canvass: 'For canvass', for_approval: 'For approval', approved: 'For funding', funded: 'Funded', ongoing: 'Ongoing', done: 'Done', closed: 'Closed', rejected: 'Rejected' };
  var OPEN_STATUS = ['reported', 'for_canvass', 'for_approval', 'approved', 'funded', 'ongoing', 'done'];
  var REQ_KINDS = ['repair', 'pms', 'registration'];
  var KIND_LABEL = { repair: 'Repair', pms: 'PMS', registration: 'Registration' };
  var REQ_SOURCES = ['admin', 'driver', 'checklist', 'system'];
  // from -> { to: who }   'admin' = admin or superadmin · 'approver' = approver title or superadmin · 'system' = only via the approval rule · 'registration' = only via the renewal auto-close
  var TRANSITIONS = {
    reported: { for_canvass: 'admin', rejected: 'approver' },
    for_canvass: { for_approval: 'admin' },
    for_approval: { approved: 'system', rejected: 'approver' },
    approved: { funded: 'admin' },
    funded: { ongoing: 'admin', closed: 'registration' },
    ongoing: { done: 'admin' },
    done: { closed: 'admin' }
  };
  var OVERRIDES = { closed: ['ongoing', 'done'], done: ['ongoing'], rejected: ['reported'], funded: ['approved'] };   // admin, reason required, logged
  var PRIORITIES = ['low', 'normal', 'urgent'];
  var PRIORITY_RANK = { urgent: 0, normal: 1, low: 2 };
  // ---- people ----
  var ROLES = ['superadmin', 'admin', 'technician', 'viewer'];
  var ROLE_TITLES = ['Fleet admin', 'Chief Operation Officer', 'CEO/President', 'Procurement Officer', 'Admin Officer', 'Property Custodian'];
  var APPROVER_TITLES = ['Chief Operation Officer', 'CEO/President', 'Procurement Officer'];
  var TECH_TABLES = ['daily_checks', 'repair_requests'];
  // ---- other vocab ----
  var REPAIR_KINDS = ['pms', 'repair', 'body', 'tire', 'battery', 'electrical', 'other'];
  var INS_KINDS = ['ctpl', 'comprehensive'];
  var DOC_KINDS = ['or_cr', 'insurance', 'receipt', 'signed_jo', 'photo', 'other'];
  var EXP_KINDS = ['repair', 'registration', 'insurance', 'other'];
  var CLAIM_STATUS = ['none', 'filed', 'approved', 'denied', 'paid'];
  var VEHICLE_STATUS = ['active', 'in_shop', 'retired'];
  var BLOWBAGETS = [['brakes', 'Brakes'], ['lights', 'Lights'], ['oil', 'Oil'], ['water', 'Water'], ['battery', 'Battery'], ['air', 'Air (tire pressure)'], ['gas', 'Gas'], ['engine', 'Engine'], ['tires', 'Tires'], ['self', 'Self (driver fit to drive)']];
  var FUEL_LEVELS = ['E', '1/4', '1/2', '3/4', 'F'];
  // Standard equipment issued to every service vehicle (owner 2026-09-17). Declared daily by the driver (default: all on board); audited by the admin only.
  var EQUIPMENT = [['ladder_24', 'Extension ladder 24 ft'], ['ladder_28', 'Extension ladder 28 ft'], ['spare_tire', 'Spare tire'], ['ladder_rack', 'Ladder rack'], ['a_ladder', 'A-type ladder'], ['ewd', 'Early warning device'], ['tools', 'Tools'], ['jack', 'Jack'], ['cable_caddie', 'Cable caddie']];
  function equipmentLabel(key) { var e = EQUIPMENT.filter(function (x) { return x[0] === key; })[0]; return e ? e[1] : key; }
  // issued = [{key, issued, status, missing_since, missing_remarks}] → the checklist rows the driver sees (only issued items).
  // Equipped items default to "on board". An item already tagged missing is LOCKED: shown as missing, not asked again, until the admin restores it.
  function equipmentChecklist(issued) {
    var rec = {}; (issued || []).forEach(function (e) { rec[e.key] = e; });
    return EQUIPMENT.filter(function (x) { var r = rec[x[0]]; return issued == null || !r || r.issued !== false; }).map(function (x) {
      var r = rec[x[0]] || {}; var locked = r.status === 'missing';
      return { key: x[0], label: x[1], present: !locked, locked: locked, remarks: locked ? (r.missing_remarks || '') : '', missing_since: locked ? (r.missing_since || null) : null };
    });
  }
  function equipmentMissing(items) { return (items || []).filter(function (i) { return i.present === false || i.ok === false || i.status === 'missing'; }); }
  // ---- thresholds (Rev 3): PMS notice 1,000 km / 30 d; registration notice 60 d; insurance 30 d ----
  var DUE_DAYS = 30, DUE_KM = 1000, REG_NOTICE_DAYS = 60, PMS_NOTICE_KM = 1000, PMS_NOTICE_DAYS = 30;
  var THRESH_DAYS = [30, 7, 0], REG_THRESH_DAYS = [60, 30, 7, 0], THRESH_KM = [1000, 0];
  var DEFAULT_PMS = [{ label: 'PMS (change oil + basic cleaning / check-up)', every_km: 5000, every_months: 6, sort_order: 10 }];

  function pad(n) { return String(n).padStart(2, '0'); }
  function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); }
  function addDays(d, n) { var x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  function addMonths(d, n) { var x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000); }
  function endOfMonth(year, month) { var last = new Date(Date.UTC(year, month, 0)).getUTCDate(); return year + '-' + pad(month) + '-' + pad(last); }
  function normPlate(p) { return String(p == null ? '' : p).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  // LTO: last digit of the plate = renewal month (1..9 = Jan..Sep, 0 = Oct). null when the plate has no digit.
  function renewalMonthFromPlate(plate) { var m = normPlate(plate).match(/(\d)(?!.*\d)/); if (!m) return null; var d = Number(m[1]); return d === 0 ? 10 : d; }
  // Next due = end of the renewal month, in the year after the last renewal (or the current year when never renewed). The OR/CR expiry, when encoded, wins over this.
  function registrationDueOn(renewalMonth, lastRenewedOn, todayStr) {
    if (!renewalMonth) return null;
    todayStr = todayStr || today();
    var y = lastRenewedOn ? Number(lastRenewedOn.slice(0, 4)) + 1 : Number(todayStr.slice(0, 4));
    return endOfMonth(y, Number(renewalMonth));
  }
  function rank(s) { return s === 'overdue' ? 2 : s === 'due' ? 1 : 0; }
  function dateState(dueOn, todayStr, windowDays) {
    if (!dueOn) return { days: null, state: 'none' };
    var days = daysBetween(todayStr || today(), dueOn), w = windowDays == null ? DUE_DAYS : windowDays;
    return { days: days, state: days < 0 ? 'overdue' : (days <= w ? 'due' : 'ok') };
  }
  // PMS due by km OR by months — the worse one wins. currentKm null => km part unknown. Never logged => both parts unknown (state 'ok',
  // shown as "never" in the UI): a used vehicle with no history must NOT read as overdue from 0 km. Alerts start after the first logged service.
  function pmsState(rule, last, currentKm, todayStr) {
    todayStr = todayStr || today(); last = last || {}; rule = rule || {};
    var out = { due_in_km: null, due_in_days: null, state: 'ok' };
    if (rule.every_km && currentKm != null && last.odometer_km != null) out.due_in_km = Number(last.odometer_km) + Number(rule.every_km) - Number(currentKm);
    if (rule.every_months && last.finished_on) out.due_in_days = daysBetween(todayStr, addMonths(last.finished_on, Number(rule.every_months)));
    var worst = 'ok';
    if (out.due_in_km != null) worst = out.due_in_km < 0 ? 'overdue' : (out.due_in_km <= DUE_KM ? 'due' : 'ok');
    if (out.due_in_days != null) { var s = out.due_in_days < 0 ? 'overdue' : (out.due_in_days <= DUE_DAYS ? 'due' : 'ok'); if (rank(s) > rank(worst)) worst = s; }
    out.state = worst; return out;
  }
  function pmsNotice(state) { return (state.due_in_km != null && state.due_in_km <= PMS_NOTICE_KM) || (state.due_in_days != null && state.due_in_days <= PMS_NOTICE_DAYS); }
  // ---- roles / permissions ----
  function isAdminRole(role) { return role === 'admin' || role === 'superadmin'; }
  function isApproverTitle(title) { return APPROVER_TITLES.indexOf(title) >= 0; }
  function canApprove(title) { return isApproverTitle(title); }
  function canReject(role, title) { return role === 'superadmin' || isApproverTitle(title); }
  function canTransition(from, to, role, title) {
    var who = TRANSITIONS[from] && TRANSITIONS[from][to]; if (!who) return false;
    if (who === 'system' || who === 'registration') return false;
    if (who === 'approver') return canReject(role, title);
    return isAdminRole(role);
  }
  function canOverride(from, to, role) { return isAdminRole(role) && !!(OVERRIDES[from] && OVERRIDES[from].indexOf(to) >= 0); }
  function canWrite(role, table) { if (isAdminRole(role)) return true; if (role === 'technician') return TECH_TABLES.indexOf(table) >= 0; return false; }
  // Two signatures: CEO/President + (Chief Operation Officer or Procurement Officer). approvals = [{role_title}]
  function approvalSatisfied(approvals) {
    var t = (approvals || []).map(function (a) { return a.role_title; });
    return t.indexOf('CEO/President') >= 0 && (t.indexOf('Chief Operation Officer') >= 0 || t.indexOf('Procurement Officer') >= 0);
  }
  function approvalProgress(approvals) { return Math.min((approvals || []).length, 2) + ' of 2'; }
  // ---- queue helpers ----
  function aging(requestedOn, status, todayStr) { if (!requestedOn || status === 'closed' || status === 'rejected') return null; return Math.max(0, daysBetween(requestedOn, todayStr || today())); }
  function queueSort(a, b) { return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) || ((b.aging == null ? -1 : b.aging) - (a.aging == null ? -1 : a.aging)) || String(a.requested_on).localeCompare(String(b.requested_on)); }
  // Why a repair / PMS request cannot be closed yet. [] = may close. (Registration requests close through the renewal, not this gate.)
  function closeBlockers(request, repair, docs) {
    var out = [], mine = (docs || []).filter(function (d) { return d.request_id === request.id && !d.deleted_at; });
    if (!mine.some(function (d) { return d.kind === 'receipt'; })) out.push('receipt not uploaded');
    if (!mine.some(function (d) { return d.kind === 'signed_jo'; })) out.push('signed JO not uploaded');
    if (!repair) out.push('no repair linked'); else { if (!repair.finished_on) out.push('repair has no finished date'); if (repair.odometer_km == null) out.push('odometer at repair not entered'); }
    return out;
  }
  function joNo(year, seq) { return 'FMS-JO-' + year + '-' + String(seq).padStart(4, '0'); }
  function overEstimate(estCost, actual) { return estCost != null && Number(actual || 0) > Number(estCost); }
  function checkSummary(items) { var bad = (items || []).filter(function (i) { return !i.ok; }); return { not_ok: bad.length, labels: bad.map(function (i) { return i.label; }) }; }
  // Rev 3: money waiting = estimates of everything For approval + Approved (for funding)
  function toBeReleased(requests) {
    var out = { total: 0, by_kind: {}, for_approval: 0, approved: 0 };
    (requests || []).forEach(function (q) { if (q.deleted_at || (q.status !== 'for_approval' && q.status !== 'approved')) return; var a = Number(q.est_cost || 0); out.total += a; out.by_kind[q.kind] = (out.by_kind[q.kind] || 0) + a; out[q.status] += a; });
    return out;
  }
  function crossedThresholds(kind, value) { var list = kind === 'pms_km' ? THRESH_KM : kind === 'registration' ? REG_THRESH_DAYS : THRESH_DAYS; return list.filter(function (t) { return value <= t; }); }
  function sumParts(parts) { return (parts || []).reduce(function (a, p) { return a + Number(p.qty || 0) * Number(p.unit_cost || 0); }, 0); }
  function aggregateReport(expenses, vehicles, from, to) {
    var byV = {}, byM = {}, vmap = {};
    (vehicles || []).forEach(function (v) { vmap[v.id] = v; });
    (expenses || []).forEach(function (e) {
      if (e.deleted_at || !e.spent_on || e.spent_on < from || e.spent_on > to) return;
      var amt = Number(e.amount || 0);
      var v = byV[e.vehicle_id] || (byV[e.vehicle_id] = { vehicle_id: e.vehicle_id, plate: (vmap[e.vehicle_id] || {}).plate || '?', total: 0, byKind: {} });
      v.total += amt; v.byKind[e.kind] = (v.byKind[e.kind] || 0) + amt;
      var m = e.spent_on.slice(0, 7); byM[m] = (byM[m] || 0) + amt;
    });
    var perVehicle = Object.keys(byV).map(function (k) { return byV[k]; }).sort(function (a, b) { return b.total - a.total; });
    return { perVehicle: perVehicle, byMonth: Object.keys(byM).sort().map(function (m) { return { month: m, total: byM[m] }; }), total: perVehicle.reduce(function (a, v) { return a + v.total; }, 0) };
  }
  function peso(n) { return '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  return { REQ_STATUS: REQ_STATUS, STATUS_LABEL: STATUS_LABEL, OPEN_STATUS: OPEN_STATUS, REQ_KINDS: REQ_KINDS, KIND_LABEL: KIND_LABEL, REQ_SOURCES: REQ_SOURCES, TRANSITIONS: TRANSITIONS, OVERRIDES: OVERRIDES,
    PRIORITIES: PRIORITIES, ROLES: ROLES, ROLE_TITLES: ROLE_TITLES, APPROVER_TITLES: APPROVER_TITLES, TECH_TABLES: TECH_TABLES, REPAIR_KINDS: REPAIR_KINDS, INS_KINDS: INS_KINDS, DOC_KINDS: DOC_KINDS,
    EXP_KINDS: EXP_KINDS, CLAIM_STATUS: CLAIM_STATUS, VEHICLE_STATUS: VEHICLE_STATUS, BLOWBAGETS: BLOWBAGETS, FUEL_LEVELS: FUEL_LEVELS, EQUIPMENT: EQUIPMENT, equipmentLabel: equipmentLabel, equipmentChecklist: equipmentChecklist, equipmentMissing: equipmentMissing,
    DUE_DAYS: DUE_DAYS, DUE_KM: DUE_KM, REG_NOTICE_DAYS: REG_NOTICE_DAYS, PMS_NOTICE_KM: PMS_NOTICE_KM, PMS_NOTICE_DAYS: PMS_NOTICE_DAYS, THRESH_DAYS: THRESH_DAYS, REG_THRESH_DAYS: REG_THRESH_DAYS, THRESH_KM: THRESH_KM, DEFAULT_PMS: DEFAULT_PMS,
    today: today, addDays: addDays, addMonths: addMonths, daysBetween: daysBetween, endOfMonth: endOfMonth, normPlate: normPlate, renewalMonthFromPlate: renewalMonthFromPlate, registrationDueOn: registrationDueOn,
    dateState: dateState, pmsState: pmsState, pmsNotice: pmsNotice, isAdminRole: isAdminRole, isApproverTitle: isApproverTitle, canApprove: canApprove, canReject: canReject, canTransition: canTransition, canOverride: canOverride, canWrite: canWrite,
    approvalSatisfied: approvalSatisfied, approvalProgress: approvalProgress, aging: aging, queueSort: queueSort, closeBlockers: closeBlockers, joNo: joNo, overEstimate: overEstimate, checkSummary: checkSummary, toBeReleased: toBeReleased,
    crossedThresholds: crossedThresholds, sumParts: sumParts, aggregateReport: aggregateReport, peso: peso };
});
