// AHBA FieldOps mobile — FLEET daily checklist (BLOWBAGETS) gate + "Report repair concern". Mount-only; all data via FmsApi.
// mount(rootEl, {api, user:{username (team), display_name, driver}, deps:{toast, compressImage, notify(payload)}, onConfirmed(check)}) -> {refresh, destroy, openConcern}
(function (root) {
  'use strict';
  var Core = root.FmsCore;
  var CSS = '.mf{font:14px system-ui,sans-serif;color:#0e2b27;padding:14px;max-width:520px;margin:0 auto}.mf h2{font:800 18px Manrope,system-ui;margin:0 0 4px}.mf p.sub{margin:0 0 12px;color:#5a6b66;font-size:12px}' +
    '.mf-card{background:#fff;border:1px solid #e3e8e2;border-radius:14px;padding:12px;margin-bottom:10px}.mf-item{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #eef1ed}.mf-item:last-child{border-bottom:0}.mf-item b{flex:1;font-size:13px}' +
    '.mf-seg{display:flex;border:1px solid #cfd8d3;border-radius:9px;overflow:hidden}.mf-seg button{border:0;background:#fff;padding:8px 12px;font-weight:800;font-size:12px;color:#5a6b66;cursor:pointer}.mf-seg button.ok.on{background:#18a57b;color:#fff}.mf-seg button.bad.on{background:#c2503a;color:#fff}' +
    '.mf input,.mf select,.mf textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #cfd8d3;border-radius:10px;font-size:14px;font-family:inherit}.mf label{display:block;font-size:11px;font-weight:700;color:#5a6b66;margin:8px 0 4px}' +
    '.mf-btn{width:100%;padding:13px;border-radius:12px;border:0;background:#18a57b;color:#fff;font-weight:800;font-size:15px;margin-top:10px;cursor:pointer}.mf-btn:disabled{opacity:.5}.mf-btn.sec{background:#fff;color:#0e2b27;border:1px solid #cfd8d3}' +
    '.mf-rem{margin-top:6px}.mf-warn{background:#fff3d6;color:#9a6200;border-radius:10px;padding:8px 10px;font-size:12px;margin-top:8px}.mf-ok{background:#e7f7ef;color:#11825f;border-radius:10px;padding:8px 10px;font-size:12px;margin-bottom:8px}' +
    '.mf-thumbs{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.mf-thumbs img{width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid #e3e8e2}.mf-req{font-size:12px;padding:6px 0;border-bottom:1px solid #eef1ed}.mf-req:last-child{border-bottom:0}.mf-pill{display:inline-block;font-size:10px;font-weight:800;padding:2px 7px;border-radius:9px;background:#eef2ec;color:#3a4a45;margin-left:4px}';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function mount(rootEl, o) {
    var api = o.api, user = o.user || {}, deps = o.deps || {}, team = user.username;
    var toast = deps.toast || function (m) { console.log('[mf]', m); };
    if (!document.getElementById('mfCss')) { var st = document.createElement('style'); st.id = 'mfCss'; st.textContent = CSS; document.head.appendChild(st); }
    var S = { vehicles: [], vehicleId: null, items: Core.BLOWBAGETS.map(function (b) { return { key: b[0], label: b[1], ok: true, remarks: '' }; }), equipment: [], odometer: '', fuel: '', photo: null, busy: false, mode: 'check', today: null, myRequests: [] };
    function fail(e) { toast((e && e.message) || String(e)); }
    function setVehicle(id) { S.vehicleId = id; var v = S.vehicles.filter(function (x) { return x.id === id; })[0]; S.equipment = Core.equipmentChecklist(v ? v.equipment : null); }
    function load() {
      return Promise.all([api.myVehicles(team), api.todayCheck(team), api.listRequests({ status: Core.OPEN_STATUS })]).then(function (r) {
        S.vehicles = r[0] || []; S.today = r[1]; var mine = S.vehicles.map(function (v) { return v.id; });
        S.myRequests = (r[2] || []).filter(function (q) { return mine.indexOf(q.vehicle_id) >= 0; });
        setVehicle(S.vehicleId || (S.today ? S.today.vehicle_id : (S.vehicles[0] ? S.vehicles[0].id : null)));
        render();
      }).catch(fail);
    }
    function render() { if (S.mode === 'concern') return renderConcern(); renderCheck(); }
    function vehOptions(sel) { return S.vehicles.length ? S.vehicles.map(function (v) { return '<option value="' + v.id + '"' + (v.id === sel ? ' selected' : '') + '>' + esc(v.plate) + (v.svc_code ? ' · ' + esc(v.svc_code) : '') + ' · ' + esc(v.make + ' ' + v.model) + '</option>'; }).join('') : '<option value="">No vehicle assigned to this team — tell the admin</option>'; }
    function renderCheck() {
      var done = S.today, notOk = S.items.filter(function (i) { return !i.ok; });
      rootEl.innerHTML = '<div class="mf"><h2>🚐 Daily vehicle check</h2><p class="sub">' + esc(team) + (user.driver ? ' · driver ' + esc(user.driver) : '') + ' · B.L.O.W.B.A.G.E.T.S. before your first load</p>' +
        (done ? '<div class="mf-ok">✅ Confirmed today ' + esc(String(done.confirmed_at).slice(11, 16)) + ' · ' + esc(done.odometer_km) + ' km · fuel ' + esc(done.fuel_level) + '</div>' : '') +
        '<div class="mf-card"><label>Vehicle</label><select id="mfVeh">' + vehOptions(S.vehicleId) + '</select>' +
        '<label>Odometer now (km)</label><input id="mfOdo" type="number" inputmode="numeric" value="' + esc(S.odometer) + '" placeholder="e.g. 84200">' +
        '<label>Fuel level</label><div class="mf-seg" id="mfFuel">' + Core.FUEL_LEVELS.map(function (f) { return '<button type="button" data-f="' + f + '" class="ok' + (S.fuel === f ? ' on' : '') + '" style="flex:1">' + f + '</button>'; }).join('') + '</div></div>' +
        '<div class="mf-card">' + S.items.map(function (it, i) { return '<div class="mf-item"><b>' + esc(it.label) + '</b><div class="mf-seg"><button type="button" class="ok' + (it.ok ? ' on' : '') + '" data-i="' + i + '" data-ok="1">OK</button><button type="button" class="bad' + (!it.ok ? ' on' : '') + '" data-i="' + i + '" data-ok="0">Not OK</button></div></div>' + (!it.ok ? '<input class="mf-rem" data-rem="' + i + '" placeholder="What is wrong with ' + esc(it.label.toLowerCase()) + '?" value="' + esc(it.remarks) + '">' : ''); }).join('') + '</div>' +
        '<div class="mf-card"><label style="margin-top:0">🧰 Equipment on board (issued to this vehicle)</label>' + (S.equipment.length ? S.equipment.map(function (it, i) { if (it.locked) return '<div class="mf-item" style="opacity:.75"><b>' + esc(it.label) + '<br><small style="color:#b23a25;font-weight:600">Tagged missing' + (it.missing_since ? ' since ' + esc(it.missing_since) : '') + (it.remarks ? ' — ' + esc(it.remarks) : '') + '</small></b><span class="mf-pill" style="background:#fde8e4;color:#b23a25">missing · admin to restore</span></div>';
          return '<div class="mf-item"><b>' + esc(it.label) + '</b><div class="mf-seg"><button type="button" class="ok' + (it.present ? ' on' : '') + '" data-e="' + i + '" data-p="1">On board</button><button type="button" class="bad' + (!it.present ? ' on' : '') + '" data-e="' + i + '" data-p="0">Missing</button></div></div>' + (!it.present ? '<input class="mf-rem" data-erem="' + i + '" placeholder="Where is the ' + esc(it.label.toLowerCase()) + '? (asked once)" value="' + esc(it.remarks) + '">' : ''); }).join('') : '<small style="color:#8a9894">No equipment issued to this vehicle</small>') + '</div>' +
        '<div class="mf-card"><label>Photo (optional)</label><input id="mfPhoto" type="file" accept="image/*" capture="environment"></div>' +
        (notOk.length ? '<div class="mf-warn">' + notOk.length + ' item(s) Not OK — a repair request will be raised for each. You can still dispatch.</div>' : '') +
        (S.equipment.some(function (i) { return !i.present; }) ? '<div class="mf-warn">Missing equipment will be reported to the fleet admin for audit.</div>' : '') +
        '<button class="mf-btn" id="mfConfirm"' + (S.busy || !S.vehicles.length ? ' disabled' : '') + '>' + (S.busy ? 'Saving…' : (done ? 'Update check & continue' : 'Confirm dispatch')) + '</button>' +
        (done ? '<button class="mf-btn sec" id="mfSkip">Continue to loads</button>' : '') +
        '<button class="mf-btn sec" id="mfConcern">🔧 Report a repair concern</button>' +
        (S.myRequests.length ? '<div class="mf-card" style="margin-top:10px"><label style="margin-top:0">My team\'s open requests</label>' + S.myRequests.map(function (q) { return '<div class="mf-req">' + esc(q.plate) + ' · ' + esc(q.description).slice(0, 70) + '<span class="mf-pill">' + esc(Core.STATUS_LABEL[q.status] || q.status) + '</span></div>'; }).join('') + '</div>' : '') + '</div>';
      var $ = function (s) { return rootEl.querySelector(s); };
      $('#mfVeh').onchange = function () { setVehicle(this.value); renderCheck(); };
      $('#mfOdo').oninput = function () { S.odometer = this.value; };
      rootEl.querySelectorAll('#mfFuel button').forEach(function (b) { b.onclick = function () { S.fuel = b.dataset.f; renderCheck(); }; });
      rootEl.querySelectorAll('[data-i]').forEach(function (b) { b.onclick = function () { S.items[Number(b.dataset.i)].ok = b.dataset.ok === '1'; renderCheck(); }; });
      rootEl.querySelectorAll('[data-rem]').forEach(function (inp) { inp.oninput = function () { S.items[Number(inp.dataset.rem)].remarks = inp.value; }; });
      rootEl.querySelectorAll('[data-e]').forEach(function (b) { b.onclick = function () { S.equipment[Number(b.dataset.e)].present = b.dataset.p === '1'; renderCheck(); }; });
      rootEl.querySelectorAll('[data-erem]').forEach(function (inp) { inp.oninput = function () { S.equipment[Number(inp.dataset.erem)].remarks = inp.value; }; });
      $('#mfPhoto').onchange = function () { S.photo = this.files[0] || null; };
      $('#mfConfirm').onclick = confirmDispatch;
      var sk = $('#mfSkip'); if (sk) sk.onclick = function () { if (o.onConfirmed) o.onConfirmed(S.today); };
      $('#mfConcern').onclick = function () { S.mode = 'concern'; render(); };
    }
    function confirmDispatch() {
      if (!S.vehicleId) { toast('Select the vehicle'); return; }
      if (S.odometer === '' || isNaN(Number(S.odometer))) { toast('Enter the odometer'); return; }
      if (!S.fuel) { toast('Select the fuel level'); return; }
      var bad = S.items.filter(function (i) { return !i.ok && !String(i.remarks || '').trim(); }); if (bad.length) { toast('Describe what is wrong with: ' + bad.map(function (i) { return i.label; }).join(', ')); return; }
      var badEq = S.equipment.filter(function (i) { return !i.present && !i.locked && !String(i.remarks || '').trim(); }); if (badEq.length) { toast('Say where the missing equipment is: ' + badEq.map(function (i) { return i.label; }).join(', ')); return; }
      S.busy = true; renderCheck();
      var photo = S.photo ? Promise.resolve(deps.compressImage ? deps.compressImage(S.photo, 1000, 90, null) : S.photo).then(function (blob) { var f = blob; try { f = new File([blob], 'check.jpg', { type: 'image/jpeg' }); } catch (_) {} return api.uploadPhoto(S.vehicleId, f, 'Daily check ' + Core.today()).then(function (d) { return d.storage_path; }); }) : Promise.resolve(null);
      photo.then(function (path) { return api.submitDailyCheck({ team: team, vehicle_id: S.vehicleId, driver: user.driver || null, items: S.items, equipment: S.equipment, odometer_km: Number(S.odometer), fuel_level: S.fuel, photo_path: path }); })
        .then(function (r) {
          var v = S.vehicles.filter(function (x) { return x.id === S.vehicleId; })[0] || {}; var sum = Core.checkSummary(S.items);
          toast(r.requests.length ? r.requests.length + ' repair request(s) raised — dispatch confirmed' : 'Vehicle check confirmed — dispatch OK');
          if (deps.notify) deps.notify({ title: '🚐 ' + team + ' dispatched', body: (v.plate || '') + ' · ' + S.odometer + ' km · fuel ' + S.fuel + (sum.not_ok ? ' · ' + sum.not_ok + ' Not OK: ' + sum.labels.join(', ') : ' · all OK') });
          S.busy = false; S.today = r.check; if (o.onConfirmed) o.onConfirmed(r.check);
        }).catch(function (e) { S.busy = false; renderCheck(); fail(e); });
    }
    function renderConcern() {
      rootEl.innerHTML = '<div class="mf"><h2>🔧 Report a repair concern</h2><p class="sub">' + esc(team) + ' · goes to the fleet admin for canvassing, then to the approvers</p>' +
        '<div class="mf-card"><label>Vehicle</label><select id="mfVeh2">' + vehOptions(S.vehicleId) + '</select>' +
        '<label>What is wrong?</label><textarea id="mfDesc" rows="4" placeholder="e.g. Clutch slipping on uphill, since Monday"></textarea>' +
        '<label>Priority</label><select id="mfPrio">' + Core.PRIORITIES.map(function (p) { return '<option value="' + p + '"' + (p === 'normal' ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select>' +
        '<label>Photos</label><input id="mfPhotos" type="file" accept="image/*" multiple><div class="mf-thumbs" id="mfThumbs"></div></div>' +
        '<button class="mf-btn" id="mfSend">Send to fleet admin</button><button class="mf-btn sec" id="mfBack">Back</button></div>';
      var $ = function (s) { return rootEl.querySelector(s); }, files = [];
      $('#mfPhotos').onchange = function () { files = Array.prototype.slice.call(this.files || []); $('#mfThumbs').innerHTML = files.map(function (f) { return '<img src="' + URL.createObjectURL(f) + '">'; }).join(''); };
      $('#mfBack').onclick = function () { S.mode = 'check'; render(); };
      $('#mfSend').onclick = function () {
        var vid = $('#mfVeh2').value, desc = $('#mfDesc').value.trim(); if (!vid) { toast('Select the vehicle'); return; } if (!desc) { toast('Describe the concern'); return; }
        var btn = $('#mfSend'); btn.disabled = true;
        Promise.all(files.map(function (f) { return Promise.resolve(deps.compressImage ? deps.compressImage(f, 1000, 90, null) : f).then(function (blob) { var ff = blob; try { ff = new File([blob], f.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }); } catch (_) {} return api.uploadPhoto(vid, ff, 'Concern photo'); }).then(function (d) { return d.storage_path; }); }))
          .then(function (paths) { return api.reportConcern({ team: team, vehicle_id: vid, description: desc, priority: $('#mfPrio').value, photos: paths }); })
          .then(function () { toast('Sent — the fleet admin will canvass and request approval'); S.mode = 'check'; return load(); })
          .catch(function (e) { btn.disabled = false; fail(e); });
      };
    }
    load();
    return { refresh: load, destroy: function () { rootEl.innerHTML = ''; }, openConcern: function () { S.mode = 'concern'; render(); } };
  }
  root.MobileFMS = { mount: mount };
})(typeof self !== 'undefined' ? self : this);
