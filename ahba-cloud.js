(function () {
  const config = {
    url: 'https://avjzkfxgzeyxtihkofed.supabase.co',
    anonKey: 'sb_publishable_2JM51zp2r5GUICznc6Nz4Q_B4UFS1da'
  };
  const configured = /^https:\/\/.+\.supabase\.co$/.test(config.url || '') &&
    config.anonKey && !config.anonKey.startsWith('YOUR_');

  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
    'Content-Type': 'application/json'
  };

  async function request(path, options = {}) {
    if (!configured) return null;
    const response = await fetch(`${config.url}/rest/v1/${path}`, {
      ...options,
      headers: {...headers, ...(options.headers || {})}
    });
    if (!response.ok) {
      // Surface the real reason (RLS = 401/403, missing table = 404, bad column = 400)
      let detail = '';
      try { detail = (await response.text()).slice(0, 180); } catch (e) {}
      throw new Error(`HTTP ${response.status} ${response.statusText}${detail ? ' — ' + detail : ''}`);
    }
    return response.status === 204 ? null : response.json();
  }

  // Extra subscriber / job-order fields (DB snake_case keys, carried as-is on the job object)
  var EXTRA = ['load_date','dispatch_status','driver','tech1','mapping_team','mapping_remarks',
    'dispatched_remarks','ibass_acct_no','job_order_no','vas_no','play_type','special_note',
    'ref_no','new_ref','primary_no','other_contact_no','first_name','middle_name','last_name',
    'house_no','street_name','village','brgy','city','in_charge','source_of_sales','referral_name',
    'negative_remark','negative_at','dispatch_count','history','created_at',
    'payment_mode','payment_amount','ar_no','work_account','crew_driver','crew_tech1','crew_tech2',
    'remittance_received','remittance_received_by','remittance_received_at'];

  function normalizeJob(row) {
    var j = {
      id: row.id,
      subscriber: row.subscriber,
      type: row.service_type,
      plan: row.plan,
      area: row.area,
      address: row.address,
      status: row.status,
      wait: row.wait_time || '—',
      priority: row.priority || 'Normal',
      schedule: row.schedule || 'Today',
      team: row.team,
      updatedAt: row.updated_at || null,
      validated: row.validated || false,
      validated_at: row.validated_at || null
    };
    EXTRA.forEach(function (k) { j[k] = row[k]; });
    return j;
  }

  function serializeJob(job) {
    var out = {
      id: job.id,
      subscriber: job.subscriber,
      service_type: job.type,
      plan: job.plan,
      area: job.area,
      address: job.address,
      status: job.status,
      wait_time: job.wait,
      priority: job.priority,
      schedule: job.schedule,
      team: job.team || null,
      updated_at: new Date().toISOString()
    };
    // pass through any subscriber fields that are set (never touch `validated` here)
    EXTRA.forEach(function (k) { if (job[k] !== undefined && job[k] !== '') out[k] = job[k]; });
    return out;
  }

  async function getJobs() {
    const rows = await request('jobs?select=*&order=updated_at.desc');
    return rows ? rows.map(normalizeJob) : [];
  }

  async function upsertJobs(items) {
    return request('jobs?on_conflict=id', {
      method: 'POST',
      headers: {Prefer: 'resolution=merge-duplicates,return=minimal'},
      body: JSON.stringify(items.map(serializeJob))
    });
  }

  // ---- Sync status badge (so failures are never silent) ----
  let badge;
  function ensureBadge() {
    if (badge || !document.body) return;
    badge = document.createElement('div');
    badge.id = 'syncBadge';
    badge.innerHTML = '<span class="sync-dot"></span><span class="sync-text">Connecting…</span>';
    const css = document.createElement('style');
    css.textContent =
      '#syncBadge{position:fixed;left:18px;bottom:16px;z-index:80;display:flex;align-items:center;gap:7px;' +
      'background:#fff;border:1px solid var(--line,#e3e8e2);border-radius:20px;padding:6px 11px;font:600 10px "DM Sans",sans-serif;' +
      'color:#52635f;box-shadow:0 6px 18px rgba(24,49,44,.12)}' +
      '#syncBadge .sync-dot{width:8px;height:8px;border-radius:50%;background:#b0bab7}' +
      '#syncBadge.live .sync-dot{background:#18a57b;box-shadow:0 0 0 3px #18a57b22}' +
      '#syncBadge.syncing .sync-dot{background:#e9a93d}' +
      '#syncBadge.error .sync-dot{background:#ff765f}' +
      '#syncBadge.error{color:#c2503a;cursor:help}' +
      '@media(max-width:760px){#syncBadge{left:auto;right:14px;bottom:14px}}';
    document.head.appendChild(css);
    document.body.appendChild(badge);
  }
  function setStatus(state, text, title) {
    ensureBadge();
    if (!badge) return;
    badge.className = state;
    badge.querySelector('.sync-text').textContent = text;
    badge.title = title || '';
  }

  function startDashboard(onJobs, onEmpty) {
    if (!configured) return;
    let signature = '';
    let seeded = false;
    const refresh = async () => {
      try {
        const cloudJobs = await getJobs();
        if (!cloudJobs.length && !seeded && typeof onEmpty === 'function') {
          // Cloud is empty on a fresh project — push local seed ONCE to bootstrap it.
          seeded = true;
          await onEmpty();
          return refresh();
        }
        const nextSignature = JSON.stringify(cloudJobs);
        if (cloudJobs.length && nextSignature !== signature) {
          signature = nextSignature;
          onJobs(cloudJobs);
        }
        setStatus('live', 'Synced', 'Cloud sync active');
      } catch (error) {
        setStatus('error', 'Sync error', error.message);
        console.warn('AHBA cloud sync:', error.message);
      }
    };
    refresh();
    if (window.supabase?.createClient) {
      const realtime = window.supabase.createClient(config.url, config.anonKey);
      realtime
        .channel('ahba-dashboard-jobs')
        .on('postgres_changes', {event: '*', schema: 'public', table: 'jobs'}, refresh)
        .subscribe();
    }
    setInterval(refresh, 15000);
  }

  window.AHBACloud = {configured, getJobs, upsertJobs, startDashboard, setStatus};

  document.addEventListener('DOMContentLoaded', () => {
    if (!configured || typeof jobs === 'undefined') {
      setStatus('', 'Local only', 'Cloud not configured — running on this device only');
      return;
    }
    ensureBadge();
    setStatus('syncing', 'Connecting…');

    // save() now only writes the local cache. Cloud writes are done as TARGETED
    // single-job upserts by the app (assignTeam / new order) so a background poll
    // can never overwrite a fresh change with the whole stale array.
    const saveLocally = save;
    save = function () { saveLocally(); };

    // Helper the app calls to persist ONE job to the cloud immediately.
    window.AHBASync = function (job) {
      if (!job) return Promise.resolve();
      setStatus('syncing', 'Saving…');
      return upsertJobs([job])
        .then(() => setStatus('live', 'Synced', 'Cloud sync active'))
        .catch(error => { setStatus('error', 'Sync error', error.message); console.warn('AHBA cloud sync:', error.message); });
    };

    // IMPORTANT: do NOT blindly upsert the local cache here. Adopt the cloud as
    // the source of truth first (prevents stale local data from clobbering
    // newer changes made by the mobile app). Seed only if the cloud is empty.
    startDashboard(
      cloudJobs => {
        jobs = cloudJobs;
        localStorage.setItem('fieldflow_jobs', JSON.stringify(jobs));
        renderOverview();
      },
      () => upsertJobs(jobs) // onEmpty: bootstrap a brand-new/empty project once
    );
  });
})();
