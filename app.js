const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const money = n => `₱${Number(n).toLocaleString('en-PH')}`;

const icons = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  route:'<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M6 16V9a4 4 0 0 1 4-4h5"/>',users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  clipboard:'<path d="M9 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h6"/>',wallet:'<path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6"/><path d="M16 13h4"/>',chevron:'<path d="m9 18 6-6-6-6"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',plus:'<path d="M12 5v14M5 12h14"/>',check:'<path d="m20 6-11 11-5-5"/>',truck:'<path d="M10 17h4V5H2v12h3M14 9h4l4 4v4h-3M8 17a3 3 0 1 1-6 0M22 17a3 3 0 1 1-6 0"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',expand:'<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',close:'<path d="m18 6-12 12M6 6l12 12"/>',search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',spark:'<path d="m12 3-1.5 4.5L6 9l4.5 1.5L12 15l1.5-4.5L18 9l-4.5-1.5L12 3ZM5 16l-.8 2.2L2 19l2.2.8L5 22l.8-2.2L8 19l-2.2-.8L5 16Z"/>',pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',wrench:'<path d="M14.7 6.3a4 4 0 0 0-5-5L7 4l3 3 2.7-2.7a4 4 0 0 0 2 5L5 19l-2 2 2 2 2-2 9.7-9.7a4 4 0 0 0 5-5L19 9l-3-3 2.7-2.7Z"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
};
function injectIcons(){ $$('[data-icon]').forEach(el=>{const name=el.dataset.icon;el.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name]||icons.info}</svg>`}) }

const names=['North Star','Fiber Force','Signal Pro','Sky Link','Quick Connect','Metro Tech','Cable Crew','Blue Wave','Fast Track','Prime Line','Urban Link','Net Masters','Service One','Tech Titans','Rapid Repair','City Connect','Wire Works','Field Fox','Core Team','Alpha Install'];
const areas=['Quezon City','Manila','Makati','Pasig','Taguig','Caloocan','Parañaque','Mandaluyong','San Juan','Marikina'];
const statuses=['on-site','en-route','on-site','available','en-route','on-site','en-route','available','on-site','en-route','on-site','offline','en-route','on-site','available','en-route','on-site','offline','available','en-route'];
const colors=['#1a9d79','#4086e8','#9a6edb','#ee8564','#16a0ad','#e3a23c'];
const teams=names.map((name,i)=>({id:i+1,name,code:`T-${String(i+1).padStart(2,'0')}`,status:statuses[i],area:areas[i%areas.length],jobs: i%4+1,completed: Math.max(0,(i*3)%7),rating:(4.6+(i%4)*.1).toFixed(1),x:8+((i*37)%84),y:12+((i*29)%72),color:colors[i%colors.length],members:2+(i%2)}));

let jobs=JSON.parse(localStorage.getItem('fieldflow_jobs')||'null')||[
 {id:'WO-2026-1048',subscriber:'Maria Santos',type:'Installation',plan:'Fiber Unli 400 Mbps',area:'Quezon City',address:'Project 4, Quezon City',status:'pending',wait:'42 min',priority:'Urgent',schedule:'Today, 10:00 AM',team:null},
 {id:'WO-2026-1047',subscriber:'Carlo Reyes',type:'Repair',plan:'Service Repair',area:'Makati',address:'Poblacion, Makati',status:'pending',wait:'35 min',priority:'Normal',schedule:'Today, 10:30 AM',team:null},
 {id:'WO-2026-1046',subscriber:'Anne Lim',type:'Installation',plan:'Fiber Unli 200 Mbps',area:'Manila',address:'Sampaloc, Manila',status:'assigned',wait:'28 min',priority:'Normal',schedule:'Today, 11:00 AM',team:'North Star'},
 {id:'WO-2026-1045',subscriber:'Roberto Cruz',type:'Repair',plan:'Service Repair',area:'Pasig',address:'Kapitolyo, Pasig',status:'en-route',wait:'18 min',priority:'VIP',schedule:'Today, 9:45 AM',team:'Fiber Force'},
 {id:'WO-2026-1044',subscriber:'Liza Mendoza',type:'Installation',plan:'Cable + Internet Bundle',area:'Taguig',address:'Pinagsama, Taguig',status:'on-site',wait:'12 min',priority:'Normal',schedule:'Today, 9:00 AM',team:'Signal Pro'},
 {id:'WO-2026-1043',subscriber:'David Ong',type:'Installation',plan:'Fiber Unli 600 Mbps',area:'Caloocan',address:'Grace Park, Caloocan',status:'completed',wait:'—',priority:'Normal',schedule:'Today, 8:00 AM',team:'Metro Tech'},
 {id:'WO-2026-1042',subscriber:'Grace Tan',type:'Repair',plan:'Service Repair',area:'Marikina',address:'Concepcion, Marikina',status:'in-progress',wait:'—',priority:'Urgent',schedule:'Today, 8:30 AM',team:'Cable Crew'},
 {id:'WO-2026-1041',subscriber:'Marco Diaz',type:'Installation',plan:'Fiber Unli 400 Mbps',area:'Parañaque',address:'BF Homes, Parañaque',status:'completed',wait:'—',priority:'Normal',schedule:'Today, 7:30 AM',team:'Blue Wave'}
];
let expenses=JSON.parse(localStorage.getItem('fieldflow_expenses')||'null')||[
 {time:'9:42 AM',team:'North Star',category:'Fuel',description:'Diesel refill',workOrder:'—',amount:1850,status:'Approved'},
 {time:'9:18 AM',team:'Signal Pro',category:'Materials',description:'Fiber drop cable, 150m',workOrder:'WO-2026-1044',amount:3200,status:'Approved'},
 {time:'8:55 AM',team:'Fiber Force',category:'Toll & Parking',description:'Skyway toll',workOrder:'WO-2026-1045',amount:520,status:'Approved'},
 {time:'8:30 AM',team:'Cable Crew',category:'Materials',description:'Connectors and splitter',workOrder:'WO-2026-1042',amount:1480,status:'Pending'},
 {time:'8:05 AM',team:'Metro Tech',category:'Fuel',description:'Gasoline refill',workOrder:'—',amount:2100,status:'Approved'},
 {time:'7:50 AM',team:'Blue Wave',category:'Meals',description:'Team breakfast allowance',workOrder:'—',amount:600,status:'Approved'},
 {time:'7:32 AM',team:'Quick Connect',category:'Fuel',description:'Diesel refill',workOrder:'—',amount:1750,status:'Approved'},
 {time:'7:18 AM',team:'Prime Line',category:'Other',description:'Emergency tool replacement',workOrder:'—',amount:2950,status:'Pending'},
 {time:'7:05 AM',team:'Urban Link',category:'Materials',description:'Modem replacement stock',workOrder:'WO-2026-1039',amount:4000,status:'Approved'}
];
const activity=[
 {icon:'check',tone:'',title:'Installation completed',text:'<b>Metro Tech</b> completed WO-2026-1043',time:'2m'},
 {icon:'truck',tone:'blue',title:'Team is en route',text:'<b>Fiber Force</b> heading to Poblacion, Makati',time:'6m'},
 {icon:'wallet',tone:'coral',title:'Expense submitted',text:'<b>Signal Pro</b> logged ₱3,200 materials',time:'12m'},
 {icon:'pin',tone:'',title:'Team arrived on site',text:'<b>Cable Crew</b> checked in at Marikina',time:'18m'},
 {icon:'wrench',tone:'blue',title:'Repair started',text:'<b>North Star</b> began line diagnostics',time:'24m'},
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
  $('#teamAvatars').innerHTML=teams.slice(0,6).map((t,i)=>`<span style="background:${t.color}">${t.code.slice(2)}</span>`).join('');
  $('#completionBars').innerHTML=[16,24,20,31,26,36,29].map(h=>`<span style="height:${h}px"></span>`).join('');
  renderMapPins();
  $('#activityList').innerHTML=activity.map(a=>`<div class="activity-item"><span class="activity-icon ${a.tone}" data-icon="${a.icon}"></span><div class="activity-copy"><strong>${a.title}</strong><p>${a.text}</p></div><time>${a.time}</time></div>`).join('');
  injectIcons();
  renderExpenses();renderJobs();
}
function renderMapPins(){
  const list=teams.filter(t=>t.status!=='offline').filter(t=>mapFilter==='all'||t.status!=='available');
  $('#mapPins').innerHTML=list.map(t=>`<button class="team-pin ${t.status}" style="left:${t.x}%;top:${t.y}%" aria-label="${t.name}, ${statusLabel(t.status)}"><span class="pin-tooltip"><b>${t.name}</b> · ${t.area}</span><span class="pin-dot"><span>${t.id}</span></span></button>`).join('');
}
function renderJobs(){
  const pending=jobs.filter(j=>j.status==='pending');
  $('#pendingBadge').textContent=pending.length;
  $('#queueBody').innerHTML=pending.slice(0,4).map(j=>`<tr><td><strong>${j.id}</strong><span>${j.priority}</span></td><td><strong>${j.subscriber}</strong></td><td>${j.type}</td><td>${j.area}</td><td><span class="status pending">${j.wait}</span></td><td><button class="assign-btn" data-assign="${j.id}">Assign</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty-cell">No jobs waiting for dispatch.</td></tr>';
  $('#workOrderBody').innerHTML=jobs.map(j=>`<tr data-type="${j.type.toLowerCase()}" data-status="${j.status}" data-text="${(j.id+' '+j.subscriber+' '+j.area).toLowerCase()}"><td><strong>${j.id}</strong><span>${j.priority}</span></td><td><strong>${j.subscriber}</strong><span>${j.plan}</span></td><td>${j.type}</td><td>${j.area}</td><td>${j.team||'—'}</td><td><span class="status ${j.status}">${statusLabel(j.status)}</span></td><td>${j.schedule}</td></tr>`).join('');
  const stages=[['pending','Unassigned'],['assigned','Assigned'],['en-route','En route'],['on-site,in-progress','On site']];
  $('#dispatchBoard').innerHTML=stages.map(([keys,label])=>{const list=jobs.filter(j=>keys.split(',').includes(j.status));return `<div class="board-column"><div class="column-head"><strong>${label}</strong><span>${list.length}</span></div>${list.map(jobCard).join('')||'<div class="job-card empty"><p>No jobs in this stage.</p></div>'}</div>`}).join('');
  const counts=[['Waiting',pending.length],['Assigned',jobs.filter(j=>j.status==='assigned').length],['On the road',jobs.filter(j=>j.status==='en-route').length],['In service',jobs.filter(j=>['on-site','in-progress'].includes(j.status)).length]];
  $('#dispatchStats').innerHTML=counts.map(([l,n])=>`<div class="small-stat"><span>${l}</span><strong>${n}</strong></div>`).join('');
  bindAssignButtons();
  applyJobTableFilter();
}
function jobCard(j){return `<article class="job-card"><div class="job-top"><span class="job-id">${j.id}</span>${j.priority!=='Normal'?`<span class="priority">${j.priority}</span>`:''}</div><h3>${j.subscriber}</h3><p>${j.type} · ${j.plan}</p><div class="job-meta"><span>⌖ ${j.area}</span><span>${j.schedule.replace('Today, ','')}</span></div>${j.status==='pending'?`<div class="job-actions"><button class="assign-btn" data-assign="${j.id}">Assign team</button></div>`:`<div class="job-actions"><span class="status ${j.status}">${j.team||statusLabel(j.status)}</span></div>`}</article>`}
function renderTeams(filter=''){$('#teamGrid').innerHTML=teams.filter(t=>(t.name+t.area+t.code).toLowerCase().includes(filter.toLowerCase())).map(t=>`<article class="team-card"><div class="team-card-head"><span class="team-avatar" style="background:${t.color}">${t.code.slice(2)}</span><div><h3>${t.name}</h3><p>${t.code} · ${t.members} technicians</p></div></div><span class="status ${t.status}">${statusLabel(t.status)}</span><div class="load-row"><span>Today’s load</span><b>${t.jobs} / 5 jobs</b></div><div class="load-bar"><span style="width:${t.jobs/5*100}%"></span></div><div class="team-info"><span>Current area<strong>${t.area}</strong></span><span>Completed<strong>${t.completed} jobs · ★ ${t.rating}</strong></span></div></article>`).join('')||'<div class="empty-row">No teams match your search.</div>'}
function renderExpenses(){
  const total=todayTotal(),pct=Math.round(total/25000*100);$('#todayExpense').textContent=money(total);$('#budgetPercent').textContent=`${pct}% of ₱25,000`;$('#budgetBar').style.width=`${Math.min(pct,100)}%`;$('#donutTotal').textContent=`₱${(total/1000).toFixed(1)}k`;
  const cats=['Fuel','Materials','Meals','Toll & Parking','Other'], cols=['#18a57b','#ff765f','#e9a93d','#4285f4','#b0bab7'];
  const values=cats.map(c=>expenses.filter(e=>e.category===c).reduce((a,b)=>a+Number(b.amount),0));
  let acc=0;const stops=values.map((v,i)=>{const start=acc;acc+=v/total*100;return `${cols[i]} ${start}% ${acc}%`}).join(',');$('#expenseDonut').style.background=`conic-gradient(${stops})`;
  $('#expenseLegend').innerHTML=cats.map((c,i)=>`<div class="legend-row"><i style="background:${cols[i]}"></i><span>${c}</span><b>${money(values[i])}</b></div>`).join('');
  $('#categoryList').innerHTML=cats.map((c,i)=>`<div class="category-row"><div class="category-top"><span>${c}</span><b>${money(values[i])}</b></div><div class="category-bar"><span style="width:${values[i]/Math.max(...values)*100}%;background:${cols[i]}"></span></div></div>`).join('');
  $('#expenseBody').innerHTML=expenses.map(e=>`<tr><td>${e.time}</td><td><strong>${e.team}</strong></td><td>${e.category}</td><td>${e.description}</td><td>${e.workOrder}</td><td><strong>${money(e.amount)}</strong></td><td><span class="status ${e.status==='Approved'?'completed':'pending'}">${e.status}</span></td></tr>`).join('');
  $('#expenseSummary').innerHTML=[['Today’s spend',money(total)],['Remaining budget',money(Math.max(0,25000-total))],['Cost / completed job',money(Math.round(total/24))],['Pending approval',money(expenses.filter(e=>e.status==='Pending').reduce((a,b)=>a+b.amount,0))]].map(([l,v])=>`<div class="small-stat"><span>${l}</span><strong>${v}</strong></div>`).join('');
  const week=[14200,19800,17650,22100,15800,20400,total],days=['Thu','Fri','Sat','Sun','Mon','Tue','Today'];$('#weeklyChart').innerHTML=week.map((v,i)=>`<div class="bar-col ${i===6?'today':''}"><span style="height:${v/26000*100}%" title="${money(v)}"></span><b>${days[i]}</b></div>`).join('');
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

function openAssign(jobId){
  const job=jobs.find(j=>j.id===jobId);$('#assignJobLabel').textContent=`${job.id} · ${job.subscriber} · ${job.area}`;$('#assignModal').dataset.job=jobId;
  const candidates=teams.filter(t=>t.status!=='offline').sort((a,b)=>(a.status==='available'?-2:0)+(a.area===job.area?-1:0)-((b.status==='available'?-2:0)+(b.area===job.area?-1:0))).slice(0,6);
  $('#assignmentList').innerHTML=candidates.map((t,i)=>`<div class="assignment-item ${i===0?'recommended':''}"><span class="team-avatar" style="background:${t.color}">${t.code.slice(2)}</span><div><strong>${t.name}${i===0?'<span class="recommend">BEST MATCH</span>':''}</strong><p>${t.area} · ${t.jobs}/5 jobs · ${statusLabel(t.status)}</p></div><button class="assign-btn" data-team="${t.name}">Assign</button></div>`).join('');
  $$('[data-team]').forEach(b=>b.onclick=()=>assignTeam(jobId,b.dataset.team));openModal($('#assignModal'));
}
function assignTeam(jobId,team){const j=jobs.find(x=>x.id===jobId);j.team=team;j.status='assigned';save();closeModals();renderJobs();showToast(`${team} assigned to ${jobId}`)}
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

function switchPage(page){$$('.page').forEach(p=>p.classList.remove('active'));$(`#${page}Page`).classList.add('active');$$('.nav-item').forEach(n=>{const on=n.dataset.page===page;n.classList.toggle('active',on);on?n.setAttribute('aria-current','page'):n.removeAttribute('aria-current')});const labels={overview:'Good morning, Alex',dispatch:'Dispatch operations',teams:'Field team monitoring',workorders:'Subscriber work orders',expenses:'Expense monitoring'};$('#pageTitle').textContent=labels[page];closeSidebar();scrollTo(0,0)}

function init(){
  injectIcons();const d=new Date();$('#todayLabel').textContent=d.toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric'});$$('input[type=date]').forEach(i=>i.value=d.toISOString().slice(0,10));
  $('#expenseTeam').innerHTML=teams.map(t=>`<option>${t.name}</option>`).join('');renderOverview();renderTeams();renderNotifPop();

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
  $$('.map-actions [data-seg]').forEach(b=>b.onclick=()=>{$$('.map-actions [data-seg]').forEach(x=>x.classList.remove('active'));b.classList.add('active');mapFilter=b.dataset.seg;renderMapPins()});
  let mapScale=1;const canvas=$('#mapCanvas'),art=$('#mapPins');
  const applyScale=()=>{const s=Math.max(1,Math.min(2,mapScale));$('.map-art').style.transform=`scale(${s})`;art.style.transform=`scale(${s})`};
  $('#mapZoomIn').onclick=()=>{mapScale=Math.min(2,mapScale+.2);applyScale()};
  $('#mapZoomOut').onclick=()=>{mapScale=Math.max(1,mapScale-.2);applyScale()};
  $('#mapExpandBtn').onclick=()=>$('.map-panel').classList.toggle('expanded');

  // Forms
  $('#orderForm').onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const num=1050+jobs.length;jobs.unshift({id:`WO-2026-${num}`,subscriber:f.subscriber,type:f.type,plan:f.plan,area:f.area,address:f.address,status:'pending',wait:'Just now',priority:f.priority,schedule:`${f.date}, 9:00 AM`,team:null});save();e.target.reset();$$('input[type=date]').forEach(i=>i.value=new Date().toISOString().slice(0,10));closeModals();renderOverview();showToast('Work order created and added to dispatch queue')};
  $('#expenseForm').onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));expenses.unshift({time:new Date().toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit'}),team:f.team,category:f.category,description:f.description,workOrder:f.workOrder||'—',amount:Number(f.amount),status:'Pending'});save();e.target.reset();closeModals();renderExpenses();showToast('Expense recorded for approval')};

  // Search + filters
  $('#teamSearch').oninput=e=>renderTeams(e.target.value);
  $('#jobSearch').oninput=applyJobTableFilter;
  $$('#jobFilters button').forEach(b=>b.onclick=()=>{$$('#jobFilters button').forEach(x=>x.classList.remove('active'));b.classList.add('active');applyJobTableFilter()});

  $('#autoAssignBtn').onclick=()=>{const pending=jobs.find(j=>j.status==='pending');pending?openAssign(pending.id):showToast('No unassigned jobs in the queue')};
}
document.addEventListener('DOMContentLoaded',init);
