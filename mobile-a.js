    const SUPA_URL = 'https://avjzkfxgzeyxtihkofed.supabase.co';
    const SUPA_KEY = 'sb_publishable_2JM51zp2r5GUICznc6Nz4Q_B4UFS1da';
    const EMAIL_DOMAIN = 'ahbafield.app';
    const sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);

    // ---- App version stamp + auto "new version" nudge (kills stale-cache confusion after deploy) ----
    const APP_VERSION = '2026-07-14.1';
    function _stampVersion(){ try{ const m=document.getElementById('menuPop'); if(m && !document.getElementById('appVerStamp')){ const d=document.createElement('div'); d.id='appVerStamp'; d.textContent='v'+APP_VERSION; d.style.cssText='font:600 9px system-ui;color:#8a9894;padding:8px 12px;text-align:center;border-top:1px solid #eee'; m.appendChild(d); } }catch(e){} }
    function _showVerNudge(){
      if(document.getElementById('verNudge')) return;
      const b=document.createElement('div');
      b.id='verNudge';
      b.textContent='🔄 Bagong bersyon — i-tap para i-refresh';
      b.style.cssText='position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;background:#0d3b34;color:#fff;font:600 13px system-ui;padding:12px 16px;border-radius:12px;text-align:center;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.3)';
      b.onclick=()=>location.reload();
      document.body.appendChild(b);
    }
    // True only if `dep` is a STRICTLY NEWER version than `cur` (YYYY-MM-DD.N).
    // Guards against a stale/CDN-cached version.json (older value) causing a false "new version" nudge.
    function _verNewer(dep,cur){
      if(!dep||!cur) return false;
      const a=String(dep).split('.'), b=String(cur).split('.');
      if(a[0]!==b[0]) return a[0]>b[0];
      return (parseInt(a[1]||'0',10) > parseInt(b[1]||'0',10));
    }
    async function checkAppVersion(){
      try{
        const r=await fetch('version.json?t='+Date.now(),{cache:'no-store'});
        if(!r.ok) return;
        const j=await r.json();
        const dep=j&&j.version;
        if(dep && _verNewer(dep,APP_VERSION)) _showVerNudge();   // only when deployed is genuinely newer
      }catch(e){}
    }

    const $ = s => document.querySelector(s);
    const $$ = s => Array.from(document.querySelectorAll(s));
    let myTeam = '';        // AHBA_SLI004
    let jobs = [];
    let signature = '';
    let realtimeChan = null;
    let attendanceId = null;   // current open time-in record
    let pwForced = false;      // was the password screen a forced first-login?
    let viewMode = 'todo';   // 'todo' | 'inprogress' | 'negative' | 'done'
    let photoData = {};        // jobId -> [paths]
    let myRole = 'technician'; // 'technician' | 'sales_agent'
    let myName = '';           // display name
    let saDocs = {id:[], billing:[], premise:[]};
    const saStatus = {};   // jobId -> last known status (for sales realtime change detection)
    const headerName = () => myRole==='sales_agent' ? (myTeam+' · '+(myName||'Sales')) : (myName?(myTeam+' · '+myName):myTeam);
    const PHOTO_LABELS = ['SUBS HOUSE','NAP QR CODE','NAP STENCIL','PORT LOCATION & TAGGING','S-CLAMP AT THE J-HOOK ABOVE THE NAP','MIDSPAN BEFORE THE HOUSE','HOUSE BRACKET','LAYOUT OF THE DROP CABLE ON SUBS PREMISES BEFORE CPE','NIU LOCATION WITH CORRECT TAGGING','INSIDE THE NIU BOX WITH PROPER LOOPING','ACTUAL LOCATION OF THE MODEM NIU','SAR'];
    const PHOTOS_REQUIRED = PHOTO_LABELS.length;
    const pubUrl = path => `${SUPA_URL}/storage/v1/object/public/job-photos/${path}`;

    const emailFor = u => u.trim().toLowerCase() + '@' + EMAIL_DOMAIN;
    const teamFromEmail = e => (e||'').split('@')[0].toUpperCase();
    const TZ = 'Asia/Manila';
    const manilaDate = () => new Date().toLocaleDateString('en-CA', {timeZone: TZ}); // YYYY-MM-DD
    const manilaTime = d => new Date(d).toLocaleTimeString('en-PH', {timeZone: TZ, hour:'numeric', minute:'2-digit'});

    // One confirm for ALL date pickers — changing any date asks to confirm; on confirm it switches, on cancel it reverts.
    document.addEventListener('focus', function(e){ const el=e.target; if(el&&el.tagName==='INPUT'&&el.type==='date'&&!el.dataset.noconfirm) el.dataset.cur=el.value||''; }, true);
    document.addEventListener('change', function(e){
      const el=e.target;
      if(!el || el.tagName!=='INPUT' || el.type!=='date' || el.dataset.noconfirm) return;
      if(el.dataset.skipconfirm==='1'){ el.dataset.skipconfirm=''; return; }
      const cur=el.dataset.cur||'', picked=el.value||'';
      if(picked===cur) return;
      e.stopImmediatePropagation();
      if(confirm('Palitan ang petsa sa '+(picked||'—')+'?')){ el.dataset.cur=picked; el.dataset.skipconfirm='1'; el.dispatchEvent(new Event('change',{bubbles:true})); }
      else { el.value=cur; }
    }, true);
    const appendHist = (h,line) => {const t=new Date().toLocaleString('en-PH',{timeZone:TZ,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); return ((h||'')+`\n[${t}] ${line}`).trim();};

    const ic = {
      pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',
      clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      truck:'<path d="M10 17h4V5H2v12h3M14 9h4l4 4v4h-3M8 17a3 3 0 1 1-6 0M22 17a3 3 0 1 1-6 0"/>',
      check:'<path d="m20 6-11 11-5-5"/>', play:'<polygon points="6 4 20 12 6 20 6 4"/>',
      camera:'<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
      phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
      note:'<path d="M9 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h6"/>',
      inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.5A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.5Z"/>'
    };
    const svg = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ic[n]||''}</svg>`;
    function toast(msg){const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),2600)}
    function setSync(state,text){const b=$('#syncbar');if(!b)return;b.className='syncbar '+state;const st=$('#syncText');if(st)st.textContent=text;if(state==='live'){const ss=$('#syncStamp');if(ss)ss.textContent='Updated '+manilaTime(new Date());}}

    // ---- Durable write queue: a job status/payment write is NEVER silently lost. ----
    // If a write fails (offline / server down) it persists in localStorage and retries
    // on reconnect and on every 15s poll, so the optimistic UI is always eventually true.
    const SYNC_Q_KEY='ahba_syncq_v1';
    function syncQLoad(){ try{ return JSON.parse(localStorage.getItem(SYNC_Q_KEY)||'[]'); }catch(e){ return []; } }
    function syncQSave(q){ try{ localStorage.setItem(SYNC_Q_KEY, JSON.stringify(q)); }catch(e){} }
    function syncQCount(){ return syncQLoad().length; }
    // Queue ANY write: {table, op:'update'|'insert', match, payload}. Old job items {id,patch} still work.
    function enqueueWrite(table, op, match, payload){ const q=syncQLoad(); q.push({qid:Date.now()+'_'+Math.random().toString(36).slice(2,6), table, op, match, payload, attempts:0, at:Date.now()}); syncQSave(q); }
    function enqueueJob(id, patch){ enqueueWrite('jobs','update',{id}, patch); }
    // Apply one queued item to Supabase. Returns true on success (false on a returned error).
    async function _applyItem(item){
      const table=item.table||'jobs', op=item.op||'update', match=item.match||{id:item.id}, payload=item.payload||item.patch;
      if(op==='insert'){ const {error}=await sb.from(table).insert(payload); return !error; }
      let q=sb.from(table).update(payload); for(const k in match) q=q.eq(k, match[k]);
      const {error}=await q; return !error;
    }
    // Try a write now; if it fails (offline/server), queue it for retry — never lost, never throws.
    async function saveWrite(table, op, match, payload){
      try{ if(!await _applyItem({table, op, match, payload})) throw 0; return true; }
      catch(e){ enqueueWrite(table, op, match, payload); return false; }
    }
    async function saveJobPatch(id, patch){ return saveWrite('jobs','update',{id}, patch); }
    let _flushing=false;
    async function flushQueue(){
      if(_flushing) return; _flushing=true;
      try{
        while(true){
          const q=syncQLoad(); if(!q.length) break;
          const item=q[0];
          let ok=false;
          try{ ok=await _applyItem(item); }catch(e){ ok=false; }
          if(ok){ syncQSave(syncQLoad().filter(x=>x.qid!==item.qid)); continue; }
          // Failed → bump attempts; drop as poison after many tries so one bad item can't block the queue.
          const cur=syncQLoad(); const it=cur.find(x=>x.qid===item.qid);
          if(it){ it.attempts=(it.attempts||0)+1; if(it.attempts>=25){ syncQSave(cur.filter(x=>x.qid!==item.qid)); try{ toast('⚠ A saved change could not sync — please redo it.'); }catch(_){} console.error('AHBA sync dropped after retries:', it); } else syncQSave(cur); }
          break;   // stop this pass; retry on next poll / 'online'
        }
      } finally { _flushing=false; }
    }

    // ---------- attendance (time in / time out) ----------
    async function clockIn(){
      try{
        // Reuse today's open attendance row if it already exists (avoid duplicate rows on re-login/refresh).
        await findOpenAttendance();
        if(attendanceId) return;
        const {data,error}=await sb.from('attendance').insert({username:myTeam, work_date:manilaDate()}).select('id,time_in').single();
        if(error) throw error;
        attendanceId = data?.id || null;
        if(data?.time_in) toast('Timed in at '+manilaTime(data.time_in));
      }catch(e){ console.warn('clockIn',e.message); toast('Timed in'); }
    }
    async function findOpenAttendance(){
      try{
        const {data}=await sb.from('attendance').select('id').eq('username',myTeam).is('time_out',null)
          .eq('work_date',manilaDate()).order('time_in',{ascending:false}).limit(1);
        attendanceId = (data && data[0]) ? data[0].id : null;
      }catch(e){ attendanceId=null; }
    }
    async function clockOut(){
      if(!attendanceId) return;
      await saveWrite('attendance','update',{id:attendanceId},{time_out:new Date().toISOString()});   // queued if offline
      attendanceId=null;
    }

    // ---------- GPS location ----------
    function captureLocation(announce, trackReason, area){
      if(!navigator.geolocation){ if(announce)toast('GPS not available on this device'); return; }
      navigator.geolocation.getCurrentPosition(async pos=>{
        const {latitude, longitude} = pos.coords;
        try{
          await sb.from('technicians').update({lat:latitude, lng:longitude, location_at:new Date().toISOString(), updated_at:new Date().toISOString()}).eq('username',myTeam);
          // travel history trail (auto every 20 min + on every status update)
          try{ await sb.from('location_history').insert({username:myTeam, lat:latitude, lng:longitude, area:area||null, reason:trackReason||'auto'}); }catch(e2){}
          if(announce) toast('Location updated');
        }catch(e){ console.warn('loc',e.message); }
      }, err=>{
        console.warn('geo', err.message);
        if(announce || err.code===1) toast('Turn on Location so dispatch can find you');
      }, {enableHighAccuracy:true, timeout:15000, maximumAge:60000});
    }
    function logTrack(reason, area){ captureLocation(false, reason||'status', area); }

    // ---------- notifications ----------
    function askNotify(){ try{ if('Notification' in window && Notification.permission==='default') Notification.requestPermission(); }catch(e){} }
    function notify(title, body){
      try{ if('Notification' in window && Notification.permission==='granted'){ new Notification(title,{body, icon:'icon-192.png'}); } }catch(e){}
      try{ if(navigator.vibrate) navigator.vibrate([120,60,120]); }catch(e){}
      toast(title+(body?(' · '+body):''));
    }
    function audioCtx(){ const C=window.AudioContext||window.webkitAudioContext; if(!C)return null; const ctx=playBeep._c||(playBeep._c=new C()); if(ctx.state==='suspended')ctx.resume(); return ctx; }
    // Unlock audio on any user tap so realtime events (new load/chat) can play sound
    function primeAudio(){ try{ const ctx=audioCtx(); if(ctx&&ctx.state==='suspended')ctx.resume(); }catch(e){} }
    document.addEventListener('pointerdown', primeAudio);
    document.addEventListener('click', primeAudio);
    // Chat sound — short rising two-tone beep
    function playBeep(){ try{ const ctx=audioCtx(); if(!ctx)return; const o=ctx.createOscillator(),g=ctx.createGain(); o.type='sine'; o.frequency.setValueAtTime(880,ctx.currentTime); o.frequency.setValueAtTime(1170,ctx.currentTime+0.12); o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.0001,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.35,ctx.currentTime+0.02); g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.35); o.start(); o.stop(ctx.currentTime+0.36);}catch(e){} }
    // New-load sound — distinct ascending 4-note chime
    function playLoadSound(){ try{ const ctx=audioCtx(); if(!ctx)return; [523,659,784,1047].forEach((f,i)=>{ const o=ctx.createOscillator(),g=ctx.createGain(); o.type='triangle'; o.frequency.value=f; o.connect(g); g.connect(ctx.destination); const t=ctx.currentTime+i*0.15; g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.4,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+0.17); o.start(t); o.stop(t+0.19); }); if(navigator.vibrate)navigator.vibrate([200,80,200]); }catch(e){} }
    // Helper: play a sequence of notes [freq, startOffset, dur]
    function playSeq(notes,type){ try{ const ctx=audioCtx(); if(!ctx)return; notes.forEach(([f,off,dur])=>{ const o=ctx.createOscillator(),g=ctx.createGain(); o.type=type||'sine'; o.frequency.value=f; o.connect(g); g.connect(ctx.destination); const t=ctx.currentTime+off; g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.4,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+dur); o.start(t); o.stop(t+dur+0.02); }); }catch(e){} }
    // Sales: JO VALIDATED — quick two-tone rising "ding-dong"
    function playValidatedSound(){ playSeq([[880,0,0.16],[1318,0.16,0.26]],'sine'); if(navigator.vibrate)navigator.vibrate([120,60,120]); }
    // Sales: JO COMPLETED/SUCCESS — bright ascending major arpeggio + sparkle
    function playCompletedSound(){ playSeq([[523,0,0.14],[659,0.13,0.14],[784,0.26,0.14],[1047,0.39,0.34]],'sine'); if(navigator.vibrate)navigator.vibrate([90,50,90,50,200]); }
    // Sales: JO NEGATIVE — somber descending low tones (clearly different)
    function playNegativeSound(){ playSeq([[392,0,0.22],[311,0.22,0.24],[233,0.46,0.40]],'sawtooth'); if(navigator.vibrate)navigator.vibrate([300,120,300]); }
    // Sales: JO CANCELLED — sad slow "wah-wah" downward glide
    function playCancelledSound(){ try{ const ctx=audioCtx(); if(!ctx)return; const o=ctx.createOscillator(),g=ctx.createGain(); o.type='sine'; const t=ctx.currentTime; o.frequency.setValueAtTime(440,t); o.frequency.exponentialRampToValueAtTime(196,t+0.95); o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.35,t+0.06); g.gain.exponentialRampToValueAtTime(0.0001,t+1.05); o.start(t); o.stop(t+1.1); if(navigator.vibrate)navigator.vibrate([400,160,250]); }catch(e){} }
    // ---------- Web Push (notifications even when app is closed) ----------
    const VAPID_PUBLIC='BMhNkASCHb5OSL3uw6p8OXnqF10IfPGqAyGlLg2utnoIISvlI0NrR5QgJcbPqEDtrzItqRVmOLwkkU7bHAP-MXc';
    function urlB64ToU8(b){ const p='='.repeat((4-b.length%4)%4); const s=(b+p).replace(/-/g,'+').replace(/_/g,'/'); const raw=atob(s); const a=new Uint8Array(raw.length); for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i); return a; }
    async function registerPush(){
      try{
        if(!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        const reg=await navigator.serviceWorker.register('sw.js');
        if(!('Notification' in window)) return;
        let perm=Notification.permission;
        if(perm==='default') perm=await Notification.requestPermission();
        if(perm!=='granted') return;
        let sub=await reg.pushManager.getSubscription();
        if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:urlB64ToU8(VAPID_PUBLIC)});
        const j=sub.toJSON();
        await sb.from('push_subscriptions').upsert({team:myTeam, role:(myRole==='sales_agent'?'sales':'technician'), endpoint:sub.endpoint, p256dh:j.keys.p256dh, auth:j.keys.auth}, {onConflict:'endpoint'});
      }catch(e){ console.warn('push',e.message); }
    }

    // ---------- team chat ----------
    let chatChan=null, chatMsgs=[], chatUnread=0;
    function fmtChatTime(ts){ return new Date(ts).toLocaleString('en-PH',{timeZone:TZ,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); }
    // ----- threaded chat: broadcast (dispatch/team) + private DMs -----
    const myCode=()=>'T:'+myTeam;                 // this mobile user's canonical chat code
    const dmPair=peer=>[myCode(),peer].sort();    // sorted pair for a DM thread
    let chatThread={kind:'bcast'};                // current open thread
    let chatContacts=[];                          // [{code,label,kind}] for the picker
    const chatUnreadBy={};                         // threadKey -> unread count
    function curThreadKey(){ return chatThread.kind==='dm' ? ('dm:'+chatThread.code) : 'bcast'; }
    function threadKeyOf(m){ if(m.dm_a){ const peer=(m.dm_a===myCode())?m.dm_b:m.dm_a; return 'dm:'+peer; } return 'bcast'; }
    function codeLabel(code){ const c=chatContacts.find(x=>x.code===code); if(c) return c.label; if(code&&code.startsWith('C:')) return code.slice(2); if(code&&code.startsWith('T:')) return 'Team '+code.slice(2); return code||''; }
    async function buildChatContacts(){
      const list=[];
      try{ const {data}=await sb.from('console_contacts').select('*'); (data||[]).forEach(u=>list.push({code:'C:'+u.username,label:(u.display_name||u.username)+(u.role_label?(' · '+u.role_label):''),kind:'console'})); }catch(e){}
      if(myRole==='sales_agent'){
        try{ const {data}=await sb.from('jobs').select('team').eq('created_by',myTeam).not('team','is',null); const seen={}; (data||[]).forEach(j=>{ if(j.team&&!seen[j.team]){ seen[j.team]=1; list.push({code:'T:'+j.team,label:'Team '+j.team,kind:'team'}); } }); }catch(e){}
      }
      try{ const me=myCode();
        const q1=await sb.from('team_messages').select('dm_a,dm_b').eq('dm_a',me).limit(500);
        const q2=await sb.from('team_messages').select('dm_a,dm_b').eq('dm_b',me).limit(500);
        const peers={}; [...(q1.data||[]),...(q2.data||[])].forEach(r=>{ const peer=(r.dm_a===me)?r.dm_b:r.dm_a; if(peer) peers[peer]=1; });
        Object.keys(peers).forEach(code=>{ if(!list.find(x=>x.code===code)) list.push({code,label:codeLabel(code),kind:code.startsWith('C:')?'console':'team'}); });
      }catch(e){}
      chatContacts=list; renderChatRecipients();
    }
    function renderChatRecipients(){
      const sel=$('#chatTo'); if(!sel)return;
      sel.innerHTML=['<option value="">📢 Dispatch (team broadcast)</option>'].concat(
        chatContacts.map(c=>`<option value="${c.code}">${(c.kind==='console'?'🔒 ':'🔒👷 ')+(c.label||'').replace(/</g,'&lt;')}</option>`)).join('');
      sel.value=(chatThread.kind==='dm')?chatThread.code:'';
    }
    function selectChatThread(val){
      chatThread = val ? {kind:'dm',code:val} : {kind:'bcast'};
      $('#chatTitle').textContent = chatThread.kind==='dm' ? ('💬 '+codeLabel(val)) : '💬 Messages with Dispatch';
      chatUnreadBy[curThreadKey()]=0; recomputeChatBadge(); loadChat();
    }
    function renderChat(){
      const el=$('#chatList'); if(!el)return;
      el.innerHTML=chatMsgs.length?chatMsgs.map(m=>{
        const mine=(m.role==='team' && m.team===myTeam);
        const who=mine?'You':((m.sender||(m.role==='dispatch'?'Dispatch':(m.team||''))));
        const roleTag=(!mine && m.role==='dispatch' && m.sender_role)?(' · '+String(m.sender_role).replace(/</g,'&lt;')):'';
        const img=m.image_path?`<a href="${pubUrl(m.image_path)}" target="_blank" rel="noopener"><img src="${pubUrl(m.image_path)}" alt="photo" style="max-width:100%;max-height:220px;border-radius:9px;display:block"></a>`:'';
        const txt=(m.body||'').trim()?`<div>${(m.body||'').replace(/</g,'&lt;')}</div>`:'';
        const bubble=`<div style="background:${mine?'#18a57b':'#eef1ed'};color:${mine?'#fff':'#26352f'};padding:${img&&!txt?'4px':'8px 11px'};border-radius:12px;font-size:13px;display:flex;flex-direction:column;gap:5px">${img}${txt}</div>`;
        return `<div style="align-self:${mine?'flex-end':'flex-start'};max-width:80%">${bubble}<div style="font-size:9px;color:#9aa6a2;margin-top:2px;text-align:${mine?'right':'left'}">${String(who).replace(/</g,'&lt;')}${roleTag} · ${fmtChatTime(m.created_at)}</div></div>`;
      }).join(''):'<div style="text-align:center;color:#9aa6a2;font-size:12px;padding:20px">No messages yet. Say hello 👋</div>';
      el.scrollTop=el.scrollHeight;
    }
    async function loadChat(){
      try{
        let q=sb.from('team_messages').select('*').order('created_at',{ascending:true}).limit(200);
        if(chatThread.kind==='dm'){ const [a,b]=dmPair(chatThread.code); q=q.eq('dm_a',a).eq('dm_b',b); }
        else { q=q.eq('team',myTeam).is('dm_a',null); }
        const {data}=await q; chatMsgs=data||[]; renderChat();
      }catch(e){}
    }
    function openChat(){ $('#chatBack').classList.remove('hidden'); $('#chatModal').classList.remove('hidden'); buildChatContacts(); chatUnreadBy[curThreadKey()]=0; recomputeChatBadge(); loadChat(); setTimeout(()=>$('#chatInput')?.focus(),100); }
    function closeChat(){ $('#chatBack').classList.add('hidden'); $('#chatModal').classList.add('hidden'); }
    let chatPhotoFile=null;   // pending chat image (mobile)
    function setChatPhoto(file){ chatPhotoFile=file||null; const t=$('#chatPhotoThumb'); if(t){ t.innerHTML=chatPhotoFile?`<span style="position:relative;display:inline-block"><img src="${URL.createObjectURL(chatPhotoFile)}" alt="" style="height:46px;border-radius:7px;display:block"><button type="button" id="chatPhotoDel" style="position:absolute;top:-6px;right:-6px;background:#c2503a;color:#fff;border:0;border-radius:50%;width:18px;height:18px;font-size:10px;line-height:1;padding:0">✕</button></span>`:''; const d=$('#chatPhotoDel'); if(d) d.onclick=()=>{ setChatPhoto(null); if($('#chat_photo_cam'))$('#chat_photo_cam').value=''; if($('#chat_photo_alb'))$('#chat_photo_alb').value=''; }; } }
    async function uploadChatPhoto(file){
      const blob=await compressImage(file,1200,140);
      const path=`chat/${Date.now()}_${Math.random().toString(36).slice(2,7)}.jpg`;
      const {error}=await sb.storage.from('job-photos').upload(path,blob,{contentType:'image/jpeg',upsert:false});
      if(error) throw error; return path;
    }
    async function sendChat(){
      const v=$('#chatInput').value.trim(); if(!v && !chatPhotoFile)return;
      const row={team:myTeam, sender:(myName||myTeam), role:'team', body:v};
      if(chatThread.kind==='dm'){ const [a,b]=dmPair(chatThread.code); row.dm_a=a; row.dm_b=b; }
      if(chatPhotoFile){ try{ row.image_path=await uploadChatPhoto(chatPhotoFile); }catch(e){ toast('Photo upload failed'); return; } }
      $('#chatInput').value=''; setChatPhoto(null); if($('#chat_photo_cam'))$('#chat_photo_cam').value=''; if($('#chat_photo_alb'))$('#chat_photo_alb').value='';
      try{ await sb.from('team_messages').insert(row); }catch(e){ toast('Send failed'); }
    }
    function recomputeChatBadge(){ chatUnread=Object.values(chatUnreadBy).reduce((a,b)=>a+(b||0),0); updateChatBadge(); }
    function updateChatBadge(){ [['#chatBadge'],['#chatFabBadge']].forEach(([id])=>{const b=$(id); if(b){ b.textContent=chatUnread; b.classList.toggle('hidden', chatUnread<=0); }}); }

    // ---------- announcements ----------
    let annChan=null, annList=[], annSeen=0, annUnread=0;
    function audienceOk(a){ const aud=(a.audience||'all'); return aud==='all' || (myRole==='sales_agent'?aud==='sales':aud==='technician'); }
    function renderAnn(){
      const el=$('#annList'); if(!el)return; const list=annList.filter(audienceOk);
      el.innerHTML=list.length?list.map(a=>`<div style="border:1px solid #e3e8e2;border-radius:11px;padding:11px">${a.photo_path?`<img src="${pubUrl(a.photo_path)}" alt="" style="width:100%;max-height:200px;object-fit:cover;border-radius:9px;margin-bottom:8px">`:''}<div style="font-weight:800;font-size:13px;color:#0e2b27">${a.photo_path?'🏆 ':''}${(a.title||'Announcement').replace(/</g,'&lt;')}</div><div style="font-size:12px;color:#3a4a45;margin-top:3px;white-space:pre-wrap">${(a.body||'').replace(/</g,'&lt;')}</div><div style="font-size:9px;color:#9aa6a2;margin-top:5px">${a.audience||'all'} · ${fmtChatTime(a.created_at)}</div></div>`).join(''):'<div style="text-align:center;color:#9aa6a2;font-size:12px;padding:20px">No announcements.</div>';
    }
    async function loadAnn(){
      try{ const {data}=await sb.from('announcements').select('*').order('created_at',{ascending:false}).limit(50); annList=data||[]; annSeen=annList.filter(audienceOk).length; renderAnn(); renderAnnBanner(); }catch(e){}
    }
    // Banner: app stays CLEAN when there's nothing. Recognition (with photo) stays the
    // whole month it was posted; a regular announcement shows until dismissed.
    function pickBanner(){
      // Fixed announcement bar: show the latest active announcement for this audience.
      // It STAYS until the console removes it (no user dismiss).
      const list=annList.filter(audienceOk);
      if(!list.length) return null;
      const a=list[0];
      return {a, recognition:!!a.photo_path};
    }
    function renderAnnBanner(){
      const wrap=$('#annBanner'); if(!wrap) return;
      const inApp = !$('#appView').classList.contains('hidden') || !$('#saView').classList.contains('hidden');
      const list = inApp ? annList.filter(audienceOk) : [];
      const reg = list[0];                        // latest announcement (any) → text bar
      const rec = list.find(a=>a.photo_path);     // latest recognition (photo) → picture banner
      if(!reg && !rec){ wrap.classList.add('hidden'); wrap.innerHTML=''; return; }
      const esc=s=>(s||'').replace(/</g,'&lt;');
      let html='';
      // Regular announcement bar stays even when a picture banner is shown.
      if(reg){
        html+=`<div class="ann-open" style="display:flex;gap:11px;align-items:center;padding:11px 13px;background:#0e3531;color:#eaf5f1;cursor:pointer;border-radius:12px;margin-bottom:6px"><div style="min-width:0;flex:1"><div style="font-size:10px;font-weight:800;letter-spacing:.04em;opacity:.85">📢 Announcement</div><div style="font-weight:800;font-size:14px;margin:1px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(reg.title||'Announcement')}</div><div style="font-size:11px;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc((reg.body||'').slice(0,90))}</div></div></div>`;
      }
      // Recognition picture banner — full large image, title overlaid on top.
      if(rec){
        html+=`<div class="ann-open" style="position:relative;cursor:pointer;border-radius:12px;overflow:hidden;background:#081c18">
          <img src="${pubUrl(rec.photo_path)}" alt="" style="width:100%;height:auto;max-height:64vh;object-fit:contain;display:block;background:#081c18">
          <div style="position:absolute;left:0;right:0;top:0;padding:12px 14px 30px;background:linear-gradient(to bottom,rgba(6,24,20,.82),rgba(6,24,20,0));color:#fff">
            <div style="font-weight:800;font-size:17px;line-height:1.25;text-shadow:0 1px 4px rgba(0,0,0,.55)">${esc(rec.photo_caption||rec.title||'')}</div>
          </div></div>`;
      }
      wrap.innerHTML=html;
      wrap.classList.remove('hidden');
      wrap.querySelectorAll('.ann-open').forEach(el=>el.onclick=openAnn);
    }
    function openAnn(){ annUnread=0; updateAnnBadge(); $('#annBack').classList.remove('hidden'); $('#annModal').classList.remove('hidden'); loadAnn(); }
    function closeAnn(){ $('#annBack').classList.add('hidden'); $('#annModal').classList.add('hidden'); }
    function updateAnnBadge(){ const b=$('#annBadge'); if(!b)return; b.textContent=annUnread; b.classList.toggle('hidden', annUnread<=0); }

    function startComms(){
      askNotify(); registerPush(); loadChat(); loadAnn();
      if(chatChan) sb.removeChannel(chatChan);
      // No team filter: RLS delivers only messages this user may read (their team
      // broadcast + their private DMs). We route each one to the right thread.
      chatChan=sb.channel('chat-all-'+myTeam).on('postgres_changes',{event:'INSERT',schema:'public',table:'team_messages'},p=>{
        const m=p.new; if(!m) return;
        const tk=threadKeyOf(m);
        const mine=(m.role==='team' && m.team===myTeam);   // a message I sent
        const open=!$('#chatModal').classList.contains('hidden');
        const onThisThread = open && tk===curThreadKey();
        if(onThisThread){ chatMsgs.push(m); renderChat(); }
        if(!mine){
          playBeep();
          if(!onThisThread){ chatUnreadBy[tk]=(chatUnreadBy[tk]||0)+1; recomputeChatBadge(); notify('💬 '+(m.sender||'Message'), m.body||(m.image_path?'📷 Photo':'')); }
        }
      }).subscribe();
      if(annChan) sb.removeChannel(annChan);
      annChan=sb.channel('ann-all').on('postgres_changes',{event:'*',schema:'public',table:'announcements'},p=>{
        if(p.eventType==='DELETE'){ const id=p.old&&p.old.id; annList=annList.filter(x=>x.id!==id); renderAnn(); renderAnnBanner(); return; }
        const a=p.new; if(!a) return; annList=annList.filter(x=>x.id!==a.id); annList.unshift(a);
        if(audienceOk(a)){ if($('#annModal').classList.contains('hidden')){ annUnread++; updateAnnBadge(); notify('📢 '+(a.title||'Announcement'), a.body); } }
        renderAnn(); renderAnnBanner();
      }).subscribe();
    }
    function showErr(id,msg){const e=$(id);e.textContent=msg;e.classList.add('show')}
    function clearErr(id){$(id).classList.remove('show')}

    const FLOW = {
      assigned:{label:'Assigned',next:'en-route',action:'Start travel',icon:'truck',cls:'go'},
      'en-route':{label:'On the way',next:'on-site',action:'Arrived',icon:'pin',cls:'go'},
      'on-site':{label:'On site',next:'in-progress',action:'Start work',icon:'play',cls:'go'},
      'in-progress':{label:'Working',next:'completed',action:'Mark complete',icon:'check',cls:'done'},
      completed:{label:'Completed',next:null,action:null},
      pending:{label:'Awaiting dispatch',next:null,action:null}
    };
    const statusLabel = s => (FLOW[s]?.label) || ({negative:'Incomplete',cancelled:'Cancelled',rejected:'Rejected',for_validation:'For validation'}[s]) || s;

    // ---------- views ----------
    function show(view){['loginView','pwView','shiftView','appView','saView','secView'].forEach(v=>$('#'+v).classList.toggle('hidden', v!==view));const inApp=(view==='appView'||view==='saView'||view==='secView');$('#menuBtn').classList.toggle('hidden', !inApp);$('#chatFab')&&$('#chatFab').classList.toggle('hidden', !(view==='appView'||view==='saView'));$('#menuPop').classList.add('hidden');try{renderAnnBanner();}catch(e){}}

    // ---------- shift setup (account + crew) ----------
    // Work accounts now come from the org-scoped `work_accounts` table (see openShift) — no hardcoded list,
    // so no org's account names ship in the shared client and each org sees only its own pool.
    let shiftAccount='', shiftDriver='', shiftTech1='', shiftTech2='';
    function shiftKey(){ return 'ahba_shift_'+myTeam; }
    async function takenAccounts(){
      // accounts currently in use by OTHER teams that are still timed in today
      const taken={};
      try{
        const {data}=await sb.from('attendance').select('username,work_account,time_out').eq('work_date',manilaDate());
        (data||[]).forEach(a=>{ if(a.work_account && !a.time_out && a.username!==myTeam) taken[a.work_account]=a.username; });
      }catch(e){}
      return taken;
    }
    async function openShift(){
      const sel=$('#sf_account');
      const taken=await takenAccounts();
      // Org-scoped work accounts: RLS returns ONLY this org's pool — subcon sees their own, GC sees theirs.
      let names=[]; const sharedSet=new Set();
      try{ const {data}=await sb.from('work_accounts').select('name,shared').eq('active',true).order('name');
        names=(data||[]).map(r=>r.name).filter(Boolean);
        (data||[]).forEach(r=>{ if(r.shared && r.name) sharedSet.add(r.name); });
      }catch(e){}
      // NO hardcoded fallback — an empty pool must stay empty; otherwise a subcon would leak the GC list.
      sel.innerHTML=names.length?'<option value="">— Select account —</option>':'<option value="">— Walang work account na naka-assign. Contact admin. —</option>';
      names.forEach(a=>{ const o=document.createElement('option'); o.value=a;
        // Shared accounts can be used by multiple devices at once — never disabled, even if another team is on it.
        if(taken[a] && !sharedSet.has(a)){ o.textContent=a+' — in use'; o.disabled=true; }
        else if(sharedSet.has(a)){ o.textContent=a+(taken[a]?' — shared (in use)':' — shared'); }
        else { o.textContent=a; }
        sel.appendChild(o); });
      // No auto-select of the account — the user must pick it manually each login.
      // (Crew names may prefill for convenience, but the account is always left blank.)
      sel.value='';
      try{ const s=JSON.parse(localStorage.getItem(shiftKey())||'null');
        if(s && s.date===manilaDate()){ $('#sf_driver').value=s.driver||''; $('#sf_tech1').value=s.tech1||''; $('#sf_tech2').value=s.tech2||''; }
      }catch(e){}
      // AHBA_OMT = One-Man Team: only Account + Technician name; no Driver / Tech 2.
      const omt=/OMT/i.test(myTeam||'');
      const dw=$('#sf_driver_wrap'), t2w=$('#sf_tech2_wrap'), lab=$('#sf_tech1_label');
      if(dw) dw.style.display=omt?'none':''; if(t2w) t2w.style.display=omt?'none':'';
      if(lab) lab.textContent=omt?'Technician name *':'Technician 1 *';
      clearErr('#shiftErr'); show('shiftView');
    }

    // ---------- sales agent ----------
    function startSA(){ $('#teamName').textContent=headerName(); show('saView'); saSwitch('new'); saRenderDocs(); populatePlans(); toggleAddonCount(); startComms(); primeSalesStatus(); startSalesWatch(); const dsel=$('#sa_district'); if(dsel&&!dsel._wired){ dsel._wired=true; dsel.onchange=()=>populateSaBrgys(dsel.value); } }
    // Load current statuses once at startup so we can detect future changes (without sounding on first load)
    async function primeSalesStatus(){ try{ const {data}=await sb.from('jobs').select('id,status').eq('created_by',myTeam); (data||[]).forEach(j=>{ saStatus[j.id]=j.status; }); }catch(e){} }

    // ---------- SECURITY (gate-out validation) ----------
    let secTab='out';
    function startSecurity(){ $('#teamName').textContent=headerName(); show('secView'); secSwitch(secTab); initSecMap(); setTimeout(()=>{ if(secMap) secMap.invalidateSize(); },200); renderSecMapPins(); loadSecTeams(); clearInterval(startSecurity._t); startSecurity._t=setInterval(()=>{ loadSecTeams(); renderSecMapPins(); },20000); }
    function secSwitch(tab){
      secTab=tab;
      $$('.sec-tab').forEach(b=>b.classList.toggle('active', b.dataset.sectab===tab));
      $('#secOutPane').classList.toggle('hidden', tab!=='out');
      $('#secInPane').classList.toggle('hidden', tab!=='in');
    }
    // ---- Home screen: live team map (VIEW-ONLY, online pins, no history) ----
    let secMap=null, secMarkers={};
    function initSecMap(){
      if(secMap||typeof L==='undefined'||!document.getElementById('secMap'))return;
      secMap=L.map('secMap',{zoomControl:true,attributionControl:false}).setView([14.5995,120.9842],11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(secMap);
    }
    async function renderSecMapPins(){
      initSecMap(); if(!secMap) return;
      const today=manilaDate(); let rows=[];
      try{ const {data}=await sb.from('technicians').select('username,area,lat,lng,location_at'); rows=data||[]; }catch(e){}
      const seen={};
      rows.forEach(t=>{
        if(t.lat==null||t.lng==null||!t.location_at) return;
        if(new Date(t.location_at).toLocaleDateString('en-CA',{timeZone:TZ})!==today) return;
        if((Date.now()-new Date(t.location_at))>=15*60*1000) return;     // online only (≤15 min)
        seen[t.username]=1;
        const popup=`<b>${t.username}</b><br>${t.area||''}<br>Updated ${manilaTime(t.location_at)}`;
        if(secMarkers[t.username]) secMarkers[t.username].setLatLng([t.lat,t.lng]).bindPopup(popup);
        else secMarkers[t.username]=L.circleMarker([t.lat,t.lng],{radius:9,weight:2,color:'#18a57b',fillColor:'#18a57b',fillOpacity:.9}).addTo(secMap).bindPopup(popup);
      });
      Object.keys(secMarkers).forEach(u=>{ if(!seen[u]){ secMap.removeLayer(secMarkers[u]); delete secMarkers[u]; } });
    }
    async function loadSecTeams(){
      const elOut=$('#secOutList'), elIn=$('#secInList'); if(!elOut||!elIn)return;
      const date=manilaDate();
      let att=[], gates=[];
      try{ const {data}=await sb.from('attendance').select('username,work_account,crew_driver,crew_tech1,crew_tech2,time_in,time_out').eq('work_date',date).order('time_in',{ascending:false}); att=data||[]; }catch(e){}
      try{ const {data}=await sb.from('gate_logs').select('team,gate_type,plate_no,odometer,fuel_level,checked_at').eq('work_date',date).order('checked_at',{ascending:false}); gates=data||[]; }catch(e){}
      const outMap={}, inMap={};
      gates.forEach(g=>{ if((g.gate_type||'outgoing')==='incoming'){ if(!inMap[g.team]) inMap[g.team]=g; } else { if(!outMap[g.team]) outMap[g.team]=g; } });
      const seen={}, rows=[];
      att.forEach(a=>{ if(/^AHBA_SLI/i.test(a.username) && !seen[a.username]){ seen[a.username]=1; rows.push(a); } });
      $('#secStamp').textContent=rows.length+' team(s) in';
      const card=(a,which)=>{
        const crew=[a.crew_driver,a.crew_tech1,a.crew_tech2].filter(Boolean).join(', ')||'— no declared crew —';
        const go=outMap[a.username], gi=inMap[a.username];
        const outBadge=go?`<span class="badge b-completed">✓ Out ${manilaTime(go.checked_at)}</span>`:`<span class="badge b-pending">Out pending</span>`;
        const inBadge=gi?`<span class="badge b-completed">✓ In ${manilaTime(gi.checked_at)}</span>`:(go?`<span class="badge b-pending">In pending</span>`:'');
        const info=go?`<div class="job-meta"><div class="row">${svg('truck')}<span>Plate ${go.plate_no||'—'} · Out odo ${go.odometer!=null?go.odometer:'—'} · Fuel ${go.fuel_level||'—'}${gi?` · In odo ${gi.odometer!=null?gi.odometer:'—'} · Fuel ${gi.fuel_level||'—'}`:''}</span></div></div>`:'';
        let btn='';
        if(which==='out') btn=go?'':`<button class="act done" data-sec-out="${a.username}" style="flex:1">${svg('check')} Outgoing SVC</button>`;
        else btn=(go&&!gi)?`<button class="act" data-sec-in="${a.username}" style="flex:1;background:#0e6fae;color:#fff">${svg('truck')} Incoming SVC</button>`:'';
        const btns=btn?`<div style="display:flex;gap:8px;margin-top:8px">${btn}</div>`:'';
        const badges=which==='out'?outBadge:`${outBadge}${inBadge}`;
        return `<div class="job"><div class="job-head"><div><span class="job-id">${a.username}</span><h3>${a.work_account||'—'}</h3><p class="plan">${crew}</p></div><div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">${badges}</div></div>${info}${btns}</div>`;
      };
      if(!rows.length){
        const empty=`<div class="empty">${svg('inbox')}No timed-in team right now.<br>Teams that started their shift will appear here.</div>`;
        elOut.innerHTML=empty; elIn.innerHTML=empty; return;
      }
      elOut.innerHTML=rows.map(a=>card(a,'out')).join('');
      const inRows=rows.filter(a=>outMap[a.username]);   // Incoming list: teams that already went out
      elIn.innerHTML=inRows.length?inRows.map(a=>card(a,'in')).join(''):`<div class="empty">${svg('truck')}No vehicle out yet.<br>Teams appear here after their Outgoing SVC.</div>`;
      elOut.querySelectorAll('[data-sec-out]').forEach(b=>b.onclick=()=>openSecCheck(b.dataset.secOut, rows.find(r=>r.username===b.dataset.secOut), 'outgoing', null));
      elIn.querySelectorAll('[data-sec-in]').forEach(b=>b.onclick=()=>openSecCheck(b.dataset.secIn, rows.find(r=>r.username===b.dataset.secIn), 'incoming', outMap[b.dataset.secIn]));
    }
    let secPhotoFile=null;
    function openSecCheck(team,a,mode,outRec){
      const m=$('#secModal'); const isIn=(mode==='incoming');
      m.dataset.team=team; m.dataset.mode=mode||'outgoing'; m.dataset.driver=a.crew_driver||''; m.dataset.t1=a.crew_tech1||''; m.dataset.t2=a.crew_tech2||''; m.dataset.acct=a.work_account||'';
      $('#secTitle').textContent= isIn?'Incoming SVC':'Outgoing SVC';
      $('#secTeam').textContent='Team '+team;
      $('#secAccount').textContent=a.work_account||'—';
      $('#secCrew').textContent=[a.crew_driver&&('Driver: '+a.crew_driver),a.crew_tech1&&('Tech 1: '+a.crew_tech1),a.crew_tech2&&('Tech 2: '+a.crew_tech2)].filter(Boolean).join(' · ')||'no declared crew';
      $('#secOutOnly').classList.toggle('hidden', isIn);
      $('#secInOnly').classList.toggle('hidden', !isIn);
      $('#secOdoLabel').textContent= isIn?'Odometer on return * (km)':'Odometer before departure * (km)';
      $('#sec_crewok').value='yes'; $('#sec_remarks').value='';
      $('#sec_plate').value= isIn ? ((outRec&&outRec.plate_no)||'') : '';
      $('#sec_odo').value=''; $('#sec_fuel').value='';
      $('#sec_veh_remarks').value=''; if($('#sec_photo'))$('#sec_photo').value=''; secPhotoFile=null; if($('#secPhotoName'))$('#secPhotoName').textContent='';
      $('#secSave').textContent= isIn?'Record Incoming SVC':'Record Outgoing SVC';
      clearErr('#secErr');
      $('#secBack').classList.remove('hidden'); m.classList.remove('hidden');
    }
    function closeSec(){ $('#secBack').classList.add('hidden'); $('#secModal').classList.add('hidden'); }
    async function submitGate(){
      const m=$('#secModal'); const team=m.dataset.team; const mode=m.dataset.mode||'outgoing'; const isIn=(mode==='incoming');
      const plate=$('#sec_plate').value.trim(), odo=$('#sec_odo').value.trim(), fuel=$('#sec_fuel').value;
      if(!plate){ showErr('#secErr','Enter the plate no.'); return; }
      if(odo===''||isNaN(Number(odo))){ showErr('#secErr','Enter the odometer (number).'); return; }
      if(!fuel){ showErr('#secErr','Select the fuel tank level.'); return; }
      let crewok=true, rem='';
      if(!isIn){ crewok=$('#sec_crewok').value==='yes'; rem=$('#sec_remarks').value.trim(); if(!crewok && !rem){ showErr('#secErr','Enter remarks if there is a crew discrepancy.'); return; } }
      const vehRem = isIn ? ($('#sec_veh_remarks').value.trim()||'none') : '';
      const btn=$('#secSave'); btn.disabled=true; btn.textContent='Saving…';
      const now=new Date().toISOString();
      try{
        let photoPath=null;
        if(isIn && secPhotoFile){
          try{ const blob=await compressImage(secPhotoFile,1000,90,await buildStamp()); photoPath=`gate/${team}_${Date.now()}.jpg`; const {error:e2}=await sb.storage.from('job-photos').upload(photoPath,blob,{contentType:'image/jpeg',upsert:false}); if(e2) photoPath=null; }catch(e){ photoPath=null; }
        }
        const row={ team, account:m.dataset.acct, plate_no:plate, odometer:Number(odo), fuel_level:fuel, gate_type:mode, security_user:myTeam, checked_at:now };
        if(!isIn){ Object.assign(row,{crew_driver:m.dataset.driver, crew_tech1:m.dataset.t1, crew_tech2:m.dataset.t2, crew_ok:crewok, crew_remarks:rem}); }
        else { Object.assign(row,{vehicle_remarks:vehRem, photo_path:photoPath}); }
        const gateOk=await saveWrite('gate_logs','insert',{},row);   // queued if offline
        if(!isIn){ await saveWrite('attendance','update',{username:team, work_date:manilaDate()},{deployed_verified:true, verified_by:myTeam, verified_at:now}); }
        toast((isIn?'Incoming':'Outgoing')+' SVC recorded for '+team+(gateOk?'':' — will sync when online')); closeSec(); loadSecTeams();
      }catch(e){ showErr('#secErr','Failed: '+e.message); }
      btn.disabled=false; btn.textContent= isIn?'Record Incoming SVC':'Record Outgoing SVC';
    }
    const saStatusLabel = s => ({for_validation:'For validation',pending:'Approved · for dispatch',rejected:'Rejected',assigned:'Assigned','en-route':'In progress','on-site':'In progress','in-progress':'In progress',completed:'Completed',negative:'Incomplete',cancelled:'Cancelled'}[s]||s);
    // Badge color synced to status — en-route/on-site/in-progress share the "In progress" color so the badge always matches its label.
    const saBadgeCls = s => ({for_validation:'b-for_validation',rejected:'b-rejected',pending:'b-pending',assigned:'b-assigned','en-route':'b-in-progress','on-site':'b-in-progress','in-progress':'b-in-progress',completed:'b-completed',negative:'b-negative',cancelled:'b-cancelled'}[s]||'b-pending');
    function saSwitch(view){
      $('#saTabNew').classList.toggle('active',view==='new'); $('#saTabMine').classList.toggle('active',view==='mine');
      $('#saNew').classList.toggle('hidden',view!=='new'); $('#saMine').classList.toggle('hidden',view!=='mine');
      if(view==='mine') saRenderMine();
    }
    // Plan dropdowns — different lists per unit type, plus optional SKY TV add-on
    const PLANS_SDU=['PLAN 999 - 100MBPS','PLAN 1500 - 300MBPS','PLAN 1699 - 600MBPS / 400MBPS (VICE VERSA)','PLAN 2000 - 500MBPS','PLAN 2500 - 2500MBPS','PLAN 3000 - 700MBPS / 1GBPS (VICE VERSA)','PLAN 3500 - 1GBPS'];
    const PLANS_MDU=['PLAN 999 - 100MBPS','PLAN 1399 - 200MBPS','PLAN 1500 - 300MBPS','PLAN 2000 - 500MBPS'];
    const PLANS_MDU_DOCSIS=['SKY FIBER 999 - 100MBPS','SKY FIBER 1399 - 200MBPS','SKY FIBER 1500 - 300MBPS','SKY FIBER 2000 - 500MBPS'];
    const ADDONS=['SKY TV 99','SKY TV 299','SKY TV 499'];
    // Quezon City barangays grouped by legislative district (1–6). Source: PSA / Wikipedia.
    const QC_BRGYS={
"1":["Alicia","Bagong Pag-asa","Bahay Toro","Balingasa","Bungad","Damar","Damayan","Del Monte","Katipunan","Lourdes","Maharlika","Manresa","Mariblo","Masambong","N.S. Amoranto","Nayong Kanluran","Paang Bundok","Pag-ibig sa Nayon","Paltok","Paraiso","Phil-Am","Project 6","Ramon Magsaysay","Saint Peter","Salvacion","San Antonio","San Isidro Labrador","San Jose","Santa Cruz","Santa Teresita","Sto. Cristo","Santo Domingo","Siena","Talayan","Vasra","Veterans Village","West Triangle"],
"2":["Bagong Silangan","Batasan Hills","Commonwealth","Holy Spirit","Payatas"],
"3":["Amihan","Bagumbayan","Bagumbuhay","Bayanihan","Blue Ridge A","Blue Ridge B","Camp Aguinaldo","Claro (Quirino 3-B)","Dioquino Zobel","Duyan-duyan","E. Rodriguez","East Kamias","Escopa I","Escopa II","Escopa III","Escopa IV","Libis","Loyola Heights","Mangga","Marilag","Masagana","Matandang Balara","Milagrosa","Pansol","Quirino 2-A","Quirino 2-B","Quirino 2-C","Quirino 3-A","St. Ignatius","San Roque","Silangan","Socorro","Tagumpay","Ugong Norte","Villa Maria Clara","West Kamias","White Plains"],
"4":["Bagong Lipunan ng Crame","Botocan","Central","Damayang Lagi","Don Manuel","Doña Aurora","Doña Imelda","Doña Josefa","Horseshoe","Immaculate Concepcion","Kalusugan","Kamuning","Kaunlaran","Kristong Hari","Krus na Ligas","Laging Handa","Malaya","Mariana","Obrero","Old Capitol Site","Paligsahan","Pinagkaisahan","Pinyahan","Roxas","Sacred Heart","San Isidro Galas","San Martin de Porres","San Vicente","Santol","Sikatuna Village","South Triangle","Santo Niño","Tatalon","Teacher's Village East","Teacher's Village West","U.P. Campus","U.P. Village","Valencia"],
"5":["Bagbag","Capri","Fairview","Gulod","Greater Lagro","Kaligayahan","Nagkaisang Nayon","North Fairview","Novaliches Proper","Pasong Putik Proper","San Agustin","San Bartolome","Sta. Lucia","Sta. Monica"],
"6":["Apolonio Samson","Baesa","Balon Bato","Culiat","New Era","Pasong Tamo","Sangandaan","Sauyo","Talipapa","Tandang Sora","Unang Sigaw"]
};
    function populateSaBrgys(dist){
      const sel=$('#sa_brgy'); if(!sel) return;
      const list=QC_BRGYS[String(dist)]||[];
      sel.innerHTML=list.length?'<option value="">— Select barangay —</option>'+list.map(b=>`<option>${b}</option>`).join(''):'<option value="">— Select district first —</option>';
    }
    function populatePlans(){
      const dw=($('#sa_dwelling')&&$('#sa_dwelling').value)||'SDU';
      const list=dw==='MDU DOCSIS'?PLANS_MDU_DOCSIS:(dw==='MDU'?PLANS_MDU:PLANS_SDU);
      const sel=$('#sa_plan');
      if(sel){ const cur=sel.value; sel.innerHTML='<option value="">— Select plan —</option>'+list.map(p=>`<option>${p}</option>`).join(''); sel.value=list.includes(cur)?cur:''; }
      const ad=$('#sa_addon');
      if(ad && !ad.options.length){ ad.innerHTML='<option value="">— None —</option>'+ADDONS.map(a=>`<option>${a}</option>`).join(''); }
    }
    function toggleAddonCount(){ const on=($('#sa_play_type')&&$('#sa_play_type').value)==='2-PLAY'; const w=$('#sa_addon_count_wrap'); if(w) w.classList.toggle('hidden',!on); if(!on && $('#sa_addon_count')) $('#sa_addon_count').value=''; }
    function saRenderDocs(){
      ['id','billing','premise'].forEach(cat=>{
        const arr=saDocs[cat];
        const c=document.querySelector(`[data-cnt="${cat}"]`); if(c){c.textContent=arr.length;c.className='count '+(arr.length?'ok':'need');}
        const t=document.querySelector(`[data-thumbs="${cat}"]`);
        if(t){
          t.innerHTML=arr.map((f,i)=>`<span style="position:relative;display:inline-block"><img src="${f._url||(f._url=URL.createObjectURL(f))}" alt=""><button type="button" data-remdoc="${cat}" data-remi="${i}" title="Tanggalin" style="position:absolute;top:-6px;right:-6px;background:#c2503a;color:#fff;border:0;border-radius:50%;width:19px;height:19px;font-size:11px;line-height:1;padding:0">✕</button></span>`).join('');
          t.querySelectorAll('[data-remdoc]').forEach(b=>b.onclick=()=>{ saDocs[b.dataset.remdoc].splice(Number(b.dataset.remi),1); saRenderDocs(); });
        }
      });
    }
    function saReset(){
      ['first_name','middle_name','last_name','primary_no','other_contact_no','house_no','street_name','village','ref_no','amount','source_of_sales','referral_name','special_note'].forEach(k=>{const el=$('#sa_'+k);if(el)el.value='';});
      if($('#sa_district')) $('#sa_district').value=''; populateSaBrgys('');
      if($('#sa_city')) $('#sa_city').value='QUEZON CITY';
      if($('#sa_dwelling')) $('#sa_dwelling').value='SDU'; if($('#sa_install_fee')) $('#sa_install_fee').value='One Time Payment';
      populatePlans(); if($('#sa_addon')) $('#sa_addon').value='';
      if($('#sa_play_type')) $('#sa_play_type').value='1-PLAY'; toggleAddonCount();
      saDocs={id:[],billing:[],premise:[]}; saRenderDocs();
    }
    let saMineAllDates=false, saMineSearchT=null;
    async function saRenderMine(){
      const el=$('#saMineList'); el.innerHTML=`<div class="empty">Loading…</div>`;
      const dEl=$('#saMineDate'), qEl=$('#saMineSearch');
      const today=manilaDate();
      if(dEl && !dEl.dataset.wired){
        dEl.dataset.wired='1';
        if(!dEl.value) dEl.value=today;                 // default the picker to the present date
        dEl.onchange=()=>{ saMineAllDates=false; saRenderMine(); };
        const allB=$('#saMineAll'); if(allB) allB.onclick=()=>{ saMineAllDates=true; dEl.value=''; saRenderMine(); };
        if(qEl) qEl.oninput=()=>{ clearTimeout(saMineSearchT); saMineSearchT=setTimeout(saRenderMine,120); };
        // Daily refresh: when the app returns to the foreground, re-render so the "today" view rolls over at midnight.
        document.addEventListener('visibilitychange',()=>{ if(!document.hidden && $('#saMine') && !$('#saMine').classList.contains('hidden')) saRenderMine(); });
      }
      try{
        const {data}=await sb.from('jobs').select('id,subscriber,status,area,team,plan,ref_no,negative_remark,special_note,created_at,updated_at,load_date').eq('created_by',myTeam).is('deleted_at',null).order('created_at',{ascending:false});
        let all=data||[];
        all.forEach(j=>{ saStatus[j.id]=j.status; });   // seed status map for change detection
        const mday = ts => ts ? new Date(ts).toLocaleDateString('en-CA',{timeZone:TZ}) : '';
        const esc=s=>(s||'').replace(/</g,'&lt;');
        // Which day's crew handled this load (dispatch day; falls back to the encode day).
        const jobDay = j => (j.load_date?String(j.load_date).slice(0,10):'') || mday(j.created_at);
        let crewMap={};   // "TEAM|YYYY-MM-DD" → the crew DECLARED for that team that day (from attendance)
        const cardHTML = j => {
          const assigned = j.team
            ? `<div class="row" style="color:#0e7a59;font-weight:700">${svg('truck')}<span>Assigned to: ${esc(j.team)}</span></div>`
            : `<div class="row" style="color:#9aa6a2">${svg('truck')}<span>Awaiting team assignment</span></div>`;
          const cw = j.team ? crewMap[j.team+'|'+jobDay(j)] : null;
          const crew = (cw && (cw.d||cw.t1)) ? `<div class="row" style="color:#0e7a59"><span>👷 Driver: ${esc(cw.d||'—')} · Tech: ${esc([cw.t1,cw.t2].filter(Boolean).join(', ')||'—')}</span></div>` : '';
          const neg = (j.status==='negative'&&j.negative_remark) ? `<div class="row" style="color:#c2503a">${svg('note')}<span>${esc(j.negative_remark)}</span></div>` : '';
          const rejReason = (j.status==='rejected'&&j.special_note) ? `<div class="row" style="color:#c2503a">${svg('note')}<span>${esc(j.special_note)}</span></div>` : '';
          const rejBtn = (j.status==='rejected') ? `<button class="act" data-resub="${j.id}" style="width:100%;margin-top:8px;background:#e9a93d;color:#3a2a00">${svg('note')} Edit &amp; resubmit</button>` : '';
          // Still for validation? Let the sales agent edit it before the validator reviews.
          const editBtn = (j.status==='for_validation') ? `<button class="act" data-resub="${j.id}" style="width:100%;margin-top:8px;background:#178262;color:#fff;border-color:#178262">${svg('note')} Edit before validation</button>` : '';
          // NOTE: sales agents can no longer delete their own orders. Mistakes are fixed with
          // "Edit before validation" / "Edit & resubmit"; deleting is a console (GC) action only.
          const enc = j.created_at ? `<div class="row" style="color:#9aa6a2"><span>🗓 Encoded: ${mday(j.created_at)} · ${manilaTime(j.created_at)}</span></div>` : '';
          const meta=[j.plan&&('Plan: '+esc(j.plan)), j.ref_no&&('Ref: '+esc(j.ref_no)), esc(j.area)].filter(Boolean).join(' · ');
          return `<div class="submitted"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><h4>${esc(j.subscriber)||'—'}</h4><span class="badge ${saBadgeCls(j.status)}">${saStatusLabel(j.status)}</span></div><p>${j.id}${meta?' · '+meta:''}</p><div class="job-meta">${enc}${assigned}${crew}${neg}${rejReason}</div><button class="act ghost" data-info="${j.id}" style="width:100%;margin-top:8px">ℹ︎ View full info</button>${editBtn}${rejBtn}</div>`;
        };
        const q=(qEl&&qEl.value.trim().toLowerCase())||'';
        const pick=(dEl&&dEl.value)||'';
        let priority=[], list=[], note='', isDaily=false;
        if(q){                            // SEARCH — find a subscriber across ALL submissions (name / JO# / ref)
          list=all.filter(j=> (j.subscriber||'').toLowerCase().includes(q) || (j.id||'').toLowerCase().includes(q) || (j.ref_no||'').toLowerCase().includes(q) );
          note=`${list.length} result${list.length===1?'':'s'} for “${qEl.value.trim()}”`;
        } else if(saMineAllDates){        // full history
          list=all; note=`${all.length} load${all.length===1?'':'s'} · all dates`;
        } else if(pick && pick!==today){  // a specific past date
          list=all.filter(j=> mday(j.created_at)===pick );
          note=`${list.length} load${list.length===1?'':'s'} encoded on ${pick}`;
        } else {                          // DEFAULT daily view — today's loads, then carried-over Incomplete BELOW
          isDaily=true;
          if(dEl && pick!==today) dEl.value=today;   // keep the picker on the current day (midnight roll-over)
          list=all.filter(j=> mday(j.created_at)===today );
          // Follow-up block: Incomplete (negative) ONLY, from previous days. Cancelled are excluded.
          priority=all.filter(j=> j.status==='negative' && mday(j.created_at)!==today )
                      .sort((a,b)=> (b.updated_at||b.created_at||'').localeCompare(a.updated_at||a.created_at||''));
          note=`${list.length} today${priority.length?(' · '+priority.length+' for follow-up'):''}`;
        }
        // Monitoring summary — count per status over what's shown (doubles as a quick legend).
        const shown=[...priority,...list];
        const cnt={}; shown.forEach(j=>{ const lab=saStatusLabel(j.status); (cnt[lab]=cnt[lab]||{n:0,cls:saBadgeCls(j.status)}).n++; });
        const sumEl=$('#saMineSummary'); if(sumEl) sumEl.innerHTML=Object.entries(cnt).map(([lab,o])=>`<span class="badge ${o.cls}">${lab}: ${o.n}</span>`).join('');
        const cEl=$('#saMineCount'); if(cEl) cEl.textContent=note;
        if(!shown.length){
          if(sumEl) sumEl.innerHTML='';
          const msg = q?('No match for “'+esc(qEl.value.trim())+'”.')
            : saMineAllDates?'No submissions yet.<br>Encode a new job order to get started.'
            : (pick&&pick!==today)?('No loads encoded on '+pick+'.')
            : 'No loads yet today.<br>Encode a new job order to get started.';
          el.innerHTML=`<div class="empty">${svg('inbox')}${msg}</div>`; return;
        }
        // Who actually handled each load: the crew DECLARED for that team on that day (attendance).
        try{
          const teams=[...new Set(shown.map(j=>j.team).filter(Boolean))];
          const days=[...new Set(shown.map(jobDay).filter(Boolean))];
          if(teams.length && days.length){
            const {data:att}=await sb.from('attendance').select('username,work_date,crew_driver,crew_tech1,crew_tech2').in('username',teams).in('work_date',days);
            (att||[]).forEach(a=>{ crewMap[a.username+'|'+a.work_date]={d:a.crew_driver||'',t1:a.crew_tech1||'',t2:a.crew_tech2||''}; });
          }
        }catch(e){}
        let html='';
        if(isDaily){
          if(list.length) html+=`<div style="padding:8px 16px 2px;font-size:12px;font-weight:800;color:#2a3a36">Today · ${today}</div>`;
          html+=list.map(cardHTML).join('');
          if(priority.length){
            html+=`<div style="padding:14px 16px 2px;font-size:12px;font-weight:800;color:#c2503a">⚠ Incomplete — previous days (${priority.length})</div>`;
            html+=`<div style="padding:0 16px 6px;font-size:10.5px;color:#8a9894">Follow up on these — they were not completed on an earlier day.</div>`;
            html+=priority.map(cardHTML).join('');
          }
        } else html+=list.map(cardHTML).join('');
        el.innerHTML=html;
        el.querySelectorAll('[data-resub]').forEach(b=>b.onclick=()=>saEditResubmit(b.dataset.resub));
        el.querySelectorAll('[data-info]').forEach(b=>b.onclick=()=>showJobInfo(b.dataset.info));
      }catch(e){ el.innerHTML=`<div class="empty">Could not load submissions.</div>`; }
    }
    // Sales: delete their OWN submitted order (only while still for-validation / rejected, pre-dispatch).
    async function saDeleteOrder(jobId){
      if(!confirm('Delete this job order?\nIt will be removed from your list. (The record is kept for the office / Superadmin.)')) return;
      // Soft-delete: keep the row + its docs so the office can still see it; hide it from the sales list.
      const now=new Date().toISOString();
      const ok=await saveWrite('jobs','update',{id:jobId},{deleted_at:now, deleted_by:myTeam, updated_at:now});
      delete saStatus[jobId];
      toast(ok?'Job order deleted':'Deleted — will sync when online'); saRenderMine();
    }
    // Edit a REJECTED order and resubmit it for validation (loads info back into the form)
    let saEditingId=null;
    async function saEditResubmit(jobId){
      try{
        const {data:j}=await sb.from('jobs').select('*').eq('id',jobId).single();
        if(!j){ toast('Order not found'); return; }
        saEditingId=jobId;
        const set=(id,val)=>{const el=$('#sa_'+id); if(el) el.value=(val==null?'':val);};
        set('first_name',j.first_name); set('middle_name',j.middle_name); set('last_name',j.last_name);
        set('primary_no',j.primary_no); set('other_contact_no',j.other_contact_no);
        set('house_no',j.house_no); set('street_name',j.street_name); set('village',j.village);
        if($('#sa_district')) $('#sa_district').value=j.district||''; populateSaBrgys(j.district||''); if($('#sa_brgy')) $('#sa_brgy').value=j.brgy||'';
        if($('#sa_city')) $('#sa_city').value=j.city||'QUEZON CITY';
        if($('#sa_dwelling')) $('#sa_dwelling').value=(['MDU','MDU DOCSIS'].includes(j.dwelling_type)?j.dwelling_type:'SDU');
        populatePlans(); if($('#sa_plan')) $('#sa_plan').value=j.plan||'';
        if($('#sa_addon')) $('#sa_addon').value=j.add_on||'';
        set('ref_no',j.ref_no);
        if($('#sa_play_type')) $('#sa_play_type').value=j.play_type||'1-PLAY';
        toggleAddonCount(); if($('#sa_addon_count')) $('#sa_addon_count').value=(j.addon_count!=null?String(j.addon_count):'');
        if($('#sa_install_fee')) $('#sa_install_fee').value=j.install_fee_type||'One Time Payment';
        set('amount', j.amount_to_collect!=null?j.amount_to_collect:'');
        if($('#sa_source_of_sales')) $('#sa_source_of_sales').value=j.source_of_sales||'Referral';
        set('referral_name',j.referral_name);
        set('special_note', (j.special_note&&/^REJECTED/i.test(j.special_note))?'':j.special_note);
        saDocs={id:[],billing:[],premise:[]}; saRenderDocs();
        $('#saSubmit').textContent='Resubmit for validation';
        saSwitch('new'); window.scrollTo(0,0);
        toast('Editing order — update the info, then Resubmit for validation');
      }catch(e){ toast('Could not load: '+e.message); }
    }
    // Realtime watch on the sales agent's OWN submitted orders (status + distinct sounds)
    let saChan=null;
    function startSalesWatch(){
      if(saChan) sb.removeChannel(saChan);
      saChan=sb.channel('sa-'+myTeam).on('postgres_changes',
        {event:'*',schema:'public',table:'jobs',filter:'created_by=eq.'+myTeam},
        p=>{
          const j=p.new||{}; if(!j.id) return;
          const prev=saStatus[j.id]; const now=j.status; saStatus[j.id]=now;
          if(p.eventType==='UPDATE' && prev && now && prev!==now){
            const subj=j.subscriber||j.id;
            if(prev==='for_validation' && (now==='pending'||now==='assigned')){ playValidatedSound(); notify('✅ Job order validated', subj+(j.team?(' · assigned to '+j.team):'')); }
            else if(now==='completed'){ playCompletedSound(); notify('🎉 Job order completed', subj); }
            else if(now==='negative'){ playNegativeSound(); notify('⚠️ Job order negative', subj+(j.negative_remark?(' · '+j.negative_remark):'')); }
            else if(now==='cancelled'){ playCancelledSound(); notify('🚫 Job order cancelled', subj); }
            else if(now==='assigned' && j.team){ playValidatedSound(); notify('👷 Team assigned', subj+' · '+j.team); }
          }
          if(!$('#saMine').classList.contains('hidden')) saRenderMine();
        }).subscribe();
    }
    async function saSubmit(){
      clearErr('#saErr');
      const v=id=>($('#'+id)?$('#'+id).value.trim():'');
      const fn=v('sa_first_name'), ln=v('sa_last_name'), dist=v('sa_district'), brgy=v('sa_brgy'), city=v('sa_city')||'QUEZON CITY', pno=v('sa_primary_no'), ono=v('sa_other_contact_no');
      if(!fn||!ln||!pno||!dist||!brgy){ showErr('#saErr','Please fill: first & last name, primary no., district, and barangay.'); return; }
      if(!/^\d{11}$/.test(pno)){ showErr('#saErr','Primary no. must be exactly 11 digits (numbers only).'); return; }
      if(ono && !/^\d{11}$/.test(ono)){ showErr('#saErr','Other contact no. must be 11 digits (numbers only).'); return; }
      const editing=!!saEditingId;
      if(v('sa_play_type')==='2-PLAY' && !v('sa_addon_count')){ showErr('#saErr','For 2-PLAY, select how many add-ons are included.'); return; }
      if(!editing && !saDocs.id.length){ showErr('#saErr','A Valid ID photo is required.'); return; }
      const btn=$('#saSubmit'); btn.disabled=true; btn.textContent=editing?'Resubmitting…':'Submitting…';
      const full=[fn,v('sa_middle_name'),ln].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
      const addr=[v('sa_house_no'),v('sa_street_name'),v('sa_village'),brgy,'District '+dist,city].filter(Boolean).join(', ');
      const fields={subscriber:full,plan:v('sa_plan'),ref_no:v('sa_ref_no'),area:city,address:addr,status:'for_validation',
        first_name:fn,middle_name:v('sa_middle_name'),last_name:ln,primary_no:pno,other_contact_no:v('sa_other_contact_no'),
        house_no:v('sa_house_no'),street_name:v('sa_street_name'),village:v('sa_village'),district:dist,brgy:brgy,city:city,
        play_type:v('sa_play_type'),source_of_sales:v('sa_source_of_sales'),referral_name:v('sa_referral_name'),
        dwelling_type:v('sa_dwelling'),install_fee_type:v('sa_install_fee'),amount_to_collect:(v('sa_amount')!==''?Number(v('sa_amount')):null),add_on:v('sa_addon'),addon_count:(v('sa_play_type')==='2-PLAY'&&v('sa_addon_count')!==''?Number(v('sa_addon_count')):null),
        special_note:v('sa_special_note'),updated_at:new Date().toISOString()};
      try{
        let jobId;
        if(editing){
          jobId=saEditingId;
          const {error}=await sb.from('jobs').update(fields).eq('id',jobId); if(error) throw error;
        } else {
          jobId='WO-'+new Date().getFullYear()+'-'+Date.now().toString().slice(-6)+Math.random().toString(36).slice(2,5);
          const {error}=await sb.from('jobs').insert(Object.assign({id:jobId,service_type:'Installation',wait_time:'Just now',priority:'Normal',schedule:manilaDate()+', 9:00 AM',team:null,created_by:myTeam},fields)); if(error) throw error;
        }
        for(const cat of ['id','billing','premise']){
          for(let i=0;i<saDocs[cat].length;i++){
            const blob=await compressImage(saDocs[cat][i],1000,90,await buildStamp());
            const path=`${jobId}/docs/${cat}_${Date.now()}_${i}.jpg`;
            const {error:e2}=await sb.storage.from('job-photos').upload(path,blob,{contentType:'image/jpeg',upsert:false}); if(e2) throw e2;
            await sb.from('job_docs').insert({job_id:jobId, category:cat, path});
          }
        }
        toast(editing?'Order resubmitted for validation':'Job order submitted for validation'); saEditingId=null; $('#saSubmit').textContent='Submit for validation'; saReset(); saSwitch('mine');
      }catch(e){ showErr('#saErr','Submit failed: '+e.message); }
      btn.disabled=false; btn.textContent= saEditingId?'Resubmit for validation':'Submit for validation';
    }
