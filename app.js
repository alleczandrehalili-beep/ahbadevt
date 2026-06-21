const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const money = n => `₱${Number(n).toLocaleString('en-PH')}`;

const icons = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  route:'<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M6 16V9a4 4 0 0 1 4-4h5"/>',users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  clipboard:'<path d="M9 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h6"/>',wallet:'<path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6"/><path d="M16 13h4"/>',chevron:'<path d="m9 18 6-6-6-6"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',plus:'<path d="M12 5v14M5 12h14"/>',check:'<path d="m20 6-11 11-5-5"/>',truck:'<path d="M10 17h4V5H2v12h3M14 9h4l4 4v4h-3M8 17a3 3 0 1 1-6 0M22 17a3 3 0 1 1-6 0"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',expand:'<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',close:'<path d="m18 6-12 12M6 6l12 12"/>',search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',spark:'<path d="m12 3-1.5 4.5L6 9l4.5 1.5L12 15l1.5-4.5L18 9l-4.5-1.5L12 3ZM5 16l-.8 2.2L2 19l2.2.8L5 22l.8-2.2L8 19l-2.2-.8L5 16Z"/>',pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',wrench:'<path d="M14.7 6.3a4 4 0 0 0-5-5L7 4l3 3 2.7-2.7a4 4 0 0 0 2 5L5 19l-2 2 2 2 2-2 9.7-9.7a4 4 0 0 0 5-5L19 9l-3-3 2.7-2.7Z"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
};
function injectIcons(){ $$('[data-icon]').forEach(el=>{const name=el.dataset.icon;el.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name]||icons.info}</svg>`}) }

const names=Array.from({length:20},(_,i)=>`AHBA_SLI${String(i+1).padStart(3,'0')}`);
const areas=['Quezon City','Manila','Makati','Pasig','Taguig','Caloocan','Parañaque','Mandaluyong','San Juan','Marikina'];
const statuses=['on-site','en-route','on-site','available','en-route','on-site','en-route','available','on-site','en-route','on-site','offline','en-route','on-site','available','en-route','on-site','offline','available','en-route'];
const colors=['#1a9d79','#4086e8','#9a6edb','#ee8564','#16a0ad','#e3a23c'];
const teams=names.map((name,i)=>({id:i+1,name,code:name,short:String(i+1).padStart(3,'0'),status:statuses[i],area:areas[i%areas.length],jobs: i%4+1,completed: Math.max(0,(i*3)%7),rating:(4.6+(i%4)*.1).toFixed(1),x:8+((i*37)%84),y:12+((i*29)%72),color:colors[i%colors.length],members:2+(i%2)}));

// Supabase (read-only here) for the Accounts panel
const SUPA_URL='https://avjzkfxgzeyxtihkofed.supabase.co';
const SUPA_KEY='sb_publishable_2JM51zp2r5GUICznc6Nz4Q_B4UFS1da';
// Authorization token for REST calls: logged-in dashboard user's JWT (falls back to public key pre-login).
// Once RLS is locked to authenticated-only, all data calls must carry this user token.
window.__ahbaTok = window.__ahbaTok || null;
function dashTok(){ return window.__ahbaTok || SUPA_KEY; }

let jobs=JSON.parse(localStorage.getItem('fieldflow_jobs')||'null')||[
 {id:'WO-2026-1048',subscriber:'Maria Santos',type:'Installation',plan:'Fiber Unli 400 Mbps',area:'Quezon City',address:'Project 4, Quezon City',status:'pending',wait:'42 min',priority:'Urgent',schedule:'Today, 10:00 AM',team:null},
 {id:'WO-2026-1047',subscriber:'Carlo Reyes',type:'Repair',plan:'Service Repair',area:'Makati',address:'Poblacion, Makati',status:'pending',wait:'35 min',priority:'Normal',schedule:'Today, 10:30 AM',team:null},
 {id:'WO-2026-1046',subscriber:'Anne Lim',type:'Installation',plan:'Fiber Unli 200 Mbps',area:'Manila',address:'Sampaloc, Manila',status:'assigned',wait:'28 min',priority:'Normal',schedule:'Today, 11:00 AM',team:'AHBA_SLI001'},
 {id:'WO-2026-1045',subscriber:'Roberto Cruz',type:'Repair',plan:'Service Repair',area:'Pasig',address:'Kapitolyo, Pasig',status:'en-route',wait:'18 min',priority:'VIP',schedule:'Today, 9:45 AM',team:'AHBA_SLI002'},
 {id:'WO-2026-1044',subscriber:'Liza Mendoza',type:'Installation',plan:'Cable + Internet Bundle',area:'Taguig',address:'Pinagsama, Taguig',status:'on-site',wait:'12 min',priority:'Normal',schedule:'Today, 9:00 AM',team:'AHBA_SLI003'},
 {id:'WO-2026-1043',subscriber:'David Ong',type:'Installation',plan:'Fiber Unli 600 Mbps',area:'Caloocan',address:'Grace Park, Caloocan',status:'completed',wait:'—',priority:'Normal',schedule:'Today, 8:00 AM',team:'AHBA_SLI006'},
 {id:'WO-2026-1042',subscriber:'Grace Tan',type:'Repair',plan:'Service Repair',area:'Marikina',address:'Concepcion, Marikina',status:'in-progress',wait:'—',priority:'Urgent',schedule:'Today, 8:30 AM',team:'AHBA_SLI007'},
 {id:'WO-2026-1041',subscriber:'Marco Diaz',type:'Installation',plan:'Fiber Unli 400 Mbps',area:'Parañaque',address:'BF Homes, Parañaque',status:'completed',wait:'—',priority:'Normal',schedule:'Today, 7:30 AM',team:'AHBA_SLI008'}
];
let expenses=JSON.parse(localStorage.getItem('fieldflow_expenses')||'null')||[
 {time:'9:42 AM',team:'AHBA_SLI001',category:'Fuel',description:'Diesel refill',workOrder:'—',amount:1850,status:'Approved'},
 {time:'9:18 AM',team:'AHBA_SLI003',category:'Materials',description:'Fiber drop cable, 150m',workOrder:'WO-2026-1044',amount:3200,status:'Approved'},
 {time:'8:55 AM',team:'AHBA_SLI002',category:'Toll & Parking',description:'Skyway toll',workOrder:'WO-2026-1045',amount:520,status:'Approved'},
 {time:'8:30 AM',team:'AHBA_SLI007',category:'Materials',description:'Connectors and splitter',workOrder:'WO-2026-1042',amount:1480,status:'Pending'},
 {time:'8:05 AM',team:'AHBA_SLI006',category:'Fuel',description:'Gasoline refill',workOrder:'—',amount:2100,status:'Approved'},
 {time:'7:50 AM',team:'AHBA_SLI008',category:'Meals',description:'Team breakfast allowance',workOrder:'—',amount:600,status:'Approved'},
 {time:'7:32 AM',team:'AHBA_SLI005',category:'Fuel',description:'Diesel refill',workOrder:'—',amount:1750,status:'Approved'},
 {time:'7:18 AM',team:'AHBA_SLI010',category:'Other',description:'Emergency tool replacement',workOrder:'—',amount:2950,status:'Pending'},
 {time:'7:05 AM',team:'AHBA_SLI011',category:'Materials',description:'Modem replacement stock',workOrder:'WO-2026-1039',amount:4000,status:'Approved'}
];
const activity=[
 {icon:'check',tone:'',title:'Installation completed',text:'<b>AHBA_SLI006</b> completed WO-2026-1043',time:'2m'},
 {icon:'truck',tone:'blue',title:'Team is en route',text:'<b>AHBA_SLI002</b> heading to Poblacion, Makati',time:'6m'},
 {icon:'wallet',tone:'coral',title:'Expense submitted',text:'<b>AHBA_SLI003</b> logged ₱3,200 materials',time:'12m'},
 {icon:'pin',tone:'',title:'Team arrived on site',text:'<b>AHBA_SLI007</b> checked in at Marikina',time:'18m'},
 {icon:'wrench',tone:'blue',title:'Repair started',text:'<b>AHBA_SLI001</b> began line diagnostics',time:'24m'},
 {icon:'info',tone:'coral',title:'Job needs attention',text:'WO-2026-1048 has been waiting 42 min',time:'31m'}
];

// UI state
let mapFilter='all';

function save(){localStorage.setItem('fieldflow_jobs',JSON.stringify(jobs));localStorage.setItem('fieldflow_expenses',JSON.stringify(expenses))}
function statusLabel(s){return s.split('-').map(x=>x[0].toUpperCase()+x.slice(1)).join(' ')}
function todayTotal(){return expenses.reduce((a,b)=>a+Number(b.amount),0)}
function showToast(msg){$('#toast span').textContent=msg;$('#toast').classList.add('show');clearTimeout(showToast._t);showToast._t=setTimeout(()=>$('#toast').classList.remove('show'),2600)}
// Fire a phone push (Web Push) to a team or audience via the send-push Edge Function
function pushNotify(payload){ try{ fetch(`${SUPA_URL}/functions/v1/send-push`,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()},body:JSON.stringify(payload)}).catch(()=>{}); }catch(e){} }

function dayStr(d){return new Date(d).toLocaleDateString('en-CA',{timeZone:TZ});}
function timeAgo(ts){ if(!ts)return''; const s=(Date.now()-new Date(ts))/1000; if(s<60)return Math.max(1,Math.round(s))+'s'; if(s<3600)return Math.round(s/60)+'m'; if(s<86400)return Math.round(s/3600)+'h'; return Math.round(s/86400)+'d'; }
function renderLiveActivity(){
  const el=$('#activityList'); if(!el)return;
  const map={completed:['check','','Job completed'],'en-route':['truck','blue','Team en route'],'on-site':['pin','','Arrived on site'],'in-progress':['wrench','blue','Work in progress'],negative:['info','coral','Marked negative'],assigned:['truck','blue','Dispatched'],cancelled:['info','coral','Cancelled'],for_validation:['clipboard','','For validation'],pending:['info','','For dispatch'],rejected:['info','coral','Rejected']};
  const items=jobs.filter(j=>j.updatedAt).slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,8);
  if(!items.length){ el.innerHTML='<div style="padding:24px;text-align:center;color:#9aa6a2;font-size:11px">No field activity yet.</div>'; return; }
  el.innerHTML=items.map(j=>{ const m=map[j.status]||['info','','Updated']; const who=j.team?`<b>${j.team}</b> · `:''; return `<div class="activity-item" data-detail="${j.id}" style="cursor:pointer"><span class="activity-icon ${m[1]}" data-icon="${m[0]}"></span><div class="activity-copy"><strong>${m[2]}</strong><p>${who}${j.subscriber||j.id}</p></div><time>${timeAgo(j.updatedAt)}</time></div>`; }).join('');
  injectIcons();
  $$('#activityList [data-detail]').forEach(r=>r.onclick=()=>openJobDetail(r.dataset.detail));
}
function renderOverview(){
  const today=manilaToday();
  const isToday=d=>d && dayStr(d)===today;
  const loadToday=d=>!d||String(d).slice(0,10)===today;
  // Jobs completed today (resets to 0 each new day)
  const doneJobs=jobs.filter(j=>j.status==='completed' && isToday(j.updatedAt));
  const todaySet=jobs.filter(j=> (['completed','cancelled'].includes(j.status)? isToday(j.updatedAt) : loadToday(j.load_date)) );
  if($('#completedCount')) $('#completedCount').textContent=doneJobs.length;
  if($('#completedTarget')) $('#completedTarget').textContent=Math.max(todaySet.length,doneJobs.length);
  if($('#completedFoot')) $('#completedFoot').textContent=`${doneJobs.length} done`;
  // Teams on the road = online (timed-in) teams only
  const online=Object.entries(shiftByTeam).filter(([k,s])=>s.online);
  if($('#activeTeamCount')) $('#activeTeamCount').textContent=online.length;
  if($('#availableTeamText')) $('#availableTeamText').textContent=`${online.length} online now`;
  if($('#teamAvatars')) $('#teamAvatars').innerHTML=online.slice(0,6).map(([k])=>{const t=teams.find(x=>x.code===k);return `<span style="background:#18a57b">${t?t.short:k.slice(-3)}</span>`}).join('');
  // Avg completion time today (encode → completion, same-day)
  const mins=[]; doneJobs.forEach(j=>{ if(j.created_at&&j.updatedAt){const d=(new Date(j.updatedAt)-new Date(j.created_at))/60000; if(d>0&&d<24*60) mins.push(d);} });
  if(mins.length){ const avg=Math.round(mins.reduce((a,b)=>a+b,0)/mins.length); if($('#avgTime'))$('#avgTime').textContent=`${Math.floor(avg/60)}h ${String(avg%60).padStart(2,'0')}m`; if($('#avgSub'))$('#avgSub').textContent=`avg of ${mins.length} completed today`; }
  else { if($('#avgTime'))$('#avgTime').textContent='—'; if($('#avgSub'))$('#avgSub').textContent='no completed jobs yet today'; }
  // 7-day completed mini-bars (real)
  const bars=[]; for(let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); const ds=dayStr(d); bars.push(jobs.filter(j=>j.status==='completed'&&j.updatedAt&&dayStr(j.updatedAt)===ds).length); }
  const mx=Math.max(...bars,1); if($('#completionBars')) $('#completionBars').innerHTML=bars.map(n=>`<span style="height:${6+Math.round(n/mx*34)}px"></span>`).join('');
  renderTeamLocations();
  renderLiveActivity();
  injectIcons();
  renderExpenses();renderJobs();
}
// ---------- Live GPS map (Leaflet) ----------
const AREA_COORDS={'Quezon City':[14.676,121.043],'Manila':[14.599,120.984],'Makati':[14.554,121.024],'Pasig':[14.576,121.085],'Taguig':[14.520,121.053],'Caloocan':[14.651,120.972],'Parañaque':[14.479,121.019],'Mandaluyong':[14.577,121.037],'San Juan':[14.601,121.030],'Marikina':[14.650,121.102]};
function areaCoord(a){if(!a)return null;if(AREA_COORDS[a])return AREA_COORDS[a];const k=Object.keys(AREA_COORDS).find(x=>x.toLowerCase()===String(a).toLowerCase());return k?AREA_COORDS[k]:null;}
const SUB_FIELDS=['dispatch_status','driver','tech1','mapping_team','mapping_remarks','dispatched_remarks','ibass_acct_no','job_order_no','vas_no','play_type','special_note','ref_no','new_ref','primary_no','other_contact_no','first_name','middle_name','last_name','house_no','street_name','village','brgy','city','in_charge','source_of_sales','referral_name'];
const safeName=s=>(s||'subscriber').replace(/[\\/:*?"<>|]+/g,'').replace(/\s+/g,' ').trim()||'subscriber';
let leafMap=null, teamMarkers={}, techIndex={};
function haversineKm(a,b,c,d){const R=6371,toR=x=>x*Math.PI/180;const dLat=toR(c-a),dLng=toR(d-b);const s=Math.sin(dLat/2)**2+Math.cos(toR(a))*Math.cos(toR(c))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(s))}
function isOnline(loc){return loc && loc.location_at && (Date.now()-new Date(loc.location_at))<15*60*1000}

// ---- Live team shifts (account + crew) read from today's attendance ----
let shiftByTeam={};   // { AHBA_SLI001: {account,driver,tech1,tech2,online,time_in} }
async function loadTeamShifts(){
  const date=manilaToday();
  try{
    const r=await fetch(`${SUPA_URL}/rest/v1/attendance?select=username,time_in,time_out,work_account,crew_driver,crew_tech1,crew_tech2,deployed_verified&work_date=eq.${date}&order=time_in.desc`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}});
    const rows=r.ok?await r.json():[];
    const m={};
    rows.forEach(a=>{ if(!m[a.username]) m[a.username]={account:a.work_account||'',driver:a.crew_driver||'',tech1:a.crew_tech1||'',tech2:a.crew_tech2||'',online:!!(a.time_in&&!a.time_out),time_in:a.time_in,verified:a.deployed_verified===true,verified_by:a.verified_by||'',verified_at:a.verified_at||''}; });
    shiftByTeam=m;
  }catch(e){}
}
function teamCrew(code){const s=shiftByTeam[code]||{};return [s.driver,s.tech1,s.tech2].filter(Boolean).join(', ');}
// A team "moved" a load today → real deployment (not just a login test)
function teamHasActivity(code){
  const today=manilaToday();
  return jobs.some(j=>{
    if(j.team!==code) return false;
    if(!['en-route','on-site','in-progress','completed','negative'].includes(j.status)) return false;
    const d=j.load_date?String(j.load_date).slice(0,10):(j.updatedAt?new Date(j.updatedAt).toLocaleDateString('en-CA',{timeZone:TZ}):'');
    return !d || d===today;
  });
}
function teamCounted(code){const s=shiftByTeam[code]||{};return s.verified===true||teamHasActivity(code);}
// Dispatcher confirms (or unconfirms) that a signed-in team is really deployed
async function verifyTeamDeployed(code,val){
  const date=manilaToday();
  const who=currentOperator(), now=new Date().toISOString();
  const payload=val?{deployed_verified:true,verified_by:who,verified_at:now}:{deployed_verified:false,verified_by:null,verified_at:null};
  try{
    await fetch(`${SUPA_URL}/rest/v1/attendance?username=eq.${code}&work_date=eq.${date}`,{method:'PATCH',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok(),'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(payload)});
    await loadTeamShifts();
    renderTeams($('#teamSearch')?.value||'');
    if($('#expensesPage')?.classList.contains('active')) renderExpenses();
    if($('#teamDetailModal')?.open) openTeamDetail(code);
    showToast(val?`${code} verified as deployed`:`${code} verification removed`);
  }catch(e){ showToast('Could not update verification'); }
}

// ---- Live real-time clock (Manila / Philippine Standard Time) ----
function updateShiftClock(){
  const now=new Date();
  const t=$('#clockTime'); if(t)t.textContent=now.toLocaleTimeString('en-PH',{timeZone:TZ,hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true});
  const d=$('#clockDate'); if(d)d.textContent=now.toLocaleDateString('en-PH',{timeZone:TZ,weekday:'long',month:'short',day:'numeric'})+' · PHT';
}
function initMap(){
  if(leafMap||typeof L==='undefined'||!document.getElementById('leafletMap'))return;
  leafMap=L.map('leafletMap',{zoomControl:true,attributionControl:false}).setView([14.5995,120.9842],11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(leafMap);
  setTimeout(()=>leafMap.invalidateSize(),200);
}
async function fetchTechLocations(){
  try{
    const r=await fetch(`${SUPA_URL}/rest/v1/technicians?select=username,area,lat,lng,location_at`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}});
    const rows=r.ok?await r.json():[];
    techIndex={}; rows.forEach(t=>{techIndex[t.username]=t}); return rows;
  }catch(e){return Object.values(techIndex)}
}
async function renderTeamLocations(){
  initMap(); if(!leafMap)return;
  const rows=await fetchTechLocations();
  const today=manilaToday();
  const seen={};
  rows.forEach(t=>{
    if(t.lat==null||t.lng==null)return;
    // map shows TODAY's positions only — auto-clears at the start of each new day
    if(!t.location_at || new Date(t.location_at).toLocaleDateString('en-CA',{timeZone:TZ})!==today) return;
    const online=isOnline(t);
    if(mapFilter==='active'&&!online)return;
    seen[t.username]=1;
    const color=online?'#18a57b':'#e9a93d';
    const popup=`<b>${t.username}</b><br>${t.area||''}<br>${t.location_at?'Updated '+fmtWhen(t.location_at):'—'}`;
    if(teamMarkers[t.username]){
      teamMarkers[t.username].setLatLng([t.lat,t.lng]).setStyle({fillColor:color,color:color}).bindPopup(popup);
    }else{
      teamMarkers[t.username]=L.circleMarker([t.lat,t.lng],{radius:8,weight:2,color,fillColor:color,fillOpacity:.85}).addTo(leafMap).bindPopup(popup);
    }
  });
  // remove markers no longer shown
  Object.keys(teamMarkers).forEach(u=>{if(!seen[u]){leafMap.removeLayer(teamMarkers[u]);delete teamMarkers[u]}});
  const withGps=rows.filter(t=>t.lat!=null).length;
  const onlineN=rows.filter(isOnline).length;
  const at=$('#availableTeamText'); if(at) at.textContent=`${onlineN} online · ${withGps} sharing GPS`;
}
function renderJobs(){
  processNegativeReturns();
  const pending=jobs.filter(j=>j.status==='pending');
  $('#pendingBadge').textContent=pending.length;
  $('#queueBody').innerHTML=pending.slice(0,4).map(j=>`<tr><td><strong>${j.id}</strong><span>${j.priority}</span></td><td><strong>${j.subscriber}</strong></td><td>${j.type}</td><td>${j.area}</td><td><span class="status pending">${j.wait}</span></td><td><button class="assign-btn" data-assign="${j.id}">Assign</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty-cell">No jobs waiting for dispatch.</td></tr>';
  $('#workOrderBody').innerHTML=jobs.map(j=>`<tr data-type="${j.type.toLowerCase()}" data-status="${j.status}" data-text="${(j.id+' '+j.subscriber+' '+j.area).toLowerCase()}"><td><strong>${j.id}</strong><span>${j.priority}</span></td><td><strong>${j.subscriber}</strong><span>${j.plan}</span></td><td>${j.type}</td><td>${j.area}</td><td>${j.team||'—'}</td><td><span class="status ${j.status}">${statusLabel(j.status)}</span></td><td>${j.schedule}</td></tr>`).join('');
  const today=manilaToday();
  const isToday=d=>d && new Date(d).toLocaleDateString('en-CA',{timeZone:TZ})===today;
  const loadToday=d=>!d || String(d).slice(0,10)===today;   // today's working set (clears daily)
  const stages=[['pending','For Dispatch'],['assigned','Acknowledged'],['en-route','Travel'],['on-site,in-progress','On Site'],['negative','Incomplete'],['completed','Completed'],['cancelled','Cancelled']];
  $('#dispatchBoard').innerHTML=stages.map(([keys,label])=>{
    let list;
    if(keys==='negative'){ list=jobs.filter(j=>j.status==='negative'); }
    else if(keys==='completed'||keys==='cancelled'){ list=jobs.filter(j=>keys.split(',').includes(j.status)&&isToday(j.updatedAt)); }
    else { list=jobs.filter(j=>keys.split(',').includes(j.status)&&loadToday(j.load_date)); }
    return `<div class="board-column" data-drop="${keys}"><div class="column-head"><strong>${label}</strong><span>${list.length}</span></div>${list.map(jobCard).join('')||'<div class="job-card empty"><p>No jobs in this stage.</p></div>'}</div>`;
  }).join('');
  // All four counts come from ONE set: unique loads with today's load_date.
  // → Incomplete + Cancelled + Completed (+ still-active) always reconcile to Total Turn-Ins.
  const todayLoads=[...new Map(jobs.filter(j=>j.load_date&&String(j.load_date).slice(0,10)===today).map(j=>[j.id,j])).values()];
  const cntBy=s=>todayLoads.filter(j=>j.status===s).length;
  const stats=[
    ['Total Turn-Ins', todayLoads.length, '#4285f4'],   // unique loads na pumasok para sa araw
    ['Incomplete',     cntBy('negative'),  '#c2503a'],
    ['Cancelled',      cntBy('cancelled'), '#7a8088'],
    ['Completed',      cntBy('completed'), '#11825f']
  ];
  $('#dispatchStats').innerHTML=stats.map(([l,n,c])=>`<div class="small-stat" style="border-left:4px solid ${c}"><span>${l}</span><strong style="color:${c}">${n}</strong></div>`).join('');
  bindAssignButtons();
  wireDispatchDnD();
  applyJobTableFilter();
  applyDispatchSearch();
}
function applyDispatchSearch(){
  const q=($('#dispatchSearch')?.value||'').toLowerCase().trim();
  $$('#dispatchBoard .board-column').forEach(col=>{
    let shown=0;
    col.querySelectorAll('.job-card[data-detail]').forEach(c=>{ const hit=!q||(c.dataset.name||'').includes(q); c.style.display=hit?'':'none'; if(hit)shown++; });
    const empty=col.querySelector('.job-card.empty'); if(empty) empty.style.display=q?'none':'';
    // show a "no match" hint when searching and nothing matched in this column
    let hint=col.querySelector('.search-empty');
    if(q && !shown){ if(!hint){ hint=document.createElement('div'); hint.className='job-card empty search-empty'; hint.innerHTML='<p>No match</p>'; col.appendChild(hint); } hint.style.display=''; }
    else if(hint){ hint.style.display='none'; }
  });
}
function appendHistory(h,line){const t=new Date().toLocaleString('en-PH',{timeZone:TZ,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});return ((h||'')+`\n[${t}] ${line}`).trim();}
// A negative job is released back to dispatch at 5:00 AM (Manila) the NEXT day.
function negReleased(negAt){
  if(!negAt) return false;
  const md=new Date(negAt).toLocaleDateString('en-CA',{timeZone:TZ});
  const release=new Date(`${md}T05:00:00+08:00`); release.setDate(release.getDate()+1);
  return Date.now()>=release.getTime();
}
function processNegativeReturns(){
  const today=manilaToday();
  jobs.forEach(j=>{
    // Incomplete (negative) → back to For Dispatch at 5:00 AM next day, as 1st Load
    if(j.status==='negative' && negReleased(j.negative_at)){
      j.status='pending'; j.team=null; j.priority='1st Load'; j.load_date=today;
      j.history=appendHistory(j.history,'End of day: Incomplete → For Dispatch (1st Load)');
      if(window.AHBASync) window.AHBASync(j);
    }
    // Leftover For Dispatch from a previous day → carry forward to today as priority (1st Load)
    else if(j.status==='pending' && j.load_date && String(j.load_date).slice(0,10)<today){
      j.priority='1st Load'; j.load_date=today;
      j.history=appendHistory(j.history,'Carried to next day (For Dispatch, 1st Load)');
      if(window.AHBASync) window.AHBASync(j);
    }
  });
}
function unassignJob(jobId){
  const j=jobs.find(x=>x.id===jobId); if(!j||!['assigned','en-route','negative'].includes(j.status))return;
  const wasNeg=j.status==='negative';
  j.status='pending'; j.team=null; j.load_date=manilaToday(); if(wasNeg) j.priority='1st Load';
  j.history=appendHistory(j.history, wasNeg?'Manually returned → For Dispatch (1st Load)':'Moved back to For Dispatch');
  save(); renderJobs(); showToast(`${jobId} → For Dispatch${wasNeg?' (High priority)':''}`);
  if(window.AHBASync) window.AHBASync(j);
}
function openJobDetail(jobId){
  const j=findJob(jobId)||{};
  $('#jdTitle').textContent=`${j.id} · ${j.subscriber||''}`;
  $('#jdSub').textContent=`${statusLabel(j.status||'—')}${j.team?' · '+j.team:''}${j.dispatch_count?' · ⟳ ×'+j.dispatch_count:''}`;
  const F=(l,v)=>`<div><b>${l}</b>${v||'—'}</div>`;
  $('#jdInfo').innerHTML=[
    F('Subscriber',j.subscriber),F('Primary no.',j.primary_no),F('Other contact',j.other_contact_no),
    F('J.O. Number',j.job_order_no),F('IBASS acct',j.ibass_acct_no),F('Plan / 1P-2P',[j.plan,j.play_type].filter(Boolean).join(' · ')),
    F('Address',j.address),F('Barangay',j.brgy),F('City',j.city||j.area),
    F('Team',j.team),F('Status',statusLabel(j.status||'')),F('Priority',j.priority),
    F('Source / Referral',[j.source_of_sales,j.referral_name].filter(Boolean).join(' · ')),
    F('Account',j.work_account||(j.team&&shiftByTeam[j.team]?shiftByTeam[j.team].account:'')),
    F('Crew (Driver / T1 / T2)',[j.crew_driver||(j.team&&shiftByTeam[j.team]?shiftByTeam[j.team].driver:''),j.crew_tech1||(j.team&&shiftByTeam[j.team]?shiftByTeam[j.team].tech1:''),j.crew_tech2||(j.team&&shiftByTeam[j.team]?shiftByTeam[j.team].tech2:'')].filter(Boolean).join(' · ')),
    F('Payment',[j.payment_mode, j.payment_amount!=null?('₱'+j.payment_amount):null, j.ar_no?('AR '+j.ar_no):null].filter(Boolean).join(' · ')),
    F('Schedule',j.schedule),F('Negative remark',j.negative_remark)
  ].join('');
  $('#jdHistory').textContent=j.history||'No history yet.';
  if($('#jdPriority')){ $('#jdPriority').value=j.priority||'Normal'; $('#jdPriority').onchange=()=>updatePriority(jobId,$('#jdPriority').value); }
  $('#jdStatus').value='';
  $('#jdApply').onclick=()=>{const c=$('#jdStatus').value; if(!c){showToast('Select a status to apply');return;} applyStatusUpdate(jobId,c);};
  openModal($('#jobDetailModal'));
}
function updatePriority(jobId,p){
  const j=findJob(jobId); if(!j||!p||j.priority===p)return;
  j.priority=p; j.history=appendHistory(j.history,`Priority → ${p} (by Dispatcher)`);
  save(); renderJobs(); if($('#historyPage')?.classList.contains('active'))renderHistory(); showToast(`${jobId} priority → ${p}`);
  if(window.AHBASync) window.AHBASync(j);
}
function applyStatusUpdate(jobId,choice){
  const j=findJob(jobId); if(!j)return;
  if(choice==='completed') j.status='completed';
  else if(choice==='cancelled') j.status='cancelled';
  else { j.status='pending'; j.team=null; j.load_date=manilaToday(); }  // incomplete / re-dispatch → For Dispatch (today)
  const label={completed:'Completed',incomplete:'Incomplete → For Dispatch',redispatch:'Re-dispatch → For Dispatch',cancelled:'Cancelled'}[choice];
  j.history=appendHistory(j.history, `Status → ${label} (by Dispatcher)`);
  j.updatedAt=new Date().toISOString();
  save(); closeModals(); renderJobs(); if($('#historyPage')?.classList.contains('active'))renderHistory(); showToast(`${jobId}: ${label}`);
  if(window.AHBASync) window.AHBASync(j);
}
function wireDispatchDnD(){
  $$('#dispatchBoard .job-card[data-detail]').forEach(c=>c.onclick=e=>{ if(e.target.closest('button'))return; openJobDetail(c.dataset.detail); });
  $$('#dispatchBoard [data-unassign]').forEach(b=>b.onclick=()=>unassignJob(b.dataset.unassign));
  $$('#dispatchBoard [data-jobid]').forEach(card=>{
    card.ondragstart=e=>{e.dataTransfer.setData('text/plain',card.dataset.jobid);e.dataTransfer.effectAllowed='move';card.style.opacity='.45'};
    card.ondragend=()=>{card.style.opacity=''};
  });
  $$('#dispatchBoard [data-drop="pending"]').forEach(col=>{
    col.ondragover=e=>{e.preventDefault();col.classList.add('drop-hover')};
    col.ondragleave=()=>col.classList.remove('drop-hover');
    col.ondrop=e=>{e.preventDefault();col.classList.remove('drop-hover');const id=e.dataTransfer.getData('text/plain');if(id)unassignJob(id)};
  });
}
function jobCard(j){
  const canBounce=['assigned','en-route','negative'].includes(j.status);
  const drag=canBounce?` draggable="true" data-jobid="${j.id}"`:'';
  const prio=j.priority?`<span class="priority" style="${j.priority!=='1st Load'?'color:#687974;background:#f1f3f1':''}">${j.priority}</span>`:'';
  const enc=j.created_at?fmtWhen(j.created_at):(j.load_date?String(j.load_date).slice(0,10):'—');
  const action=j.status==='pending'
    ? `<button class="assign-btn" data-assign="${j.id}" style="margin-top:8px;width:100%">Assign team</button>`
    : canBounce
      ? `<button class="assign-btn" data-unassign="${j.id}" title="Return to For Dispatch" style="margin-top:8px;width:100%">${j.status==='negative'?'↩ For Dispatch (1st Load)':'↩ For Dispatch'}</button>`
      : '';
  const s=j.team?(shiftByTeam[j.team]||{}):{};
  const acct=j.work_account||s.account;
  const crew=[j.crew_driver||s.driver, j.crew_tech1||s.tech1, j.crew_tech2||s.tech2].filter(Boolean).join(', ');
  const acctLine=acct?`<span>🚐 ${acct}</span>`:'';
  const crewLine=crew?`<span>👤 ${crew}</span>`:'';
  return `<article class="job-card compact" data-detail="${j.id}" data-name="${(j.subscriber||'').toLowerCase().replace(/"/g,'')}"${drag}>
    <div class="job-top"><span class="job-id">${j.id}</span>${prio}</div>
    <h3>${j.subscriber||'—'}</h3>
    <div class="jc-meta">
      <span><span class="status ${j.status}">${statusLabel(j.status)}</span></span>
      <span>👥 ${j.team||'Unassigned'}</span>
      ${acctLine}${crewLine}
      <span>🕒 ${enc}</span>
    </div>${action}</article>`;
}
function renderTeams(filter=''){
  $('#teamGrid').innerHTML=teams.filter(t=>(t.name+t.area+t.code).toLowerCase().includes(filter.toLowerCase())).map(t=>{
    const s=shiftByTeam[t.code]||{};
    const online=!!s.online;
    const crew=teamCrew(t.code);
    const todayJobs=jobs.filter(j=>j.team===t.code).length;
    const cardStyle=online?'style="cursor:pointer;background:#e9f9f0;border:1px solid #a8e6c9"':'style="cursor:pointer"';
    const vchip=teamCounted(t.code)?' <span class="status completed">✓ Deployed</span>':(online?' <span class="status pending">Pending</span>':'');
    const badge=(online?'<span class="status en-route">● Online</span>':'<span class="status offline">Offline</span>')+vchip;
    const acctLine=online&&s.account?`<div class="team-info"><span>Account<strong>${s.account}</strong></span><span>Crew<strong>${crew||'—'}</strong></span></div>`:'';
    return `<article class="team-card" data-team="${t.code}" ${cardStyle}><div class="team-card-head"><span class="team-avatar" style="background:${online?'#18a57b':t.color}">${t.short}</span><div><h3>${t.name}</h3><p>${online?'On shift':'Not signed in'} · ${t.area}</p></div></div>${badge}<div class="load-row"><span>Today’s load</span><b>${todayJobs} jobs</b></div><div class="load-bar"><span style="width:${Math.min(todayJobs/5*100,100)}%"></span></div>${acctLine}</article>`;
  }).join('')||'<div class="empty-row">No teams match your search.</div>';
  $$('#teamGrid [data-team]').forEach(c=>c.onclick=()=>openTeamDetail(c.dataset.team));
}
function openTeamDetail(code){
  const t=teams.find(x=>x.code===code)||{code}; const s=shiftByTeam[code]||{};
  const online=!!s.online;
  const teamJobs=jobs.filter(j=>j.team===code);
  const F=(l,v)=>`<div><b>${l}</b>${v||'—'}</div>`;
  $('#tdTitle').textContent=code;
  $('#tdSub').textContent=online?('On shift since '+(s.time_in?fmtWhen(s.time_in):'—')):'Not signed in today';
  $('#tdInfo').innerHTML=[
    F('Status',online?'Online (on shift)':'Offline'),
    F('Account in use',s.account),
    F('Driver',s.driver),
    F('Technician 1',s.tech1),
    F('Technician 2',s.tech2),
    F('Jobs today',teamJobs.length+''),
    F('Active now',teamJobs.filter(j=>['assigned','en-route','on-site','in-progress'].includes(j.status)).map(j=>j.id).join(', ')),
    F('Completed today',teamJobs.filter(j=>j.status==='completed').length+''),
    F('Load activity',teamHasActivity(code)?'Has updated a load ✓':'No load update yet'),
    F('Dispatcher verification',s.verified?'Verified deployed ✓':'Not verified'),
    F('Verified by',s.verified?(s.verified_by||'—'):'—'),
    F('Verified at',s.verified&&s.verified_at?fmtWhen(s.verified_at):'—'),
    F('Counted in expenses',teamCounted(code)?'Yes':'Not yet')
  ].join('');
  const vb=$('#tdVerify');
  if(vb){
    const signedIn=!!shiftByTeam[code];
    vb.style.display=signedIn?'':'none';
    vb.textContent=s.verified?'✓ Verified — tap to remove':'Verify as deployed';
    vb.onclick=()=>verifyTeamDeployed(code,!s.verified);
  }
  loadTeamTrack(code); loadTeamChat(code); loadTeamGate(code);
  const sb=$('#tdChatSend'), inp=$('#tdChatInput');
  if(sb){ sb.onclick=()=>sendTeamChat(code); }
  if(inp){ inp.value=''; inp.onkeydown=e=>{ if(e.key==='Enter') sendTeamChat(code); }; }
  openModal($('#teamDetailModal'));
}
async function loadTeamGate(code){
  const el=$('#tdGate'); if(!el)return; el.innerHTML='Loading…';
  const date=manilaToday();
  try{
    const r=await fetch(`${SUPA_URL}/rest/v1/gate_logs?select=*&team=eq.${encodeURIComponent(code)}&work_date=eq.${date}&order=checked_at.desc&limit=1`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}});
    const g=(r.ok?await r.json():[])[0];
    if(!g){ el.innerHTML='<span style="color:#b97a16">⏳ Hindi pa na-validate ng Security ngayong araw.</span>'; return; }
    const crew=[g.crew_driver,g.crew_tech1,g.crew_tech2].filter(Boolean).join(', ');
    el.innerHTML=`<div style="display:grid;gap:3px">
      <div><b style="color:#11825f">✓ Gate-out validated</b> · ${fmtWhen(g.checked_at)}</div>
      <div>🚐 Plate: <b>${g.plate_no||'—'}</b> · Odometer: <b>${g.odometer!=null?g.odometer+' km':'—'}</b></div>
      <div>👤 Crew: ${crew||'—'} ${g.crew_ok?'<span class="status completed" style="font-size:7px">crew OK</span>':'<span class="status pending" style="font-size:7px">discrepancy</span>'}</div>
      ${g.crew_remarks?`<div style="color:#c2503a">Remarks: ${g.crew_remarks}</div>`:''}
      <div style="color:#9aa6a2">Validated by ${g.security_user||'Security'}</div>
    </div>`;
  }catch(e){ el.innerHTML='<span style="color:#c2503a">Could not load gate-out.</span>'; }
}
async function loadTeamTrack(code){
  const el=$('#tdTrack'); if(!el)return; el.innerHTML='Loading…';
  const date=manilaToday();
  try{
    const r=await fetch(`${SUPA_URL}/rest/v1/location_history?select=lat,lng,area,reason,created_at&username=eq.${encodeURIComponent(code)}&work_date=eq.${date}&order=created_at.asc`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}});
    const rows=r.ok?await r.json():[];
    if(!rows.length){ el.innerHTML='<span style="color:#9aa6a2">No location trail recorded today.</span>'; return; }
    el.innerHTML=rows.map(p=>{
      const t=fmtTime(p.created_at); const place=p.area||(p.lat!=null?`${(+p.lat).toFixed(4)}, ${(+p.lng).toFixed(4)}`:'—');
      const r2=(p.reason||'auto').replace('status:','• ');
      const maps=p.lat!=null?` · <a href="https://maps.google.com/?q=${p.lat},${p.lng}" target="_blank" rel="noopener" style="color:#178262">map</a>`:'';
      return `<div style="border-bottom:1px dashed #eef1ed;padding:5px 0"><b>${t}</b> — ${place} <span style="color:#9aa6a2">${r2}</span>${maps}</div>`;
    }).join('');
  }catch(e){ el.innerHTML='<span style="color:#c2503a">Could not load travel history.</span>'; }
}
async function loadTeamChat(code){
  const el=$('#tdChat'); if(!el)return; el.innerHTML='Loading…';
  try{
    const r=await fetch(`${SUPA_URL}/rest/v1/team_messages?select=*&team=eq.${encodeURIComponent(code)}&order=created_at.asc&limit=200`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}});
    const rows=r.ok?await r.json():[];
    el.innerHTML=rows.length?rows.map(m=>{
      const disp=m.role==='dispatch';
      return `<div style="align-self:${disp?'flex-end':'flex-start'};max-width:82%"><div style="background:${disp?'#18a57b':'#fff'};color:${disp?'#fff':'#26352f'};border:1px solid ${disp?'#18a57b':'#e3e8e2'};padding:7px 10px;border-radius:11px;font-size:12px">${(m.body||'').replace(/</g,'&lt;')}</div><div style="font-size:8px;color:#9aa6a2;margin-top:2px;text-align:${disp?'right':'left'}">${disp?(m.sender||'Dispatcher'):(m.sender||code)} · ${fmtWhen(m.created_at)}</div></div>`;
    }).join(''):'<span style="color:#9aa6a2;font-size:11px">No messages yet. Send an instruction to this team.</span>';
    el.scrollTop=el.scrollHeight;
  }catch(e){ el.innerHTML='<span style="color:#c2503a">Could not load messages.</span>'; }
}
async function sendTeamChat(code){
  const inp=$('#tdChatInput'); const v=(inp.value||'').trim(); if(!v)return; inp.value='';
  const who=(window.dashUser&&(window.dashUser.display_name||window.dashUser.username))||'Dispatcher';
  try{
    await fetch(`${SUPA_URL}/rest/v1/team_messages`,{method:'POST',headers:DH(),body:JSON.stringify({team:code,sender:who,role:'dispatch',body:v})});
    pushNotify({team:code,title:'Message from Dispatch',body:v});
    loadTeamChat(code);
  }catch(e){ showToast('Send failed'); }
}
const PER_HEAD=955;       // bawat driver / technician na naka-declare sa Start shift
const GAS_PER_TEAM=400;   // gasolina kada na-deploy na team
const CONSOLE_COST=1415;  // bawat dashboard user na nag-login ngayong araw
async function renderExpenses(){
  const date=manilaToday(), H={apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()};
  let cloudExp=[], att=[];
  try{ const r=await fetch(`${SUPA_URL}/rest/v1/expenses?select=*&work_date=eq.${date}&order=created_at.desc`,{headers:H}); cloudExp=r.ok?await r.json():[]; }catch(e){}
  try{ const r=await fetch(`${SUPA_URL}/rest/v1/attendance?select=username,crew_driver,crew_tech1,crew_tech2,time_in&work_date=eq.${date}&order=time_in.desc`,{headers:H}); att=r.ok?await r.json():[]; }catch(e){}
  // Dashboard (console) users who logged in today × ₱1,415
  let dashUsers=[]; try{ const r=await fetch(`${SUPA_URL}/rest/v1/dashboard_users?select=username,last_login`,{headers:H}); dashUsers=r.ok?await r.json():[]; }catch(e){}
  const consoleUsers=dashUsers.filter(u=>u.last_login && new Date(u.last_login).toLocaleDateString('en-CA',{timeZone:TZ})===date).length;
  const consoleCost=consoleUsers*CONSOLE_COST;
  // one shift row per team; cost from the crew they declared at Start shift
  const byTeam={}; att.forEach(a=>{ if(/^AHBA_SLI/i.test(a.username)&&!byTeam[a.username]) byTeam[a.username]=a; });
  let heads=0, deployedTeams=0, loggedInTeams=0, pendingTeams=0;
  Object.values(byTeam).forEach(a=>{
    loggedInTeams++;
    const c=[a.crew_driver,a.crew_tech1,a.crew_tech2].filter(Boolean).length;
    const counted = (a.deployed_verified===true) || teamHasActivity(a.username);   // moved a load OR dispatcher-verified
    if(counted && c>0){ heads+=c; deployedTeams++; } else { pendingTeams++; }
  });
  const manpowerCost=heads*PER_HEAD;
  const gasCost=deployedTeams*GAS_PER_TEAM;
  const deployCost=manpowerCost+gasCost;
  const submitted=cloudExp.reduce((a,b)=>a+Number(b.amount||0),0);
  const total=deployCost+consoleCost+submitted, BUDGET=50000, pct=Math.round(total/BUDGET*100);
  const set=(id,v)=>{const el=$(id);if(el)el.textContent=v};
  set('#todayExpense',money(total)); set('#budgetPercent',`${pct}% of ${money(BUDGET)}`); set('#donutTotal',`₱${(total/1000).toFixed(1)}k`);
  if($('#budgetBar'))$('#budgetBar').style.width=`${Math.min(pct,100)}%`;

  const cats=['Deployment','Console','Permit','Gas','Parking','Violation','Other'];
  const cols=['#082c28','#6a5acd','#18a57b','#ff765f','#e9a93d','#4285f4','#b0bab7'];
  const values=cats.map(c=> c==='Deployment'? deployCost : c==='Console'? consoleCost : cloudExp.filter(e=>e.category===c).reduce((a,b)=>a+Number(b.amount||0),0));
  const sum=values.reduce((a,b)=>a+b,0)||1; let acc=0;
  const stops=values.map((v,i)=>{const s=acc;acc+=v/sum*100;return `${cols[i]} ${s}% ${acc}%`}).join(',');
  if($('#expenseDonut'))$('#expenseDonut').style.background=`conic-gradient(${stops})`;
  if($('#expenseLegend'))$('#expenseLegend').innerHTML=cats.map((c,i)=>`<div class="legend-row"><i style="background:${cols[i]}"></i><span>${c}</span><b>${money(values[i])}</b></div>`).join('');
  if($('#categoryList'))$('#categoryList').innerHTML=cats.map((c,i)=>`<div class="category-row"><div class="category-top"><span>${c}</span><b>${money(values[i])}</b></div><div class="category-bar"><span style="width:${values[i]/Math.max(...values,1)*100}%;background:${cols[i]}"></span></div></div>`).join('');
  if($('#expenseBody')){
    const manpowerRow=`<tr><td>—</td><td><strong>${deployedTeams} teams · ${heads} crew</strong></td><td>Deployment</td><td>Manpower — ${heads} declared crew × ₱${PER_HEAD.toLocaleString('en-PH')} (driver/technician)</td><td>—</td><td><strong>${money(manpowerCost)}</strong></td><td><span class="status completed">Auto</span></td></tr>`;
    const gasRow=`<tr><td>—</td><td><strong>${deployedTeams} teams deployed</strong></td><td>Gas</td><td>Gasoline — ${deployedTeams} deployed teams × ₱${GAS_PER_TEAM.toLocaleString('en-PH')}</td><td>—</td><td><strong>${money(gasCost)}</strong></td><td><span class="status completed">Auto</span></td></tr>`;
    const consoleRow=`<tr><td>—</td><td><strong>${consoleUsers} console login(s)</strong></td><td>Console</td><td>Dashboard access — ${consoleUsers} user(s) logged in today × ₱${CONSOLE_COST.toLocaleString('en-PH')}</td><td>—</td><td><strong>${money(consoleCost)}</strong></td><td><span class="status completed">Auto</span></td></tr>`;
    const pendingRow=pendingTeams?`<tr style="opacity:.7"><td>—</td><td><strong>${pendingTeams} team(s)</strong></td><td>Deployment</td><td>Logged in but not yet counted — no load activity / awaiting dispatcher verification</td><td>—</td><td><strong>${money(0)}</strong></td><td><span class="status pending">Pending</span></td></tr>`:'';
    const expRows=cloudExp.map(e=>`<tr><td>${e.created_at?fmtTime(e.created_at):''}</td><td><strong>${e.team||'—'}</strong></td><td>${e.category||''}</td><td>${e.description||''}</td><td>${e.job_id||'—'}</td><td><strong>${money(e.amount)}</strong></td><td><span class="status ${e.status==='Approved'?'completed':'pending'}">${e.status||'Pending'}</span></td></tr>`).join('');
    $('#expenseBody').innerHTML=manpowerRow+gasRow+consoleRow+pendingRow+expRows;
  }
  if($('#expenseSummary'))$('#expenseSummary').innerHTML=[
    ['Today’s total',money(total)],['Manpower (crew × ₱955)',money(manpowerCost)],['Gasoline (teams × ₱400)',money(gasCost)],['Console (users × ₱1,415)',money(consoleCost)]
  ].map(([l,v])=>`<div class="small-stat"><span>${l}</span><strong>${v}</strong></div>`).join('');
  const week=[14200,19800,17650,22100,15800,20400,total],days=['Thu','Fri','Sat','Sun','Mon','Tue','Today'];
  if($('#weeklyChart'))$('#weeklyChart').innerHTML=week.map((v,i)=>`<div class="bar-col ${i===6?'today':''}"><span style="height:${v/Math.max(...week,1)*100}%" title="${money(v)}"></span><b>${days[i]}</b></div>`).join('');
}
function bindAssignButtons(){$$('[data-assign]').forEach(b=>b.onclick=()=>openAssign(b.dataset.assign))}

