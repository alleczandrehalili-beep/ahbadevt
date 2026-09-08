// AHBA QA Audit — real QaApi over supabase-js v2 (schema `qa`, bucket `qa-photos`). Same method set as qa-sim.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./qa-core.js'));
  else root.QaApi = factory(root.QaCore);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  var BUCKET = 'qa-photos', PUBLIC_PHOTOS = 'job-photos';
  function create(client, opts) {
    opts = opts || {};
    var qa = function () { return client.schema('qa'); };
    var username = opts.username || '';
    function unwrap(p) { return Promise.resolve(p).then(function (r) { if (r.error) throw new Error(r.error.message || String(r.error)); return r.data; }); }
    function rpc(name, args) { return unwrap(qa().rpc(name, args || {})); }
    function safeName(s) { return String(s || 'photo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40); }
    function upload(path, blob, type) { return unwrap(client.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false })).then(function () { return { path: path }; }); }
    // PostgREST caps at 1,000 rows/request → page through explicitly for any unbounded list.
    function pageAll(build, size) {
      size = size || 1000; var out = [];
      function step(from) { return unwrap(build().range(from, from + size - 1)).then(function (rows) { rows = rows || []; out = out.concat(rows); return rows.length === size ? step(from + size) : out; }); }
      return step(0);
    }
    var api = {
      listMyAudits: function (u) {
        var cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
        return pageAll(function () { return qa().from('audits').select('*').eq('assigned_to', u || username).is('deleted_at', null)
          .or('status.in.(assigned,in_progress),and(status.eq.done,inspected_at.gte.' + cutoff + ')').order('scheduled_date', { ascending: true }).order('sequence', { ascending: true }); });
      },
      startAudit: function (id, pos) { pos = pos || {}; return rpc('start_audit', { p_id: id, p_lat: pos.lat == null ? null : pos.lat, p_lng: pos.lng == null ? null : pos.lng }); },
      uploadPhoto: function (id, blob, meta) { meta = meta || {}; return upload('qa/' + id + '/' + safeName(meta.label) + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '.jpg', blob, 'image/jpeg'); },
      uploadSignature: function (id, who, blob) { return upload('qa/' + id + '/sig_' + who + '_' + Date.now() + '.png', blob, 'image/png'); },
      submitAudit: function (id, payload) { return rpc('submit_audit', { p_id: id, p_payload: payload }); },
      getInstallPhotos: function (jobId) {
        if (!jobId) return Promise.resolve([]);
        return unwrap(client.from('job_photos').select('path,label').eq('job_id', jobId).order('created_at', { ascending: true })).then(function (rows) {
          var base = (opts.supaUrl || '') + '/storage/v1/object/public/' + PUBLIC_PHOTOS + '/';
          return (rows || []).map(function (r) { return { path: r.path, label: r.label, url: base + r.path }; });
        });
      },
      listAudits: function (f) {
        f = f || {}; var page = f.page || 1, size = f.pageSize || 50;
        var b = qa().from('audits').select('*', { count: 'exact' }).is('deleted_at', null);
        if (f.status && f.status.length) b = b.in('status', f.status);
        if (f.contractor) b = b.eq('contractor_name', f.contractor);
        if (f.kind) b = b.eq('kind', f.kind);
        if (f.barangay) b = b.eq('barangay', f.barangay);
        if (f.from) b = b.gte('jo_date_closed', f.from);
        if (f.to) b = b.lte('jo_date_closed', f.to);
        if (f.inspector) { var insp = String(f.inspector).replace(/[(),]/g, ' ').trim(); b = b.or('inspector.eq.' + insp + ',assigned_to.eq.' + insp); }
        if (f.assessment) b = b.eq('assessment', f.assessment);
        if (f.qfrom) b = b.gte('inspected_at', f.qfrom + 'T00:00:00+08:00');
        if (f.qto) b = b.lte('inspected_at', f.qto + 'T23:59:59+08:00');
        if (f.q) { var q = String(f.q).replace(/[(),]/g, ' ').trim().replace(/[%_]/g, '\\$&'); b = b.or('id.ilike.%' + q + '%,subscriber.ilike.%' + q + '%,address.ilike.%' + q + '%,jo_no.ilike.%' + q + '%,acct_no.ilike.%' + q + '%'); }
        b = b.order('jo_date_closed', { ascending: false, nullsFirst: false }).order('id').range((page - 1) * size, page * size - 1);
        return Promise.resolve(b).then(function (r) { if (r.error) throw new Error(r.error.message); return { rows: r.data || [], total: r.count || 0 }; });
      },
      assignAudits: function (ids, o) { o = o || {}; return rpc('assign_audits', { p_ids: ids, p_inspector: o.inspector, p_date: o.date, p_start_seq: o.startSeq == null ? 1 : o.startSeq }); },
      unassignAudits: function (ids) { return rpc('unassign_audits', { p_ids: ids }); },
      queuePool: function (ids) { return rpc('queue_pool', { p_ids: ids }); },
      sampleInhouse: function (o) { o = o || {}; return rpc('sample_inhouse', { p_from: o.from, p_to: o.to, p_pct: o.pct }); },
      getAudit: function (id) {
        return Promise.all([
          unwrap(qa().from('audits').select('*').eq('id', id).single()),
          unwrap(qa().from('audit_items').select('*').eq('audit_id', id)),
          unwrap(qa().from('audit_photos').select('*').eq('audit_id', id).order('id')),
          unwrap(qa().from('audit_violations').select('*').eq('audit_id', id).order('id')),
          unwrap(qa().from('audit_log').select('*').eq('audit_id', id).order('at'))
        ]).then(function (r) { return { audit: r[0], items: r[1] || [], photos: r[2] || [], violations: r[3] || [], log: r[4] || [] }; });
      },
      reopenAudit: function (id, o) { return rpc('reopen_audit', { p_id: id, p_reason: (o || {}).reason || '' }); },
      listInspectors: function () { return unwrap(client.from('technicians').select('username,display_name').eq('role', 'qa_inspector').order('username')); },
      board: function (date) { return pageAll(function () { return qa().from('audits').select('*').eq('scheduled_date', date).is('deleted_at', null).not('assigned_to', 'is', null).order('assigned_to').order('sequence'); }); },
      weeklyReport: function (from, to) { return rpc('weekly_report', { p_from: from, p_to: to }); },
      getConfig: function () {
        return Promise.all([
          unwrap(qa().from('checklist_items').select('*').order('sort_order')), pageAll(function () { return qa().from('violation_codes').select('*').order('code'); }),
          unwrap(qa().from('contractors').select('*').order('sheet_name')), unwrap(qa().from('quick_remarks').select('*').order('sort_order')), unwrap(qa().from('settings').select('*'))
        ]).then(function (r) { var s = {}; (r[4] || []).forEach(function (x) { s[x.key] = x.value; }); return { checklist: r[0] || [], codes: r[1] || [], contractors: r[2] || [], quickRemarks: r[3] || [], settings: s }; });
      },
      // server-managed columns (identity PK, timestamps) must never travel in an update/upsert body
      saveChecklistItem: function (item) {
        var b = Object.assign({}, item); delete b.id; delete b.created_at; delete b.updated_at;
        return unwrap(item.id ? qa().from('checklist_items').update(b).eq('id', item.id).select().single() : qa().from('checklist_items').insert(b).select().single());
      },
      saveCode: function (code) { var b = Object.assign({}, code); delete b.created_at; delete b.updated_at; return unwrap(qa().from('violation_codes').upsert(b, { onConflict: 'code' }).select().single()); },
      saveContractor: function (c) { var b = Object.assign({}, c); delete b.created_at; delete b.updated_at; return unwrap(qa().from('contractors').upsert(b, { onConflict: 'sheet_name' }).select().single()); },
      saveSetting: function (k, v) { return unwrap(qa().from('settings').upsert({ key: k, value: String(v) }, { onConflict: 'key' }).select().single()); },
      syncStatus: function () { return rpc('sync_status'); },
      importRows: function (rows) {
        var norm = (rows || []).map(function (r) { var n = Core.normalizeSheetRow(r); if (n) n.raw = r; return n; }).filter(Boolean);
        var chunks = []; for (var i = 0; i < norm.length; i += 500) chunks.push(norm.slice(i, i + 500));
        return chunks.reduce(function (p, ch) { return p.then(function () { return unwrap(qa().from('sheet_rows').upsert(ch, { onConflict: 'jo_no' })); }); }, Promise.resolve())
          .then(function () { return rpc('ingest_sheet_rows'); })
          .then(function (n) { return api.saveSetting('last_sync_at', new Date().toISOString()).then(function () { return api.saveSetting('last_sync_rows', norm.length); }).then(function () { return { upserted: norm.length, audits_created: n }; }); });
      },
      subscribe: function (cb) {
        var ch = client.channel('qa-audits-' + Math.random().toString(36).slice(2, 8)).on('postgres_changes', { event: '*', schema: 'qa', table: 'audits' }, function (m) { cb({ type: 'audit', row: m.eventType === 'DELETE' ? m.old : m.new }); }).subscribe();
        return function () { try { client.removeChannel(ch); } catch (e) {} };
      },
      photoUrl: function (path) { return unwrap(client.storage.from(BUCKET).createSignedUrl(path, 3600)).then(function (d) { return (d && d.signedUrl) || ''; }); }
    };
    return api;
  }
  return { create: create };
});
