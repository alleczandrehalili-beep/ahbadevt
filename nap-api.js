// AHBA FieldOps — NAP monitoring API over supabase-js v2 (schema `nap`, bucket `nap-photos`). Used by nap-dashboard.html and mobile-nap.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NapApi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var BUCKET = 'nap-photos', PAGE = 1000, OPEN_STATUSES = ['pending', 'blocked', 'unassigned'], OPEN_MAX = 2000;

  function fail(error) {
    var msg = (error && error.message) || String(error);
    var m = /^(NAP_[A-Z_]+)/.exec(msg);
    var e = new Error(msg); e.code = m ? m[1] : 'NAP_ERROR'; return e;
  }
  function unwrap(p) { return Promise.resolve(p).then(function (r) { if (r.error) throw fail(r.error); return r.data; }); }
  // writes use .select(): under RLS a forbidden update/delete is not an error, it just changes 0 rows. Report that, never "saved".
  function changed(p) {
    return unwrap(p).then(function (rows) {
      if (!rows || !rows.length) { var e = new Error('NAP_NOOP: walang nabago (wala kang pahintulot o wala na ang record)'); e.code = 'NAP_NOOP'; throw e; }
    });
  }

  function create(client) {
    var nap = function () { return client.schema('nap'); };

    function getAll(table, build) {
      var out = [];
      function next(from) {
        return unwrap(build(nap().from(table).select('*')).range(from, from + PAGE - 1)).then(function (rows) {
          rows = rows || []; out = out.concat(rows);
          return rows.length < PAGE ? out : next(from + PAGE);
        });
      }
      return next(0);
    }

    return {
      myRole: function () { return unwrap(nap().rpc('my_role')); },
      gateApplies: function () { return unwrap(nap().rpc('gate_applies_me')).then(Boolean); },
      boxStatus: function () { return getAll('box_status', function (q) { return q.order('stencil'); }); },
      boxPorts: function (boxId) { return unwrap(nap().from('ports').select('np,port,status,tag_acct,verified_at').eq('box_id', boxId).order('np').order('port')); },
      nearest: function (o) { return unwrap(nap().rpc('nearest_installable', { p_lat: o.lat, p_lng: o.lng, p_mode: o.mode || 'install', p_limit: o.limit == null ? 5 : o.limit })); },
      submitAudit: function (payload) { return unwrap(nap().rpc('submit_audit', { p: payload })); },
      uploadPhoto: function (team, clientId, index, blob) {
        var path = team + '/' + clientId + '/' + index + '.jpg';
        return Promise.resolve(client.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })).then(function (r) {
          // photos are immutable evidence (no UPDATE policy); a retry that finds the object already there is a success
          if (r.error && !(String(r.error.statusCode) === '409' || /already exists|duplicate/i.test(r.error.message || ''))) throw fail(r.error);
          return path;
        });
      },
      // one entry per path: {path, url, error}; a missing/forbidden object gives url null and its error text (never silently dropped)
      signedPhotoUrls: function (paths) {
        if (!paths || !paths.length) return Promise.resolve([]);
        return unwrap(client.storage.from(BUCKET).createSignedUrls(paths, 3600)).then(function (rows) {
          return (rows || []).map(function (r) {
            var url = r.signedUrl || r.signedURL || null;
            return { path: r.path, url: r.error ? null : url, error: r.error ? String(r.error) : (url ? null : 'walang signed URL') };
          });
        });
      },
      listAudits: function (o) {
        o = o || {};
        var q = nap().from('audits').select('*, boxes:box_id(stencil,street), audit_ports(port,status,tag_acct), audit_photos(path)').order('created_at', { ascending: false }).limit(o.limit || 200);
        if (o.reviewStatus) q = q.eq('review_status', o.reviewStatus);
        if (o.boxId) q = q.eq('box_id', o.boxId);
        return unwrap(q);
      },
      setReview: function (auditId, status) { return changed(nap().from('audits').update({ review_status: status }).eq('id', auditId).select('id')); },
      listPilot: function () { return unwrap(nap().from('pilot_access').select('*').order('role').order('username')); },
      savePilot: function (row) { return changed(nap().from('pilot_access').upsert(row, { onConflict: 'username' }).select('username')); },
      removePilot: function (username) { return changed(nap().from('pilot_access').delete().eq('username', username).select('username')); },
      getSettings: function () {
        return unwrap(nap().from('settings').select('key,value')).then(function (rows) { var o = {}; rows.forEach(function (r) { o[r.key] = r.value; }); return o; });
      },
      setSetting: function (key, value) { return changed(nap().from('settings').upsert({ key: key, value: String(value) }, { onConflict: 'key' }).select('key')); },
      dispatchMatch: function (rows) { return unwrap(nap().rpc('dispatch_match', { p_rows: rows })); },
      dispatchCreate: function (payload) { return unwrap(nap().rpc('dispatch_create', { p: payload })); },
      dispatchFromBoxes: function (payload) { return unwrap(nap().rpc('dispatch_from_boxes', { p: payload })); },
      dispatchAssign: function (payload) { return unwrap(nap().rpc('dispatch_assign', { p: payload })); },
      dispatchCancel: function (payload) { return unwrap(nap().rpc('dispatch_cancel', { p: payload })); },
      myDispatch: function () { return unwrap(nap().rpc('my_dispatch')); },
      // Newest `limit` items, PLUS every open item (pending / blocked / unassigned, up to OPEN_MAX): a busy week of done items must never push
      // an old pending or blocked item out of the list or skew the per-team counts. Each row also carries audit:{review_status} when linked.
      listDispatchItems: function (o) {
        o = o || {};
        function build() {
          var q = nap().from('dispatch_items').select('*, boxes:box_id(stencil,street,barangay), audit:audit_id(review_status)').order('created_at', { ascending: false });
          if (o.status) q = q.eq('status', o.status);
          if (o.team) q = q.eq('team', o.team);
          return q;
        }
        var statusIsOpen = !!o.status && OPEN_STATUSES.indexOf(o.status) >= 0;
        if (statusIsOpen) return unwrap(build().limit(OPEN_MAX));
        var recent = unwrap(build().limit(o.limit || 300));
        if (o.status) return recent;
        var open = unwrap(build().in('status', OPEN_STATUSES).limit(OPEN_MAX));
        return Promise.all([recent, open]).then(function (parts) {
          var seen = {}, out = [];
          parts[0].concat(parts[1]).forEach(function (r) { if (!seen[r.id]) { seen[r.id] = true; out.push(r); } });
          return out.sort(function (x, y) { return x.created_at < y.created_at ? 1 : x.created_at > y.created_at ? -1 : 0; });
        });
      },
      listGeoHistory: function (o) {
        o = o || {};
        var q = nap().from('box_geo_history').select('*, boxes:box_id(stencil)').order('created_at', { ascending: false }).limit(o.limit || 100);
        if (o.result) q = q.eq('result', o.result);
        if (o.boxId) q = q.eq('box_id', o.boxId);
        return unwrap(q);
      },
      geoReview: function (payload) { return unwrap(nap().rpc('geo_review', { p: payload })); }
    };
  }
  return { create: create, BUCKET: BUCKET };
});