// Work-order table filtering (search text + active chip combined)
function applyJobTableFilter(){
  const chip=$('#jobFilters .active'), f=chip?chip.dataset.filter:'all';
  const q=($('#jobSearch')?.value||'').toLowerCase().trim();
  let shown=0;
  $$('#workOrderBody tr').forEach(r=>{
    const matchesChip = f==='all' || (f==='pending'?r.dataset.status==='pending':r.dataset.type===f);
    const matchesText = !q || r.dataset.text.includes(q);
    const show=matchesChip&&matchesText;
    r.style.display=show?'':'none';
    if(show) shown++;
  });
  const empty=$('#workOrderEmpty'); if(empty) empty.hidden=shown!==0;
}

async function openAssign(jobId){
  const job=jobs.find(j=>j.id===jobId);$('#assignJobLabel').textContent=`${job.id} · ${job.subscriber} · ${job.area}`;$('#assignModal').dataset.job=jobId;
  const joEl=$('#assignJONum'); if(joEl){ joEl.value=job.job_order_no||''; joEl.readOnly=!!job.job_order_no; joEl.style.background=job.job_order_no?'#f1f3f1':''; if($('#joLock'))$('#joLock').textContent=job.job_order_no?'(locked)':''; }
  const remEl=$('#assignRemarks'); if(remEl) remEl.value=job.dispatched_remarks||'';
  openModal($('#assignModal'));
  $('#assignmentList').innerHTML='<div class="empty-row">Loading online teams…</div>';
  await Promise.all([fetchTechLocations(), loadTeamShifts()]);
  const dest=areaCoord(job.area);
  const enrich=t=>{ const loc=techIndex[t.code]; let dist=null; if(loc&&loc.lat!=null&&loc.lng!=null&&dest)dist=haversineKm(loc.lat,loc.lng,dest[0],dest[1]); const s=shiftByTeam[t.code]||{}; return {t,loc,dist,online:!!s.online,shift:s}; };
  const all=teams.map(enrich);
  const online=all.filter(e=>e.online).sort((a,b)=>(a.dist==null?1e9:a.dist)-(b.dist==null?1e9:b.dist));
  const offline=all.filter(e=>!e.online);
  const item=(e,best)=>{ const t=e.t,s=e.shift; const crew=[s.driver,s.tech1,s.tech2].filter(Boolean).join(', '); const acct=s.account?` · ${s.account}`:''; const distTxt=e.dist!=null?`${e.dist.toFixed(1)} km away`:(e.loc&&e.loc.area?e.loc.area:'no GPS'); const sub=e.online?`Online${acct}${crew?' · '+crew:''} · ${distTxt}`:`Offline · last seen ${e.loc&&e.loc.location_at?fmtWhen(e.loc.location_at):'—'}`; return `<div class="assignment-item ${best?'recommended':''}"><span class="team-avatar" style="background:${e.online?'#18a57b':t.color}">${t.short}</span><div><strong>${t.name}${best?'<span class="recommend">NEAREST</span>':e.online?'<span class="recommend">ONLINE</span>':''}</strong><p>${sub}</p></div><button class="assign-btn" data-team="${t.code}">Assign</button></div>`; };
  let html='';
  if(online.length){ html+=`<div class="form-sec" style="margin:4px 0 6px">Online now · ${online.length} team(s)</div>`+online.map((e,i)=>item(e,i===0&&e.dist!=null)).join(''); }
  else { html+='<div class="empty-row">Walang online (naka-time in) na team ngayon. Pwede pa ring mag-assign mula sa listahan sa baba.</div>'; }
  if(offline.length){ html+=`<div class="form-sec" style="margin:14px 0 6px;color:#8a9894">Offline / not signed in</div>`+offline.map(e=>item(e,false)).join(''); }
  $('#assignmentList').innerHTML=html;
  $$('#assignmentList [data-team]').forEach(b=>b.onclick=()=>assignTeam(jobId,b.dataset.team));
}
function assignTeam(jobId,team){const j=jobs.find(x=>x.id===jobId);const joVal=(($('#assignJONum')&&$('#assignJONum').value)||'').trim();const joFinal=j.job_order_no||joVal;if(!joFinal){showToast('Enter the J.O. Number first');$('#assignJONum')&&$('#assignJONum').focus();return;}if(!j.job_order_no)j.job_order_no=joVal;const rem=(($('#assignRemarks')&&$('#assignRemarks').value)||'').trim();if(rem)j.dispatched_remarks=rem;j.team=team;j.status='assigned';j.load_date=manilaToday();j.dispatch_count=(j.dispatch_count||0)+1;j.history=appendHistory(j.history,`Dispatched to ${team} (#${j.dispatch_count})${j.job_order_no?' · JO '+j.job_order_no:''}`);save();closeModals();renderJobs();showToast(`${team} assigned to ${jobId}`);if(window.AHBASync)window.AHBASync(j);pushNotify({team,title:'New load assigned',body:(j.subscriber||jobId)})}
function openModal(modal){$('#modalBackdrop').classList.add('show');modal.showModal()}
function closeModals(){$$('dialog[open]').forEach(d=>d.close());$('#modalBackdrop').classList.remove('show')}

