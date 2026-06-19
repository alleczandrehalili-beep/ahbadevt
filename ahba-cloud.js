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
    if (!response.ok) throw new Error(`Cloud request failed (${response.status})`);
    return response.status === 204 ? null : response.json();
  }

  function normalizeJob(row) {
    return {
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
      team: row.team
    };
  }

  function serializeJob(job) {
    return {
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

  function startDashboard(onJobs) {
    if (!configured) return;
    let signature = '';
    const refresh = async () => {
      try {
        const cloudJobs = await getJobs();
        const nextSignature = JSON.stringify(cloudJobs);
        if (cloudJobs.length && nextSignature !== signature) {
          signature = nextSignature;
          onJobs(cloudJobs);
        }
      } catch (error) {
        console.warn('AHBA cloud sync:', error.message);
      }
    };
    refresh();
    setInterval(refresh, 2000);
  }

  window.AHBACloud = {configured, getJobs, upsertJobs, startDashboard};

  document.addEventListener('DOMContentLoaded', () => {
    if (!configured || typeof jobs === 'undefined') return;
    const saveLocally = save;
    save = function () {
      saveLocally();
      upsertJobs(jobs).catch(error => console.warn('AHBA cloud sync:', error.message));
    };
    upsertJobs(jobs).catch(error => console.warn('Initial cloud sync:', error.message));
    startDashboard(cloudJobs => {
      jobs = cloudJobs;
      localStorage.setItem('fieldflow_jobs', JSON.stringify(jobs));
      renderOverview();
    });
  });
})();
