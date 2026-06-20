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

function renderOverview(){
  $('#activeTeamCount').textContent=teams.filter(t=>!['available','offline'].includes(t.status)).length;
  $('#availableTeamText').textContent=`${teams.filter(t=>t.status==='available').length} available · ${teams.filter(t=>t.status==='offline').length} offline`;
  const done=jobs.filter(j=>j.status==='completed').length;
  if($('#completedCount')) $('#completedCount').textContent=done;
  if($('#completedTarget')) $('#completedTarget').textContent=jobs.length;
  $('#teamAvatars').innerHTML=teams.slice(0,6).map((t,i)=>`<span style="background:${t.color}">${t.short}</span>`).join('');
  $('#completionBars').innerHTML=[16,24,20,31,26,36,29].map(h=>`<span style="height:${h}px"></span>`).join('');
  renderTeamLocations();
  $('#activityList').innerHTML=activity.map(a=>`<div class="activity-item"><span class="activity-icon ${a.tone}" data-icon="${a.icon}"></span><div class="activity-copy"><strong>${a.title}</strong><p>${a.text}</p></div><time>${a.time}</time></div>`).join('');
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
function initMap(){
  if(leafMap||typeof L==='undefined'||!document.getElementById('leafletMap'))return;
  leafMap=L.map('leafletMap',{zoomControl:true,attributionControl:false}).setView([14.5995,120.9842],11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(leafMap);
  setTimeout(()=>leafMap.invalidateSize(),200);
}
async function fetchTechLocations(){
  try{
    const r=await fetch(`${SUPA_URL}/rest/v1/technicians?select=username,area,lat,lng,location_at`,{headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`}});
    const rows=r.ok?await r.json():[];
    techIndex={}; rows.forEach(t=>{techIndex[t.username]=t}); return rows;
  }catch(e){return Object.values(techIndex)}
}
async function renderTeamLocations(){
  initMap(); if(!leafMap)return;
  const rows=await fetchTechLocations();
  const seen={};
  rows.forEach(t=>{
    if(t.lat==null||t.lng==null)return;
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
  const stages=[['pending','For Dispatch'],['assigned','Dispatched'],['en-route','Travel'],['on-site,in-progress','On Site'],['negative','Negative'],['completed','Completed'],['cancelled','Cancelled']];
  $('#dispatchBoard').innerHTML=stages.map(([keys,label])=>{
    let list;
    if(keys==='negative'){ list=jobs.filter(j=>j.status==='negative'); }
    else if(keys==='completed'||keys==='cancelled'){ list=jobs.filter(j=>keys.split(',').includes(j.status)&&isToday(j.updatedAt)); }
    else { list=jobs.filter(j=>keys.split(',').includes(j.status)&&loadToday(j.load_date)); }
    return `<div class="board-column" data-drop="${keys}"><div class="column-head"><strong>${label}</strong><span>${list.length}</span></div>${list.map(jobCard).join('')||'<div class="job-card empty"><p>No jobs in this stage.</p></div>'}</div>`;
  }).join('');
  const counts=[['Waiting',pending.length],['Assigned',jobs.filter(j=>j.status==='assigned').length],['On the road',jobs.filter(j=>j.status==='en-route').length],['In service',jobs.filter(j=>['on-site','in-progress'].includes(j.status)).length]];
  $('#dispatchStats').innerHTML=counts.map(([l,n])=>`<div class="small-stat"><span>${l}</span><strong>${n}</strong></div>`).join('');
  bindAssignButtons();
  wireDispatchDnD();
  applyJobTableFilter();
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
  jobs.filter(j=>j.status==='negative'&&negReleased(j.negative_at)).forEach(j=>{
    j.status='pending'; j.team=null; j.priority='Urgent'; j.load_date=manilaToday();
    j.history=appendHistory(j.history,'Auto-returned 5:00 AM → For Dispatch (High priority)');
    if(window.AHBASync) window.AHBASync(j);
  });
}
function unassignJob(jobId){
  const j=jobs.find(x=>x.id===jobId); if(!j||!['assigned','en-route','negative'].includes(j.status))return;
  const wasNeg=j.status==='negative';
  j.status='pending'; j.team=null; j.load_date=manilaToday(); if(wasNeg) j.priority='Urgent';
  j.history=appendHistory(j.history, wasNeg?'Manually returned → For Dispatch (High priority)':'Moved back to For Dispatch');
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
    F('Schedule',j.schedule),F('Negative remark',j.negative_remark)
  ].join('');
  $('#jdHistory').textContent=j.history||'No history yet.';
  $('#jdStatus').value='';
  $('#jdApply').onclick=()=>{const c=$('#jdStatus').value; if(!c){showToast('Select a status to apply');return;} applyStatusUpdate(jobId,c);};
  openModal($('#jobDetailModal'));
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
  const remark=j.negative_remark?`<p style="font-size:8px;color:#c2503a;font-weight:700;margin:6px 0 0">⚠ ${j.negative_remark}</p>`:'';
  const dc=(j.dispatch_count>0)?`<span style="font-size:7px;background:#eef1ff;color:#4456c7;border-radius:10px;padding:2px 6px;font-weight:700" title="${(j.history||'').replace(/"/g,'&quot;')}">⟳ ×${j.dispatch_count}</span>`:'';
  const btnLabel=j.status==='negative'?'↩ For Dispatch (High)':'↩ For Dispatch';
  const actions=j.status==='pending'
    ? `<div class="job-actions"><button class="assign-btn" data-assign="${j.id}">Assign team</button></div>`
    : canBounce
      ? `<div class="job-actions" style="align-items:center"><span class="status ${j.status}">${j.team||statusLabel(j.status)}</span><button class="assign-btn" data-unassign="${j.id}" title="Return to For Dispatch" style="margin-left:auto">${btnLabel}</button></div>`
      : `<div class="job-actions"><span class="status ${j.status}">${j.team||statusLabel(j.status)}</span></div>`;
  return `<article class="job-card" data-detail="${j.id}"${drag}><div class="job-top"><span class="job-id">${j.id}</span>${dc}${j.priority!=='Normal'?`<span class="priority">${j.priority}</span>`:''}</div><h3>${j.subscriber}</h3><p>${j.type} · ${j.plan}</p><div class="job-meta"><span>⌖ ${j.area}</span><span>${(j.schedule||'').replace('Today, ','')}</span></div>${remark}${actions}</article>`;
}
function renderTeams(filter=''){$('#teamGrid').innerHTML=teams.filter(t=>(t.name+t.area+t.code).toLowerCase().includes(filter.toLowerCase())).map(t=>`<article class="team-card"><div class="team-card-head"><span class="team-avatar" style="background:${t.color}">${t.short}</span><div><h3>${t.name}</h3><p>${t.members} technicians · ${t.area}</p></div></div><span class="status ${t.status}">${statusLabel(t.status)}</span><div class="load-row"><span>Today’s load</span><b>${t.jobs} / 5 jobs</b></div><div class="load-bar"><span style="width:${t.jobs/5*100}%"></span></div><div class="team-info"><span>Current area<strong>${t.area}</strong></span><span>Completed<strong>${t.completed} jobs · ★ ${t.rating}</strong></span></div></article>`).join('')||'<div class="empty-row">No teams match your search.</div>'}
const DEPLOY_COST=2100;
async function renderExpenses(){
  const date=manilaToday(), H={apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`};
  let cloudExp=[], att=[];
  try{ const r=await fetch(`${SUPA_URL}/rest/v1/expenses?select=*&work_date=eq.${date}&order=created_at.desc`,{headers:H}); cloudExp=r.ok?await r.json():[]; }catch(e){}
  try{ const r=await fetch(`${SUPA_URL}/rest/v1/attendance?select=username&work_date=eq.${date}`,{headers:H}); att=r.ok?await r.json():[]; }catch(e){}
  const techsToday=[...new Set(att.map(a=>a.username).filter(u=>/^AHBA_SLI/i.test(u)))];
  const deployCost=techsToday.length*DEPLOY_COST;
  const submitted=cloudExp.reduce((a,b)=>a+Number(b.amount||0),0);
  const total=deployCost+submitted, BUDGET=50000, pct=Math.round(total/BUDGET*100);
  const set=(id,v)=>{const el=$(id);if(el)el.textContent=v};
  set('#todayExpense',money(total)); set('#budgetPercent',`${pct}% of ${money(BUDGET)}`); set('#donutTotal',`₱${(total/1000).toFixed(1)}k`);
  if($('#budgetBar'))$('#budgetBar').style.width=`${Math.min(pct,100)}%`;

  const cats=['Deployment','Permit','Gas','Parking','Violation','Other'];
  const cols=['#082c28','#18a57b','#ff765f','#e9a93d','#4285f4','#b0bab7'];
  const values=cats.map(c=> c==='Deployment'? deployCost : cloudExp.filter(e=>e.category===c).reduce((a,b)=>a+Number(b.amount||0),0));
  const sum=values.reduce((a,b)=>a+b,0)||1; let acc=0;
  const stops=values.map((v,i)=>{const s=acc;acc+=v/sum*100;return `${cols[i]} ${s}% ${acc}%`}).join(',');
  if($('#expenseDonut'))$('#expenseDonut').style.background=`conic-gradient(${stops})`;
  if($('#expenseLegend'))$('#expenseLegend').innerHTML=cats.map((c,i)=>`<div class="legend-row"><i style="background:${cols[i]}"></i><span>${c}</span><b>${money(values[i])}</b></div>`).join('');
  if($('#categoryList'))$('#categoryList').innerHTML=cats.map((c,i)=>`<div class="category-row"><div class="category-top"><span>${c}</span><b>${money(values[i])}</b></div><div class="category-bar"><span style="width:${values[i]/Math.max(...values,1)*100}%;background:${cols[i]}"></span></div></div>`).join('');
  if($('#expenseBody')){
    const deployRow=`<tr><td>—</td><td><strong>${techsToday.length} tech logins</strong></td><td>Deployment</td><td>Daily deployment cost (₱${DEPLOY_COST.toLocaleString('en-PH')} / technician login)</td><td>—</td><td><strong>${money(deployCost)}</strong></td><td><span class="status completed">Auto</span></td></tr>`;
    const expRows=cloudExp.map(e=>`<tr><td>${e.created_at?fmtTime(e.created_at):''}</td><td><strong>${e.team||'—'}</strong></td><td>${e.category||''}</td><td>${e.description||''}</td><td>${e.job_id||'—'}</td><td><strong>${money(e.amount)}</strong></td><td><span class="status ${e.status==='Approved'?'completed':'pending'}">${e.status||'Pending'}</span></td></tr>`).join('');
    $('#expenseBody').innerHTML=deployRow+expRows;
  }
  if($('#expenseSummary'))$('#expenseSummary').innerHTML=[
    ['Today’s total',money(total)],['Deployment cost',money(deployCost)],['Field expenses',money(submitted)],
    ['Pending approval',money(cloudExp.filter(e=>(e.status||'Pending')==='Pending').reduce((a,b)=>a+Number(b.amount||0),0))]
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
  openModal($('#assignModal'));
  $('#assignmentList').innerHTML='<div class="empty-row">Finding nearest teams by GPS…</div>';
  await fetchTechLocations();
  const dest=areaCoord(job.area);
  const enriched=teams.map(t=>{
    const loc=techIndex[t.name];
    let dist=null;
    if(loc&&loc.lat!=null&&loc.lng!=null&&dest) dist=haversineKm(loc.lat,loc.lng,dest[0],dest[1]);
    return {t,loc,dist,online:isOnline(loc)};
  }).sort((a,b)=>{
    if(a.dist!=null&&b.dist!=null)return a.dist-b.dist;
    if(a.dist!=null)return -1;
    if(b.dist!=null)return 1;
    return (b.t.area===job.area?1:0)-(a.t.area===job.area?1:0);
  });
  const top=enriched.slice(0,6);
  $('#assignmentList').innerHTML=top.map((e,i)=>{
    const t=e.t, best=(i===0&&e.dist!=null);
    const sub=e.dist!=null
      ? `${e.dist.toFixed(1)} km away · ${e.online?'online now':'last seen '+(e.loc.location_at?fmtWhen(e.loc.location_at):'—')}`
      : (e.loc&&e.loc.area?`${e.loc.area} · no GPS yet`:'No GPS yet');
    return `<div class="assignment-item ${best?'recommended':''}"><span class="team-avatar" style="background:${t.color}">${t.short}</span><div><strong>${t.name}${best?'<span class="recommend">NEAREST</span>':''}</strong><p>${sub}</p></div><button class="assign-btn" data-team="${t.name}">Assign</button></div>`;
  }).join('');
  $$('[data-team]').forEach(b=>b.onclick=()=>assignTeam(jobId,b.dataset.team));
}
function assignTeam(jobId,team){const j=jobs.find(x=>x.id===jobId);const joVal=(($('#assignJONum')&&$('#assignJONum').value)||'').trim();if(joVal&&!j.job_order_no)j.job_order_no=joVal;j.team=team;j.status='assigned';j.load_date=manilaToday();j.dispatch_count=(j.dispatch_count||0)+1;j.history=appendHistory(j.history,`Dispatched to ${team} (#${j.dispatch_count})${j.job_order_no?' · JO '+j.job_order_no:''}`);save();closeModals();renderJobs();showToast(`${team} assigned to ${jobId}`);if(window.AHBASync)window.AHBASync(j)}
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

function switchPage(page){$$('.page').forEach(p=>p.classList.remove('active'));$(`#${page}Page`).classList.add('active');$$('.nav-item').forEach(n=>{const on=n.dataset.page===page;n.classList.toggle('active',on);on?n.setAttribute('aria-current','page'):n.removeAttribute('aria-current')});const labels={overview:'Good morning, Allec',dispatch:'Dispatch operations',teams:'Field team monitoring',workorders:'Subscriber work orders',expenses:'Expense monitoring',accounts:'Technician accounts',attendance:'Attendance · Time records',completed:'Completed jobs',validation:'Validator · New job orders',history:'Load history'};$('#pageTitle').textContent=labels[page];if(page==='accounts')renderAccounts();if(page==='attendance')renderAttendance();if(page==='completed')renderCompleted();if(page==='validation')renderValidation();if(page==='history')renderHistory();closeSidebar();scrollTo(0,0)}

// ---------- Validator (sales-agent job orders awaiting approval) ----------
let valJobs=[], valDocs={};
async function refreshValBadge(){
  try{
    const r=await fetch(`${SUPA_URL}/rest/v1/jobs?select=id&status=eq.for_validation`,{headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`}});
    const n=r.ok?(await r.json()).length:0; const b=$('#valBadge');
    if(b){ b.textContent=n; b.style.display=n?'':'none'; }
  }catch(e){}
}
async function renderValidation(){
  const body=$('#validationBody'); if(!body)return;
  body.innerHTML=`<tr><td colspan="7" class="empty-cell">Loading…</td></tr>`;
  try{
    const r=await fetch(`${SUPA_URL}/rest/v1/jobs?status=eq.for_validation&select=*&order=updated_at.asc`,{headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`}});
    valJobs=r.ok?await r.json():[];
  }catch(e){valJobs=[]}
  valDocs=await fetchDocsFor(valJobs.map(j=>j.id));
  await loadAgentNames();
  $('#valPending').textContent=valJobs.length;
  $('#valAgents').textContent=new Set(valJobs.map(j=>j.created_by).filter(Boolean)).size||'—';
  // approved/rejected today
  try{
    const today=manilaToday();
    const r2=await fetch(`${SUPA_URL}/rest/v1/jobs?select=status,validated_at,updated_at&or=(status.eq.pending,status.eq.rejected)`,{headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`}});
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
    const r=await fetch(`${SUPA_URL}/rest/v1/job_docs?select=job_id,category,path&job_id=in.(${q})`,{headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`}});
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
    await fetch(`${SUPA_URL}/rest/v1/jobs?id=eq.${encodeURIComponent(jobId)}`,{method:'PATCH',headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(body)});
    closeModals(); showToast(approve?`${jobId} approved → sent to dispatch`:`${jobId} rejected`); renderValidation();
  }catch(e){showToast('Action failed: '+e.message)}
}

// ---------- Accounts (technician login accounts) ----------
async function fetchTechnicians(){
  try{
    const r=await fetch(`${SUPA_URL}/rest/v1/technicians?select=*&order=username.asc`,{headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`}});
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
    const r=await fetch(`${SUPA_URL}/functions/v1/admin-reset`,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`},body:JSON.stringify({username,new_password:np,admin_secret:sec})});
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
    const r=await fetch(`${SUPA_URL}/rest/v1/attendance?select=*&work_date=eq.${date}&order=time_in.desc`,{headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`}});
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
}

// ---------- Completed jobs · proof photos · validation · export ----------
const photoBase = p => `${SUPA_URL}/storage/v1/object/public/job-photos/${p}`;
let compJobs=[], compPhotos={};
async function fetchCompleted(date){
  try{
    const r=await fetch(`${SUPA_URL}/rest/v1/jobs?status=eq.completed&select=*&order=updated_at.desc`,{headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`}});
    const all=r.ok?await r.json():[];
    return all.filter(j=>j.updated_at && new Date(j.updated_at).toLocaleDateString('en-CA',{timeZone:TZ})===date);
  }catch(e){return[]}
}
async function fetchPhotosFor(ids){
  if(!ids.length)return{};
  try{
    const q=ids.map(encodeURIComponent).join(',');
    const r=await fetch(`${SUPA_URL}/rest/v1/job_photos?select=job_id,path&job_id=in.(${q})`,{headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`}});
    const rows=r.ok?await r.json():[]; const m={}; rows.forEach(x=>{(m[x.job_id]=m[x.job_id]||[]).push(x.path)}); return m;
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
  $('#photoGrid').innerHTML=paths.length?paths.map((p,i)=>`<a class="ph" href="${photoBase(p)}" target="_blank" rel="noopener" title="Photo ${i+1} — open in new window"><img src="${photoBase(p)}" alt="proof ${i+1}" loading="lazy"></a>`).join(''):'<div class="none">No photos uploaded for this job.</div>';
  $$('#photoGrid .ph').forEach(a=>a.onclick=e=>{e.preventDefault();window.open(a.href,'_blank','noopener,noreferrer');});
  const vb=$('#validateBtn'); vb.style.display=j.validated?'none':''; vb.onclick=()=>{validateJob(jobId);closeModals();};
  openModal($('#photoModal'));
}
async function validateJob(jobId){
  try{
    await fetch(`${SUPA_URL}/rest/v1/jobs?id=eq.${encodeURIComponent(jobId)}`,{method:'PATCH',headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({validated:true,validated_at:new Date().toISOString()})});
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
    for(let i=0;i<paths.length;i++){
      try{ const blob=await (await fetch(photoBase(paths[i]))).blob(); folder.file(`${name}_${String(i+1).padStart(2,'0')}.jpg`, blob); }
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
  const allPaths=compJobs.flatMap(j=>compPhotos[j.id]||[]);
  if(!allPaths.length){showToast('No photos to clear');return}
  if(!confirm(`Delete ${allPaths.length} photo(s) from the cloud for ${date}?\n\nDownload the ZIP archive FIRST. Job records are kept — only the images are removed. This cannot be undone.`))return;
  showToast('Clearing photos from cloud…');
  try{
    for(let i=0;i<allPaths.length;i+=100){
      await fetch(`${SUPA_URL}/storage/v1/object/job-photos`,{method:'DELETE',headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({prefixes:allPaths.slice(i,i+100)})});
    }
    const q=compJobs.map(j=>encodeURIComponent(j.id)).join(',');
    await fetch(`${SUPA_URL}/rest/v1/job_photos?job_id=in.(${q})`,{method:'DELETE',headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`,Prefer:'return=minimal'}});
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
  let all=[]; try{ const r=await fetch(`${SUPA_URL}/rest/v1/jobs?select=*&order=updated_at.desc`,{headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`}}); all=r.ok?await r.json():[]; }catch(e){}
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

function init(){
  injectIcons();const d=new Date();$('#todayLabel').textContent=d.toLocaleDateString('en-PH',{timeZone:TZ,weekday:'short',month:'short',day:'numeric'});$$('input[type=date]').forEach(i=>i.value=manilaToday());
  $('#expenseTeam').innerHTML=teams.map(t=>`<option>${t.name}</option>`).join('');
  if($('#orderTeam'))$('#orderTeam').innerHTML='<option value="">— Unassigned —</option>'+teams.map(t=>`<option>${t.name}</option>`).join('');
  renderOverview();renderTeams();renderNotifPop();

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
  $('#orderForm').onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));
    const full=[f.first_name,f.middle_name,f.last_name].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
    const addr=[f.house_no,f.street_name,f.village,f.brgy,f.city].filter(Boolean).join(', ');
    const num=2050+jobs.length;
    const job={id:`WO-2026-${num}`,subscriber:full||'Subscriber',type:f.type,plan:f.plan,area:f.city||f.brgy||'Quezon City',address:addr,status:f.team?'assigned':'pending',wait:'Just now',priority:f.priority,schedule:`${f.date}, 9:00 AM`,team:f.team||null,load_date:manilaToday()};
    SUB_FIELDS.forEach(k=>{ if(f[k]) job[k]=f[k]; });
    jobs.unshift(job);save();if(window.AHBASync)window.AHBASync(job);e.target.reset();$$('input[type=date]').forEach(i=>i.value=manilaToday());closeModals();renderOverview();showToast('Work order created and added to dispatch queue')};
  $('#expenseForm').onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));
    fetch(`${SUPA_URL}/rest/v1/expenses`,{method:'POST',headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({team:f.team,category:f.category,description:f.description,amount:Number(f.amount),job_id:f.workOrder||null,status:'Pending',work_date:manilaToday()})}).then(()=>setTimeout(renderExpenses,400)).catch(()=>{});
    e.target.reset();closeModals();showToast('Expense recorded for approval')};

  // Search + filters
  $('#teamSearch').oninput=e=>renderTeams(e.target.value);
  $('#jobSearch').oninput=applyJobTableFilter;
  $$('#jobFilters button').forEach(b=>b.onclick=()=>{$$('#jobFilters button').forEach(x=>x.classList.remove('active'));b.classList.add('active');applyJobTableFilter()});

  $('#autoAssignBtn').onclick=()=>{const pending=jobs.find(j=>j.status==='pending');pending?openAssign(pending.id):showToast('No unassigned jobs in the queue')};

  // Completed view: export + clear
  $('#exportBtn')?.addEventListener('click',exportZip);
  $('#clearBtn')?.addEventListener('click',clearCloud);
  $('#histExport')?.addEventListener('click',exportHistoryExcel);

  // Validator badge (count of pending sales-agent submissions)
  refreshValBadge(); setInterval(refreshValBadge,30000);

  // Superadmin password reset
  $('#resetNow')?.addEventListener('click',resetNow);
}
document.addEventListener('DOMContentLoaded',init);