// Sidebar (mobile)
function openSidebar(){$('#sidebar').classList.add('open');const s=$('#sidebarScrim');if(s)s.hidden=false}
function closeSidebar(){$('#sidebar').classList.remove('open');const s=$('#sidebarScrim');if(s)s.hidden=true}

// Popovers
function closePopovers(){
  const np=$('#notifPop'); if(np){np.hidden=true;$('#notifBtn').setAttribute('aria-expanded','false')}
  const rm=$('#roleMenu'); if(rm){rm.hidden=true;$('#roleSwitcher').setAttribute('aria-expanded','false')}
}
function toggleNotif(){
  const np=$('#notifPop'),btn=$('#notifBtn');const open=np.hidden;
  closePopovers();
  if(open){np.hidden=false;btn.setAttribute('aria-expanded','true')}
}
function renderNotifPop(){
  $('#notifPopList').innerHTML=activity.map(a=>`<div class="notif-item"><span class="activity-icon ${a.tone}" data-icon="${a.icon}"></span><div><strong>${a.title}</strong><p>${a.text}</p></div><time>${a.time}</time></div>`).join('');
  injectIcons();
}

function switchPage(page){$$('.page').forEach(p=>p.classList.remove('active'));$(`#${page}Page`).classList.add('active');$$('.nav-item').forEach(n=>{const on=n.dataset.page===page;n.classList.toggle('active',on);on?n.setAttribute('aria-current','page'):n.removeAttribute('aria-current')});const labels={overview:'Good morning, Allec',dispatch:'Dispatch operations',teams:'Field team monitoring',workorders:'Subscriber work orders',expenses:'Expense monitoring',accounts:'Technician accounts',attendance:'Attendance · Time records',completed:'Completed jobs',validation:'Validator · New job orders',history:'Load history',remittance:'Remittance · Daily collection',access:'Access control'};$('#pageTitle').textContent=labels[page]||'';if(page==='overview'){const u=window.dashUser;const nm=u?String(u.display_name||u.username).split(/\s+/)[0]:'there';$('#pageTitle').textContent='Good Day, '+nm;}if(page==='accounts')renderAccounts();if(page==='attendance')renderAttendance();if(page==='completed')renderCompleted();if(page==='validation')renderValidation();if(page==='history')renderHistory();if(page==='remittance')renderRemittance();if(page==='access')renderAccess();closeSidebar();scrollTo(0,0)}

