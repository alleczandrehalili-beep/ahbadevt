// ============================================================================
// WIMS — technician material report, infused into the mobile close-out.
// Shows ONLY for enrolled technicians (wims.profiles via my_access RPC).
// Fully OPTIONAL: the job can be completed without it. Everything here is
// guarded so a WIMS failure can never block the normal FieldOps flow.
// Shares scope with mobile-a.js / mobile-b.js (classic scripts): sb, myTeam,
// photoCount, toast are reachable as free variables.
// ============================================================================
(function(){
  "use strict";
  var qs=function(s){return document.querySelector(s);};
  function say(m){ try{ if(typeof toast==='function') toast(m); }catch(e){} }
  function w(){ try{ return sb; }catch(e){ return (window.sb||null); } }

  var access=null, loaded=false, wState={};
  var MATS=[['foc','FOC (m)'],['clip5','Clip 5mm'],['clip7','Clip 7mm'],['tie','Cable Tie'],['dtape','D-Tape (in)'],['etape','E-Tape (in)']];

  async function ensureAccess(){
    if(loaded) return access;
    loaded=true;
    try{ var r=await w().schema('wims').rpc('my_access'); access=(r&&r.data&&r.data[0])?r.data[0]:null; }
    catch(e){ access=null; }
    return access;
  }

  function matInput(k,label){ return '<div class="field" style="margin:0"><label style="font-size:10px">'+label+'</label><input id="wm_'+k+'" type="number" inputmode="numeric" value="0" min="0" style="padding:6px"></div>'; }

  // Called from openComplete(jobId): render the (optional) WIMS block, only if enrolled.
  window.wimsRenderInto = async function(jobId){
    var block=qs('#wimsBlock'); if(!block) return;
    var acc=await ensureAccess();
    if(!acc){ block.classList.add('hidden'); block.innerHTML=''; return; }   // not enrolled → invisible
    block.classList.remove('hidden');
    block.innerHTML='<div style="font-weight:800;font-size:12px;color:#0e6f52;margin-bottom:6px">📦 WIMS material report <span style="font-weight:600;color:#8a9a94">· optional</span></div><div style="font-size:11px;color:#8a9a94">Loading issued CPE…</div>';
    try{
      var res=await w().schema('wims').from('cpe').select('serial,model,category').eq('status','issued').order('serial');
      var cpe=(res&&res.data)||[];
      var modems=cpe.filter(function(u){return u.category==='modem';});
      var iptv=cpe.filter(function(u){return u.category==='iptv';});
      var st=wState[jobId]=wState[jobId]||{};
      var opt=function(list){return '<option value="">— none —</option>'+list.map(function(u){return '<option value="'+u.serial+'">'+u.serial+'</option>';}).join('');};
      block.innerHTML=
        '<div style="font-weight:800;font-size:12px;color:#0e6f52;margin-bottom:8px">📦 WIMS material report <span style="font-weight:600;color:#8a9a94">· optional</span></div>'+
        '<div class="field"><label>Installed MODEM</label><select id="wModem">'+opt(modems)+'</select></div>'+
        '<div class="field"><label>IPTV box</label><select id="wIptv">'+opt(iptv)+'</select></div>'+
        '<label style="display:flex;align-items:center;gap:8px;font-size:12px;margin:6px 0 8px"><input type="checkbox" id="wKit" checked> 1 standard kit used</label>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">'+MATS.map(function(m){return matInput(m[0],m[1]);}).join('')+'</div>'+
        '<div style="font-size:10px;color:#9aa6a2;margin-top:6px">Only CPE issued to your team'+(acc.team_code?(' ('+acc.team_code+')'):'')+' appears here. You can complete the job without filling this in.</div>';
    }catch(e){
      block.innerHTML='<div style="font-size:11px;color:#c2503a">WIMS unavailable ('+(e.message||e)+') — you can still complete the job.</div>';
    }
  };

  // Called from confirmComplete(id, job) AFTER the job is saved. Optional: only
  // files a report if a modem was picked. Never throws into the caller.
  window.wimsSubmit = async function(jobId, job){
    try{
      var acc=await ensureAccess(); if(!acc) return;
      var modem=(qs('#wModem')||{}).value||'';
      if(!modem) return;                       // nothing reported → skip (optional)
      var iptv=(qs('#wIptv')||{}).value||'';
      var kit=(qs('#wKit')&&qs('#wKit').checked)?{standard:1}:{};
      var mats={}; MATS.forEach(function(m){ var v=parseFloat((qs('#wm_'+m[0])||{}).value)||0; if(v>0) mats[m[0]]=v; });
      var photos=0; try{ if(typeof photoCount==='function') photos=photoCount(jobId); }catch(e){}
      var r=await w().schema('wims').rpc('complete_install',{
        p_jo: jobId,
        p_subscriber: (job&&job.subscriber)||'',
        p_account: (job&&(job.account||job.acct||job.account_no||job.subscriber_account))||'',
        p_modem_serial: modem,
        p_iptv_serial: iptv||null,
        p_kit: kit,
        p_materials: mats,
        p_photos: photos
      });
      if(r&&r.error) throw r.error;
      say('📦 WIMS material report filed');
    }catch(e){ say('WIMS report not saved: '+(e.message||e)); try{console.warn('wimsSubmit',e);}catch(_){} }
  };
})();
