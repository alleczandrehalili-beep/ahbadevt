// AHBA FieldOps — NAP monitoring API over supabase-js v2 (schema `nap`, bucket `nap-photos`). Used by nap-dashboard.html and mobile-nap.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NapApi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var BUCKET = 'nap-photos', PAGE = 1000, OPEN_STATUSES = ['pending', 'blocked', 'unassigned'], OPEN_MAX = 2000, BY_IDS_CHUNK = 500;

  function fail(error, status) {
    var msg = (error && error.message) || String(error);
    var m = /^(NAP_[A-Z_]+)/.exec(msg);
    var e = new Error(msg); e.code = m ? m[1] : 'NAP_ERROR';
    if (status) e.status = status;
    if (error && error.code && !m) e.pgCode = String(error.code);
    return e;
  }
  function unwrap(p) { return Promise.resolve(p).then(function (r) { if (r.error) throw fail(r.error, r.status); return r.data; }); }
  // Phase 8: true when a call failed because the session token is expired / invalid (PostgREST 401, PGRST301 "JWT expired", PGRST302
  // "no bearer", "JWT expired", "invalid JWT"). A NAP_ error (the server's own refusal) is never an auth error.
  function isAuthError(e) {
    if (!e || /^NAP_/.test(String(e.code || '')) && e.code !== 'NAP_ERROR') return false;
    if (e.status === 401) return true;
    if (/^PGRST30[0-3]$/.test(String(e.pgCode || ''))) return true;
    return /JWT expired|invalid JWT|JWSError|JWT is expired|token is expired|Invalid token|not authenticated|session.*(missing|expired)/i.test(String(e.message || ''));
  }
  // Phase 8: sign in with the first email that works (NapCore.signInEmails order). Moves on ONLY when the answer is "wrong credentials"
  // (Supabase answers the same for an unknown email and a wrong password); any other answer (rate limit, network) stops. Resolves
  // {ok: true, email} or {ok: false, reason: 'credentials' | 'rate' | 'other', message}. The password is passed through, never kept.
  function signInFirst(client, emails, password) {
    var list = (emails || []).slice();
    function bad(err) {
      var code = String((err && (err.code || err.error_code)) || ''), msg = String((err && err.message) || '');
      if (code === 'invalid_credentials' || code === 'email_not_confirmed' || /invalid login credentials|email not confirmed/i.test(msg)) return 'credentials';
      if ((err && err.status === 429) || /rate limit|too many/i.test(msg) || code === 'over_request_rate_limit') return 'rate';
      return 'other';
    }
    function next(i, last) {
      if (i >= list.length) return Promise.resolve({ ok: false, reason: last || 'credentials' });
      return Promise.resolve(client.auth.signInWithPassword({ email: list[i], password: password })).then(function (r) {
        if (r && !r.error) return { ok: true, email: list[i] };
        var why = bad(r && r.error);
        if (why === 'credentials') return next(i + 1, 'credentials');
        return { ok: false, reason: why, message: String((r && r.error && r.error.message) || '') };
      }, function (err) { return { ok: false, reason: 'other', message: String((err && err.message) || err) }; });
    }
    return next(0, '');
  }
  // Phase 8: wraps every function of an api object so an auth error also calls onAuth() (the dashboard then shows "Session ended");
  // the error is still rethrown to the caller. Other errors pass through untouched.
  function guardAuth(api, onAuth) {
    var out = {};
    Object.keys(api).forEach(function (k) {
      var f = api[k];
      out[k] = typeof f !== 'function' ? f : function () {
        var r;
        try { r = f.apply(out, arguments); } catch (e) { if (isAuthError(e)) { try { onAuth(e); } catch (x) {} } throw e; }
        return r && typeof r.then === 'function' ? r.then(null, function (e) { if (isAuthError(e)) { try { onAuth(e); } catch (x) {} } throw e; }) : r;
      };
    });
    return out;
  }
  // writes use .select(): under RLS a forbidden update/delete is not an error, it just changes 0 rows. Report that, never "saved".
  function changed(p) {
    return unwrap(p).then(function (rows) {
      if (!rows || !rows.length) { var e = new Error('NAP_NOOP: nothing changed (you do not have permission, or the record no longer exists)'); e.code = 'NAP_NOOP'; throw e; }
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
      // Phase 8: what the phone may show, decided by the server in ONE call: {audit, view, role} (nap.my_nap_access, nap-17). On a database
      // without nap-17 (function missing) it falls back to my_role: a pilot field team ('field') gets both, everyone else nothing.
      myNapAccess: function () {
        var self = this;
        return Promise.resolve(nap().rpc('my_nap_access')).then(function (r) {
          if (r && r.error) {
            var m = String(r.error.message || '') + ' ' + String(r.error.code || '');
            if (/PGRST202|could not find the function|does not exist|42883/i.test(m)) {
              return self.myRole().then(function (role) { var f = role === 'field'; return { audit: f, view: f, role: role || 'none', fallback: true }; });
            }
            throw fail(r.error, r.status);
          }
          var d = (r && r.data) || {};
          return { audit: d.audit === true, view: d.view === true, role: typeof d.role === 'string' ? d.role : 'none' };
        });
      },
      // Phase 5: true for a console user (public.dashboard_users) while viewer_scope allows it. my_role already says 'viewer' unless the
      // account is also a pilot field team (then my_role stays 'field' for the phone); the dashboard asks this only in that case.
      isViewer: function () { return unwrap(nap().rpc('is_viewer')).then(function (v) { return v === true; }); },
      // Phase 5: the port grid of one ACTIVE box for the view-only Board (np, port, status, verified_at: no account numbers).
      boxPortsView: function (boxId) { return unwrap(nap().rpc('box_ports', { p_box_id: boxId })).then(function (r) { return r || []; }); },
      // EVERY box, paged 1000 at a time. Phase 2B (whole QC, ~46k boxes = 46 requests and ~15 MB): no screen calls this any more.
      // The dashboard uses barangaySummary + boxesInBarangay, the mobile boxesNear + searchBoxes. Kept for small tools and tests only.
      boxStatus: function () { return getAll('box_status', function (q) { return q.order('stencil'); }); },
      // One row per barangay (about 140 rows): counts per kind, boxes without coordinates, fresh free ports, newest check.
      barangaySummary: function () { return unwrap(nap().rpc('barangay_summary')).then(function (r) { return r || []; }); },
      // box_status rows within o.radius m (default 150, server max 5000) of o.lat/o.lng, nearest first, each with distance_m (limit <= 500).
      boxesNear: function (o) {
        o = o || {};
        return unwrap(nap().rpc('boxes_near', { p_lat: o.lat, p_lng: o.lng, p_radius_m: o.radius == null ? 150 : o.radius, p_limit: o.limit == null ? 100 : o.limit }))
          .then(function (r) { return r || []; });
      },
      // Typed stencil search (exact, single-NP form like 'QCY003 LP114 NP6', prefix, contains). Server needs 2+ characters; limit <= 50.
      searchBoxes: function (q, limit) {
        return unwrap(nap().rpc('search_boxes', { p_q: String(q == null ? '' : q), p_limit: limit == null ? 20 : limit })).then(function (r) { return r || []; });
      },
      // Phase 7 (Full NAP flow only): DEACTIVATED boxes by typed stencil -> [{box_id, stencil, barangay, street}]. Field or board; 2+ characters; limit <= 20.
      searchInactiveBoxes: function (q, limit) {
        return unwrap(nap().rpc('search_inactive_boxes', { p_q: String(q == null ? '' : q), p_limit: limit == null ? 10 : limit })).then(function (r) { return r || []; });
      },
      // One page of one barangay's boxes, ordered by stencil (kind 'aging' = stale oldest first, then unverified).
      boxesInBarangay: function (o) {
        o = o || {};
        return unwrap(nap().rpc('boxes_in_barangay', { p_barangay: o.barangay, p_kind: o.kind || null, p_limit: o.limit == null ? PAGE : o.limit, p_offset: o.offset || 0 }))
          .then(function (r) { return r || []; });
      },
      // Every box of one barangay, PAGE rows per request. PostgREST may cap a response at its max-rows setting (1000 on Supabase),
      // so a short page only ends the loop when o.expected (the barangay_summary count) is unknown; otherwise the loop runs until
      // o.expected rows arrived or a page comes back empty. o.onPage(rowsSoFar) reports progress. At most 60 requests.
      boxesInBarangayAll: function (o) {
        o = o || {};
        var self = this, out = [], size = o.pageSize || PAGE, n = 0;
        function next(offset) {
          return self.boxesInBarangay({ barangay: o.barangay, kind: o.kind, limit: size, offset: offset }).then(function (rows) {
            out = out.concat(rows); n++;
            if (o.onPage) { try { o.onPage(out.length); } catch (e) { /* progress only */ } }
            var done = !rows.length || (o.expected != null ? out.length >= o.expected : rows.length < size) || n >= 60;
            return done ? out : next(offset + rows.length);
          });
        }
        return next(0);
      },
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
            return { path: r.path, url: r.error ? null : url, error: r.error ? String(r.error) : (url ? null : 'no signed URL') };
          });
        });
      },
      listAudits: function (o) {
        o = o || {};
        var q = nap().from('audits').select('*, boxes:box_id(stencil,street), audit_ports(port,status,tag_acct), audit_photos(path)').order('created_at', { ascending: false }).limit(o.limit || 200);
        if (o.reviewStatus) q = q.eq('review_status', o.reviewStatus);
        if (o.joNapInactive) q = q.eq('jo_nap_inactive', true);   // phase 7: the deactivated-NAP records only
        if (o.boxId) q = q.eq('box_id', o.boxId);
        return unwrap(q);
      },
      // ---------- Audits tab (phase 10, nap-19; board only, the server checks) ----------
      // One page of nap.list_audits: params = NapCore.auditFilterParams(...).params, o = {limit (default 200, max 1000), cursor
      // (NapCore.auditCursor of the previous page), count (export: ask for the capped total)}. Rows: newest first, no ports / photos / account
      // numbers. Before nap-19 is on the database the call fails with code NAP_RPC_MISSING (the dashboard then uses listAudits, "Update pending").
      listAuditsPage: function (params, o) {
        o = o || {};
        var args = {}, p = params || {};
        ['p_district', 'p_barangay', 'p_street', 'p_kind', 'p_from', 'p_to', 'p_q'].forEach(function (k) { args[k] = p[k] == null || p[k] === '' ? null : p[k]; });
        args.p_limit = o.limit == null ? 200 : o.limit;
        if (o.cursor) { args.p_before_at = o.cursor.p_before_at; args.p_before_id = o.cursor.p_before_id; }
        if (o.count) args.p_count = true;
        return Promise.resolve(nap().rpc('list_audits', args)).then(function (r) {
          if (r && r.error) {
            var m = String(r.error.message || '') + ' ' + String(r.error.code || '');
            if (/PGRST202|could not find the function|does not exist|42883/i.test(m) && !/^NAP_/.test(String(r.error.message || ''))) {
              var e = new Error('NAP_RPC_MISSING: the database update for the Audits filters (nap-PHASE10-ALL.sql) is not installed yet'); e.code = 'NAP_RPC_MISSING'; throw e;
            }
            throw fail(r.error, r.status);
          }
          return (r && r.data) || [];
        });
      },
      // the distinct streets of one barangay: [{street, boxes}] (max 2000; default 500)
      streetsInBarangay: function (barangay, limit) {
        return unwrap(nap().rpc('streets_in_barangay', { p_barangay: barangay, p_limit: limit == null ? 500 : limit })).then(function (r) { return r || []; });
      },
      // ONE audit with its ports and photos, for the detail View (board RLS on the tables; the list never carries them)
      getAudit: function (id) {
        return unwrap(nap().from('audits').select('*, boxes:box_id(stencil,street), audit_ports(port,status,tag_acct), audit_photos(path)').eq('id', id).limit(1))
          .then(function (rows) { return (rows && rows[0]) || null; });
      },
      // Every row matching params, o.pageSize (1000) per request by keyset cursor, until an EMPTY page (a server row cap below the page size
      // never ends it early). The first page asks for the capped total: more than o.max (50,000) stops at once with NAP_EXPORT_TOO_MANY
      // (err.total), as does a run that passes o.max. o.onPage(rowsSoFar, total) reports progress; o.cancelled() true between pages stops
      // with NAP_CANCELLED. Rows are de-duplicated by id. At most max / pageSize + 2 requests.
      // Streaming (2026-10-20.4, the .xlsx worker): with o.onRows(rows) each page's new rows go to onRows (it may return a promise; the next
      // request waits for it), nothing is kept here, and the promise resolves with the row COUNT instead of the rows.
      exportAuditsAll: function (params, o) {
        o = o || {};
        var self = this, size = o.pageSize || PAGE, max = o.max == null ? 50000 : o.max, out = [], seen = {}, total = null, n = 0, limit = Math.ceil(max / size) + 2;
        var stream = typeof o.onRows === 'function', count = 0;
        function stop(code, msg, extra) { var e = new Error(code + ': ' + msg); e.code = code; if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; }); throw e; }
        function next(cursor) {
          if (o.cancelled && o.cancelled()) stop('NAP_CANCELLED', 'export cancelled');
          return self.listAuditsPage(params, { limit: size, cursor: cursor, count: n === 0 }).then(function (rows) {
            n++;
            if (o.cancelled && o.cancelled()) stop('NAP_CANCELLED', 'export cancelled');
            if (n === 1 && rows.length && rows[0].total_count != null) total = Number(rows[0].total_count);
            if (total != null && total > max) stop('NAP_EXPORT_TOO_MANY', 'more than ' + max + ' audits match', { total: total });
            var dest = stream ? [] : out;
            rows.forEach(function (r) { if (r && r.id != null && !seen[r.id]) { seen[r.id] = true; dest.push(r); count++; } });
            if (count > max) stop('NAP_EXPORT_TOO_MANY', 'more than ' + max + ' audits match', { total: total });
            return Promise.resolve(stream && dest.length ? o.onRows(dest) : null).then(function () {
              if (o.onPage) { try { o.onPage(count, total); } catch (e) { /* progress only */ } }
              if (!rows.length) return stream ? count : out;
              if (n >= limit) stop('NAP_TOO_MANY_PAGES', 'the export stopped after ' + n + ' pages');
              var r = rows[rows.length - 1];
              return next({ p_before_at: r.created_at, p_before_id: r.id });
            });
          });
        }
        return Promise.resolve().then(function () { return next(null); });
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
      // ---------- dispatch plan (phase 4, board only; the server checks) ----------
      // plan = {source?, note?, assignments: [{team, due, box_ids}]} -> {dispatch_id, requested, created, teams: [...], skipped: [{box_id, stencil, team, reason}]}
      dispatchPlan: function (plan) { return unwrap(nap().rpc('dispatch_plan', { p_plan: plan })); },
      // One row per active pilot field team: pending, blocked, done_today, overdue, oldest_pending_at / _days.
      teamLoad: function () { return unwrap(nap().rpc('team_load')).then(function (r) { return r || []; }); },
      // Box rows (status + open dispatch item) for a list of ids, in the order given. PostgREST returns at most 1000 rows per call, so the ids
      // go BY_IDS_CHUNK at a time, one request after the other (at most 2000 ids = 4 requests).
      boxesByIds: function (ids) {
        var list = (ids || []).slice(), out = [];
        function next(i) {
          if (i >= list.length) return Promise.resolve(out);
          return unwrap(nap().rpc('boxes_by_ids', { p_ids: list.slice(i, i + BY_IDS_CHUNK) })).then(function (rows) { out = out.concat(rows || []); return next(i + BY_IDS_CHUNK); });
        }
        return next(0);
      },
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
      geoReview: function (payload) { return unwrap(nap().rpc('geo_review', { p: payload })); },

      // ---------- NAP Master (board only; the server checks) ----------
      // Preview (nothing written) / apply (written, one transaction per call) of up to 5000 import rows: {row, stencil, barangay, ...}.
      masterPreview: function (rows) { return unwrap(nap().rpc('master_preview', { p_rows: rows })); },
      masterApply: function (rows) { return unwrap(nap().rpc('master_apply', { p_rows: rows })); },
      // Applies rows in sequential batches (default 1000). Resolves { counts (summed), results, new_barangays, batches }.
      // A failing batch rejects with err.partial = what the earlier batches applied (each batch is atomic; re-applying is safe).
      masterApplyAll: function (rows, o) {
        o = o || {};
        var self = this, size = o.batchSize || 1000, list = rows || [], out = { counts: {}, results: [], new_barangays: [], batches: 0, rows: 0 };
        function next(i) {
          if (i >= list.length) return Promise.resolve(out);
          var part = list.slice(i, i + size);
          if (o.onBatch) { try { o.onBatch(out.batches + 1, Math.ceil(list.length / size), i); } catch (e) { /* progress only */ } }
          return self.masterApply(part).then(function (r) {
            r = r || {};
            Object.keys(r.counts || {}).forEach(function (k) { out.counts[k] = (out.counts[k] || 0) + Number(r.counts[k] || 0); });
            out.results = out.results.concat(r.results || []);
            (r.new_barangays || []).forEach(function (b) { if (out.new_barangays.indexOf(b) < 0) out.new_barangays.push(b); });
            out.batches++; out.rows += part.length;
            return next(i + size);
          }, function (e) { e.partial = out; throw e; });
        }
        return next(0);
      },
      // One page of the master export (exact export-template columns), ordered by stencil. barangay null = the whole QC master.
      exportBoxes: function (o) {
        o = o || {};
        return unwrap(nap().rpc('export_boxes', { p_barangay: o.barangay || null, p_include_inactive: o.includeInactive !== false,
          p_limit: o.limit == null ? PAGE : o.limit, p_offset: o.offset || 0 })).then(function (r) { return r || []; });
      },
      // Every row of an export scope, PAGE rows per request, until a page comes back EMPTY (so a server row cap below PAGE can never end
      // it early and lose rows). Rows are de-duplicated by stencil (a box added meanwhile can shift a page). At most 200 requests.
      // o.cancelled() true before / after a request stops with NAP_CANCELLED. Streaming (2026-10-20.4, the .xlsx worker): with o.onRows(rows)
      // each page's new rows go to onRows (it may return a promise; the next request waits for it), nothing is kept here, and the promise
      // resolves with the row COUNT instead of the rows.
      exportBoxesAll: function (o) {
        o = o || {};
        var self = this, out = [], seen = {}, size = o.pageSize || PAGE, n = 0, stream = typeof o.onRows === 'function', count = 0;
        function cancelled() { if (o.cancelled && o.cancelled()) { var e = new Error('NAP_CANCELLED: export cancelled'); e.code = 'NAP_CANCELLED'; throw e; } }
        function next(offset) {
          cancelled();
          return self.exportBoxes({ barangay: o.barangay, includeInactive: o.includeInactive, limit: size, offset: offset }).then(function (rows) {
            n++;
            cancelled();
            var dest = stream ? [] : out;
            rows.forEach(function (r) { var k = r && r.stencil; if (k == null || !seen[k]) { if (k != null) seen[k] = true; dest.push(r); count++; } });
            return Promise.resolve(stream && dest.length ? o.onRows(dest) : null).then(function () {
              if (o.onPage) { try { o.onPage(count, n); } catch (e) { /* progress only */ } }
              if (!rows.length) return stream ? count : out;
              if (n >= 200) { var e = new Error('NAP_TOO_MANY_PAGES: the export stopped after 200 pages'); e.code = 'NAP_TOO_MANY_PAGES'; throw e; }
              return next(offset + rows.length);
            });
          });
        }
        return Promise.resolve().then(function () { return next(0); });
      }
    };
  }
  // ======================================================================================================================
  // ---------- phase 11: DESK UPDATE of ports (nap-20). Self-contained block: adds four methods to every api object create() returns ----------
  function deskApi(client) {
    var nap = function () { return client.schema('nap'); };
    function missingFn(err) { return /PGRST202|could not find the function|does not exist|42883/i.test(String((err && err.message) || '') + ' ' + String((err && err.code) || '')); }
    return {
      // true when the server lets this session desk-update ports (nap.my_desk_access). A database without nap-20 = false (button hidden).
      myDeskAccess: function () {
        return Promise.resolve(nap().rpc('my_desk_access')).then(function (r) {
          if (r && r.error) { if (missingFn(r.error)) return false; throw fail(r.error, r.status); }
          return !!(r && r.data === true);
        });
      },
      // the ports of one active box WITH account numbers (desk-update sessions only); np null = every NAP number
      portDetail: function (boxId, np) {
        return unwrap(nap().rpc('port_detail', { p_box_id: boxId, p_np: np == null ? null : Number(np) })).then(function (r) { return r || []; });
      },
      // payload = NapCore.desk.payload(...) -> {ok, audit_id, changed, unchanged, ports: [{port, status, tag_acct, old_status, old_tag_acct}], duplicate_acct, replay}
      deskUpdatePorts: function (payload) { return unwrap(nap().rpc('desk_update_ports', { p_payload: payload })); },
      // the old -> new values of one desk audit (the Audits list query is not changed: it reads audit_ports without the old_* columns)
      deskAuditPorts: function (auditId) {
        return unwrap(nap().from('audit_ports').select('port,status,tag_acct,old_status,old_tag_acct').eq('audit_id', auditId).order('port')).then(function (r) { return r || []; });
      }
    };
  }
  var createBase = create;
  create = function (client) { var api = createBase(client), d = deskApi(client); Object.keys(d).forEach(function (k) { api[k] = d[k]; }); return api; };
  // ======================================================================================================================
  // ======================================================================================================================
  // ---------- phase 12: REMARKS per port, LOCATION edit, STENCIL rename + merge (nap-21). Self-contained block: adds methods to every api ----------
  function p12Api(client) {
    var nap = function () { return client.schema('nap'); };
    function missingFn(err) { return /PGRST202|could not find the function|does not exist|42883/i.test(String((err && err.message) || '') + ' ' + String((err && err.code) || '')) && !/^NAP_/.test(String((err && err.message) || '')); }
    return {
      // true when the server lets this session edit NAP coordinates (nap.my_location_access). A database without nap-21 = false (button hidden).
      myLocationAccess: function () {
        return Promise.resolve(nap().rpc('my_location_access')).then(function (r) {
          if (r && r.error) { if (missingFn(r.error)) return false; throw fail(r.error, r.status); }
          return !!(r && r.data === true);
        });
      },
      // the remarks of one active box: [{np, port, remark, remark_by, remark_at}] (board + NAP technicians). Without nap-21: [] and .missing = true.
      portRemarks: function (boxId) {
        return Promise.resolve(nap().rpc('port_remarks', { p_box_id: boxId })).then(function (r) {
          if (r && r.error) { if (missingFn(r.error)) { var none = []; none.missing = true; return none; } throw fail(r.error, r.status); }
          return (r && r.data) || [];
        });
      },
      // payload = NapCore.p12.remarkPayload(...) -> {ok, changed, unchanged, items: [{np, port, remark, old_remark, remark_by, remark_at}], replay}
      setPortRemark: function (payload) { return unwrap(nap().rpc('set_port_remark', { p_payload: payload })); },
      // payload = NapCore.p12.locPayload(...) -> {ok, result: applied | moved | proposed | unchanged, needs_review, distance_m, lat, lng, history_id, replay}
      setBoxLocation: function (payload) { return unwrap(nap().rpc('set_box_location', { p_payload: payload })); },
      // {client_id, box_id, new_stencil, reason} -> {ok, changed, old_stencil, new_stencil, np_numbers, replay}
      renameBox: function (payload) { return unwrap(nap().rpc('rename_box', { p_payload: payload })); },
      // read only: what merging box `from` INTO box `to` would move (counts, NP union, conflicts, coordinates, blocked)
      mergeBoxesPreview: function (fromId, toId) { return unwrap(nap().rpc('merge_boxes_preview', { p_from: fromId, p_to: toId })); },
      // admin / super: {client_id, box_from, box_to, reason, confirm: true, allow_np_union} -> {ok, moved: {...}, np_numbers, coords_from, replay}
      mergeBoxes: function (payload) { return unwrap(nap().rpc('merge_boxes', { p_payload: payload })); },
      // board: which of these stencils were renamed / merged away -> [{old_stencil, box_id, current_stencil, action, at, active}]; without nap-21: []
      renamedStencils: function (stencils) {
        var list = (stencils || []).slice(0, 5000);
        if (!list.length) return Promise.resolve([]);
        return Promise.resolve(nap().rpc('renamed_stencils', { p_stencils: list })).then(function (r) {
          if (r && r.error) { if (missingFn(r.error)) return []; throw fail(r.error, r.status); }
          return (r && r.data) || [];
        });
      }
    };
  }
  var createBase12 = create;
  create = function (client) { var api = createBase12(client), d = p12Api(client); Object.keys(d).forEach(function (k) { api[k] = d[k]; }); return api; };
  // ======================================================================================================================

  return { create: create, BUCKET: BUCKET, isAuthError: isAuthError, signInFirst: signInFirst, guardAuth: guardAuth };
});