// ---------- Validator (sales-agent job orders awaiting approval) ----------
let valJobs=[], valDocs={};
async function refreshValBadge(){
  try{
    const r=await fetch(`${SUPA_URL}/rest/v1/jobs?select=id&status=eq.for_validation`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}});
    const n=r.ok?(await r.json()).length:0; const b=$('#valBadge');
    if(b){ b.textContent=n; b.style.display=n?'':'none'; }
  }catch(e){}
}
async function renderValidation(){
  const body=$('#validationBody'); if(!body)return;
  body.innerHTML=`<tr><td colspan="7" class="empty-cell">Loading…</td></tr>`;
  try{
    const r=await fetch(`${SUPA_URL}/rest/v1/jobs?status=eq.for_validation&select=*&order=updated_at.asc`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}});
    valJobs=r.ok?await r.json():[];
  }catch(e){valJobs=[]}
  valDocs=await fetchDocsFor(valJobs.map(j=>j.id));
  await loadAgentNames();
  $('#valPending').textContent=valJobs.length;
  $('#valAgents').textContent=new Set(valJobs.map(j=>j.created_by).filter(Boolean)).size||'—';
  // approved/rejected today
  try{
    const today=manilaToday();
    const r2=await fetch(`${SUPA_URL}/rest/v1/jobs?select=status,validated_at,updated_at&or=(status.eq.pending,status.eq.rejected)`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}});
    const rows=r2.ok?await r2.json():[];
    $('#valApproved').textContent=rows.filter(x=>x.status==='pending'&&x.validated_at&&new Date(x.validated_at).toLocaleDateString('en-CA',{timeZone:TZ})===today).length;
    $('#valRejected').textContent=rows.filter(x=>x.status==='rejected'&&x.updated_at&&new Date(x.updated_at).toLocaleDateString('en-CA',{timeZone:TZ})===today).length;
  }catch(e){}
  if(!valJobs.length){body.innerHTML=`<tr><td colspan="7" class="empty-cell">No job orders awaiting validation.</td></tr>`;refreshValBadge();return}
  body.innerHTML=valJobs.map(j=>{
    const docs=valDocs[j.id]||[];
    return `<tr><td><strong>${j.id}</strong></td><td>${agentLabel(j.created_by)}</td><td><strong>${j.subscriber||'—'}</strong></td><td>${j.primary_no||'—'}</td><td>${j.area||j.city||'—'}</td><td>${fmtWhen(j.updated_at)}</td><td><button class="assign-btn" data-review="${j.id}">Review (${docs.length} docs)</button></td></tr>`;
  }).join('');
  $$('#validationBody [data-review]').forEach(b=>b.onclick=()=>openValidate(b.dataset.review));
  refreshValBadge();
}
async function fetchDocsFor(ids){
  if(!ids.length)return{};
  try{
    const q=ids.map(encodeURIComponent).join(',');
    const r=await fetch(`${SUPA_URL}/rest/v1/job_docs?select=job_id,category,path&job_id=in.(${q})`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}});
    const rows=r.ok?await r.json():[]; const m={}; rows.forEach(x=>{(m[x.job_id]=m[x.job_id]||[]).push(x)}); return m;
  }catch(e){return{}}
}
function openValidate(jobId){
  const j=valJobs.find(x=>x.id===jobId)||{}; const docs=valDocs[jobId]||[];
  $('#valTitle').textContent=`${jobId} · ${j.subscriber||''}`;
  $('#valSub').textContent=`Submitted by ${agentLabel(j.created_by)} · ${fmtWhen(j.updated_at)}`;
  const F=(label,val)=>`<div><b>${label}</b>${val||'—'}</div>`;
  $('#valInfo').innerHTML=[
    F('Subscriber',j.subscriber),F('Primary no.',j.primary_no),F('Other contact',j.other_contact_no),
    F('Plan / Ref',j.plan),F('1P/2P',j.play_type),F('Source of sales',j.source_of_sales),
    F('Referral',j.referral_name),F('Address',j.address),F('Barangay',j.brgy),F('City',j.city||j.area),
    F('Special note',j.special_note)
  ].join('');
  const cats=[['id','Valid ID'],['billing','Proof of Billing'],['premise','Subscriber Premise']];
  $('#valDocs').innerHTML=cats.map(([c,label])=>{
    const list=docs.filter(d=>d.category===c);
    const imgs=list.length?`<div class="photo-grid" style="max-height:none;padding:0">${list.map(d=>`<a class="ph" href="${photoBase(d.path)}" target="_blank" rel="noopener"><img src="${photoBase(d.path)}" alt="${label}" loading="lazy"></a>`).join('')}</div>`:'<div class="none" style="padding:12px;color:#c2503a;font-size:12px">⚠ No photo submitted</div>';
    return `<div class="doc-sec"><h4>${label} (${list.length})</h4>${imgs}</div>`;
  }).join('');
  $$('#valDocs .ph').forEach(a=>a.onclick=e=>{e.preventDefault();window.open(a.href,'_blank','noopener,noreferrer');});
  $('#valReason').value='';
  $('#valApprove').onclick=()=>decideValidation(jobId,true);
  $('#valReject').onclick=()=>decideValidation(jobId,false);
  openModal($('#valModal'));
}
async function decideValidation(jobId,approve){
  const body=approve
    ? {status:'pending', validated:true, validated_at:new Date().toISOString(), updated_at:new Date().toISOString(), load_date:manilaToday()}
    : {status:'rejected', updated_at:new Date().toISOString(), special_note:(($('#valReason').value||'').trim()?('REJECTED: '+$('#valReason').value.trim()):'REJECTED')};
  try{
    await fetch(`${SUPA_URL}/rest/v1/jobs?id=eq.${encodeURIComponent(jobId)}`,{method:'PATCH',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok(),'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(body)});
    closeModals(); showToast(approve?`${jobId} approved → sent to dispatch`:`${jobId} rejected`); renderValidation();
  }catch(e){showToast('Action failed: '+e.message)}
}

// ---------- Accounts (technician login accounts) ----------
async function fetchTechnicians(){
  try{
    const r=await fetch(`${SUPA_URL}/rest/v1/technicians?select=*&order=username.asc`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}});
    return r.ok?await r.json():[];
  }catch(e){return[]}
}
let agentNames={};
async function loadAgentNames(){ try{ const ts=await fetchTechnicians(); agentNames={}; ts.forEach(t=>agentNames[t.username]=t.display_name||''); }catch(e){} return agentNames; }
const agentLabel=u=>u?(u+(agentNames[u]?(' · '+agentNames[u]):'')):'—';
const TZ='Asia/Manila';
const manilaToday=()=>new Date().toLocaleDateString('en-CA',{timeZone:TZ});
function fmtWhen(s){if(!s)return'—';return new Date(s).toLocaleString('en-PH',{timeZone:TZ,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
function fmtTime(s){if(!s)return'—';return new Date(s).toLocaleTimeString('en-PH',{timeZone:TZ,hour:'numeric',minute:'2-digit'})}
function fmtDur(inTs,outTs){if(!inTs)return'—';const end=outTs?new Date(outTs):new Date();let mins=Math.max(0,Math.round((end-new Date(inTs))/60000));const h=Math.floor(mins/60),m=mins%60;return `${h}h ${String(m).padStart(2,'0')}m`}
async function renderAccounts(){
  const body=$('#accountsBody'); if(!body)return;
  body.innerHTML=`<tr><td colspan="6" class="empty-cell">Loading accounts…</td></tr>`;
  let rows=await fetchTechnicians();
  if(!rows.length){
    // fall back to the 20 known accounts if the table isn't set up yet
    rows=teams.map(t=>({username:t.name,email:`${t.name.toLowerCase()}@ahbafield.app`,area:t.area,must_change:true,last_login:null,password_changed_at:null}));
  }
  $('#accountTotal').textContent=rows.length;
  $('#accountActive').textContent=rows.filter(r=>!r.must_change).length;
  $('#accountPending').textContent=rows.filter(r=>r.must_change).length;
  $('#accountSignedIn').textContent=rows.filter(r=>r.last_login).length;
  body.innerHTML=rows.map(r=>{
    const status=r.must_change?'<span class="status pending">Needs setup</span>':'<span class="status completed">Active</span>';
    return `<tr><td><strong>${r.username}</strong></td><td>${r.email||'—'}</td><td>${r.area||'—'}</td><td>${status}</td><td>${fmtWhen(r.last_login)}</td><td>${r.must_change?'<span style="color:#9aa6a2">default</span>':fmtWhen(r.password_changed_at)}<button class="assign-btn" style="margin-left:8px" data-reset="${r.username}" data-email="${r.email||''}">Reset</button></td></tr>`;
  }).join('');
  $$('#accountsBody [data-reset]').forEach(b=>b.onclick=()=>openReset(b.dataset.reset,b.dataset.email));
}
function openReset(username,email){
  $('#resetUser').textContent=username;
  $('#resetEmail').textContent=email||`${username.toLowerCase()}@ahbafield.app`;
  if($('#resetNewPw'))$('#resetNewPw').value='';
  if($('#resetSecret'))$('#resetSecret').value=localStorage.getItem('ahba_admin_secret')||'';
  openModal($('#resetModal'));
}
async function resetNow(){
  const username=$('#resetUser').textContent.trim();
  const np=($('#resetNewPw').value||'').trim(), sec=($('#resetSecret').value||'').trim();
  if(np.length<8){showToast('Temporary password must be at least 8 characters');return}
  if(!sec){showToast('Enter the admin secret');return}
  const btn=$('#resetNow'); btn.disabled=true; btn.textContent='Resetting…';
  try{
    const r=await fetch(`${SUPA_URL}/functions/v1/admin-reset`,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()},body:JSON.stringify({username,new_password:np,admin_secret:sec})});
    let out={}; try{out=await r.json()}catch(e){}
    if(!r.ok||out.error) throw new Error(out.error||('HTTP '+r.status));
    localStorage.setItem('ahba_admin_secret',sec);
    closeModals(); showToast(`${username} reset. They must set a new password on next login.`);
    if($('#accountsPage')?.classList.contains('active')) renderAccounts();
  }catch(e){
    const m=/Failed to fetch|NetworkError/i.test(e.message)?'Reset service not reachable — is the admin-reset function deployed?':e.message;
    showToast('Reset failed: '+m);
  }
  btn.disabled=false; btn.textContent='Reset now';
}

// ---------- Attendance (time-in / time-out) ----------
async function fetchAttendance(date){
  try{
    const r=await fetch(`${SUPA_URL}/rest/v1/attendance?select=*&work_date=eq.${date}&order=time_in.desc`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}});
    return r.ok?await r.json():[];
  }catch(e){return[]}
}
async function renderAttendance(){
  const body=$('#attendanceBody'); if(!body)return;
  const dateEl=$('#attDate'); if(dateEl && !dateEl.value){dateEl.value=manilaToday(); dateEl.onchange=renderAttendance;}
  const date=dateEl?dateEl.value:manilaToday();
  body.innerHTML=`<tr><td colspan="6" class="empty-cell">Loading…</td></tr>`;
  const rows=await fetchAttendance(date);
  const open=rows.filter(r=>!r.time_out).length, closed=rows.filter(r=>r.time_out).length;
  let totalMin=0; rows.forEach(r=>{if(r.time_in){const end=r.time_out?new Date(r.time_out):new Date();totalMin+=Math.max(0,(end-new Date(r.time_in))/60000)}});
  $('#attIn').textContent=open; $('#attOut').textContent=closed; $('#attTotal').textContent=rows.length;
  $('#attHours').textContent=`${Math.floor(totalMin/60)}h ${String(Math.round(totalMin%60)).padStart(2,'0')}m`;
  if(!rows.length){body.innerHTML=`<tr><td colspan="6" class="empty-cell">No time records for this day.</td></tr>`;return}
  body.innerHTML=rows.map(r=>{
    const status=r.time_out?'<span class="status completed">Timed out</span>':'<span class="status en-route">Timed in</span>';
    return `<tr><td><strong>${r.username}</strong></td><td>${r.work_date}</td><td>${fmtTime(r.time_in)}</td><td>${r.time_out?fmtTime(r.time_out):'—'}</td><td>${fmtDur(r.time_in,r.time_out)}</td><td>${status}</td></tr>`;
  }).join('');
  attRows=rows;            // keep for export
  renderGateLog(date);
}
// ---- Security gate-out / vehicle log (on the Attendance page) ----
let attRows=[], gateRows=[];
async function renderGateLog(date){
  const body=$('#gateBody'); if(!body)return;
  body.innerHTML=`<tr><td colspan="9" class="empty-cell">Loading…</td></tr>`;
  try{
    const r=await fetch(`${SUPA_URL}/rest/v1/gate_logs?select=*&work_date=eq.${date}&order=checked_at.asc`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}});
    gateRows=r.ok?await r.json():[];
  }catch(e){ gateRows=[]; }
  const ok=gateRows.filter(g=>g.crew_ok).length, disc=gateRows.length-ok;
  const set=(id,v)=>{const el=$(id);if(el)el.textContent=v};
  set('#gateCount',gateRows.length); set('#gateOk',ok); set('#gateDisc',disc);
  set('#gateFirst', gateRows.length?fmtTime(gateRows[0].checked_at):'—');
  if(!gateRows.length){ body.innerHTML=`<tr><td colspan="9" class="empty-cell">No gate-out records for this day.</td></tr>`; return; }
  body.innerHTML=gateRows.map(g=>{
    const crew=[g.crew_tech1,g.crew_tech2].filter(Boolean).join(', ');
    const okb=g.crew_ok?'<span class="status completed">OK</span>':`<span class="status pending">Diff</span>`;
    return `<tr><td><strong>${fmtTime(g.checked_at)}</strong></td><td><strong>${g.team||'—'}</strong></td><td>${g.account||'—'}</td><td><strong>${g.plate_no||'—'}</strong></td><td>${g.odometer!=null?g.odometer:'—'}</td><td>${g.crew_driver||'—'}</td><td>${crew||'—'}</td><td>${okb}${g.crew_remarks?` <span style="color:#c2503a;font-size:9px">${g.crew_remarks}</span>`:''}</td><td>${g.security_user||'—'}</td></tr>`;
  }).join('');
}
function exportAttendance(){
  if(typeof XLSX==='undefined'){showToast('Excel library still loading');return}
  if(!attRows.length){showToast('Nothing to export');return}
  const date=$('#attDate')?.value||manilaToday();
  const rows=attRows.map(r=>({'TECHNICIAN':r.username,'DATE':r.work_date,'TIME IN':r.time_in?fmtWhen(r.time_in):'','TIME OUT':r.time_out?fmtWhen(r.time_out):'','HOURS':fmtDur(r.time_in,r.time_out),'STATUS':r.time_out?'Timed out':'Timed in','ACCOUNT':r.work_account||'','DRIVER':r.crew_driver||'','TECH 1':r.crew_tech1||'','TECH 2':r.crew_tech2||''}));
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Attendance');
  const out=XLSX.write(wb,{type:'array',bookType:'xlsx'}); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([out],{type:'application/octet-stream'})); a.download=`AHBA_attendance_${date}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),9000);
  showToast('Attendance exported');
}
function exportGateLog(){
  if(typeof XLSX==='undefined'){showToast('Excel library still loading');return}
  if(!gateRows.length){showToast('No vehicle log to export');return}
  const date=$('#attDate')?.value||manilaToday();
  const rows=gateRows.map(g=>({'GATE-OUT TIME':fmtWhen(g.checked_at),'TEAM':g.team||'','ACCOUNT':g.account||'','PLATE NO.':g.plate_no||'','ODOMETER (KM)':(g.odometer!=null?g.odometer:''),'DRIVER':g.crew_driver||'','TECH 1':g.crew_tech1||'','TECH 2':g.crew_tech2||'','CREW OK':g.crew_ok?'YES':'NO','REMARKS':g.crew_remarks||'','VALIDATED BY':g.security_user||'','DATE':g.work_date||date}));
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Vehicle log');
  const out=XLSX.write(wb,{type:'array',bookType:'xlsx'}); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([out],{type:'application/octet-stream'})); a.download=`AHBA_vehicle_log_${date}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),9000);
  showToast('Vehicle log exported');
}

