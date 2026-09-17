// AHBA FieldOps — FMS real FmsApi over supabase-js v2 (schema `fms`, bucket `fms-docs`). Same method set as fms-sim.js (Rev 2 + Rev 3).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./fms-core.js'));
  else root.FmsApi = factory(root.FmsCore);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';
  var BUCKET = 'fms-docs';
  function create(client, opts) {
    opts = opts || {};
    var username = opts.username || '';
    var fms = function () { return client.schema('fms'); };
    function unwrap(p) { return Promise.resolve(p).then(function (r) { if (r.error) throw new Error(r.error.message || String(r.error)); return r.data; }); }
    function one(p) { return unwrap(p).then(function (d) { return Array.isArray(d) ? d[0] : d; }); }
    function strip(row) { row = Object.assign({}, row); ['parts', 'total_cost', 'open_requests', 'aging', 'approvals', 'team', '_url'].forEach(function (k) { delete row[k]; }); if (row.make === undefined) { delete row.plate; delete row.svc_code; } return row; }
    function save(table, row) { row = strip(row); var q = row.id ? fms().from(table).update(row).eq('id', row.id) : fms().from(table).insert(row); return one(q.select('*')); }
    function setStatus(id, patch) { return one(fms().from('repair_requests').update(patch).eq('id', id).select('*')); }
    function listBy(table, id, orderCol) { return unwrap(fms().from(table).select(table === 'repairs' ? '*, parts:repair_parts(*)' : '*').eq('vehicle_id', id).is('deleted_at', null).order(orderCol, { ascending: false })); }
    function decorate(rows) { var t = Core.today(); return (rows || []).map(function (q) { q.plate = q.vehicles ? q.vehicles.plate : q.plate; q.svc_code = q.vehicles ? q.vehicles.svc_code : q.svc_code; q.team = q.vehicles ? q.vehicles.assigned_team : q.team; delete q.vehicles; q.aging = Core.aging(q.requested_on, q.status, t); q.approvals = q.approvals || []; return q; }).sort(Core.queueSort); }
    var REQ_SELECT = '*, vehicles(plate, svc_code, assigned_team), approvals(username, role_title, at)';
    var api = {
      myRole: function () { return unwrap(fms().rpc('my_role')); },
      myTitle: function () { return unwrap(fms().rpc('my_title')); },
      listVehicles: function () {
        return unwrap(fms().from('vehicles').select('*, repair_requests(status, deleted_at), vehicle_equipment(issued, status)').is('deleted_at', null).order('plate')).then(function (rows) {
          return (rows || []).map(function (v) { var q = v.repair_requests || [], e = v.vehicle_equipment || []; delete v.repair_requests; delete v.vehicle_equipment; v.open_requests = q.filter(function (x) { return !x.deleted_at && Core.OPEN_STATUS.indexOf(x.status) >= 0; }).length; v.equipment_missing = e.filter(function (x) { return x.issued !== false && x.status === 'missing'; }).length; return v; });
        });
      },
      getVehicle: function (id) {
        return Promise.all([
          one(fms().from('vehicles').select('*').eq('id', id)), listBy('registrations', id, 'last_renewed_on'), listBy('insurance', id, 'expires_on'),
          unwrap(fms().from('repair_requests').select(REQ_SELECT).eq('vehicle_id', id).is('deleted_at', null)), listBy('repairs', id, 'started_on'), listBy('incidents', id, 'happened_on'), listBy('expenses', id, 'spent_on'),
          listBy('documents', id, 'created_at'), unwrap(fms().from('pms_status').select('*').eq('vehicle_id', id)), unwrap(fms().from('daily_checks').select('*').eq('vehicle_id', id).is('deleted_at', null).order('work_date', { ascending: false }).limit(30)),
          unwrap(fms().from('vehicle_equipment').select('*').eq('vehicle_id', id)), listBy('equipment_audits', id, 'audited_on')
        ]).then(function (r) {
          var pms = (r[8] || []).sort(function (a, b) { return a.rule_id - b.rule_id; }); var odo = pms.filter(function (p) { return p.current_km != null; })[0]; var v = r[0];
          var lr = (r[1] || [])[0]; var due = lr && lr.or_cr_expiry ? lr.or_cr_expiry : Core.registrationDueOn((lr && lr.renewal_month) || Core.renewalMonthFromPlate(v.plate), lr ? lr.last_renewed_on : null);
          var checks = r[9] || [];
          var eqMissing = (r[10] || []).filter(function (e) { return e.issued !== false && e.status === 'missing'; }).map(function (e) { return { key: e.key, label: e.label, present: false, remarks: e.missing_remarks || '', missing_since: e.missing_since, missing_by: e.missing_by }; });   // vehicle_equipment.status = source of truth (sticky missing)
          return { vehicle: v, odometer: odo ? { km: Number(odo.current_km), at: odo.current_km_at, source: odo.current_km_source || 'gate log' } : null, registrations: r[1], insurance: r[2], requests: decorate(r[3]), repairs: r[4], incidents: r[5], expenses: r[6], documents: r[7], checks: checks, pms: pms, registration_due: due,
            equipment: (r[10] && r[10].length) ? r[10] : Core.EQUIPMENT.map(function (e) { return { vehicle_id: id, key: e[0], label: e[1], issued: true }; }), equipment_audits: r[11] || [], equipment_missing: eqMissing };
        });
      },
      saveVehicle: function (v) { v = Object.assign({}, v, { plate: Core.normPlate(v.plate) }); if (!v.plate) return Promise.reject(new Error('FMS: plate required')); return save('vehicles', v); },
      saveRegistration: function (r) {
        r = Object.assign({}, r); if (!r.last_renewed_on) return Promise.reject(new Error('FMS: last_renewed_on required'));
        var month = r.renewal_month ? Promise.resolve(r.renewal_month) : one(fms().from('vehicles').select('plate').eq('id', r.vehicle_id)).then(function (v) { return Core.renewalMonthFromPlate(v.plate); });
        return month.then(function (m) { r.renewal_month = m; return save('registrations', r); });   // the DB trigger closes a funded registration request when request_id is set
      },
      saveInsurance: function (i) { if (Core.INS_KINDS.indexOf(i.kind) < 0) return Promise.reject(new Error('FMS: bad insurance kind')); return save('insurance', i); },
      softDelete: function (table, id) { return unwrap(fms().from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id)).then(function () { return { ok: true }; }); },
      // ---- requests ----
      createRequest: function (r) { return save('repair_requests', Object.assign({ kind: 'repair', priority: 'normal', source: 'admin', photos: [] }, r, { status: 'reported', requested_by: username })); },
      setPriority: function (id, o) { return one(fms().from('repair_requests').update({ priority: o.priority, priority_reason: o.reason || null }).eq('id', id).select('*')); },   // SQL trigger logs the change in request_log
      startCanvass: function (id) { return setStatus(id, { status: 'for_canvass' }); },
      submitEstimate: function (id, o) { return setStatus(id, { status: 'for_approval', est_cost: o && o.est_cost != null && o.est_cost !== '' ? Number(o.est_cost) : null, canvass_notes: (o && o.canvass_notes) || null }); },
      recordApproval: function (ids) { return unwrap(fms().rpc('record_approval', { p_ids: ids })); },
      listApprovals: function (id) { return unwrap(fms().from('approvals').select('*').eq('request_id', id).order('at')); },
      rejectRequest: function (id, o) { return unwrap(fms().rpc('reject_request', { p_id: id, p_reason: (o && o.reason) || '' })); },   // approvers are not admins: no direct update through RLS
      markFunded: function (id, o) { return setStatus(id, { status: 'funded', funded_on: (o && o.funded_on) || null, funded_amount: o && o.funded_amount != null && o.funded_amount !== '' ? Number(o.funded_amount) : null }); },
      startWork: function (id, o) {
        return setStatus(id, { status: 'ongoing' }).then(function (q) {
          return unwrap(fms().from('repairs').select('*, parts:repair_parts(*)').eq('request_id', id).is('deleted_at', null).limit(1)).then(function (ex) {
            if (ex && ex.length) return { request: q, repair: ex[0] };
            var pmsRule = q.kind === 'pms' ? unwrap(fms().from('pms_rules').select('id').eq('active', true).order('sort_order').limit(1)).then(function (r) { return (r && r[0] && r[0].id) || null; }) : Promise.resolve(null);
            return pmsRule.then(function (ruleId) { return save('repairs', { vehicle_id: q.vehicle_id, request_id: q.id, kind: q.kind === 'pms' ? 'pms' : 'repair', pms_rule_id: ruleId, odometer_km: o && o.odometer_km != null ? Number(o.odometer_km) : null, started_on: Core.today(), work_done: q.description, labor_cost: 0 }); }).then(function (rep) { rep.parts = []; return { request: q, repair: rep }; });
          });
        });
      },
      markDone: function (id, o) { var fin = (o && o.finished_on) || Core.today();
        return unwrap(fms().from('repairs').update({ finished_on: fin }).eq('request_id', id).is('finished_on', null).is('deleted_at', null)).then(function () { return setStatus(id, { status: 'done' }); }); },
      closeRequest: function (id, o) { o = o || {}; var patch = {}; if (o.odometer_km != null && o.odometer_km !== '') patch.odometer_km = Number(o.odometer_km); if (o.labor_cost != null && o.labor_cost !== '') patch.labor_cost = Number(o.labor_cost);
        var pre = Object.keys(patch).length ? unwrap(fms().from('repairs').update(patch).eq('request_id', id).is('deleted_at', null)) : Promise.resolve();
        return pre.then(function () { return setStatus(id, { status: 'closed' }); }); },
      overrideRequest: function (id, o) { return unwrap(fms().rpc('override_request', { p_id: id, p_to: o.to, p_reason: o.reason })); },
      requestLog: function (id) { return unwrap(fms().from('request_log').select('*').eq('request_id', id).order('at')); },
      joPrintData: function (id) {
        return one(fms().from('repair_requests').select(REQ_SELECT).eq('id', id)).then(function (q) {
          q = decorate([q])[0];
          return Promise.all([one(fms().from('vehicles').select('*').eq('id', q.vehicle_id)), unwrap(fms().from('repairs').select('*, parts:repair_parts(*)').eq('request_id', id).is('deleted_at', null).limit(1)),
            unwrap(fms().from('pms_status').select('current_km, current_km_at').eq('vehicle_id', q.vehicle_id).limit(1)), api.requestLog(id)])
            .then(function (r) { var p = (r[2] || [])[0]; return { request: q, vehicle: r[0], repair: (r[1] || [])[0] || null, odometer: p && p.current_km != null ? { km: Number(p.current_km), at: p.current_km_at } : null, driver_photos: q.photos || [], log: r[3] || [] }; });
        });
      },
      listRequests: function (f) {
        f = f || {}; var q = fms().from('repair_requests').select(REQ_SELECT).in('status', f.status || Core.REQ_STATUS).is('deleted_at', null).limit(2000);
        if (f.kind) q = q.eq('kind', f.kind); if (f.priority) q = q.eq('priority', f.priority); if (f.from) q = q.gte('requested_on', f.from); if (f.to) q = q.lte('requested_on', f.to);
        return unwrap(q).then(decorate);
      },
      monitoringTotals: function () { return unwrap(fms().rpc('monitoring_totals')); },
      // ---- work log / incidents / expenses / documents ----
      saveRepair: function (rep, parts) {
        rep = strip(rep); if (!rep.kind) rep.kind = 'repair';
        return save('repairs', rep).then(function (row) {
          return unwrap(fms().from('repair_parts').delete().eq('repair_id', row.id)).then(function () {
            var rows = (parts || []).filter(function (p) { return p.part_name; }).map(function (p) { return { repair_id: row.id, part_name: p.part_name, qty: Number(p.qty || 1), unit_cost: Number(p.unit_cost || 0) }; });
            return rows.length ? unwrap(fms().from('repair_parts').insert(rows)) : null;
          }).then(function () { return one(fms().from('repairs').select('*, parts:repair_parts(*)').eq('id', row.id)); });
        });
      },
      saveIncident: function (inc) { return save('incidents', Object.assign({ claim_status: 'none', resolved: false, damage_photos: [] }, inc)); },
      addExpense: function (e) { return save('expenses', { vehicle_id: e.vehicle_id, kind: 'other', amount: Number(e.amount || 0), spent_on: e.spent_on, description: e.description || '' }); },
      listExpenses: function (f) { f = f || {}; var q = fms().from('expenses').select('*').is('deleted_at', null).order('spent_on', { ascending: false }).limit(5000);
        if (f.vehicle_id) q = q.eq('vehicle_id', f.vehicle_id); if (f.from) q = q.gte('spent_on', f.from); if (f.to) q = q.lte('spent_on', f.to); return unwrap(q); },
      uploadDocument: function (vehicleId, kind, file, label, requestId) {
        var name = String((file && file.name) || 'file').replace(/[^A-Za-z0-9._-]/g, '_'); var path = 'vehicles/' + vehicleId + '/' + kind + '/' + Date.now() + '_' + name;
        return unwrap(client.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false }))
          .then(function () { return save('documents', { vehicle_id: vehicleId, request_id: requestId || null, kind: kind, storage_path: path, label: label || name, uploaded_by: username }); });
      },
      uploadPhoto: function (vehicleId, file, label) { return api.uploadDocument(vehicleId, 'photo', file, label); },
      documentUrl: function (doc) { return unwrap(client.storage.from(BUCKET).createSignedUrl(doc.storage_path, 3600)).then(function (d) { return d.signedUrl; }); },
      // ---- fleet-wide ----
      listAlerts: function () { return unwrap(fms().rpc('alerts')).then(function (a) { return a || []; }); },
      alertCounts: function () { return one(fms().from('alert_counts').select('*').eq('id', 1)); },
      executiveSummary: function () { return unwrap(fms().rpc('executive_summary')).then(function (r) { return r || []; }); },
      // ---- equipment (admin) ----
      saveEquipment: function (vehicleId, items) { var rows = (items || []).map(function (it) { return { vehicle_id: vehicleId, key: it.key, label: Core.equipmentLabel(it.key), issued: it.issued !== false, notes: it.notes || null }; });
        return unwrap(fms().from('vehicle_equipment').upsert(rows, { onConflict: 'vehicle_id,key' })).then(function () { return unwrap(fms().from('vehicle_equipment').select('*').eq('vehicle_id', vehicleId)); }); },
      setEquipmentStatus: function (vehicleId, key, status, remarks) { return one(fms().from('vehicle_equipment').update(status === 'missing' ? { status: 'missing', missing_since: Core.today(), missing_remarks: remarks || null, missing_by: username } : { status: 'equipped', missing_since: null, missing_remarks: null, missing_by: null, notes: remarks || null }).eq('vehicle_id', vehicleId).eq('key', key).select('*')); },
      saveEquipmentAudit: function (vehicleId, a) { return save('equipment_audits', { vehicle_id: vehicleId, audited_on: (a && a.audited_on) || Core.today(), audited_by: username, items: (a && a.items) || [], remarks: (a && a.remarks) || null }); },
      // ---- settings ----
      getSettings: function () {
        return Promise.all([unwrap(fms().from('pms_rules').select('*').order('sort_order')), unwrap(fms().from('members').select('*').is('deleted_at', null)), unwrap(fms().from('settings').select('*'))])
          .then(function (r) { var s = {}; (r[2] || []).forEach(function (x) { s[x.key] = x.value; }); return { pms_rules: r[0] || [], members: r[1] || [], push_teams: s.push_teams || '', pms_standard_cost: s.pms_standard_cost || '' }; });
      },
      savePmsRule: function (r) { return save('pms_rules', r); },
      saveMember: function (m) { return one(fms().from('members').upsert({ username: m.username, role: m.role === 'admin' ? 'admin' : null, role_title: m.role_title || 'Fleet admin', notify: m.notify !== false, push_team: m.push_team || null, deleted_at: m.deleted_at || null }, { onConflict: 'username' }).select('*')); },
      saveSetting: function (k, v) { return one(fms().from('settings').upsert({ key: k, value: String(v == null ? '' : v) }, { onConflict: 'key' }).select('*')); },
      listDashboardUsers: function () { return unwrap(client.from('dashboard_users').select('username, display_name').order('username')); },
      // ---- mobile ----
      myVehicles: function (team) { return unwrap(fms().from('vehicles').select('*, vehicle_equipment(key, label, issued, status, missing_since, missing_remarks, missing_by)').eq('assigned_team', team).neq('status', 'retired').is('deleted_at', null).order('plate')).then(function (rows) { return (rows || []).map(function (v) { v.equipment = v.vehicle_equipment && v.vehicle_equipment.length ? v.vehicle_equipment : null; delete v.vehicle_equipment; return v; }); }); },
      todayCheck: function (team) { return unwrap(fms().from('daily_checks').select('*').eq('team', team).eq('work_date', Core.today()).is('deleted_at', null).limit(1)).then(function (r) { return (r && r[0]) || null; }); },
      submitDailyCheck: function (c) { return unwrap(fms().rpc('submit_daily_check', { p: c })); },
      reportConcern: function (c) { return save('repair_requests', { vehicle_id: c.vehicle_id, kind: 'repair', description: c.description, priority: c.priority || 'normal', source: 'driver', photos: c.photos || [], status: 'reported', requested_by: username }); }
    };
    return api;
  }
  return { create: create };
});
