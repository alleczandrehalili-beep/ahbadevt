// ============================================================================
// WIMS — technician material report, shown INLINE in the job close-out card.
// Visible ONLY for enrolled technicians (wims.profiles via my_access RPC).
// Hindi enrolled = walang epekto. ENROLLED = MANDATORY at FILE-FIRST
// (2026-09-18): ang report ay ini-file BAGO makumpleto ang JO; kapag bigo ang
// server, HARANG ang completion at kita ng tech ang dahilan (dating tahimik
// na nawawala ang report — 'walang lumalabas na report ni team' bug).
// Shares scope with mobile-a.js / mobile-b.js (classic scripts): sb, toast,
// photoCount reachable as free variables.
//   render()          -> window.wimsMountAll()   (populate inline slots)
//   confirmComplete() -> window.wimsSubmit(id,job) BAGO ang completion save;
//     regular install → complete_install · SLR-TICKET/Transfer/IPTV → ticket_usage
//     (flexible: CPE optional; sa IPTV load ay required ang IPTV serial)
// ============================================================================
(function(){
  "use strict";
  function say(m){ try{ if(typeof toast==='function') toast(m); }catch(e){} }
  function W(){ try{ return sb; }catch(e){ return (window.sb||null); } }

  var access=null, accLoaded=false, cpeCache=null, wState={};
  // Fallback list only — the live catalog loads from wims.materials (loadMats),
  // so bagong materials sa DB ay lalabas dito nang walang app update.
  var MATS=[['foc','FOC (m)'],['clip5','Clip 5mm'],['clip7','Clip 7mm'],['tie','Cable Tie'],['dtape','D-Tape (in)'],['etape','E-Tape (in)'],['f17','F-17 Clamp'],['f19','F-19 Bracket'],['f20','F-20 Hook']];
  var matsLoaded=false, SPOOL=2000;   // FOC reel length (m) — markings count DOWN to 0
  async function loadMats(){
    if(matsLoaded) return; matsLoaded=true;
    try{
      var r=await W().schema('wims').from('materials').select('key,name,consume_unit,unit_qty,task_types').order('sort');
      if(r&&r.error) r=await W().schema('wims').from('materials').select('key,name,consume_unit,unit_qty').order('sort');
      if(r&&r.data&&r.data.length){
        MATS=r.data.map(function(m){ return [m.key, m.name+' ('+m.consume_unit+')', m.task_types||null]; });
        var f=r.data.filter(function(m){return m.key==='foc';})[0];
        if(f&&+f.unit_qty>0) SPOOL=+f.unit_qty;
      }
    }catch(e){}
  }
  // JO dwelling_type → canonical task tag; unknown/empty = '' (no filtering)
  function dwellKey(d){ d=String(d||'').trim().toUpperCase();
    return d==='SDU'?'sdu':(d==='MDU'?'mdu':(d==='MDU DOCSIS'?'mdu_docsis':'')); }
  // standard kit BOM — key, label, default qty (1 full kit). Editable per install.
  // 2026-08-05 restructure: F-17/F-19/F-20 ay INDIVIDUAL materials na (nasa
  // drop-materials grid, galing wims.materials); kapalit sa kit ang SAR + SAF.
  var KIT=[['conn','Fast Connector · SC/APC',2],['patch','Patch Cord · SC/APC 1.5m',1],['tbox','Terminal Box · FTTH',1],['sar','SAR · Service Acceptance Report',1],['saf','SAF · Service Activation Form',1]];
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
  function st(id){ return wState[id]||(wState[id]={modem:'',iptv:[],kit:defaultKit(),mats:{},focReel:'',focStart:'',focEnd:'',foc2On:false,foc2Reel:'',foc2End:'',kitRemarks:''}); }
  // KIT-EXCESS RULE: declaring MORE than the standard kit needs remarks (server-enforced too)
  function kitExcess(s){
    var ex=false;
    KIT.forEach(function(k){ var q=(s.kit&&s.kit[k[0]]!=null)?+s.kit[k[0]]:k[2]; if(q>k[2]) ex=true; });
    return ex;
  }
  // FOC CONTINUITY: the START of this JO is LOCKED to the END of the team's
  // previous JO (server-enforced too). A different/new reel starts at 0.
  var focPrev=null, focPrevLoaded=false, focSeq=0;
  // After ANY accepted outcome (filed / replay, install or ticket, interactive or queued) the next JO's START comes from the
  // server's accepted chronology (my_last_foc = the team's latest filed reading), never from a local guess or an older replay.
  // FENCED (Codex RC4): only the NEWEST request may write the cache — an older response that lands late is dropped — and no
  // filing ever waits for this read (the completion returns as soon as the server accepted the report). Unreachable / empty
  // → the cache is left as it is (a freshly filed reading stays).
  function refreshPrevFoc(){
    var seq=++focSeq; focPrevLoaded=true;
    return Promise.resolve().then(function(){ return W().schema('wims').rpc('my_last_foc'); })
      .then(function(r){ if(seq!==focSeq) return focPrev; var row=(r&&r.data&&r.data[0])||null; if(row) focPrev=row; return focPrev; })
      .catch(function(){ return focPrev; });
  }
  async function loadPrevFoc(){ if(focPrevLoaded) return focPrev; return refreshPrevFoc(); }
  function lockedStart(s){   // ano dapat ang START ayon sa continuity rule
    if(!focPrev||focPrev.end_m==null) return null;              // walang history → editable
    var cur=(s.focReel||'').trim().toUpperCase(), prev=(focPrev.reel_no||'').trim().toUpperCase();
    return (!cur||!prev||cur===prev) ? String(+focPrev.end_m) : String(SPOOL);   // bagong reel = SPOOL pababa
  }
  // FOC used = |end − start| mula sa meter markings ng cable; server ang final compute
  function focUsed(s){ var a=parseFloat(s.focStart), b=parseFloat(s.focEnd); if(isNaN(a)||isNaN(b)) return null;
    var u=Math.abs(b-a); if(s.foc2On){ var c=parseFloat(s.foc2End); if(!isNaN(c)) u+=Math.max(0,SPOOL-c); } return u; }
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

  // MODEM picker: parehong daan (search o scan) ay valid — mula LANG sa naka-issue sa team
  function pickIssuedModem(q){
    q=String(q||'').trim().toUpperCase(); if(!q) return null;
    var ms=(cpeCache||[]).filter(function(u){return u.category==='modem';});
    var exact=ms.filter(function(u){return u.serial.toUpperCase()===q;})[0];
    if(exact) return exact.serial;
    var ends=ms.filter(function(u){return u.serial.toUpperCase().slice(-q.length)===q;});
    if(ends.length===1) return ends[0].serial;
    var inc=ms.filter(function(u){return u.serial.toUpperCase().indexOf(q)>=0;});
    if(inc.length===1) return inc[0].serial;
    return null;
  }
  function remountSlot(jid){
    var slot=document.querySelector('.wims-slot[data-wjob="'+jid+'"]');
    if(slot){ slot.removeAttribute('data-mounted'); slot.innerHTML=''; window.wimsMountAll(); }
  }
  // 📷 barcode scanner (BarcodeDetector; kapag walang suporta ang phone → search box)
  var scanStream=null, scanRaf=null;
  function stopScan(){
    try{ if(scanRaf) cancelAnimationFrame(scanRaf); }catch(e){}
    try{ if(scanStream) scanStream.getTracks().forEach(function(t){t.stop();}); }catch(e){}
    scanStream=null; scanRaf=null;
    var m=document.getElementById('wimsScanModal'); if(m) m.remove();
  }
  async function startScan(jid){
    if(!('BarcodeDetector' in window)){ say('⚠ Scanner is not supported on this phone — type the last 6 digits instead'); return; }
    var det;
    try{ det=new BarcodeDetector({formats:['code_128','code_39','ean_13','qr_code','upc_a']}); }
    catch(e){ say('⚠ Scanner unavailable — use the search box'); return; }
    var m=document.createElement('div'); m.id='wimsScanModal';
    m.style.cssText='position:fixed;inset:0;background:rgba(8,44,40,.96);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px';
    m.innerHTML='<div style="color:#c9f36a;font:800 14px system-ui">📷 I-scan ang MODEM serial barcode</div>'+
      '<video id="wimsScanVid" playsinline muted style="width:92%;max-width:480px;border-radius:14px;background:#000"></video>'+
      '<div id="wimsScanMsg" style="color:#fff;font:600 12px system-ui;min-height:16px;max-width:90%;text-align:center"></div>'+
      '<button type="button" id="wimsScanClose" style="font:800 13px system-ui;background:#fff;border:0;border-radius:10px;padding:10px 22px">✕ Cancel</button>';
    document.body.appendChild(m);
    document.getElementById('wimsScanClose').onclick=stopScan;
    try{ scanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}); }
    catch(e){ stopScan(); say('⚠ Camera permission denied — use the search box'); return; }
    var vid=document.getElementById('wimsScanVid'); vid.srcObject=scanStream;
    try{ await vid.play(); }catch(e){}
    var st_=st(jid);
    var loop=async function(){
      if(!document.getElementById('wimsScanModal')) return;
      try{
        var codes=await det.detect(vid);
        if(codes&&codes.length){
          var raw=String(codes[0].rawValue||'').trim().toUpperCase();
          var hit=pickIssuedModem(raw);
          if(hit){ stopScan(); st_.modem=hit; remountSlot(jid); say('✓ Modem '+hit+' selected'); return; }
          var msg=document.getElementById('wimsScanMsg'); if(msg) msg.textContent='"'+raw+'" is NOT issued to your team — keep scanning';
        }
      }catch(e){}
      scanRaf=requestAnimationFrame(loop);
    };
    loop();
  }
  // live search habang nagta-type (min 3 chars, huling digits ang priority)
  document.addEventListener('input',function(e){
    var el=e.target; if(!el||!el.matches||!el.matches('input[data-wf="modemq"]')) return;
    var jid=el.getAttribute('data-j');
    var wrap=document.querySelector('[data-modem-matches="'+jid+'"]'); if(!wrap) return;
    var q=el.value.trim().toUpperCase();
    if(q.length<3){ wrap.innerHTML=q.length?'<div style="font-size:10.5px;color:#8a9a94;padding:4px 0">Type at least 3 characters…</div>':''; return; }
    var ms=(cpeCache||[]).filter(function(u){return u.category==='modem'&&u.serial.toUpperCase().indexOf(q)>=0;});
    ms.sort(function(a,b){ var ae=a.serial.toUpperCase().slice(-q.length)===q?0:1, be=b.serial.toUpperCase().slice(-q.length)===q?0:1; return ae-be; });
    wrap.innerHTML=ms.length?ms.slice(0,6).map(function(u){
      return '<button type="button" data-modempick="'+u.serial+'" data-j="'+jid+'" style="display:block;width:100%;text-align:left;font:700 13px system-ui;background:#f3fbf7;border:1px solid #bfe6d5;border-radius:9px;padding:9px 11px;margin-top:6px">📶 '+u.serial+'</button>';
    }).join(''):'<div style="font-size:11px;color:#c2503a;font-weight:700;padding:6px 0">No ISSUED modem matches "'+q+'" — check the serial o baka hindi pa naka-issue sa team ninyo</div>';
  });

  // Called at the end of render(): fill any inline WIMS slots (enrolled techs only).
  window.wimsMountAll = async function(){
    var slots=document.querySelectorAll('.wims-slot[data-wjob]'); if(!slots.length) return;
    var acc=await ensureAccess();
    if(!acc){ slots.forEach(function(s){ s.innerHTML=''; }); return; }   // not enrolled → invisible
    await loadMats();
    await loadPrevFoc();
    var cpe=await loadCpe();
    var modems=cpe.filter(function(u){return u.category==='modem';});
    var iptv=cpe.filter(function(u){return u.category==='iptv';});
    var opt=function(list,sel){ return '<option value="">— none —</option>'+list.map(function(u){return '<option value="'+u.serial+'"'+(sel===u.serial?' selected':'')+'>'+u.serial+'</option>';}).join(''); };
    slots.forEach(function(slot){
      if(slot.getAttribute('data-mounted')==='1' && slot.innerHTML) return; // keep user input across re-renders
      var jid=slot.getAttribute('data-wjob'); var s=st(jid);
      // ↩ Phase 1 (owner 2026-10-09): ibinalik ng QA = PICTURE LANG ang papalitan. Walang WIMS form — ipinapakita ang
      // naka-file na declaration (read-only) o ang katayuan nito; ang server din ang humaharang sa panibagong filing.
      if(slot.getAttribute('data-returned')==='1'){ slot.setAttribute('data-mounted','1'); mountDeclared(slot, jid); return; }
      var iptvn = parseInt(slot.getAttribute('data-iptvn'),10)||0;  // # of IPTV from the JO (2-PLAY add-ons); 0 = 1-PLAY
      var dwellRaw = slot.getAttribute('data-dwell')||'';
      var dw = dwellKey(dwellRaw);
      var is2 = iptvn>0;
      // 🎫/🔀/📺 flexible (SLR ticket · Transfer · IPTV): CPE optional, kit
      // defaults ZERO (ideklara lang ang aktwal na ginamit), pero MANDATORY na
      // may kahit isang declaration. Sa IPTV load: REQUIRED ang IPTV serial.
      var isTkt = slot.getAttribute('data-ticket')==='1';
      var wlt = slot.getAttribute('data-lt')||'';
      if(isTkt && !s._tkInit){ s._tkInit=1; s.kit={conn:0,patch:0,tbox:0,sar:0,saf:0}; }
      // 🧱 DOCSIS (owner 2026-09-26): coax install — WALANG fiber, kaya walang
      // FOC section, kit defaults ZERO; CPE lang ang required, lahat ng drops
      // OPTIONAL (ideklara lang ang aktwal na nagamit, kung meron).
      var isDx = !isTkt && /DOCSIS/i.test(dwellRaw);
      if(isDx && !s._dxInit){ s._dxInit=1; s.kit={conn:0,patch:0,tbox:0,sar:0,saf:0};
        s.focReel=''; s.focStart=''; s.focEnd=''; s.foc2On=false; s.foc2Reel=''; s.foc2End=''; }
      if(!Array.isArray(s.iptv)) s.iptv=[];
      if(!is2) s.iptv=[];
      slot.setAttribute('data-mounted','1');
      var iptvBlock;
      if(is2){
        iptvBlock = '<div style="font-weight:700;font-size:11px;color:#4a5c56;margin:2px 0 4px">Installed IPTV box'+(iptvn>1?'es · '+iptvn+' add-ons on the JO':'')+'</div><div class="wiptv-wrap" data-j="'+jid+'" data-n="'+iptvn+'"></div>';
      } else {
        iptvBlock = '<div style="font-size:11px;color:#8a9a94;margin:2px 0 8px">📶 1-PLAY · internet only — no IPTV for this JO</div>';
      }
      if(isTkt && wlt!=='IPTV') iptvBlock='';
      var kitRows = KIT.map(function(k){ var q=(s.kit&&s.kit[k[0]]!=null)?s.kit[k[0]]:k[2]; return '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid #eef4f1"><span style="flex:1;font-size:11px;color:#4a5c56">'+k[1]+'</span><input type="number" inputmode="numeric" min="0" value="'+q+'" data-wf="kitq" data-kk="'+k[0]+'" data-j="'+jid+'" style="width:54px;padding:5px;text-align:center"></div>'; }).join('');
      slot.innerHTML=
        '<div style="border:1.5px solid #bfe6d5;background:#f6fcf9;border-radius:14px;padding:12px;margin-top:10px">'+
          '<div style="font-weight:800;font-size:12px;color:#0e6f52;margin-bottom:8px">📦 WIMS material report <span style="font-weight:600;color:#c2503a">'+(isTkt?(wlt==='Transfer'?'· 🔀 Transfer · declare the materials USED':wlt==='IPTV'?'· 📺 IPTV add-on · select the installed IPTV + materials USED':'· 🎫 SLR ticket · declare the materials USED'):(isDx?'· 🧱 DOCSIS · CPE lang ang required':'· REQUIRED · '+(is2?'2-PLAY':'1-PLAY')))+'</span></div>'+
          '<div class="field"><label>'+(isTkt?'Modem (optional — only if you installed/swapped a modem from your inventory)':'Installed MODEM *')+'</label>'+
          (s.modem
            ? '<div style="display:flex;gap:8px;align-items:center;border:1.5px solid #bfe6d5;background:#f3fbf7;border-radius:10px;padding:9px 11px">'+
                '<b class="tnum" style="flex:1;font-size:13.5px">📶 '+s.modem+'</b>'+
                '<button type="button" data-wf="modemclear" data-j="'+jid+'" style="font:700 11px system-ui;background:#fff;border:1px solid #e3e8e2;border-radius:8px;padding:6px 10px">✕ Change</button></div>'
            : '<div style="display:flex;gap:6px">'+
                '<input data-wf="modemq" data-j="'+jid+'" placeholder="Type the LAST 6 digits of the serial" autocapitalize="characters" style="flex:1;text-transform:uppercase">'+
                '<button type="button" data-wf="modemscan" data-j="'+jid+'" style="font:800 12px system-ui;background:#082c28;color:#c9f36a;border:0;border-radius:10px;padding:0 14px;white-space:nowrap">📷 Scan</button></div>'+
              '<div data-modem-matches="'+jid+'"></div>')+
          '</div>'+
          // 🔁 REPLACEMENT RULE (owner 2026-09-20): sa SLR ticket, kapag may
          // BAGONG CPE mula sa inventory, REQUIRED ideklara ang serial ng
          // BINUNOT/pinalitang unit — naka-track ito hanggang maisauli sa warehouse.
          (wlt==='SLR-TICKET'
            ? '<div class="field" style="margin-top:2px"><label>🔁 Binunot/Pinalitang CPE serial <span style="color:#c2503a;font-weight:700">· REQUIRED kapag may bagong CPE</span></label>'+
              '<input data-wf="pulled" data-j="'+jid+'" value="'+(s.pulled||'')+'" placeholder="Serial ng LUMANG unit na binunot (comma kung marami)" autocapitalize="characters" style="text-transform:uppercase">'+
              '<div style="font-size:10px;color:#8a9a94;margin-top:2px">Isasauli ang binunot na unit sa warehouse — naka-track ito sa pangalan ng team.</div></div>'
            : '')+
          iptvBlock+
          (isDx
            ? '<div style="border:1px solid #d9e3f0;background:#f5f8fc;border-radius:10px;padding:9px 10px;margin:6px 0 8px;font-size:11px;color:#1d4f8a"><b>🧱 DOCSIS install</b> — coax, walang FOC drop fiber. CPE lang ang required; ideklara lang ang kit/materials na AKTWAL na nagamit (kung meron).</div>'
            : (function(){
            var ls=lockedStart(s);
            if(ls!=null && !s._focInit){ s._focInit=1; if(!s.focReel) s.focReel=(focPrev.reel_no||''); if(!s.focStart) s.focStart=ls; }
            var lock=false;   // FOC continuity lock REMOVED (owner 2026-09-02) — prefill lang ang prev end, EDITABLE lahat; ibabalik kapag stable na ang teams
            var startInp = lock
              ? '<input type="number" data-wf="focstart" data-j="'+jid+'" value="'+(s.focStart||'')+'" readonly style="background:#eef2f0;color:#556;pointer-events:none">'
              : '<input type="number" inputmode="decimal" min="0" data-wf="focstart" data-j="'+jid+'" value="'+(s.focStart||'')+'" placeholder="e.g. '+SPOOL+'">';
            var reel2='';
            if(s.foc2On){
              reel2='<div style="border-top:1px dashed #e3d3a8;margin-top:8px;padding-top:8px">'+
                '<div style="font-weight:700;font-size:11px;color:#8a6a24;margin-bottom:5px">🆕 Reel 2 <span style="font-weight:600;color:#b09a5e">· starts at '+SPOOL+' (auto, pababa)</span></div>'+
                '<div class="field" style="margin-bottom:6px"><label>Reel 2 # *</label><input data-wf="foc2reel" data-j="'+jid+'" value="'+(s.foc2Reel||'')+'" placeholder="e.g. RL-04522" autocapitalize="characters" style="text-transform:uppercase"></div>'+
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">'+
                  '<div class="field" style="margin:0"><label>START</label><input value="'+SPOOL+'" readonly style="background:#eef2f0;color:#556;pointer-events:none"></div>'+
                  '<div class="field" style="margin:0"><label>END meters *</label><input type="number" inputmode="decimal" min="0" max="'+SPOOL+'" data-wf="foc2end" data-j="'+jid+'" value="'+(s.foc2End||'')+'" placeholder="e.g. '+(SPOOL-110)+'"></div>'+
                '</div></div>';
            }
            return '<div style="border:1px solid #f0d9a8;background:#fffdf5;border-radius:10px;padding:9px 10px;margin:6px 0 8px">'+
            '<div style="font-weight:700;font-size:11px;color:#8a6a24;margin-bottom:6px">📏 FOC · drop fiber <span style="font-weight:600;color:#b09a5e">· footage REQUIRED · reel = '+SPOOL+' m pababa sa 0</span></div>'+
            '<div class="field" style="margin-bottom:6px"><label>Reel # (optional)</label><input data-wf="focreel" data-j="'+jid+'" value="'+(s.focReel||'')+'" placeholder="e.g. RL-04521" autocapitalize="characters" style="text-transform:uppercase"></div>'+
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">'+
              '<div class="field" style="margin:0"><label>START meters *'+(lock?' 🔒':'')+'</label>'+startInp+'</div>'+
              '<div class="field" style="margin:0"><label>'+(s.foc2On?'Reel 1 END (last marking) *':'END meters *')+'</label><input type="number" inputmode="decimal" min="0" data-wf="focend" data-j="'+jid+'" value="'+(s.focEnd||'')+'" placeholder="e.g. 1650"></div>'+
            '</div>'+
            (lock?'<div style="font-size:10px;color:#8a9a94;margin-top:3px">🔒 START is carried from your previous JO — hindi ito pwedeng i-edit. Ibang reel # = auto '+SPOOL+' (bumibilang PABABA sa 0).</div>':'')+
            reel2+
            '<button type="button" data-wf="foc2toggle" data-j="'+jid+'" style="margin-top:7px;font:700 10.5px system-ui;border:1px dashed #d8c58e;background:#fff;color:#8a6a24;border-radius:8px;padding:6px 10px">'+(s.foc2On?'✕ Remove reel 2':'➕ Reel emptied — used a 2nd reel')+'</button>'+
            '<div data-focused-for="'+jid+'" style="font-size:11px;font-weight:700;color:#0e6f52;margin-top:5px">'+(focUsed(s)!=null?('Used: '+focUsed(s)+' m'):'&nbsp;')+'</div>'+
          '</div>';
          })())+
          '<div style="font-weight:700;font-size:11px;color:#4a5c56;margin:8px 0 2px">🧰 Standard kit used <span style="font-weight:600;color:#8a9a94">'+(isDx?'· optional sa DOCSIS — ideklara lang ang aktwal na ginamit':'· edit if less than a full kit was used')+'</span></div>'+
          '<div style="margin-bottom:4px">'+kitRows+'</div>'+
          '<div data-kitrem-wrap="'+jid+'" style="display:'+(kitExcess(s)?'block':'none')+';margin-bottom:10px;border:1px solid #f4c4b7;background:#fdf2ef;border-radius:8px;padding:7px 9px">'+
            '<div style="font-weight:700;font-size:10.5px;color:#8a2013;margin-bottom:4px">⚠ MORE than the standard kit — remarks REQUIRED</div>'+
            '<input data-wf="kitrem" data-j="'+jid+'" value="'+(s.kitRemarks||'')+'" placeholder="Why the extra usage? (e.g. connector damaged during splice)" style="width:100%;box-sizing:border-box;padding:7px;font-size:12px">'+
          '</div>'+
          '<div style="font-size:11px;font-weight:700;color:#4a5c56;margin:0 0 4px">Drop materials used'+(dw?' · '+dwellRaw:'')+'</div>'+
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">'+MATS.filter(function(m){ if(['foc','conn','patch','tbox','sar','saf'].indexOf(m[0])>=0) return false;
            if(dw && m[2] && m[2].length && m[2].indexOf(dw)<0) return false; return true; }).map(function(m){return '<div class="field" style="margin:0"><label style="font-size:10px">'+m[1]+'</label><input type="number" inputmode="numeric" min="0" value="'+(s.mats[m[0]]||0)+'" data-wf="mat" data-mk="'+m[0]+'" data-j="'+jid+'" style="padding:6px"></div>';}).join('')+'</div>'+
          '<div style="font-size:10px;color:#9aa6a2;margin-top:6px">'+(isTkt
            ?'Declare at least ONE material — the job cannot be completed without it.'+(wlt==='IPTV'?' The installed IPTV box is REQUIRED.':'')+' Modem serial and FOC reel # are optional.'
            :'Only CPE issued to your team'+(acc.team_code?(' ('+acc.team_code+')'):'')+' appears here. REQUIRED — the job cannot be completed without this report.')+'</div>'+
        '</div>';
      if(is2) mountIptv(jid);
    });
  };

  // Read-only declaration card for a returned JO (wims.my_declaration = the team's own filed row, any task).
  async function mountDeclared(slot, jid){
    var j=jobOf(jid);
    slot.innerHTML='<div style="border:1.5px solid #d8dcd9;background:#f5f6f5;border-radius:14px;padding:12px;margin-top:10px"><div style="font-weight:800;font-size:12px;color:#4a5c56">📦 WIMS material report <span style="font-weight:600;color:#8a9a94">· naka-lock habang ibinalik ng QA</span></div><div style="font-size:11px;color:#8a9a94;margin-top:4px">Loading…</div></div>';
    var d=null, err='';
    try{
      var r=await W().schema('wims').rpc('my_declaration',{p_job_id:jid, p_jo:(j&&(j.job_order_no||j.ticket_no))||null});
      if(r&&r.error) throw r.error;
      d=(r&&r.data&&r.data[0])||null;
    }catch(e){ err=/could not find the function|schema cache/i.test(String(e&&e.message||''))?'':(e&&e.message||String(e)); }
    var body;
    if(d){
      var mats=[]; try{ Object.keys(d.materials_used||{}).forEach(function(k){ if(+d.materials_used[k]>0) mats.push(k+' '+d.materials_used[k]); }); }catch(e){}
      var kit=[]; try{ Object.keys(d.kit_used||{}).forEach(function(k){ if(+d.kit_used[k]>0) kit.push(k+' '+d.kit_used[k]); }); }catch(e){}
      body='<div style="font-size:12px;color:#1f2f2a;margin-top:6px"><b>✔ Naka-file na</b>'+(d.completed_at?' · '+new Date(d.completed_at).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'')+(d.task&&d.task!=='install'?' · '+d.task:'')+'</div>'+
        '<div style="font-size:11.5px;color:#4a5c56;margin-top:3px">Modem: <b class="tnum">'+(d.modem_serial||'—')+'</b>'+(d.iptv_serial?' · IPTV <b class="tnum">'+d.iptv_serial+'</b>':'')+'</div>'+
        (kit.length?'<div style="font-size:11px;color:#4a5c56">Kit: '+kit.join(', ')+'</div>':'')+(mats.length?'<div style="font-size:11px;color:#4a5c56">Materials: '+mats.join(', ')+'</div>':'')+
        (d.quarantined?'<div style="font-size:10.5px;color:#a4690f;margin-top:4px">⚠ Nasa warehouse reconciliation ang declaration na ito.</div>':'')+
        '<div style="font-size:10.5px;color:#8a9a94;margin-top:6px">Rehistrado na ang gamit ng JO na ito. Hindi ito mababago dito — picture lang ang papalitan, tapos pindutin ang Re-complete.</div>';
    } else if(err){
      body='<div style="font-size:11px;color:#c2503a;margin-top:6px">Hindi mabasa ang declaration: '+err+'</div><div style="font-size:10.5px;color:#8a9a94;margin-top:4px">Picture lang ang papalitan; walang bagong WIMS entry habang ibinalik ng QA.</div>';
    } else {
      body='<div style="font-size:11.5px;color:#4a5c56;margin-top:6px">Walang nakitang naka-file na WIMS report para sa JO na ito'+(navigator.onLine?'':' (offline)')+'.</div><div style="font-size:10.5px;color:#8a9a94;margin-top:4px">Kung may naka-queue pang report, maipapadala ito automatic. Walang bagong WIMS entry habang ibinalik ng QA — ipaalam sa warehouse kung talagang walang declaration.</div>';
    }
    slot.innerHTML='<div style="border:1.5px solid #d8dcd9;background:#f5f6f5;border-radius:14px;padding:12px;margin-top:10px"><div style="font-weight:800;font-size:12px;color:#4a5c56">📦 WIMS material report <span style="font-weight:600;color:#8a9a94">· naka-lock habang ibinalik ng QA</span></div>'+body+'</div>';
  }

  // keep selections in wState so re-renders never lose them
  document.addEventListener('change', function(e){
    var el=e.target.closest('[data-wf]'); if(!el) return;
    var jid=el.getAttribute('data-j'), f=el.getAttribute('data-wf'), s=st(jid);
    if(f==='modem') s.modem=el.value;
    else if(f==='pulled') s.pulled=el.value.trim().toUpperCase();
    else if(f==='iptv'){ if(!Array.isArray(s.iptv)) s.iptv=[]; s.iptv[parseInt(el.getAttribute('data-idx'),10)||0]=el.value; mountIptv(jid); }
    else if(f==='kitq'){ if(!s.kit||typeof s.kit!=='object') s.kit={}; s.kit[el.getAttribute('data-kk')]=parseFloat(el.value)||0;
      var kw=document.querySelector('[data-kitrem-wrap="'+jid+'"]'); if(kw) kw.style.display=kitExcess(s)?'block':'none'; }
    else if(f==='kitrem') s.kitRemarks=el.value;
    else if(f==='mat') s.mats[el.getAttribute('data-mk')]=parseFloat(el.value)||0;
    else if(f==='focreel'){ s.focReel=el.value.trim().toUpperCase();
      var ls=lockedStart(s);
      if(ls!=null && (s.focStart===''||s.focStart==null)){ s.focStart=ls;
        var si=document.querySelector('input[data-wf="focstart"][data-j="'+jid+'"]'); if(si) si.value=ls;
        var d0=document.querySelector('[data-focused-for="'+jid+'"]'); var u0=focUsed(s);
        if(d0) d0.innerHTML=(u0!=null)?('Used: '+u0+' m'):'&nbsp;'; } }
    else if(f==='foc2reel') s.foc2Reel=el.value.trim().toUpperCase();
    else if(f==='foc2end'){ s.foc2End=el.value;
      var d2=document.querySelector('[data-focused-for="'+jid+'"]'); var u2=focUsed(s);
      if(d2) d2.innerHTML=(u2!=null)?('Used: '+u2+' m'):'&nbsp;'; }
    else if(f==='focstart'||f==='focend'){
      s[f==='focstart'?'focStart':'focEnd']=el.value;
      var u=focUsed(s), d=document.querySelector('[data-focused-for="'+jid+'"]');
      if(d) d.innerHTML=(u!=null)?('Used: '+u+' m'):'&nbsp;';
    }
  });

  // Called from confirmComplete AFTER the job is saved. Optional; reads wState.
  document.addEventListener('click', function(e){
    var pk=e.target.closest&&e.target.closest('[data-modempick]');
    if(pk){ var pj=pk.getAttribute('data-j'); st(pj).modem=pk.getAttribute('data-modempick'); remountSlot(pj); return; }
    var sc=e.target.closest&&e.target.closest('[data-wf="modemscan"]');
    if(sc){ startScan(sc.getAttribute('data-j')); return; }
    var cl=e.target.closest&&e.target.closest('[data-wf="modemclear"]');
    if(cl){ var cj=cl.getAttribute('data-j'); st(cj).modem=''; remountSlot(cj); return; }
    var b=e.target.closest&&e.target.closest('[data-wf="foc2toggle"]'); if(!b) return;
    var jid=b.getAttribute('data-j'), s=st(jid);
    s.foc2On=!s.foc2On; if(!s.foc2On){ s.foc2Reel=''; s.foc2End=''; }
    remountSlot(jid);
  });

  // MANDATORY GATE (2026-09-02, owner): ang ENROLLED technician ay HINDI
  // makakapag-complete ng JO nang walang kumpletong WIMS report. Ang hindi
  // enrolled ay walang gate. Returns null = ok mag-proceed, o message = block.
  // helper: may kahit isang positibong dami ba sa isang {key:qty} object?
  function anyPos(o){ if(!o||typeof o!=='object') return false;
    for(var k in o){ if(+o[k]>0) return true; } return false; }
  function jobOf(id){ try{ return (jobs||[]).find(function(x){return x.id===id;})||null; }catch(e){ return null; } }
  // FLEXIBLE (ticket-style) load types: CPE optional, mandatory kahit ISANG
  // declaration. Transfer/IPTV idinagdag 2026-09-18 — dating pinipilit silang
  // pumili ng modem (mali) at laging bigo sa server photo check (12 vs 3).
  function flexType(j){ return (j&&['SLR-TICKET','Transfer','IPTV'].indexOf(j.load_type)>=0)?j.load_type:null; }
  window.wimsGate = async function(jobId){
    try{
      var acc=await ensureAccess(); if(!acc) return null;   // hindi enrolled
      var s=wState[jobId];
      var _j=jobOf(jobId);
      var _ft=flexType(_j);
      if(_ft){
        // 🎫/🔀/📺 flexible: HINDI required ang modem/FOC reel — pero MANDATORY
        // na may kahit ISANG declaration (CPE, kit item, drop material, o FOC).
        if(!s) return 'WIMS declaration is REQUIRED — declare the materials used in the WIMS section';
        var hasS=(s.focStart!==''&&s.focStart!=null), hasE=(s.focEnd!==''&&s.focEnd!=null);
        if(hasS!==hasE) return 'WIMS: START and END FOC meter readings are both required';
        if(kitExcess(s) && !(s.kitRemarks||'').trim()) return 'WIMS: kit usage exceeds the standard kit — remarks are REQUIRED';
        if(s.foc2On){
          if(!(s.foc2Reel||'').trim()) return 'WIMS: Reel 2 # is required';
          var te2=parseFloat(s.foc2End);
          if(isNaN(te2)||te2<0||te2>=SPOOL) return 'WIMS: Reel 2 END must be between 0 and '+SPOOL;
        }
        if(_ft==='IPTV' && !(Array.isArray(s.iptv)&&s.iptv.some(function(x){return !!x;})))
          return 'WIMS: select the installed IPTV box — required for IPTV add-on JOs';
        // REPLACEMENT RULE: bagong CPE sa SLR ticket = required ang pulled serial
        if(_ft==='SLR-TICKET' && (!!s.modem || (Array.isArray(s.iptv)&&s.iptv.some(function(x){return !!x;}))) && !(s.pulled||'').trim())
          return 'WIMS: ideklara ang serial ng BINUNOT/pinalitang CPE — required kapag may bagong CPE (replacement)';
        var declared = !!s.modem || (Array.isArray(s.iptv)&&s.iptv.some(function(x){return !!x;}))
          || anyPos(s.kit) || anyPos(s.mats) || (hasS&&hasE);
        if(!declared) return 'Declare at least one material used for this job (WIMS section)';
        return null;
      }
      if(!s || !s.modem) return 'WIMS report is REQUIRED — select the installed MODEM sa WIMS section bago i-complete ang JO';
      var hasStart=(s.focStart!==''&&s.focStart!=null), hasEnd=(s.focEnd!==''&&s.focEnd!=null);
      if(hasStart!==hasEnd) return 'WIMS: START and END FOC meter readings are both required';
      if(kitExcess(s) && !(s.kitRemarks||'').trim()) return 'WIMS: kit usage exceeds the standard kit — remarks are REQUIRED';
      if(s.foc2On){
        if(!(s.foc2Reel||'').trim()) return 'WIMS: Reel 2 # is required';
        var e2=parseFloat(s.foc2End);
        if(isNaN(e2)||e2<0||e2>=SPOOL) return 'WIMS: Reel 2 END must be between 0 and '+SPOOL;
      }
      return null;
    }catch(e){ return null; }   // gate error → huwag ipitin ang tech
  };

  // ---- WIMS OFFLINE QUEUE (2026-09-19) --------------------------------------
  // Ang jobs completion ay may offline queue; dati ang WIMS submit ay ONLINE-
  // ONLY fire-and-forget — kapag walang signal sa sandali ng completion, ang
  // report ay TULUYANG nawawala nang tahimik (ito ang pangunahing dahilan ng
  // 'walang lumalabas na report ni team'). Ngayon: NETWORK error → i-queue sa
  // localStorage + payagan ang completion (idempotent ang server RPCs kaya
  // ligtas ang retry); VALIDATION error (may PostgREST/PG code) → HARANG at
  // ipakita sa tech.
  var WQKEY='wims_pending_v1';
  function isNetErr(e){
    if(!e) return true;
    var c=e.code||'';
    if(c==='PGRST301'||c==='42501'||c==='401'||String(c)==='401') return true;   // JWT lapse / not signed in yet — temporary, retry after login
    if(/jwt|not authenticated|permission denied for function/i.test(String(e.message||''))) return true;
    if(c) return false;                                // may server code = validation, hindi network
    return /fetch|network|timeout|abort|load failed|connection|offline/i.test(String(e.message||e));
  }
  var QMAX=50;
  // STORAGE (Codex RC4 B2): ONE RECORD PER KEY (wims_pending_v1.i.<qid>). Every queue mutation — append, hold, claim, drop,
  // release — is a single-key setItem / removeItem, which Web Storage performs atomically, and a tab only ever writes the record
  // it is mutating: no tab rewrites another tab's record, so a paused, stale or late-claiming tab cannot erase a report another
  // tab verified and acknowledged. Correctness no longer depends on any mutex. The pre-RC5 array blob (wims_pending_v1) is
  // migrated record by record (hydrateQueue) and is still READ by every listing, so an old client still writing the blob beside
  // a new tab loses nothing either.
  // TERMINAL STATE (Codex RC5): an accepted record leaves a durable tombstone (wims_pending_v1.d.<qid>) tied to its STABLE identity
  // — a legacy record's identity is a content hash (ts + JO + rpc + args), never its position in the old array. A tombstoned
  // record is never listed, migrated, claimed or resurrected (a stale write of it is removed on the next listing).
  var QPFX=WQKEY+'.i.', DPFX=WQKEY+'.d.', DONE_TTL=30*24*3600*1000;
  function qKey(qid){ return QPFX+qid; }
  function dKey(qid){ return DPFX+qid; }
  function qParse(v){ try{ var x=JSON.parse(v||'null'); return (x&&typeof x==='object')?x:null; }catch(e){ return null; } }
  function qKeys(pfx){ var out=[]; try{ var n=localStorage.length; for(var i=0;i<n;i++){ var k=localStorage.key(i); if(k&&k.indexOf(pfx)===0) out.push(k); } }catch(e){} return out; }
  // content fingerprint of a legacy record: two independent 32-bit hashes (djb2 + sdbm) over the WHOLE record = 64 bits; the id
  // carries it and so does the tombstone (sig), so a tombstone only ever suppresses the record it was written for
  function qHash(str){ var h=5381, g=0; for(var i=0;i<str.length;i++){ var c=str.charCodeAt(i); h=((h<<5)+h+c)|0; g=(c+(g<<6)+(g<<16)-g)|0; } return (h>>>0).toString(36)+(g>>>0).toString(36); }
  // the record's CONTENT (what a tombstone / a collision guard compares — never a digest alone, Codex RC7)
  function qSrc(it){ return JSON.stringify([it.rpc||'',it.args||null,it.ts||0,it.jo||'',it.owner||'',it.ouser||'']); }
  function qSig(it){ return qHash(qSrc(it)); }
  function qLegacyId(it){ return it.qid||('legacy_'+(it.ts||0)+'_'+(it.jo||'')+'_'+qSig(it)); }   // content identity: stable across tabs and across the old writer's rewrites; a digest collision is separated by content (hydrateQueue)
  // TERMINAL: a tombstone key (carrying the record's content, so it suppresses ONLY the record it was written for), or (storage too
  // full for a separate key) the record key itself holding a done marker
  function isDone(qid, it){ try{ var d=qParse(localStorage.getItem(dKey(qid))); if(d){ return !(it&&d.src&&d.src!==qSrc(it)); } var r=qParse(localStorage.getItem(qKey(qid))); return !!(r&&r.done); }catch(e){ return false; } }
  // the content travels with a LEGACY record's tombstone only (its id is a digest that can collide); a record this client created
  // has a unique id, so its tombstone and done marker stay tiny (they must fit when storage is nearly full)
  function markDone(qid, src){ try{ localStorage.setItem(dKey(qid), JSON.stringify(qid.indexOf('legacy_')===0&&src?{at:Date.now(), src:src}:{at:Date.now()})); return !!qParse(localStorage.getItem(dKey(qid))); }catch(e){ return false; } }
  // a legacy record's id, resolved by CONTENT among the digest's slots (base, base_2, …): the slot whose key or tombstone holds this
  // record, else the first free slot — so a different record with the same digest never shares an identity or a tombstone
  function qSlot(it){
    var base=qLegacyId(it), src=qSrc(it), n=1, id=base;
    for(;;){
      var d=null, x=null; try{ d=qParse(localStorage.getItem(dKey(id))); x=qParse(localStorage.getItem(qKey(id))); }catch(e){}
      if(d&&(!d.src||d.src===src)) return {id:id, done:true};
      if(x&&!x.done&&qSrc(x)===src) return {id:id, done:false};
      if(x&&x.done&&(!x.src||x.src===src)) return {id:id, done:true};
      if(!d&&!x) return {id:id, done:false, free:true};
      id=base+'_'+(++n);
    }
  }
  function qLegacy(){ try{ var a=JSON.parse(localStorage.getItem(WQKEY)||'[]'); return Array.isArray(a)?a.filter(function(x){ return x&&typeof x==='object'; }):[]; }catch(e){ return []; } }
  // every ACTIVE record: the per-key records plus the not-yet-migrated blob items, minus terminal ones, oldest first
  function qAll(){
    var out=[], seen={};
    qKeys(QPFX).forEach(function(k){ var id=k.slice(QPFX.length), x=qParse(localStorage.getItem(k));
      if(!x||x.done||isDone(id)){ if(x&&x.done&&!markDone(id, x.src)) return; try{ localStorage.removeItem(k); }catch(e){} return; }   // terminal (a stale resurrection of an accepted record heals here; a done marker becomes a tombstone when room allows)
      x.qid=x.qid||id; seen[x.qid]=1; out.push(x); });
    qLegacy().forEach(function(it){ var sl=qSlot(it); if(!seen[sl.id]&&!sl.done){ it.qid=sl.id; seen[sl.id]=1; out.push(it); } });
    out.sort(function(a,b){ return ((a.ts||0)-(b.ts||0))||String(a.qid).localeCompare(String(b.qid)); });
    return out;
  }
  // NEVER truncates: capacity is enforced where a record is ADDED and the write is verified by reading it back, so a caller knows
  // whether its report is durable on this phone.
  function qPut(item){
    try{
      if(!item||!item.qid) return false;
      if(qAll().length>=QMAX) return false;
      localStorage.setItem(qKey(item.qid), JSON.stringify(item));
      var back=qParse(localStorage.getItem(qKey(item.qid))); return !!(back&&back.qid===item.qid);
    }catch(e){ return false; }
  }
  function qGet(qid){ var x=qParse(localStorage.getItem(qKey(qid))); return (x&&!x.done)?x:null; }
  // ACCEPTED → terminal. The tombstone is written and VERIFIED before the record is removed; when storage cannot fit the separate
  // marker, the record key itself is overwritten with a small done marker (which frees room) and verified; if even that fails the
  // record is left as it is — a re-send costs one replay, never the loss of the only local acknowledgment (Codex RC6).
  function qDrop(qid){
    var x=qGet(qid), src=x?qSrc(x):null;
    if(markDone(qid, src)){ try{ localStorage.removeItem(qKey(qid)); }catch(e){} return true; }
    // storage too full for the separate marker: shrink the record to a done marker (frees room), verify it, then IMMEDIATELY retry the
    // separate tombstone with the room that freed — a stale writer that later overwrites the record key cannot undo a tombstone
    try{ localStorage.setItem(qKey(qid), JSON.stringify(qid.indexOf('legacy_')===0&&src?{qid:qid, done:true, at:Date.now(), src:src}:{qid:qid, done:true, at:Date.now()})); }catch(e){}
    var back=qParse(localStorage.getItem(qKey(qid))); if(!(back&&back.done)) return false;
    if(markDone(qid, src)){ try{ localStorage.removeItem(qKey(qid)); }catch(e){} }
    return true;
  }
  function qPatch(qid, fn){ try{ if(isDone(qid)) return false; var x=qGet(qid); if(!x) return false; fn(x); if(isDone(qid)) return false; localStorage.setItem(qKey(qid), JSON.stringify(x)); return true; }catch(e){ return false; } }
  // FENCED finalize (RC5): a non-terminal outcome (held / conflict / retry) is written only by the tab whose claim token is still
  // on the record and only while the record is not terminal — a finalizer that resumes after its lease expired and another tab
  // accepted the report writes nothing (it cannot recreate an acknowledged record from its stale snapshot)
  function qFinalize(qid, tok, fn){
    var ok=qPatch(qid, function(x){ if(!(x.lock&&x.lock.by===TAB_ID&&x.lock.tok===tok)) throw new Error('stale'); fn(x); });
    if(ok&&isDone(qid)){ try{ var d=qParse(localStorage.getItem(dKey(qid))); if(d) localStorage.removeItem(qKey(qid)); }catch(e){} return false; }   // accepted elsewhere between this read and write → no stale record, no stale message
    return ok;
  }
  // CLAIM ARBITRATION (no longer a correctness dependency): the Web Locks API when the browser has it (Chrome / Android WebView
  // do), otherwise a localStorage token that FAILS CLOSED — a tab that cannot confirm ownership within the wait does NOT run the
  // claim (it skips this round). Should two tabs ever both believe they hold the token, the cost is one duplicate request: the
  // server answers the second with the same receipt (replay). Network calls are NEVER made while holding it.
  var LOCKKEY='wims_pending_v1.lock', lockDepth=0, LOCK_BUSY={busy:true};
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  async function lsMutex(fn){
    var mine=TAB_ID+'_'+Math.random().toString(36).slice(2,6), t0=Date.now(), got=false;
    while(Date.now()-t0<3000){
      var cur=null; try{ cur=JSON.parse(localStorage.getItem(LOCKKEY)||'null'); }catch(e){ cur=null; }
      if(!cur||!cur.at||(Date.now()-cur.at)>8000){
        try{ localStorage.setItem(LOCKKEY, JSON.stringify({id:mine, at:Date.now()})); }catch(e){}
        await sleep(12);                                   // let a simultaneous claimant's write land, then re-read
        try{ cur=JSON.parse(localStorage.getItem(LOCKKEY)||'null'); }catch(e){ cur=null; }
        if(cur&&cur.id===mine){ got=true; break; }
      }
      await sleep(25);
    }
    if(!got) return LOCK_BUSY;                             // fail closed: ownership not confirmed → nothing runs
    try{ return await fn(); }
    finally{ try{ var c=JSON.parse(localStorage.getItem(LOCKKEY)||'null'); if(c&&c.id===mine) localStorage.removeItem(LOCKKEY); }catch(e){} }
  }
  async function withQueueLock(fn){
    if(lockDepth>0) return fn();                           // already inside this tab's locked section
    var run=async function(){ lockDepth++; try{ return await fn(); } finally{ lockDepth--; } };
    try{ if(navigator.locks&&navigator.locks.request) return await navigator.locks.request('wims_pending_v1', run); }catch(e){}
    return lsMutex(run);
  }
  // Phase 1 (2026-10-09, Codex F7): bawat item ay may sariling id + may-ari (auth uid / username). Ang flush ay nag-aalis LANG ng
  // item na KUMPIRMADONG natapos (by id, mula sa PINAKABAGONG queue) — dating isinusulat ang buong snapshot pabalik, kaya ang
  // report na na-enqueue HABANG nagfa-flush ay tahimik na nawawala. Items ng ibang login sa parehong phone = hawak, hindi ire-replay.
  var _wUid='';
  try{ W().auth.onAuthStateChange(function(_e,s){ _wUid=(s&&s.user&&s.user.id)||''; }); W().auth.getSession().then(function(r){ var s=r&&r.data&&r.data.session; if(s&&s.user) _wUid=s.user.id; }).catch(function(){}); }catch(e){}
  function _wOwner(){ var u=''; try{ u=(typeof myTeam!=='undefined'&&myTeam)||''; }catch(e){} return _wUid||(u?('u:'+u):''); }
  function _wMine(it){ if(!it) return false; if(!it.owner) return true;   // legacy item (bago ang Phase 1) — iisang login lang ang phone noon
    var u=''; try{ u=(typeof myTeam!=='undefined'&&myTeam)||''; }catch(e){}
    return (_wUid&&it.owner===_wUid)||(u&&(it.owner===('u:'+u)||it.ouser===u)); }
  function isDeclaredAlready(e){ return /^DECLARED_ALREADY/.test(String(e&&e.message||'')); }
  function isMissingFn(e){ return /could not find the function|schema cache/i.test(String(e&&e.message||'')); }
  // LEGACY HANDOFF (Codex RC5 B1): the old array blob (wims_pending_v1) belongs to the OLD client, which may still be open in another
  // tab and still appends to / rewrites it. This client NEVER deletes or writes that blob — it cannot know that no incompatible
  // writer is still active, and a read-back before a removal cannot make the removal atomic. Instead: every blob record is COPIED
  // to its own key under its content identity (retried on every hydrate, so a copy that failed for storage reasons is retried
  // and the record stays visible from the blob meanwhile), an accepted record is tombstoned (never copied or sent again, even if
  // the old client still carries it), and the blob simply dies with the old client (or when the old client finalizes its own
  // records; the server answers its re-sends with the same receipt). Tombstones outlive the blob and are pruned after 30 days
  // once nothing references them. Returns the ids of every active record, oldest first.
  var TAB_ID=Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6), migrateWarned=false;
  function hydrateQueue(){
    var legacy=qLegacy(), failed=0, inBlob={};
    legacy.forEach(function(it){
      var sl=qSlot(it), id=sl.id;   // by CONTENT: a different record under the same digest gets its own slot
      inBlob[id]=1;
      if(sl.done||!sl.free) return;
      it.qid=id;
      try{ localStorage.setItem(qKey(id), JSON.stringify(it)); }catch(e){}
      if(!qGet(id)) failed++;
    });
    if(failed&&!migrateWarned){ migrateWarned=true; say('⚠ '+failed+' older WIMS report'+(failed>1?'s':'')+' could not be copied (phone storage full) — they stay queued and will be retried'); }
    try{ qKeys(DPFX).forEach(function(k){ var id=k.slice(DPFX.length), d=qParse(localStorage.getItem(k)); if(!inBlob[id]&&!qGet(id)&&d&&(Date.now()-(d.at||0))>DONE_TTL) localStorage.removeItem(k); }); }catch(e){}
    return qAll().map(function(x){ return x.qid; });
  }
  // Replay signature fallbacks = parehong hagdan ng interactive na tawag: LUMANG backend na walang p_job_id / pulled / kit_remarks / FOC2 / FOC params
  var FALLBACK_KEYS=[['p_job_id'],['p_pulled_serials','p_pulled_note'],['p_kit_remarks'],['p_foc2_reel','p_foc2_end'],['p_foc_reel','p_foc_start','p_foc_end']];
  async function rpcWithFallback(rpc, args){
    var a=Object.assign({}, args||{});
    var r=await W().schema('wims').rpc(rpc, a);
    for(var i=0;i<FALLBACK_KEYS.length && r&&r.error&&isMissingFn(r.error);i++){
      var had=false; FALLBACK_KEYS[i].forEach(function(k){ if(k in a){ delete a[k]; had=true; } });
      if(!had) continue;
      r=await W().schema('wims').rpc(rpc, a);
    }
    return r;
  }
  // One filing, structured outcome: {status:'filed'|'replay'|'conflict'|'error', receipt, conflict_id, message}. Bagong backend =
  // wims.file_declaration (walang silent success sa changed payload); lumang backend = lumang RPC (uuid = filed).
  async function fileDeclaration(rpc, args){
    var kind=(rpc==='ticket_usage')?'ticket':'install';
    var r=await W().schema('wims').rpc('file_declaration',{p_kind:kind, p_args:args});
    if(r&&r.error&&isMissingFn(r.error)){
      r=await rpcWithFallback(rpc, args);
      if(r&&r.error) return {status:'error', message:String(r.error.message||r.error), code:r.error.code||'', error:r.error};
      return {status:'filed', receipt:r&&r.data};
    }
    if(r&&r.error) return {status:'error', message:String(r.error.message||r.error), code:r.error.code||'', error:r.error};
    var d=(r&&r.data)||{};
    if(d.status==='error') return {status:'error', message:String(d.message||''), code:d.code||'', error:{message:d.message,code:d.code}};
    return {status:d.status||'filed', receipt:d.receipt, conflict_id:d.conflict_id, reason:d.reason||null, message:d.message||''};
  }
  var flushing=false;
  // Hinahawakan (hindi tinatapon) ang report na tinanggihan ng server (validation) o may CONFLICT sa naka-file nang declaration:
  // nakikita sa ⚠ banner / wimsHeldReports() at maaaring i-retry; ang NETWORK/session error ay nananatili at inuulit; ang
  // tagumpay lang ang tinatanggal — by id, mula sa PINAKABAGONG queue. Hindi nagre-replay nang walang naka-sign-in na session.
  async function flushWims(){
    if(flushing) return; flushing=true;
    try{
      var sess=null; try{ var sr=await W().auth.getSession(); sess=sr&&sr.data&&sr.data.session; }catch(e){ sess=null; }
      if(!sess) return;                                   // walang session — hintayin ang login (SIGNED_IN ang magti-trigger)
      var ids=await withQueueLock(hydrateQueue);
      if(ids===LOCK_BUSY) return;                         // another tab is arbitrating claims right now — next round (fail closed)
      for(var i=0;i<ids.length;i++){
        var id=ids[i];
        // CLAIM under the arbitration lock (latest state, by id); another tab's fresh claim or a held / foreign record is skipped
        var tok=Math.random().toString(36).slice(2,10);
        var it=await withQueueLock(function(){
          var x=qGet(id); if(!x||x.held||!_wMine(x)) return null;
          if(x.lock&&x.lock.by!==TAB_ID&&(Date.now()-(x.lock.at||0))<90000) return null;
          qPatch(id, function(y){ y.lock={by:TAB_ID, at:Date.now(), tok:tok}; }); return qGet(id);
        });
        if(it===LOCK_BUSY) return;
        if(!it) continue;
        var res=null, failure=null;
        try{ res=await fileDeclaration(it.rpc, it.args); if(res.status==='error') throw (res.error||new Error(res.message)); }   // NO lock held during the network call
        catch(e){ failure=e; }
        // FINALIZE: single-key writes on THIS record only (atomic) — a record another tab added or changed meanwhile is untouched;
        // a non-terminal outcome is FENCED on this tab's claim token (a stale finalizer writes nothing)
        if(failure){
          if(isNetErr(failure)){ qFinalize(id, tok, function(x){ delete x.lock; }); continue; }   // offline / session — mananatili, susubukan ulit
          var msg=String(failure&&failure.message||failure);
          if(qFinalize(id, tok, function(x){ x.held=msg; x.heldAt=Date.now(); x.kind='rejected'; delete x.lock; }))
            say('⚠ WIMS report for JO '+(it.jo||'?')+' was NOT accepted: '+msg+' — naka-hold para sa warehouse review');
          continue;
        }
        cpeCache=null;
        if(res.status==='conflict'){
          if(qFinalize(id, tok, function(x){ x.held=res.message||'Conflict with the filed declaration'; x.heldAt=Date.now(); x.kind='conflict'; x.conflict_id=res.conflict_id||null; delete x.lock; }))
            say('⚠ JO '+(it.jo||'?')+': '+(res.reason==='under_review'?'nasa warehouse review ang mas naunang WIMS declaration ng JO number na ito — hindi na-file; naka-hold ang report.':res.reason==='ambiguous_replay'?'kapareho ng declaration na na-file na para sa mas naunang (deleted) generation ng JO number na ito — hindi na-file ulit; nasa warehouse review.':'may WIMS declaration NA ang JO na ito — hindi binago ang inventory; naka-hold ang report para sa warehouse review.'));
        } else {
          qDrop(id);   // ACCEPTED by the server (filed or replay) → terminal, whoever holds the claim now
          say('📦 Queued WIMS report filed — JO '+(it.jo||'?'));
        }
        if(res.status==='filed'||res.status==='replay') refreshPrevFoc();   // accepted chronology from the server — fenced, never awaited
      }
    }finally{ flushing=false; renderHeldBar(); }
  }
  try{ W().auth.onAuthStateChange(function(ev){ if(ev==='SIGNED_IN'||ev==='TOKEN_REFRESHED') setTimeout(flushWims, 1500); }); }catch(e){}

  // ---- ⚠ held reports: visible, reviewable, retryable by the logged-in team (no developer console needed) ----
  function heldMine(){ return qAll().filter(function(x){ return x&&x.held&&_wMine(x); }); }
  function renderHeldBar(){
    try{
      var list=heldMine(), bar=document.getElementById('wimsHeldBar');
      if(!list.length){ if(bar) bar.remove(); return; }
      if(!bar){ bar=document.createElement('div'); bar.id='wimsHeldBar'; bar.style.cssText='position:fixed;left:10px;right:10px;bottom:68px;z-index:9000;background:#fdf6ea;border:1.5px solid #e6c98a;color:#7a5200;border-radius:12px;padding:9px 12px;font:700 12px system-ui;box-shadow:0 4px 14px rgba(0,0,0,.12)'; bar.onclick=openHeldModal; document.body.appendChild(bar); }
      bar.textContent='⚠ '+list.length+' WIMS report'+(list.length>1?'s':'')+' on hold — tap to review / retry';
    }catch(e){}
  }
  function openHeldModal(){
    var list=heldMine(); var old=document.getElementById('wimsHeldModal'); if(old) old.remove();
    var m=document.createElement('div'); m.id='wimsHeldModal';
    m.style.cssText='position:fixed;inset:0;background:rgba(8,44,40,.55);z-index:9500;display:flex;align-items:flex-end;justify-content:center';
    var esc=function(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
    m.innerHTML='<div style="background:#fff;width:100%;max-width:520px;max-height:80vh;overflow:auto;border-radius:16px 16px 0 0;padding:14px;font:13px system-ui">'+
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><b style="flex:1">⚠ WIMS reports on hold ('+list.length+')</b><button type="button" id="wimsHeldExport" style="font:700 11px system-ui;border:1px solid #d8dcd9;background:#fff;border-radius:8px;padding:6px 10px">⬇ Copy JSON</button><button type="button" id="wimsHeldClose" style="font:700 11px system-ui;border:1px solid #d8dcd9;background:#fff;border-radius:8px;padding:6px 10px">✕</button></div>'+
      '<div style="font-size:11px;color:#8a9a94;margin-bottom:8px">Hindi tinapon ang mga report na ito. Ang CONFLICT = may declaration na ang JO (nasa warehouse review ang bagong entries). Ang REJECTED = tinanggihan ng server — ayusin at i-retry, o ipaalam sa warehouse.</div>'+
      list.map(function(x){ return '<div style="border:1px solid #eef2f0;border-radius:10px;padding:9px;margin-bottom:6px"><div><b class="tnum">JO '+esc(x.jo||'?')+'</b> · <span style="color:'+(x.kind==='conflict'?'#a4690f':'#c2503a')+'">'+esc(x.kind||'held')+'</span> · '+esc(x.heldAt?new Date(x.heldAt).toLocaleString():'')+'</div><div style="font-size:11.5px;color:#4a5c56;margin:4px 0">'+esc(x.held)+'</div><div style="font-size:10.5px;color:#8a9a94">'+esc(x.rpc)+' · modem '+esc((x.args||{}).p_modem_serial||'—')+'</div><button type="button" data-wretry="'+esc(x.qid)+'" style="margin-top:6px;font:700 11px system-ui;border:0;background:#082c28;color:#c9f36a;border-radius:8px;padding:7px 12px">↻ Retry now</button></div>'; }).join('')+
      '</div>';
    document.body.appendChild(m);
    m.querySelector('#wimsHeldClose').onclick=function(){ m.remove(); };
    m.querySelector('#wimsHeldExport').onclick=function(){ try{ navigator.clipboard.writeText(JSON.stringify(list,null,2)); say('Copied'); }catch(e){ say('Copy not available'); } };
    m.onclick=function(e){ if(e.target===m) m.remove(); };
    m.querySelectorAll('[data-wretry]').forEach(function(b){ b.onclick=function(){ m.remove(); window.wimsReleaseHeld(b.getAttribute('data-wretry')); }; });
  }
  setTimeout(renderHeldBar, 3000);
  // outcome ng interactive filing: filed/replay → ok; conflict → HOLD (may-ari, nakikita sa banner) at durable na babala, pero
  // tuloy ang completion (rehistrado na ang gamit ng JO sa orihinal na declaration — nasa warehouse review ang bagong entries)
  window.wimsLastOutcome=null;
  // returns true only when the held record is verifiably in storage
  function holdInteractive(jobId, rpc, args, jo, kind, msg, conflictId){
    var ok=qPut({qid:Date.now()+'_'+Math.random().toString(36).slice(2,6),rpc:rpc,args:args,jo:jo,job:jobId,ts:Date.now(),owner:_wOwner(),ouser:(function(){ try{ return myTeam||''; }catch(e){ return ''; } })(),held:msg,heldAt:Date.now(),kind:kind,conflict_id:conflictId||null});
    renderHeldBar(); return ok;
  }
  async function outcome(res, jobId, rpc, args, okMsg){
    window.wimsLastOutcome={status:res.status, message:res.message||'', job:jobId, conflict_id:res.conflict_id||null, reason:res.reason||null};
    if(res.status==='conflict'){
      var kept=holdInteractive(jobId, rpc, args, args.p_jo, 'conflict', res.message||'Conflict with the filed declaration', res.conflict_id);   // one atomic record write
      if(kept) say('⚠ '+(res.message||'May WIMS declaration NA ang JO na ito — hindi binago ang inventory.')+' Naka-hold ang report (⚠ banner).');
      else say('⚠ '+(res.message||'May WIMS declaration NA ang JO na ito.')+' Nasa warehouse review ang bagong entries (server copy'+(res.conflict_id?' '+String(res.conflict_id).slice(0,8):'')+'); hindi na nakasya sa phone queue.');
      window.wimsLastOutcome.heldLocally=!!kept;
      return null;   // the server holds the durable copy (conflict row) — completion proceeds
    }
    say(res.status==='replay'?'📦 WIMS report already filed (same report)':okMsg);
    return null;
  }
  window.wimsSessionFoc=function(){ return focPrev; };   // read-only: what the next JO's START is prefilled from
  window.wimsHeldReports=function(){ return qAll().filter(function(x){ return !!x.held; }); };
  window.wimsReleaseHeld=async function(qid){
    var r=await withQueueLock(function(){ hydrateQueue(); qPatch(qid, function(x){ delete x.held; delete x.heldAt; delete x.kind; delete x.lock; }); return true; });   // own record only (atomic)
    if(r===LOCK_BUSY){ qPatch(qid, function(x){ delete x.held; delete x.heldAt; delete x.kind; delete x.lock; }); }   // a blob-only record waits for the next hydrate
    renderHeldBar(); return flushWims(); };
  try{ window.addEventListener('online', function(){ setTimeout(flushWims, 2000); }); }catch(e){}
  setInterval(flushWims, 60000);
  setTimeout(flushWims, 8000);

  // Returns: null = filed / na-queue (offline) / walang kailangan, o ERROR
  // MESSAGE string kapag ang report ay HINDI naitala — hinaharang ng caller
  // (confirmComplete) ang JO.
  window.wimsSubmit = async function(jobId, job){
    var _rpc=null,_args=null,_jo=null;
    try{
      var acc=await ensureAccess(); if(!acc) return null;
      var s=wState[jobId];
      // 🎫/🔀/📺 SLR ticket · Transfer · IPTV → sariling RPC (ticket_usage):
      // CPE optional, mandatory declare (server pa rin ang nagpapasya ng task).
      var ft=flexType(job);
      if(ft){
        if(!s) return null;
        var tmats={}; Object.keys(s.mats||{}).forEach(function(k){ if(k!=='foc'&&s.mats[k]>0) tmats[k]=s.mats[k]; });
        var thS=(s.focStart!==''&&s.focStart!=null), thE=(s.focEnd!==''&&s.focEnd!=null);
        if(thS!==thE) return '⚠ WIMS: incomplete FOC footage — START and END meters are required';
        if(ft==='IPTV' && !(Array.isArray(s.iptv)&&s.iptv.some(function(x){return !!x;})))
          return 'WIMS: select the installed IPTV box — required for IPTV add-on JOs';
        var tphotos=0; try{ if(typeof photoCount==='function') tphotos=photoCount(jobId); }catch(e){}
        var twa=''; try{ twa=(typeof shiftAccount!=='undefined'?shiftAccount:'')||''; }catch(e){ twa=''; }
        var targs={
          p_jo: (job&&(job.job_order_no||job.ticket_no))||jobId,
          p_job_id: jobId,   // Phase 1: canonical public.jobs.id — one declaration per job (server resolves the JO no when absent)
          p_subscriber: (job&&job.subscriber)||'',
          p_account: (job&&job.ibass_acct_no)||'',
          p_work_account: twa,
          p_modem_serial: s.modem||null,
          p_iptv_serials: (function(){ var a=Array.isArray(s.iptv)?s.iptv:[]; var seen={},out=[]; a.forEach(function(x){ if(x&&!seen[x]){seen[x]=1;out.push(x);} }); return out; })(),
          p_kit: (s.kit&&typeof s.kit==='object'?s.kit:{}),
          p_materials: tmats,
          p_photos: tphotos,
          p_foc_reel: s.focReel||null,
          p_foc_start: thS?parseFloat(s.focStart):null,
          p_foc_end: thE?parseFloat(s.focEnd):null,
          p_foc2_reel: (s.foc2On&&s.foc2Reel)?s.foc2Reel:null,
          p_foc2_end: (s.foc2On&&!isNaN(parseFloat(s.foc2End)))?parseFloat(s.foc2End):null,
          p_kit_remarks: (s.kitRemarks||'').trim()||null,
          p_pulled_serials: (function(){ var a=(s.pulled||'').split(/[,\s]+/).filter(function(x){return !!x;}); return a.length?a:null; })(),
          p_pulled_note: null
        };
        _rpc='ticket_usage'; _args=targs; _jo=targs.p_jo;
        var tres=await fileDeclaration('ticket_usage', targs);
        if(tres.status==='error') throw (tres.error||new Error(tres.message));
        if(thS&&thE&&tres.status==='filed'){
          focPrev={ reel_no:(s.foc2On&&s.foc2Reel)?s.foc2Reel:(s.focReel||null),
                    end_m:(s.foc2On&&!isNaN(parseFloat(s.foc2End)))?parseFloat(s.foc2End):parseFloat(s.focEnd) };
        }
        if(tres.status==='filed'||tres.status==='replay') refreshPrevFoc();   // fenced; the completion does not wait for it
        cpeCache=null;
        return await outcome(tres, jobId, 'ticket_usage', targs, '📦 WIMS usage filed — deducted from your inventory');
      }
      if(!s || !s.modem) return null;   // nothing reported → skip (gate na ang humaharang sa enrolled)
      var mats={}; Object.keys(s.mats||{}).forEach(function(k){ if(k!=='foc'&&s.mats[k]>0) mats[k]=s.mats[k]; });
      // FOC FOOTAGE RULE: kapag may start O end, kailangan pareho; used = |end − start|
      var hasStart=(s.focStart!==''&&s.focStart!=null), hasEnd=(s.focEnd!==''&&s.focEnd!=null);
      if(hasStart!==hasEnd) return '⚠ WIMS: incomplete FOC footage — START and END meters are required';
      if(kitExcess(s) && !(s.kitRemarks||'').trim()) return '⚠ WIMS: kit usage exceeds the standard kit — remarks are REQUIRED';
      if(s.foc2On){
        if(!(s.foc2Reel||'').trim()) return '⚠ WIMS: Reel 2 # is required';
        var e2=parseFloat(s.foc2End);
        if(isNaN(e2)||e2<0||e2>=SPOOL) return '⚠ WIMS: Reel 2 END must be between 0 and '+SPOOL+' (pababa mula '+SPOOL+')';
        if(!hasStart||!hasEnd) return '⚠ WIMS: complete reel 1 footage first (START and END)';
      }
      var used=focUsed(s);
      if(hasStart&&hasEnd){
        if(!(used>0)) return '⚠ WIMS: FOC start and end meters are the same — nothing used?';
        mats.foc=used;
      }
      var photos=0; try{ if(typeof photoCount==='function') photos=photoCount(jobId); }catch(e){}
      var wa=''; try{ wa=(typeof shiftAccount!=='undefined'?shiftAccount:'')||''; }catch(e){ wa=''; }
      var args={
        p_jo: (job&&job.job_order_no)||jobId,
        p_job_id: jobId,   // Phase 1: canonical public.jobs.id — one declaration per job
        p_subscriber: (job&&job.subscriber)||'',
        p_account: (job&&(job.ibass_acct_no||job.account_no||job.account))||'',
        p_work_account: wa,
        p_modem_serial: s.modem,
        p_iptv_serials: (function(){ var a=Array.isArray(s.iptv)?s.iptv:[]; var seen={},out=[]; a.forEach(function(x){ if(x&&!seen[x]){seen[x]=1;out.push(x);} }); return out; })(),
        p_kit: (s.kit&&typeof s.kit==='object'?s.kit:{}),
        p_materials: mats,
        p_photos: photos,
        p_foc_reel: s.focReel||null,
        p_foc_start: hasStart?parseFloat(s.focStart):null,
        p_foc_end: hasEnd?parseFloat(s.focEnd):null,
        p_foc2_reel: (s.foc2On&&s.foc2Reel)?s.foc2Reel:null,
        p_foc2_end: (s.foc2On&&!isNaN(parseFloat(s.foc2End)))?parseFloat(s.foc2End):null,
        p_kit_remarks: (s.kitRemarks||'').trim()||null
      };
      _rpc='complete_install'; _args=args; _jo=args.p_jo;
      var ires=await fileDeclaration('complete_install', args);
      if(ires.status==='error') throw (ires.error||new Error(ires.message));
      // chain continuity for the NEXT JO: a freshly FILED reading is applied at once, then the server's accepted chronology
      // (my_last_foc) is reloaded for every accepted outcome — a replay of an older receipt never rewinds it
      if(hasStart&&hasEnd&&ires.status==='filed'){
        focPrev={ reel_no:(s.foc2On&&s.foc2Reel)?s.foc2Reel:(s.focReel||null),
                  end_m:(s.foc2On&&!isNaN(parseFloat(s.foc2End)))?parseFloat(s.foc2End):parseFloat(s.focEnd) };
      }
      if(ires.status==='filed'||ires.status==='replay') refreshPrevFoc();   // fenced; the completion does not wait for it
      cpeCache=null;   // installed CPE leaves the issued pool
      return await outcome(ires, jobId, 'complete_install', args, '📦 WIMS material report filed');
    }catch(e){
      try{console.warn('wimsSubmit',e);}catch(_){ }
      // LUMANG backend na nag-raise ng DECLARED_ALREADY (walang conflict table sa server): tanging kopya ng report ay ang phone —
      // kailangang MAISULAT nang tiyak bago payagan ang completion; kung hindi, HARANG na may malinaw na dahilan.
      if(isDeclaredAlready(e)){
        var kept=holdInteractive(jobId, _rpc, _args, _jo, 'conflict', String(e.message||''));
        if(!kept) return '⚠ WIMS: may declaration na ang JO na ito at HINDI maisave sa phone ang bagong report (puno ang WIMS queue — i-review/i-retry ang mga naka-hold na report, o ipaalam sa warehouse) bago i-complete.';
        return null;
      }
      // NETWORK/JWT lang ang dahilan → i-QUEUE at payagan ang completion
      // (ang jobs patch mismo ay naka-offline-queue rin, magkasabay silang aabot)
      if(_rpc && isNetErr(e)){
        // 4C F4 (owner 2026-10-07) + Phase 1: kapag puno ang queue O bigo ang pagsulat, HUWAG magpanggap na "QUEUED" —
        // tapat na error → hinaharang ng file-first ang completion. Ang write ay bineberipika (qPut).
        var qitem={qid:Date.now()+'_'+Math.random().toString(36).slice(2,6),rpc:_rpc,args:_args,jo:_jo,job:jobId,ts:Date.now(),owner:_wOwner(),ouser:(function(){ try{ return myTeam||''; }catch(e){ return ''; } })()};
        var put=qPut(qitem);   // one atomic record write; verified by read-back
        if(!put){
          return '⚠ WIMS offline queue is full or this phone could not save the report ('+QMAX+' max) — this report was NOT queued. Review/retry the held reports (⚠ banner) or contact the warehouse, then try again.';
        }
        say('📴 Walang signal — WIMS report QUEUED, isesend automatic kapag online na');
        return null;
      }
      // Lumang/maling serial sa cache? I-refresh ang picker para tama ang susunod na pili
      if(/not released to your team/i.test(String(e.message||''))) cpeCache=null;
      // VALIDATION error → HINDI naitala ang report → HARANGIN ang completion
      return 'WIMS report NOT saved — '+(e.message||e)+'. Ayusin ito bago i-complete ang JO (o ipaalam sa warehouse).';
    }
  };
})();