// ---------- Completed jobs · proof photos · validation · export ----------
const photoBase = p => `${SUPA_URL}/storage/v1/object/public/job-photos/${p}`;
let compJobs=[], compPhotos={};
async function fetchCompleted(date){
  try{
    const r=await fetch(`${SUPA_URL}/rest/v1/jobs?status=eq.completed&select=*&order=updated_at.desc`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}});
    const all=r.ok?await r.json():[];
    return all.filter(j=>j.updated_at && new Date(j.updated_at).toLocaleDateString('en-CA',{timeZone:TZ})===date);
  }catch(e){return[]}
}
async function fetchPhotosFor(ids){
  if(!ids.length)return{};
  try{
    const q=ids.map(encodeURIComponent).join(',');
    const r=await fetch(`${SUPA_URL}/rest/v1/job_photos?select=job_id,path,label&job_id=in.(${q})`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}});
    const rows=r.ok?await r.json():[]; const m={}; rows.forEach(x=>{(m[x.job_id]=m[x.job_id]||[]).push({path:x.path,label:x.label||''})}); return m;
  }catch(e){return{}}
}
async function renderCompleted(){
  const dEl=$('#compDate'); if(dEl&&!dEl.value){dEl.value=manilaToday();dEl.onchange=renderCompleted;}
  const date=dEl?dEl.value:manilaToday();
  const body=$('#completedBody'); if(!body)return;
  body.innerHTML=`<tr><td colspan="7" class="empty-cell">Loading…</td></tr>`;
  compJobs=await fetchCompleted(date);
  compPhotos=await fetchPhotosFor(compJobs.map(j=>j.id));
  const totalPhotos=Object.values(compPhotos).reduce((a,b)=>a+b.length,0);
  const val=compJobs.filter(j=>j.validated).length;
  $('#compTotal').textContent=compJobs.length;
  $('#compValidated').textContent=val;
  $('#compPending').textContent=compJobs.length-val;
  $('#compPhotos').textContent=totalPhotos;
  if(!compJobs.length){body.innerHTML=`<tr><td colspan="7" class="empty-cell">No completed jobs for this day.</td></tr>`;return}
  body.innerHTML=compJobs.map(j=>{
    const n=(compPhotos[j.id]||[]).length;
    const vb=j.validated?'<span class="vbadge yes">Validated</span>':'<span class="vbadge no">Pending</span>';
    return `<tr><td><strong>${j.id}</strong></td><td>${j.team||'—'}</td><td><strong>${j.subscriber||'—'}</strong></td><td>${j.area||'—'}</td><td>${fmtWhen(j.updated_at)}</td><td><button class="assign-btn" data-gallery="${j.id}">${n} photo${n===1?'':'s'} · View</button></td><td>${vb}${j.validated?'':` <button class="assign-btn" data-validate="${j.id}">Validate</button>`}</td></tr>`;
  }).join('');
  $$('#completedBody [data-gallery]').forEach(b=>b.onclick=()=>openGallery(b.dataset.gallery));
  $$('#completedBody [data-validate]').forEach(b=>b.onclick=()=>validateJob(b.dataset.validate));
}
function openGallery(jobId){
  const j=compJobs.find(x=>x.id===jobId)||{}; const paths=compPhotos[jobId]||[];
  $('#photoTitle').textContent=`${jobId} · ${j.subscriber||''}`;
  $('#photoSub').textContent=`${j.team||''} · ${j.area||''}${j.primary_no?' · '+j.primary_no:''}${j.job_order_no?' · JO '+j.job_order_no:''} · ${paths.length} photo${paths.length===1?'':'s'}`;
  $('#photoGrid').innerHTML=paths.length?paths.map((p,i)=>`<a class="ph" href="${photoBase(p.path)}" target="_blank" rel="noopener" title="${(p.label||('Photo '+(i+1)))} — open in new window" style="position:relative"><img src="${photoBase(p.path)}" alt="${p.label||('proof '+(i+1))}" loading="lazy"><span style="position:absolute;left:0;right:0;bottom:0;background:rgba(8,44,40,.78);color:#fff;font-size:7.5px;font-weight:700;padding:3px 4px;line-height:1.2">${p.label||('#'+(i+1))}</span></a>`).join(''):'<div class="none">No photos uploaded for this job.</div>';
  $$('#photoGrid .ph').forEach(a=>a.onclick=e=>{e.preventDefault();window.open(a.href,'_blank','noopener,noreferrer');});
  const vb=$('#validateBtn'); vb.style.display=j.validated?'none':''; vb.onclick=()=>{validateJob(jobId);closeModals();};
  openModal($('#photoModal'));
}
async function validateJob(jobId){
  try{
    await fetch(`${SUPA_URL}/rest/v1/jobs?id=eq.${encodeURIComponent(jobId)}`,{method:'PATCH',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok(),'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({validated:true,validated_at:new Date().toISOString()})});
    showToast(`${jobId} validated`); renderCompleted();
  }catch(e){showToast('Could not validate')}
}
async function exportZip(){
  if(typeof JSZip==='undefined'||typeof XLSX==='undefined'){showToast('Libraries still loading — try again');return}
  if(!compJobs.length){showToast('Nothing to export for this day');return}
  const date=$('#compDate').value||manilaToday();
  showToast('Building archive (Excel + photos)…');
  await loadAgentNames();
  const zip=new JSZip();

  // --- Excel with all subscriber info (matches the NEW LOADS layout) ---
  const rows=compJobs.map(j=>({
    'DATE': j.load_date||(j.updated_at?j.updated_at.slice(0,10):''),
    'DISPATCH STATUS': j.dispatch_status||'',
    'TEAM ASSIGNED': j.team||'',
    'DRIVER': j.driver||'',
    'TECH1': j.tech1||'',
    'MAPPING TEAM': j.mapping_team||'',
    'MAPPING REMARKS': j.mapping_remarks||'',
    'DISPATCHED REMARKS': j.dispatched_remarks||'',
    'IBASS ACCT NO.': j.ibass_acct_no||'',
    'JOB ORDER NO.': j.job_order_no||'',
    'VAS NO': j.vas_no||'',
    '1P OR 2P': j.play_type||'',
    'SPECIAL NOTE': j.special_note||'',
    'REF NO.': j.ref_no||'',
    'NEW REF #': j.new_ref||'',
    'PRIMARY NO.': j.primary_no||'',
    'OTHER CONTACT NO.': j.other_contact_no||'',
    'FIRST NAME': j.first_name||'',
    'MIDDLE NAME': j.middle_name||'',
    'LAST NAME': j.last_name||'',
    'HOUSE NO.': j.house_no||'',
    'STREET NAME': j.street_name||'',
    'VILLAGE / SUBDIVISION': j.village||'',
    'BRGY': j.brgy||'',
    'CITY': j.city||j.area||'',
    'SALES AGENT': agentLabel(j.created_by),
    'IN-CHARGE': j.in_charge||'',
    'SOURCE OF SALES': j.source_of_sales||'',
    'REFERRAL NAME': j.referral_name||'',
    'PLAN': j.plan||'',
    'PRIORITY': j.priority||'',
    'ACCOUNT': j.work_account||'',
    'DRIVER (CREW)': j.crew_driver||'',
    'TECH 1 (CREW)': j.crew_tech1||'',
    'TECH 2 (CREW)': j.crew_tech2||'',
    'MODE OF PAYMENT': j.payment_mode||'',
    'AMOUNT': (j.payment_amount!=null?j.payment_amount:''),
    'AR NO.': j.ar_no||'',
    'COMPLETED AT': j.updated_at?fmtWhen(j.updated_at):'',
    'VALIDATED': j.validated?'YES':'NO',
    'PHOTOS': (compPhotos[j.id]||[]).length,
    'WO ID': j.id
  }));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Completed');
  zip.file(`AHBA_completed_${date}.xlsx`, XLSX.write(wb,{type:'array',bookType:'xlsx'}));

  // --- Photos: one folder per subscriber, files named with the subscriber name ---
  const photosRoot=zip.folder('photos'); const used={};
  for(const j of compJobs){
    const paths=compPhotos[j.id]||[]; if(!paths.length)continue;
    let name=safeName(j.subscriber || [j.first_name,j.last_name].filter(Boolean).join(' '));
    if(used[name]){ used[name]++; name=`${name} (${used[name]})`; } else used[name]=1;
    const folder=photosRoot.folder(`${name} - ${j.id}`);
    const lblUsed={};
    for(let i=0;i<paths.length;i++){
      const p=paths[i]; const lbl=safeName(p.label||('Photo '+(i+1)));
      lblUsed[lbl]=(lblUsed[lbl]||0)+1; const suffix=lblUsed[lbl]>1?` (${lblUsed[lbl]})`:'';
      try{ const blob=await (await fetch(photoBase(p.path))).blob(); folder.file(`${name} - ${lbl}${suffix}.jpg`, blob); }
      catch(e){ console.warn('zip fetch',e.message); }
    }
  }

  const out=await zip.generateAsync({type:'blob'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(out); a.download=`AHBA_completed_${date}.zip`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),15000);
  showToast('Archive downloaded (Excel + photos)');
}
async function clearCloud(){
  const date=$('#compDate').value||manilaToday();
  if(!compJobs.length){showToast('Nothing to clear for this day');return}
  const allPaths=compJobs.flatMap(j=>(compPhotos[j.id]||[]).map(p=>p.path));
  if(!allPaths.length){showToast('No photos to clear');return}
  if(!confirm(`Delete ${allPaths.length} photo(s) from the cloud for ${date}?\n\nDownload the ZIP archive FIRST. Job records are kept — only the images are removed. This cannot be undone.`))return;
  showToast('Clearing photos from cloud…');
  try{
    for(let i=0;i<allPaths.length;i+=100){
      await fetch(`${SUPA_URL}/storage/v1/object/job-photos`,{method:'DELETE',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok(),'Content-Type':'application/json'},body:JSON.stringify({prefixes:allPaths.slice(i,i+100)})});
    }
    const q=compJobs.map(j=>encodeURIComponent(j.id)).join(',');
    await fetch(`${SUPA_URL}/rest/v1/job_photos?job_id=in.(${q})`,{method:'DELETE',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok(),Prefer:'return=minimal'}});
    showToast('Cloud photos cleared'); renderCompleted();
  }catch(e){showToast('Clear failed: '+e.message)}
}

