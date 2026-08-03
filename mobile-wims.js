// ============================================================================
// WIMS — technician material report, shown INLINE in the job close-out card.
// Visible ONLY for enrolled technicians (wims.profiles via my_access RPC).
// Fully OPTIONAL and guarded: never blocks the normal FieldOps flow.
// Shares scope with mobile-a.js / mobile-b.js (classic scripts): sb, toast,
// photoCount reachable as free variables.
//   render()          -> window.wimsMountAll()   (populate inline slots)
//   confirmComplete() -> window.wimsSubmit(id,job) (file complete_install)
// ============================================================================
(function(){
  "use strict";
  function say(m){ try{ if(typeof toast==='function') toast(m); }catch(e){} }
  function W(){ try{ return sb; }catch(e){ return (window.sb||null); } }

  var access=null, accLoaded=false, cpeCache=null, wState={};
  var MATS=[['foc','FOC (m)'],['clip5','Clip 5mm'],['clip7','Clip 7mm'],['tie','Cable Tie'],['dtape','D-Tape (in)'],['etape','E-Tape (in)']];
  // standard kit BOM — key, label, default qty (1 full kit). Editable per install.
  var KIT=[['conn','Fast Connector · SC/APC',2],['patch','Patch Cord · SC/APC 1.5m',1],['tbox','Terminal Box · FTTH',1],['f17','F-17 · anchor clamp',5],['f20','F-20 · mid-span hook',1],['f19','F-19 · house bracket',1]];
  function defaultKit(){ var o={}; KIT.forEach(function(k){ o[k[0]]=k[2]; }); return o; }

  async function ensureAccess(){
    if(accLoaded) return access;
    accLoaded=true;
    try{ var r=await W().schema('wims').rpc('my_access'); access=(r&&r.data&&r.data[0])||null; }
    catch(e){ access=null; }
    return access;
  }
  async function loadCpe(){
    if(cpeCache) return cpeCache;
    try{ var r=await W().schema('wims').from('cpe').select('serial,category').eq('status','issued').order('serial'); cpeCache=(r&&r.data)||[]; }
    catch(e){ cpeCache=[]; }
    return cpeCache;
  }
  function st(id){ return wState[id]||(wState[id]={modem:'',iptv:[],kit:defaultKit(),mats:{}}); }
  // IPTV options for one slot: hide serials already chosen in the OTHER slots (no duplicates)
  function iptvOptions(all, taken, mine){
    return '<option value="">— none —</option>'+all.filter(function(u){ return u.serial===mine || taken.indexOf(u.serial)<0; })
      .map(function(u){ return '<option value="'+u.serial+'"'+(mine===u.serial?' selected':'')+'>'+u.serial+'</option>'; }).join('');
  }
  function mountIptv(jid){
    var wrap=document.querySelector('.wiptv-wrap[data-j="'+jid+'"]'); if(!wrap) return;
    var s=st(jid), n=parseInt(wrap.getAttribute('data-n'),10)||0;
    var list=(cpeCache||[]).filter(function(u){ return u.category==='iptv'; });
    var html='';
    for(var i=0;i<n;i++){
      var mine=(s.iptv&&s.iptv[i])||'';
      var taken=(s.iptv||[]).filter(function(x,idx){ return idx!==i && x; });
      html+='<div class="field" style="margin-bottom:6px"><select data-wf="iptv" data-idx="'+i+'" data-j="'+jid+'">'+iptvOptions(list,taken,mine)+'</select></div>';
    }
    wrap.innerHTML=html;
  }

  // Called at the end of render(): fill any inline WIMS slots (enrolled techs only).
  window.wimsMountAll = async function(){
    var slots=document.querySelectorAll('.wims-slot[data-wjob]'); if(!slots.length) return;
    var acc=await ensureAccess();
    if(!acc){ slots.forEach(function(s){ s.innerHTML=''; }); return; }   // not enrolled → invisible
    var cpe=await loadCpe();
    var modems=cpe.filter(function(u){return u.category==='modem';});
    var iptv=cpe.filter(function(u){return u.category==='iptv';});
    var opt=function(list,sel){ return '<option value="">— none —</option>'+list.map(function(u){return '<option value="'+u.serial+'"'+(sel===u.serial?' selected':'')+'>'+u.serial+'</option>';}).join(''); };
    slots.forEach(function(slot){
      if(slot.getAttribute('data-mounted')==='1' && slot.innerHTML) return; // keep user input across re-renders
      var jid=slot.getAttribute('data-wjob'); var s=st(jid);
      var iptvn = parseInt(slot.getAttribute('data-iptvn'),10)||0;  // # of IPTV from the JO (2-PLAY add-ons); 0 = 1-PLAY
      var is2 = iptvn>0;
      if(!Array.isArray(s.iptv)) s.iptv=[];
      if(!is2) s.iptv=[];
      slot.setAttribute('data-mounted','1');
      var iptvBlock;
      if(is2){
        iptvBlock = '<div style="font-weight:700;font-size:11px;color:#4a5c56;margin:2px 0 4px">Installed IPTV box'+(iptvn>1?'es · '+iptvn+' add-ons sa JO':'')+'</div><div class="wiptv-wrap" data-j="'+jid+'" data-n="'+iptvn+'"></div>';
      } else {
        iptvBlock = '<div style="font-size:11px;color:#8a9a94;margin:2px 0 8px">📶 1-PLAY · internet only — walang IPTV para sa JO na ito</div>';
      }
      var kitRows = KIT.map(function(k){ var q=(s.kit&&s.kit[k[0]]!=null)?s.kit[k[0]]:k[2]; return '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid #eef4f1"><span style="flex:1;font-size:11px;color:#4a5c56">'+k[1]+'</span><input type="number" inputmode="numeric" min="0" value="'+q+'" data-wf="kitq" data-kk="'+k[0]+'" data-j="'+jid+'" style="width:54px;padding:5px;text-align:center"></div>'; }).join('');
      slot.innerHTML=
        '<div style="border:1.5px solid #bfe6d5;background:#f6fcf9;border-radius:14px;padding:12px;margin-top:10px">'+
          '<div style="font-weight:800;font-size:12px;color:#0e6f52;margin-bottom:8px">📦 WIMS material report <span style="font-weight:600;color:#8a9a94">· optional · '+(is2?'2-PLAY':'1-PLAY')+'</span></div>'+
          '<div class="field"><label>Installed MODEM</label><select data-wf="modem" data-j="'+jid+'">'+opt(modems,s.modem)+'</select></div>'+
          iptvBlock+
          '<div style="font-weight:700;font-size:11px;color:#4a5c56;margin:8px 0 2px">🧰 Standard kit used <span style="font-weight:600;color:#8a9a94">· i-edit kung hindi buong kit ang nagamit</span></div>'+
          '<div style="margin-bottom:10px">'+kitRows+'</div>'+
          '<div style="font-size:11px;font-weight:700;color:#4a5c56;margin:0 0 4px">Drop materials used</div>'+
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">'+MATS.map(function(m){return '<div class="field" style="margin:0"><label style="font-size:10px">'+m[1]+'</label><input type="number" inputmode="numeric" min="0" value="'+(s.mats[m[0]]||0)+'" data-wf="mat" data-mk="'+m[0]+'" data-j="'+jid+'" style="padding:6px"></div>';}).join('')+'</div>'+
          '<div style="font-size:10px;color:#9aa6a2;margin-top:6px">Only CPE issued to your team'+(acc.team_code?(' ('+acc.team_code+')'):'')+' appears here. Optional — you can complete the job without it.</div>'+
        '</div>';
      if(is2) mountIptv(jid);
    });
  };

  // keep selections in wState so re-renders never lose them
  document.addEventListener('change', function(e){
    var el=e.target.closest('[data-wf]'); if(!el) return;
    var jid=el.getAttribute('data-j'), f=el.getAttribute('data-wf'), s=st(jid);
    if(f==='modem') s.modem=el.value;
    else if(f==='iptv'){ if(!Array.isArray(s.iptv)) s.iptv=[]; s.iptv[parseInt(el.getAttribute('data-idx'),10)||0]=el.value; mountIptv(jid); }
    else if(f==='kitq'){ if(!s.kit||typeof s.kit!=='object') s.kit={}; s.kit[el.getAttribute('data-kk')]=parseFloat(el.value)||0; }
    else if(f==='mat') s.mats[el.getAttribute('data-mk')]=parseFloat(el.value)||0;
  });

  // Called from confirmComplete AFTER the job is saved. Optional; reads wState.
  window.wimsSubmit = async function(jobId, job){
    try{
      var acc=await ensureAccess(); if(!acc) return;
      var s=wState[jobId]; if(!s || !s.modem) return;   // nothing reported → skip
      var mats={}; Object.keys(s.mats||{}).forEach(function(k){ if(s.mats[k]>0) mats[k]=s.mats[k]; });
      var photos=0; try{ if(typeof photoCount==='function') photos=photoCount(jobId); }catch(e){}
      var wa=''; try{ wa=(typeof shiftAccount!=='undefined'?shiftAccount:'')||''; }catch(e){ wa=''; }
      var r=await W().schema('wims').rpc('complete_install',{
        p_jo: (job&&job.job_order_no)||jobId,
        p_subscriber: (job&&job.subscriber)||'',
        p_account: (job&&(job.ibass_acct_no||job.account_no||job.account))||'',
        p_work_account: wa,
        p_modem_serial: s.modem,
        p_iptv_serials: (function(){ var a=Array.isArray(s.iptv)?s.iptv:[]; var seen={},out=[]; a.forEach(function(x){ if(x&&!seen[x]){seen[x]=1;out.push(x);} }); return out; })(),
        p_kit: (s.kit&&typeof s.kit==='object'?s.kit:{}),
        p_materials: mats,
        p_photos: photos
      });
      if(r&&r.error) throw r.error;
      cpeCache=null;   // installed CPE leaves the issued pool
      say('📦 WIMS material report filed');
    }catch(e){ say('WIMS not saved: '+(e.message||e)); try{console.warn('wimsSubmit',e);}catch(_){ } }
  };
})();