// ---------- Load History (weekly archive of all loads) ----------
function jobToRow(j,nPhotos){
  return {
    'DATE': j.load_date||(j.updated_at?String(j.updated_at).slice(0,10):''),
    'DISPATCH STATUS': j.dispatch_status||'',
    'STATUS': statusLabel(j.status||''),
    'TEAM ASSIGNED': j.team||'',
    'DRIVER': j.driver||'', 'TECH1': j.tech1||'', 'MAPPING TEAM': j.mapping_team||'',
    'MAPPING REMARKS': j.mapping_remarks||'', 'DISPATCHED REMARKS': j.dispatched_remarks||'',
    'IBASS ACCT NO.': j.ibass_acct_no||'', 'JOB ORDER NO.': j.job_order_no||'', 'VAS NO': j.vas_no||'',
    '1P OR 2P': j.play_type||'', 'SPECIAL NOTE': j.special_note||'', 'REF NO.': j.ref_no||'', 'NEW REF #': j.new_ref||'',
    'PRIMARY NO.': j.primary_no||'', 'OTHER CONTACT NO.': j.other_contact_no||'',
    'FIRST NAME': j.first_name||'', 'MIDDLE NAME': j.middle_name||'', 'LAST NAME': j.last_name||'',
    'HOUSE NO.': j.house_no||'', 'STREET NAME': j.street_name||'', 'VILLAGE / SUBDIVISION': j.village||'',
    'BRGY': j.brgy||'', 'CITY': j.city||j.area||'',
    'SALES AGENT': agentLabel(j.created_by), 'IN-CHARGE': j.in_charge||'', 'SOURCE OF SALES': j.source_of_sales||'', 'REFERRAL NAME': j.referral_name||'',
    'PLAN': j.plan||'', 'PRIORITY': j.priority||'', 'DISPATCH COUNT': j.dispatch_count||0,
    'ACCOUNT': j.work_account||'', 'DRIVER (CREW)': j.crew_driver||'', 'TECH 1 (CREW)': j.crew_tech1||'', 'TECH 2 (CREW)': j.crew_tech2||'',
    'MODE OF PAYMENT': j.payment_mode||'', 'AMOUNT': (j.payment_amount!=null?j.payment_amount:''), 'AR NO.': j.ar_no||'',
    'NEGATIVE REMARK': j.negative_remark||'', 'LAST UPDATE': j.updated_at?fmtWhen(j.updated_at):'',
    'VALIDATED': j.validated?'YES':'NO', 'WO ID': j.id
  };
}
function findJob(id){ return jobs.find(x=>x.id===id)||histJobs.find(x=>x.id===id)||compJobs.find(x=>x.id===id)||valJobs.find(x=>x.id===id)||null; }
let histJobs=[];
async function renderHistory(){
  const fromEl=$('#histFrom'), toEl=$('#histTo'), body=$('#historyBody'); if(!body)return;
  if(toEl&&!toEl.value) toEl.value=manilaToday();
  if(fromEl&&!fromEl.value){ const d=new Date(); d.setDate(d.getDate()-6); fromEl.value=d.toLocaleDateString('en-CA',{timeZone:TZ}); }
  if(fromEl)fromEl.onchange=renderHistory; if(toEl)toEl.onchange=renderHistory;
  const from=fromEl.value, to=toEl.value;
  body.innerHTML=`<tr><td colspan="8" class="empty-cell">Loading…</td></tr>`;
  await loadAgentNames();
  let all=[]; try{ const r=await fetch(`${SUPA_URL}/rest/v1/jobs?select=*&order=updated_at.desc`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}}); all=r.ok?await r.json():[]; }catch(e){}
  const dayOf=j=> j.load_date?String(j.load_date).slice(0,10) : (j.updated_at?new Date(j.updated_at).toLocaleDateString('en-CA',{timeZone:TZ}):'');
  histJobs=all.filter(j=>{const d=dayOf(j);return d&&d>=from&&d<=to;});
  $('#histTotal').textContent=histJobs.length;
  $('#histCompleted').textContent=histJobs.filter(j=>j.status==='completed').length;
  $('#histNegative').textContent=histJobs.filter(j=>j.negative_remark).length;
  $('#histCancelled').textContent=histJobs.filter(j=>j.status==='cancelled').length;
  if(!histJobs.length){body.innerHTML=`<tr><td colspan="8" class="empty-cell">No loads in this range.</td></tr>`;return}
  body.innerHTML=histJobs.map(j=>`<tr data-detail="${j.id}" style="cursor:pointer"><td>${dayOf(j)}</td><td><strong>${j.id}</strong></td><td>${j.job_order_no||'—'}</td><td><strong>${j.subscriber||'—'}</strong></td><td>${j.team||'—'}</td><td><span class="status ${j.status}">${statusLabel(j.status||'')}</span></td><td>⟳ ${j.dispatch_count||0}</td><td>${j.area||j.city||'—'}</td></tr>`).join('');
  $$('#historyBody [data-detail]').forEach(r=>r.onclick=()=>openJobDetail(r.dataset.detail));
}
async function exportHistoryExcel(){
  if(typeof XLSX==='undefined'){showToast('Excel library still loading');return}
  if(!histJobs.length){showToast('Nothing to export for this range');return}
  await loadAgentNames();
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(histJobs.map(j=>jobToRow(j))), 'Load History');
  const out=XLSX.write(wb,{type:'array',bookType:'xlsx'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([out],{type:'application/octet-stream'})); a.download=`AHBA_load_history_${$('#histFrom').value}_to_${$('#histTo').value}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),10000);
  showToast('Load history exported (Excel)');
}

// ---------- Remittance (daily team collections) ----------
let remJobs=[];
function currentOperator(){ const u=window.dashUser; const nm=u?(u.display_name||u.username):'Allec Zandre A. Halili'; const rl=u?(u.is_super?'Superadmin':(u.role_label||'')):''; return nm+(rl?(' ('+rl+')'):''); }
async function renderRemittance(){
  const dEl=$('#remDate'); if(dEl&&!dEl.value){dEl.value=manilaToday();dEl.onchange=renderRemittance;}
  const date=dEl?dEl.value:manilaToday();
  const body=$('#remittanceBody'); if(!body)return;
  body.innerHTML=`<tr><td colspan="9" class="empty-cell">Loading…</td></tr>`;
  const all=await fetchCompleted(date);
  // only loads with a declared collection (amount or payment mode)
  remJobs=all.filter(j=>(j.payment_amount!=null&&Number(j.payment_amount)>0)||j.payment_mode);
  const sum=k=>remJobs.reduce((a,b)=>a+(k(b)||0),0);
  const totalCol=sum(j=>Number(j.payment_amount)||0);
  const recAmt=sum(j=>j.remittance_received?(Number(j.payment_amount)||0):0);
  const gcash=sum(j=>j.payment_mode==='Gcash'?(Number(j.payment_amount)||0):0);
  const cash=sum(j=>j.payment_mode==='Cash Remittance'?(Number(j.payment_amount)||0):0);
  const set=(id,v)=>{const el=$(id);if(el)el.textContent=v};
  set('#remTotal',money(totalCol)); set('#remReceived',money(recAmt)); set('#remPending',money(totalCol-recAmt)); set('#remCount',remJobs.length+'');
  set('#remGcash',money(gcash)); set('#remCash',money(cash));
  if(!remJobs.length){body.innerHTML=`<tr><td colspan="9" class="empty-cell">No collections declared for this day.</td></tr>`;return}
  body.innerHTML=remJobs.map(j=>{
    const amt=j.payment_amount!=null?money(j.payment_amount):'—';
    const recd=j.remittance_received
      ? `<span class="status completed">✓ Received</span><div style="font-size:8px;color:#8a9894;margin-top:2px">${j.remittance_received_by||''}${j.remittance_received_at?' · '+fmtWhen(j.remittance_received_at):''}</div>`
      : `<button class="assign-btn" data-received="${j.id}">Mark received</button>`;
    return `<tr><td><strong>${j.id}</strong></td><td>${j.job_order_no||'—'}</td><td><strong>${j.team||'—'}</strong></td><td>${j.work_account||'—'}</td><td>${j.subscriber||'—'}</td><td>${j.payment_mode||'—'}</td><td><strong>${amt}</strong></td><td>${j.ar_no||'—'}</td><td>${recd}</td></tr>`;
  }).join('');
  $$('#remittanceBody [data-received]').forEach(b=>b.onclick=()=>markReceived(b.dataset.received));
}
async function markReceived(jobId){
  const j=remJobs.find(x=>x.id===jobId); if(!j)return;
  const who=currentOperator(), now=new Date().toISOString();
  const hist=appendHistory(j.history, `Remittance received (${j.payment_mode||''} ${j.payment_amount!=null?money(j.payment_amount):''}${j.ar_no?' · AR '+j.ar_no:''}) by ${who}`);
  try{
    await fetch(`${SUPA_URL}/rest/v1/jobs?id=eq.${encodeURIComponent(jobId)}`,{method:'PATCH',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok(),'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({remittance_received:true,remittance_received_by:who,remittance_received_at:now,history:hist,updated_at:now})});
    j.remittance_received=true; j.remittance_received_by=who; j.remittance_received_at=now; j.history=hist;
    renderRemittance(); showToast(`${jobId}: remittance received`);
  }catch(e){ showToast('Could not mark received'); }
}
function exportRemittance(){
  if(typeof XLSX==='undefined'){showToast('Excel library still loading');return}
  if(!remJobs.length){showToast('Nothing to export for this day');return}
  const rows=remJobs.map(j=>({
    'DATE': $('#remDate').value, 'WO ID': j.id, 'JOB ORDER NO.': j.job_order_no||'', 'TEAM': j.team||'',
    'ACCOUNT': j.work_account||'', 'DRIVER': j.crew_driver||'', 'SUBSCRIBER': j.subscriber||'',
    'MODE OF PAYMENT': j.payment_mode||'', 'AMOUNT': (j.payment_amount!=null?j.payment_amount:''), 'AR NO.': j.ar_no||'',
    'RECEIVED': j.remittance_received?'YES':'NO', 'RECEIVED BY': j.remittance_received_by||'', 'RECEIVED AT': j.remittance_received_at?fmtWhen(j.remittance_received_at):''
  }));
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Remittance');
  const out=XLSX.write(wb,{type:'array',bookType:'xlsx'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([out],{type:'application/octet-stream'})); a.download=`AHBA_remittance_${$('#remDate').value}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),10000);
  showToast('Remittance exported (Excel)');
}

// ---------- Add Job Order (console intake → Validator, mirrors sales agent) ----------
let ordDocs={id:[],billing:[],premise:[]};
let _sbc=null;
function sbc(){ if(typeof dashAuth!=='undefined' && dashAuth) return dashAuth; /* authenticated client */ if(!_sbc && window.supabase?.createClient) _sbc=window.supabase.createClient(SUPA_URL,SUPA_KEY); return _sbc; }
function compressImage(file,maxDim=1000,targetKB=90){
  return new Promise(resolve=>{
    if(!file || !(file.type||'').startsWith('image/')){ resolve(file); return; }
    const img=new Image(); const url=URL.createObjectURL(file);
    img.onload=async()=>{
      let w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
      let scale=Math.min(1,maxDim/Math.max(w,h)); w=Math.round(w*scale); h=Math.round(h*scale);
      const draw=(ww,hh)=>{const c=document.createElement('canvas');c.width=ww;c.height=hh;c.getContext('2d').drawImage(img,0,0,ww,hh);return c;};
      let cv=draw(w,h);
      const toBlob=(c,q)=>new Promise(r=>c.toBlob(b=>r(b),'image/jpeg',q));
      let q=0.5, blob=await toBlob(cv,q);
      while(blob && blob.size>targetKB*1024 && q>0.3){ q=Math.round((q-0.05)*100)/100; blob=await toBlob(cv,q); }
      if(blob && blob.size>targetKB*1024 && Math.max(w,h)>720){ w=Math.round(w*0.75); h=Math.round(h*0.75); cv=draw(w,h); blob=await toBlob(cv,0.4); }
      URL.revokeObjectURL(url); resolve(blob||file);
    };
    img.onerror=()=>{ URL.revokeObjectURL(url); resolve(file); };
    img.src=url;
  });
}
async function submitOrder(e){
  e.preventDefault();
  const f=Object.fromEntries(new FormData($('#orderForm')));
  const err=m=>{const el=$('#orderErr'); if(el)el.textContent=m||'';};
  err('');
  const t=v=>(v||'').trim();
  const fn=t(f.first_name), ln=t(f.last_name), brgy=t(f.brgy), city=t(f.city), pno=t(f.primary_no), ono=t(f.other_contact_no);
  if(!fn||!ln||!pno||!brgy||!city){ err('Please fill: first & last name, primary no., barangay, and city.'); return; }
  if(!/^\d{11}$/.test(pno)){ err('Primary no. must be exactly 11 digits (numbers only).'); return; }
  if(ono && !/^\d{11}$/.test(ono)){ err('Other contact no. must be 11 digits (numbers only).'); return; }
  if(!ordDocs.id.length){ err('A Valid ID photo is required.'); return; }
  const client=sbc(); if(!client){ err('Cloud client still loading — try again in a moment.'); return; }
  const btn=$('#orderSubmit'); btn.disabled=true; btn.textContent='Submitting…';
  const full=[fn,t(f.middle_name),ln].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
  const addr=[t(f.house_no),t(f.street_name),t(f.village),brgy,city].filter(Boolean).join(', ');
  const jobId='WO-'+new Date().getFullYear()+'-'+Date.now().toString().slice(-6);
  const job={id:jobId,subscriber:full,service_type:'Installation',plan:t(f.plan),area:city,address:addr,status:'for_validation',wait_time:'Just now',priority:'Normal',schedule:manilaToday()+', 9:00 AM',team:null,created_by:'CONSOLE',
    first_name:fn,middle_name:t(f.middle_name),last_name:ln,primary_no:pno,other_contact_no:ono,
    house_no:t(f.house_no),street_name:t(f.street_name),village:t(f.village),brgy:brgy,city:city,
    play_type:f.play_type,source_of_sales:f.source_of_sales,referral_name:t(f.referral_name),
    special_note:t(f.special_note),updated_at:new Date().toISOString()};
  try{
    const {error}=await client.from('jobs').insert(job); if(error) throw error;
    for(const cat of ['id','billing','premise']){
      for(let i=0;i<ordDocs[cat].length;i++){
        const blob=await compressImage(ordDocs[cat][i]);
        const path=`${jobId}/docs/${cat}_${Date.now()}_${i}.jpg`;
        const {error:e2}=await client.storage.from('job-photos').upload(path,blob,{contentType:'image/jpeg',upsert:false}); if(e2) throw e2;
        await client.from('job_docs').insert({job_id:jobId,category:cat,path});
      }
    }
    ordDocs={id:[],billing:[],premise:[]};
    $('#orderForm').reset(); $$('#orderModal [data-cnt]').forEach(b=>b.textContent='0 file(s)');
    closeModals(); showToast('Job order submitted to the Validator');
    refreshValBadge(); if($('#validationPage')?.classList.contains('active')) renderValidation();
  }catch(e2){ err('Submit failed: '+(e2.message||e2)); }
  btn.disabled=false; btn.textContent='Submit for validation';
}

// ---------- Dashboard login + role-based access ----------
const PAGE_KEYS=[['overview','Overview'],['validation','Validator'],['dispatch','Dispatch'],['teams','Field Teams'],['workorders','Work Orders'],['expenses','Expenses'],['accounts','Accounts'],['attendance','Attendance'],['completed','Completed'],['remittance','Remittance'],['history','Load History']];
let dashAuth=null; window.dashUser=null;
const dashEmailFor=u=>u.trim().toLowerCase()+'@ahbadash.app';
const DH=()=>({apikey:SUPA_KEY,Authorization:'Bearer '+dashTok(),'Content-Type':'application/json'});
function dgErr(id,msg){const e=$(id); if(!e)return; e.textContent=msg||''; e.classList.toggle('show',!!msg);}
function startDashAuth(){
  if(!window.supabase?.createClient){ console.warn('supabase-js not loaded'); return; }
  dashAuth=window.supabase.createClient(SUPA_URL,SUPA_KEY);
  // keep the REST token + realtime auth in sync with the session (handles token refresh)
  dashAuth.auth.onAuthStateChange((_e,session)=>{ window.__ahbaTok = session?.access_token || null; setRealtimeAuth(window.__ahbaTok); });
  dashAuth.auth.getSession().then(({data})=>{
    window.__ahbaTok = data.session?.access_token || null;
    if(data.session&&data.session.user) onDashLogin(data.session.user.email);
    else showDashGate('#dashGate');
  });
}
// Apply the user token to realtime clients so live updates work under authenticated-only RLS
function setRealtimeAuth(tok){
  try{ if(window.AHBACloud&&AHBACloud.realtime) AHBACloud.realtime.realtime.setAuth(tok||SUPA_KEY); }catch(e){}
  try{ if(window.__cwClient) window.__cwClient.realtime.setAuth(tok||SUPA_KEY); }catch(e){}
}
function showDashGate(which){ ['#dashGate','#dashPwGate'].forEach(g=>{const el=$(g); if(el)el.style.display=(g===which)?'flex':'none';}); }
function hideDashGates(){ ['#dashGate','#dashPwGate'].forEach(g=>{const el=$(g); if(el)el.style.display='none';}); }
async function fetchDashUser(email){
  try{ const r=await fetch(`${SUPA_URL}/rest/v1/dashboard_users?email=eq.${encodeURIComponent(email)}&select=*`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}}); const rows=r.ok?await r.json():[]; return rows[0]||null; }catch(e){ return null; }
}
async function onDashLogin(email){
  try{ const {data:s}=await dashAuth.auth.getSession(); window.__ahbaTok=s.session?.access_token||null; setRealtimeAuth(window.__ahbaTok); }catch(e){}
  const u=await fetchDashUser(email);
  if(!u){ dgErr('#dlErr','This account is not registered as a dashboard user.'); try{await dashAuth.auth.signOut();}catch(e){} showDashGate('#dashGate'); return; }
  window.dashUser=u;
  fetch(`${SUPA_URL}/rest/v1/dashboard_users?username=eq.${encodeURIComponent(u.username)}`,{method:'PATCH',headers:DH(),body:JSON.stringify({last_login:new Date().toISOString()})}).catch(()=>{});
  if(u.must_change){ showDashGate('#dashPwGate'); return; }
  hideDashGates(); applyAccess(u);
}
function applyAccess(u){
  const allowed = u.is_super ? PAGE_KEYS.map(p=>p[0]) : (Array.isArray(u.allowed_pages)?u.allowed_pages:[]);
  $$('.nav-item').forEach(n=>{ const pg=n.dataset.page; if(pg==='access'){ n.style.display=u.is_super?'':'none'; } else { n.style.display=allowed.includes(pg)?'':'none'; } });
  $$('[data-action="new-order"]').forEach(b=>b.style.display=(u.is_super||allowed.includes('workorders'))?'':'none');
  const nameEl=$('.user-card strong'); if(nameEl) nameEl.textContent=u.display_name||u.username;
  const rl=$('#roleLabel'); if(rl) rl.textContent=u.is_super?'Superadmin':(u.role_label||'Dashboard user');
  const av=$('.user-card .avatar'); if(av) av.textContent=(u.display_name||u.username).split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase();
  const first=(allowed[0]||'overview');
  switchPage(first);
}
function dashLogout(){ if(dashAuth) dashAuth.auth.signOut().catch(()=>{}); window.dashUser=null; closePopovers&&closePopovers(); showDashGate('#dashGate'); }
// Access Control page (superadmin)
let accessUsers=[];
async function renderAccess(){
  const wrap=$('#accessWrap'); if(!wrap)return;
  wrap.innerHTML='Loading…';
  try{ const r=await fetch(`${SUPA_URL}/rest/v1/dashboard_users?select=*&order=is_super.desc,username.asc`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}}); accessUsers=r.ok?await r.json():[]; }catch(e){accessUsers=[];}
  const head=`<tr><th>User</th><th>Role</th>${PAGE_KEYS.map(p=>`<th style="text-align:center;font-size:9px">${p[1]}</th>`).join('')}<th></th></tr>`;
  const rows=accessUsers.map(u=>{
    if(u.is_super) return `<tr><td><strong>${u.display_name||u.username}</strong><span>${u.username}</span></td><td>Superadmin</td><td colspan="${PAGE_KEYS.length}" style="text-align:center;color:#11825f">Full access (all sections)</td><td style="white-space:nowrap"><button class="assign-btn" data-renamedash="${u.username}">Rename</button> <button class="assign-btn" data-resetdash="${u.username}">Reset PW</button></td></tr>`;
    const allowed=Array.isArray(u.allowed_pages)?u.allowed_pages:[];
    const cells=PAGE_KEYS.map(p=>`<td style="text-align:center"><input type="checkbox" data-u="${u.username}" data-pg="${p[0]}" ${allowed.includes(p[0])?'checked':''}></td>`).join('');
    return `<tr><td><strong>${u.display_name||u.username}</strong><span>${u.username}</span></td><td>${u.role_label||''}</td>${cells}<td style="white-space:nowrap"><button class="assign-btn" data-saveaccess="${u.username}">Save</button> <button class="assign-btn" data-renamedash="${u.username}">Rename</button> <button class="assign-btn" data-resetdash="${u.username}">Reset PW</button></td></tr>`;
  }).join('');
  wrap.innerHTML=`<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  $$('#accessWrap [data-saveaccess]').forEach(b=>b.onclick=()=>saveAccess(b.dataset.saveaccess));
  $$('#accessWrap [data-resetdash]').forEach(b=>b.onclick=()=>resetDashUser(b.dataset.resetdash));
  $$('#accessWrap [data-renamedash]').forEach(b=>b.onclick=()=>renameDashUser(b.dataset.renamedash));
}
async function saveAccess(username){
  const pages=$$(`#accessWrap input[data-u="${username}"]`).filter(c=>c.checked).map(c=>c.dataset.pg);
  try{
    await fetch(`${SUPA_URL}/rest/v1/dashboard_users?username=eq.${encodeURIComponent(username)}`,{method:'PATCH',headers:DH(),body:JSON.stringify({allowed_pages:pages,updated_at:new Date().toISOString()})});
    showToast(`${username}: access updated`);
  }catch(e){ showToast('Could not save access'); }
}
// ---- Secure admin actions via the admin-reset Edge Function ----
function getAdminSecret(){
  let s=localStorage.getItem('ahba_admin_secret')||'';
  if(!s){ s=(prompt('Enter the Superadmin admin secret:')||'').trim(); if(s) localStorage.setItem('ahba_admin_secret',s); }
  return s;
}
async function callAdminFn(payload){
  const r=await fetch(`${SUPA_URL}/functions/v1/admin-reset`,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()},body:JSON.stringify(payload)});
  let out={}; try{out=await r.json()}catch(e){}
  if(!r.ok||out.error) throw new Error(out.error||('HTTP '+r.status));
  return out;
}
async function createDashUser(){
  const u=($('#cuUser').value||'').trim().toUpperCase(), nm=($('#cuName').value||'').trim(), rl=($('#cuRole').value||'').trim(), pw=($('#cuPass').value||'').trim(), sup=$('#cuSuper').checked;
  if(!u){ showToast('Enter a username'); return; }
  if(pw.length<8){ showToast('Temp password must be at least 8 characters'); return; }
  const sec=getAdminSecret(); if(!sec){ showToast('Admin secret required'); return; }
  const btn=$('#cuCreate'); btn.disabled=true; btn.textContent='Creating…';
  try{
    await callAdminFn({admin_secret:sec,action:'create',target:'dash',username:u,new_password:pw,display_name:nm||u,role_label:rl||'Dashboard user',is_super:sup,allowed_pages:sup?PAGE_KEYS.map(p=>p[0]):['overview']});
    showToast(`${u} created. They must change the temp password on first login.`);
    ['#cuUser','#cuName','#cuRole','#cuPass'].forEach(id=>{const e=$(id);if(e)e.value='';}); $('#cuSuper').checked=false;
    renderAccess();
  }catch(e){ showToast('Create failed: '+e.message); }
  btn.disabled=false; btn.textContent='Create user';
}
async function resetDashUser(username){
  const pw=(prompt(`New temporary password for ${username} (min 8 chars):`,'Ahba@2026')||'').trim();
  if(pw.length<8){ showToast('Password must be at least 8 characters'); return; }
  const sec=getAdminSecret(); if(!sec){ showToast('Admin secret required'); return; }
  try{
    await callAdminFn({admin_secret:sec,action:'reset',target:'dash',username,new_password:pw});
    showToast(`${username} password reset. They must change it on next login.`);
  }catch(e){ showToast('Reset failed: '+e.message); }
}
async function renameDashUser(username){
  let nu=(prompt(`New username for ${username} (letters/numbers, no spaces):`,username)||'').trim().toUpperCase();
  if(!nu||nu===username) return;
  if(!/^[A-Z0-9._-]{3,}$/.test(nu)){ showToast('Username: 3+ chars, letters/numbers/._- only (no spaces).'); return; }
  const sec=getAdminSecret(); if(!sec){ showToast('Admin secret required'); return; }
  try{
    await callAdminFn({admin_secret:sec,action:'rename',target:'dash',username,new_username:nu});
    showToast(`${username} → ${nu}. New login email: ${nu.toLowerCase()}@ahbadash.app`);
    renderAccess();
  }catch(e){ showToast('Rename failed: '+e.message); }
}
async function changeMyDisplayName(){
  const u=window.dashUser; if(!u){ return; }
  const nm=(prompt('Your display name:', u.display_name||u.username)||'').trim();
  if(!nm||nm===u.display_name) return;
  try{
    await fetch(`${SUPA_URL}/rest/v1/dashboard_users?username=eq.${encodeURIComponent(u.username)}`,{method:'PATCH',headers:DH(),body:JSON.stringify({display_name:nm,updated_at:new Date().toISOString()})});
    u.display_name=nm;
    const nameEl=$('.user-card strong'); if(nameEl) nameEl.textContent=nm;
    const av=$('.user-card .avatar'); if(av) av.textContent=nm.split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase();
    showToast('Display name updated');
  }catch(e){ showToast('Could not update display name'); }
}
// (Superadmin self-recovery removed — superadmin password is renewed in Supabase.)

// ---------- Messenger-style team chat widget + global notifications ----------
let cwTeam=null, cwUnread={}, cwChan=null;
function playBeepDash(){ try{ const C=window.AudioContext||window.webkitAudioContext; if(!C)return; const ctx=playBeepDash._c||(playBeepDash._c=new C()); if(ctx.state==='suspended')ctx.resume(); const o=ctx.createOscillator(),g=ctx.createGain(); o.type='sine'; o.frequency.setValueAtTime(880,ctx.currentTime); o.frequency.setValueAtTime(1170,ctx.currentTime+0.12); o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.0001,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.3,ctx.currentTime+0.02); g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.35); o.start(); o.stop(ctx.currentTime+0.36);}catch(e){} }
function dcTotalUnread(){ return Object.values(cwUnread).reduce((a,b)=>a+(b||0),0); }
function updateDcBadge(){ const t=dcTotalUnread(); const b=$('#dashChatBadge'); if(b){ b.textContent=t; b.classList.toggle('hidden',t<=0); } }
function chatWidgetOpen(){ const w=$('#dashChatWidget'); return w && w.style.display!=='none'; }
function openChatWidget(){ try{ if('Notification'in window&&Notification.permission==='default')Notification.requestPermission(); }catch(e){} const w=$('#dashChatWidget'); w.classList.remove('min'); w.style.display='flex'; showCwTeams(); }
function closeChatWidget(){ const w=$('#dashChatWidget'); w.style.display='none'; w.classList.remove('min'); }
function minimizeChat(){ $('#dashChatWidget').classList.add('min'); }
async function showCwTeams(){
  cwTeam=null; $('#dcThread').classList.add('hidden'); $('#dcTeams').classList.remove('hidden'); $('#dcBack').classList.add('hidden');
  $('#dcTitle').textContent='Team messages'; if($('#dcHeadAv'))$('#dcHeadAv').textContent='💬'; if($('#dcSub'))$('#dcSub').textContent='Tap a team to chat';
  const el=$('#dcTeams'); el.innerHTML='<div style="padding:20px;text-align:center;color:#9aa6a2;font-size:12px">Loading…</div>';
  try{
    const r=await fetch(`${SUPA_URL}/rest/v1/team_messages?select=team,body,role,created_at&order=created_at.desc&limit=400`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}});
    const rows=r.ok?await r.json():[];
    const last={}; rows.forEach(m=>{ if(!last[m.team]) last[m.team]=m; });
    const arr=Object.keys(last).sort((a,b)=>new Date(last[b].created_at)-new Date(last[a].created_at));
    if(!arr.length){ el.innerHTML='<div style="padding:24px;text-align:center;color:#9aa6a2;font-size:12px">No conversations yet.<br>Open a team in Field Teams to start, or assign a load.</div>'; return; }
    el.innerHTML=arr.map(t=>{ const m=last[t]; const u=cwUnread[t]||0; return `<div class="dc-team" data-cw="${t}"><div class="dc-av">${t.slice(-3)}</div><div class="dc-tmeta"><strong>${t}${u?`<span class="dc-ucount">${u}</span>`:''}</strong><p>${m.role==='dispatch'?'You: ':''}${(m.body||'').replace(/</g,'&lt;').slice(0,42)}</p></div><time>${timeAgo(m.created_at)}</time></div>`; }).join('');
    $$('#dcTeams [data-cw]').forEach(d=>d.onclick=()=>openCwThread(d.dataset.cw));
  }catch(e){ el.innerHTML='<div style="padding:20px;color:#c2503a;font-size:12px">Could not load.</div>'; }
}
async function openCwThread(code){
  cwTeam=code; cwUnread[code]=0; updateDcBadge();
  $('#dcTeams').classList.add('hidden'); $('#dcThread').classList.remove('hidden'); $('#dcBack').classList.remove('hidden');
  $('#dcTitle').textContent=code; if($('#dcHeadAv'))$('#dcHeadAv').textContent=code.slice(-3); if($('#dcSub'))$('#dcSub').textContent=(teamCrew(code)||'Field team');
  const el=$('#dcMsgs'); el.innerHTML='<div style="color:#9aa6a2;font-size:11px;text-align:center;padding:14px">Loading…</div>';
  try{
    const r=await fetch(`${SUPA_URL}/rest/v1/team_messages?select=*&team=eq.${encodeURIComponent(code)}&order=created_at.asc&limit=200`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}});
    renderCwMsgs(r.ok?await r.json():[]);
  }catch(e){ el.innerHTML='<div style="color:#c2503a;font-size:11px;padding:14px">Could not load.</div>'; }
}
function renderCwMsgs(rows){
  const el=$('#dcMsgs'); el.innerHTML=rows.length?rows.map(m=>{const d=m.role==='dispatch';return `<div class="dc-msg ${d?'me':'them'}"><div>${(m.body||'').replace(/</g,'&lt;')}</div><span>${d?(m.sender||'You'):(m.sender||cwTeam)} · ${fmtWhen(m.created_at)}</span></div>`;}).join(''):'<div style="color:#9aa6a2;font-size:11px;text-align:center;padding:14px">No messages yet.</div>'; el.scrollTop=el.scrollHeight;
}
async function sendCw(){
  const inp=$('#dcInput'); const v=(inp.value||'').trim(); if(!v||!cwTeam)return; inp.value='';
  const who=(window.dashUser&&(window.dashUser.display_name||window.dashUser.username))||'Dispatcher';
  try{ await fetch(`${SUPA_URL}/rest/v1/team_messages`,{method:'POST',headers:DH(),body:JSON.stringify({team:cwTeam,sender:who,role:'dispatch',body:v})}); pushNotify({team:cwTeam,title:'Message from Dispatch',body:v}); openCwThread(cwTeam); }catch(e){ showToast('Send failed'); }
}
function startDashChat(){
  if(cwChan||!window.supabase?.createClient) return;
  const cl=window.supabase.createClient(SUPA_URL,SUPA_KEY);
  window.__cwClient=cl; try{ cl.realtime.setAuth(window.__ahbaTok||SUPA_KEY); }catch(e){}
  cwChan=cl.channel('dash-team-chat').on('postgres_changes',{event:'INSERT',schema:'public',table:'team_messages'},p=>{
    const m=p.new; if(!m||m.role!=='team') return;   // only field-team messages notify the console
    playBeepDash();
    const widgetOpen=chatWidgetOpen();
    if(widgetOpen && cwTeam===m.team){ openCwThread(m.team); }
    else { cwUnread[m.team]=(cwUnread[m.team]||0)+1; updateDcBadge(); if(widgetOpen) showCwTeams(); }
    showToast('💬 '+m.team+': '+(m.body||'').slice(0,45));
    try{ if('Notification'in window&&Notification.permission==='granted') new Notification('💬 '+m.team,{body:m.body,icon:'favicon.png'}); }catch(e){}
  }).subscribe();
}

// ---------- Announcements (broadcast to mobile) ----------
function openAnnounce(){ loadAnnRecent(); openModal($('#announceModal')); }
async function loadAnnRecent(){
  const el=$('#annRecent'); if(!el)return; el.innerHTML='Loading…';
  try{
    const r=await fetch(`${SUPA_URL}/rest/v1/announcements?select=*&order=created_at.desc&limit=20`,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok()}});
    const rows=r.ok?await r.json():[];
    el.innerHTML=rows.length?rows.map(a=>`<div style="border-bottom:1px dashed #eef1ed;padding:6px 0"><b>${(a.title||'Announcement')}</b> <span class="status ${a.audience==='sales'?'assigned':a.audience==='technician'?'en-route':'completed'}" style="font-size:7px">${a.audience||'all'}</span><div style="color:#586965;margin:2px 0;white-space:pre-wrap">${(a.body||'').replace(/</g,'&lt;')}</div><div style="color:#9aa6a2;font-size:9px">${fmtWhen(a.created_at)} <button class="assign-btn" data-delann="${a.id}" style="margin-left:6px">Delete</button></div></div>`).join(''):'<span style="color:#9aa6a2">No announcements yet.</span>';
    $$('#annRecent [data-delann]').forEach(b=>b.onclick=()=>delAnnounce(b.dataset.delann));
  }catch(e){ el.innerHTML='<span style="color:#c2503a">Could not load.</span>'; }
}
async function postAnnounce(){
  const audience=$('#annAudience').value, title=($('#annTitle').value||'').trim(), body=($('#annBody').value||'').trim();
  if(!body){ showToast('Type a message'); return; }
  const who=(window.dashUser&&(window.dashUser.display_name||window.dashUser.username))||'Dispatcher';
  const btn=$('#annPost'); btn.disabled=true; btn.textContent='Posting…';
  try{
    await fetch(`${SUPA_URL}/rest/v1/announcements`,{method:'POST',headers:DH(),body:JSON.stringify({audience,title,body,created_by:who})});
    pushNotify({audience,title:'📢 '+(title||'Announcement'),body});
    $('#annTitle').value=''; $('#annBody').value=''; showToast('Announcement posted'); loadAnnRecent();
  }catch(e){ showToast('Post failed'); }
  btn.disabled=false; btn.textContent='Post announcement';
}
async function delAnnounce(id){
  if(!confirm('Delete this announcement?'))return;
  try{ await fetch(`${SUPA_URL}/rest/v1/announcements?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',headers:DH()}); loadAnnRecent(); }catch(e){ showToast('Delete failed'); }
}

// ---------- Import work orders from Excel → For Dispatch ----------
const IMPORT_HMAP={};
[['firstname','first_name'],['middlename','middle_name'],['lastname','last_name'],
 ['subscriber','subscriber'],['pangalan','subscriber'],['name','subscriber'],['subscribername','subscriber'],['fullname','subscriber'],
 ['primaryno','primary_no'],['primarycontactno','primary_no'],['contactno','primary_no'],['contactnumber','primary_no'],['contact','primary_no'],['mobile','primary_no'],['mobileno','primary_no'],['cellno','primary_no'],
 ['othercontactno','other_contact_no'],['othercontact','other_contact_no'],['secondaryno','other_contact_no'],['alternateno','other_contact_no'],
 ['houseno','house_no'],['housenumber','house_no'],
 ['streetname','street_name'],['street','street_name'],
 ['villagesubdivision','village'],['village','village'],['subdivision','village'],
 ['brgy','brgy'],['barangay','brgy'],
 ['city','city'],['citymunicipality','city'],['municipality','city'],
 ['ibassacctno','ibass_acct_no'],['ibasacctno','ibass_acct_no'],['ibassaccount','ibass_acct_no'],['ibasaccount','ibass_acct_no'],['ibassaccountno','ibass_acct_no'],['ibasaccountno','ibass_acct_no'],['ibasacct','ibass_acct_no'],['ibassacct','ibass_acct_no'],['acctno','ibass_acct_no'],['accountno','ibass_acct_no'],['account','ibass_acct_no'],
 ['joborderno','job_order_no'],['jobordernumber','job_order_no'],['jono','job_order_no'],['jonumber','job_order_no'],['jo','job_order_no'],
 ['vasno','vas_no'],['vas','vas_no'],
 ['1por2p','play_type'],['playtype','play_type'],['play','play_type'],['1p2p','play_type'],
 ['plan','plan'],['planrefno','plan'],['planreference','plan'],
 ['refno','ref_no'],['reference','ref_no'],['referenceno','ref_no'],
 ['newref','new_ref'],['newreference','new_ref'],['newrefno','new_ref'],
 ['servicetype','type'],['service','type'],['type','type'],
 ['priority','priority'],['loadpriority','priority'],
 ['dispatchstatus','dispatch_status'],
 ['driver','driver'],
 ['tech1','tech1'],['technician1','tech1'],['technician','tech1'],
 ['mappingteam','mapping_team'],['mappingremarks','mapping_remarks'],
 ['dispatchedremarks','dispatched_remarks'],['dispatchremarks','dispatched_remarks'],
 ['incharge','in_charge'],
 ['sourceofsales','source_of_sales'],['source','source_of_sales'],
 ['referralname','referral_name'],['referral','referral_name'],
 ['specialnote','special_note'],['note','special_note'],['remarks','special_note'],
 ['teamassigned','team'],['team','team'],
 ['date','load_date'],['preferreddate','load_date'],['loaddate','load_date']
].forEach(([k,v])=>IMPORT_HMAP[k]=v);
const normHdr=h=>String(h||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function downloadImportTemplate(){
  if(typeof XLSX==='undefined'){showToast('Excel library still loading');return}
  const headers=['Date','IBAS ACCT NO','1P or 2P','REF NO','PLAN','PRIMARY NO','SECONDARY NO','FIRST NAME','MIDDLE NAME','LAST NAME','HOUSE NO','STREET NAME','VILLAGE/SUBDIVISION','BARANGAY','CITY','SOURCE OF SALES','REFERRAL NAME'];
  const ws=XLSX.utils.aoa_to_sheet([headers]); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'NEW LOADS');
  const out=XLSX.write(wb,{type:'array',bookType:'xlsx'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([out],{type:'application/octet-stream'})); a.download='AHBA_import_template.xlsx'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),8000);
  showToast('Template downloaded — fill it in, then Import Excel');
}
// Finds the sheet + header row that best matches our known columns (handles title rows / extra sheets)
function parseWorkbook(wb){
  let best={score:-1};
  wb.SheetNames.forEach(sn=>{
    const aoa=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:''});
    for(let h=0;h<Math.min(aoa.length,15);h++){
      const hdr=aoa[h]||[]; let score=0; hdr.forEach(c=>{ if(IMPORT_HMAP[normHdr(c)]) score++; });
      if(score>best.score) best={score,sheet:sn,headerRow:h,aoa};
    }
  });
  if(!best.aoa||best.score<2) return {rows:[],headers:(best.aoa&&best.aoa[0])||[],score:best.score};
  const hdr=best.aoa[best.headerRow]; const rows=[];
  for(let i=best.headerRow+1;i<best.aoa.length;i++){
    const r=best.aoa[i]; if(!r||!r.some(c=>String(c).trim()!=='')) continue;
    const obj={}; hdr.forEach((h,ci)=>{ obj[h]= r[ci]!==undefined? r[ci] : ''; });
    rows.push(obj);
  }
  return {rows,headers:hdr,score:best.score,sheet:best.sheet};
}
function handleImportFile(file){
  if(typeof XLSX==='undefined'){showToast('Excel library still loading — try again');return}
  const reader=new FileReader();
  reader.onload=e=>{
    let parsed;
    try{ const wb=XLSX.read(e.target.result,{type:'array'}); parsed=parseWorkbook(wb); }
    catch(err){ showToast('Could not read file: '+err.message); return; }
    if(!parsed.rows.length){
      const seen=(parsed.headers||[]).filter(Boolean).join(', ').slice(0,300);
      alert('Walang nakitang tugmang column.\n\nMga header na nakita: '+(seen||'(wala)')+'\n\nGamitin ang "Template" button para sa tamang format, o tiyaking may column gaya ng FIRST NAME / SUBSCRIBER / PRIMARY NO. / JOB ORDER NO.');
      return;
    }
    if(!confirm(`Sheet "${parsed.sheet}" · ${parsed.rows.length} row(s) detected.\n\nImport as new job orders straight to For Dispatch?`)) return;
    importJobsFromRows(parsed.rows);
  };
  reader.readAsArrayBuffer(file);
}
async function importJobsFromRows(rows){
  const today=manilaToday(), now=new Date().toISOString();
  const out=[];
  rows.forEach((row,idx)=>{
    const g={}; Object.keys(row).forEach(k=>{ const f=IMPORT_HMAP[normHdr(k)]; if(f && row[k]!==''&&row[k]!=null) g[f]=String(row[k]).trim(); });
    const full=g.subscriber||[g.first_name,g.middle_name,g.last_name].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
    if(!full && !g.primary_no && !g.job_order_no) return; // skip blank lines
    const addr=[g.house_no,g.street_name,g.village,g.brgy,g.city].filter(Boolean).join(', ');
    const id='WO-'+new Date().getFullYear()+'-'+String(Date.now()).slice(-6)+String(idx);
    const o={ id, subscriber:full||'Subscriber', service_type:g.type||'Installation', plan:g.plan||'', area:g.city||g.brgy||'', address:addr,
      status:'pending', wait_time:'Imported', priority:g.priority||'1st Load', schedule:'Today', team:g.team||null, load_date:today, created_by:'IMPORT', created_at:now, updated_at:now,
      first_name:g.first_name,middle_name:g.middle_name,last_name:g.last_name,primary_no:g.primary_no,other_contact_no:g.other_contact_no,
      house_no:g.house_no,street_name:g.street_name,village:g.village,brgy:g.brgy,city:g.city,
      ibass_acct_no:g.ibass_acct_no,job_order_no:g.job_order_no,vas_no:g.vas_no,play_type:g.play_type,ref_no:g.ref_no,new_ref:g.new_ref,
      dispatch_status:g.dispatch_status,driver:g.driver,tech1:g.tech1,mapping_team:g.mapping_team,mapping_remarks:g.mapping_remarks,dispatched_remarks:g.dispatched_remarks,
      in_charge:g.in_charge,source_of_sales:g.source_of_sales,referral_name:g.referral_name,special_note:g.special_note };
    // keep identical keys across all rows (PostgREST bulk insert requires it); blanks → null
    Object.keys(o).forEach(k=>{ if(o[k]===undefined||o[k]==='') o[k]=null; });
    out.push(o);
  });
  const skipped=rows.length-out.length;
  if(!out.length){ alert('Walang valid na row na na-import.\n\nTiyaking may laman ang FIRST NAME/SUBSCRIBER, PRIMARY NO., o JOB ORDER NO. sa bawat row.'); return; }
  showToast(`Importing ${out.length} job order(s)…`);
  try{
    for(let i=0;i<out.length;i+=100){
      const r=await fetch(`${SUPA_URL}/rest/v1/jobs`,{method:'POST',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok(),'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(out.slice(i,i+100))});
      if(!r.ok){ const t=await r.text(); throw new Error(t.slice(0,200)); }
    }
    // refresh from cloud so the new jobs appear on the board
    if(window.AHBACloud&&AHBACloud.getJobs){ try{ jobs=await AHBACloud.getJobs(); localStorage.setItem('fieldflow_jobs',JSON.stringify(jobs)); }catch(e){} }
    switchPage('dispatch'); renderOverview();
    alert(`✅ Imported ${out.length} job order(s) → For Dispatch.`+(skipped?`\n${skipped} blank/invalid row(s) skipped.`:''));
  }catch(e){ alert('Import failed: '+(e.message||e)); }
}

function init(){
  injectIcons();const d=new Date();$('#todayLabel').textContent=d.toLocaleDateString('en-PH',{timeZone:TZ,weekday:'short',month:'short',day:'numeric'});$$('input[type=date]').forEach(i=>i.value=manilaToday());
  $('#expenseTeam').innerHTML=teams.map(t=>`<option>${t.name}</option>`).join('');
  if($('#orderTeam'))$('#orderTeam').innerHTML='<option value="">— Unassigned —</option>'+teams.map(t=>`<option>${t.name}</option>`).join('');
  renderOverview();renderTeams();renderNotifPop();

  // Live team shifts (account + crew, online status) — load now, then refresh every 20s
  const refreshShifts=()=>loadTeamShifts().then(()=>{ renderTeams($('#teamSearch')?.value||''); if($('#dispatchPage')?.classList.contains('active')) renderJobs(); if($('#overviewPage')?.classList.contains('active')) renderOverview(); });
  refreshShifts(); setInterval(refreshShifts, 20000);

  // Metric cards → clickable shortcuts
  $$('[data-go]').forEach(b=>b.onclick=()=>switchPage(b.dataset.go));
  $('#dispatchSearch')?.addEventListener('input',applyDispatchSearch);

  // Live shift clock (updates every second)
  updateShiftClock(); setInterval(updateShiftClock, 1000);

  $$('.nav-item').forEach(b=>b.onclick=()=>switchPage(b.dataset.page));
  $$('[data-page-link]').forEach(b=>b.onclick=()=>switchPage(b.dataset.pageLink));
  $$('[data-action="new-order"]').forEach(b=>b.onclick=()=>openModal($('#orderModal')));
  $$('[data-action="add-expense"]').forEach(b=>b.onclick=()=>openModal($('#expenseModal')));
  $$('.close-modal').forEach(b=>b.onclick=closeModals);
  $('#modalBackdrop').onclick=closeModals;

  // Sidebar (mobile)
  $('#menuBtn').onclick=openSidebar;
  $('#sidebarCloseBtn')?.addEventListener('click',closeSidebar);
  $('#sidebarScrim')?.addEventListener('click',closeSidebar);

  // Notification popover
  $('#notifBtn').onclick=e=>{e.stopPropagation();toggleNotif()};
  $('#notifPop').onclick=e=>e.stopPropagation();
  $('#notifClear').onclick=()=>{$('#notifDot').style.display='none';closePopovers();showToast('All notifications marked as read')};

  // Role switcher
  $('#roleSwitcher').onclick=e=>{e.stopPropagation();const rm=$('#roleMenu'),open=rm.hidden;closePopovers();if(open){rm.hidden=false;$('#roleSwitcher').setAttribute('aria-expanded','true')}};
  $('#roleMenu').onclick=e=>e.stopPropagation();
  $$('#roleMenu [data-role]').forEach(b=>b.onclick=()=>{$('#roleLabel').textContent=b.dataset.role;closePopovers();showToast(`Viewing as ${b.dataset.role}`)});

  // Dismiss popovers on outside click / Escape
  document.addEventListener('click',closePopovers);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePopovers();closeSidebar()}});

  // Map controls
  $$('.map-actions [data-seg]').forEach(b=>b.onclick=()=>{$$('.map-actions [data-seg]').forEach(x=>x.classList.remove('active'));b.classList.add('active');mapFilter=b.dataset.seg;renderTeamLocations()});
  $('#mapExpandBtn')?.addEventListener('click',()=>{$('.map-panel').classList.toggle('expanded');setTimeout(()=>{if(leafMap)leafMap.invalidateSize()},250)});
  setInterval(()=>{ if($('#overviewPage')?.classList.contains('active')) renderTeamLocations(); }, 30000);

  // Forms
  $('#orderForm').onsubmit=submitOrder;
  $$('#orderModal [data-doc]').forEach(inp=>inp.onchange=()=>{ const cat=inp.dataset.doc; ordDocs[cat]=[...inp.files]; const b=$(`#orderModal [data-cnt="${cat}"]`); if(b)b.textContent=`${ordDocs[cat].length} file(s)`; });
  $$('#orderModal input[inputmode="numeric"]').forEach(el=>el.oninput=()=>{el.value=el.value.replace(/\D/g,'').slice(0,11)});
  $('#expenseForm').onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));
    fetch(`${SUPA_URL}/rest/v1/expenses`,{method:'POST',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+dashTok(),'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({team:f.team,category:f.category,description:f.description,amount:Number(f.amount),job_id:f.workOrder||null,status:'Pending',work_date:manilaToday()})}).then(()=>setTimeout(renderExpenses,400)).catch(()=>{});
    e.target.reset();closeModals();showToast('Expense recorded for approval')};

  // Search + filters
  $('#teamSearch').oninput=e=>renderTeams(e.target.value);
  $('#jobSearch').oninput=applyJobTableFilter;
  $$('#jobFilters button').forEach(b=>b.onclick=()=>{$$('#jobFilters button').forEach(x=>x.classList.remove('active'));b.classList.add('active');applyJobTableFilter()});

  $('#autoAssignBtn').onclick=()=>{const pending=jobs.find(j=>j.status==='pending');pending?openAssign(pending.id):showToast('No unassigned jobs in the queue')};
  $('#announceBtn')?.addEventListener('click',openAnnounce);
  $('#annPost')?.addEventListener('click',postAnnounce);
  $('#dashChatFab')?.addEventListener('click',()=>{ chatWidgetOpen()?closeChatWidget():openChatWidget(); });
  $('#dcClose')?.addEventListener('click',e=>{e.stopPropagation();closeChatWidget();});
  $('#dcMin')?.addEventListener('click',e=>{e.stopPropagation();minimizeChat();});
  $('#dcBack')?.addEventListener('click',e=>{e.stopPropagation();showCwTeams();});
  $('#dcHead')?.addEventListener('click',()=>{ const w=$('#dashChatWidget'); if(w.classList.contains('min')) w.classList.remove('min'); });
  $('#dcSend')?.addEventListener('click',sendCw);
  $('#dcInput')?.addEventListener('keydown',e=>{ if(e.key==='Enter') sendCw(); });
  startDashChat();
  $('#importTemplateBtn')?.addEventListener('click',downloadImportTemplate);
  $('#importXlsxBtn')?.addEventListener('click',()=>$('#importXlsxInput').click());
  $('#importXlsxInput')?.addEventListener('change',e=>{ if(e.target.files[0]) handleImportFile(e.target.files[0]); e.target.value=''; });

  // Completed view: export + clear
  $('#exportBtn')?.addEventListener('click',exportZip);
  $('#clearBtn')?.addEventListener('click',clearCloud);
  $('#histExport')?.addEventListener('click',exportHistoryExcel);
  $('#remExport')?.addEventListener('click',exportRemittance);
  $('#attExport')?.addEventListener('click',exportAttendance);
  $('#gateExport')?.addEventListener('click',exportGateLog);

  // Validator badge (count of pending sales-agent submissions)
  refreshValBadge(); setInterval(refreshValBadge,30000);

  // Superadmin password reset
  $('#resetNow')?.addEventListener('click',resetNow);

  // ---- Dashboard login + access wiring ----
  $('#dashLoginForm')?.addEventListener('submit',async e=>{
    e.preventDefault(); dgErr('#dlErr','');
    const u=$('#dlUser').value.trim(), p=$('#dlPass').value; if(!u||!p)return;
    const btn=$('#dlBtn'); btn.disabled=true; btn.textContent='Signing in…';
    const {data,error}=await dashAuth.auth.signInWithPassword({email:dashEmailFor(u),password:p});
    btn.disabled=false; btn.textContent='Sign in';
    if(error){ dgErr('#dlErr',/invalid/i.test(error.message||'')?'Wrong username or password.':(error.message||'Sign-in failed.')); return; }
    onDashLogin(data.user.email);
  });
  $('#dashPwForm')?.addEventListener('submit',async e=>{
    e.preventDefault(); dgErr('#dpwErr','');
    const a=$('#dpw1').value, b=$('#dpw2').value;
    if(a.length<8){ dgErr('#dpwErr','Password must be at least 8 characters.'); return; }
    if(a!==b){ dgErr('#dpwErr','Passwords do not match.'); return; }
    const btn=$('#dpwBtn'); btn.disabled=true; btn.textContent='Saving…';
    const {error}=await dashAuth.auth.updateUser({password:a});
    btn.disabled=false; btn.textContent='Save password';
    if(error){ dgErr('#dpwErr',error.message); return; }
    if(window.dashUser){ fetch(`${SUPA_URL}/rest/v1/dashboard_users?username=eq.${encodeURIComponent(window.dashUser.username)}`,{method:'PATCH',headers:DH(),body:JSON.stringify({must_change:false,password_changed_at:new Date().toISOString()})}).catch(()=>{}); window.dashUser.must_change=false; hideDashGates(); applyAccess(window.dashUser); }
  });
  $('#dashLogoutBtn')?.addEventListener('click',dashLogout);
  $('#dashChangePw')?.addEventListener('click',()=>{ closePopovers&&closePopovers(); showDashGate('#dashPwGate'); });
  $('#dashChangeName')?.addEventListener('click',()=>{ closePopovers&&closePopovers(); changeMyDisplayName(); });
  $('#cuCreate')?.addEventListener('click',createDashUser);
  startDashAuth();
}
document.addEventListener('DOMContentLoaded',init);
