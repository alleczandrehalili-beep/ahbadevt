// ---------- data ----------
    async function loadJobs(){
      const {data,error} = await sb.from('jobs').select('*').eq('team',myTeam).is('deleted_at',null).order('updated_at',{ascending:false});
      if(error) throw error; return data||[];
    }
    async function loadPhotos(){
      const ids=jobs.map(j=>j.id); if(!ids.length){photoData={};return;}
      try{
        const {data}=await sb.from('job_photos').select('job_id,path,label').in('job_id',ids);
        const m={}; (data||[]).forEach(r=>{(m[r.job_id]=m[r.job_id]||[]).push({path:r.path,label:r.label||''})}); photoData=m;
      }catch(e){ /* keep previous counts */ }
    }
    const jobPhotos = id => (photoData[id]||[]);
    const labelsDone = id => new Set(jobPhotos(id).map(p=>p.label).filter(Boolean));
    const photoCount = id => labelsDone(id).size;            // distinct required labels filled (max 12)
    function photoSlots(id){
      const byLabel={}; jobPhotos(id).forEach(p=>{ if(p.label)(byLabel[p.label]=byLabel[p.label]||[]).push(p.path); });
      const done=PHOTO_LABELS.filter(l=>byLabel[l]&&byLabel[l].length).length;
      const rows=PHOTO_LABELS.map((l,i)=>{
        const arr=byLabel[l]||[]; const has=arr.length>0; const lab=l.replace(/"/g,'&quot;');
        const thumb=has?`<div class="thumbs">${arr.map(p=>`<span style="position:relative;display:inline-block"><img src="${pubUrl(p)}" alt=""><button type="button" data-delp="${p}" data-deljob="${id}" title="Delete" style="position:absolute;top:-6px;right:-6px;background:#c2503a;color:#fff;border:0;border-radius:50%;width:19px;height:19px;font-size:11px;line-height:1;padding:0">✕</button></span>`).join('')}</div>`:'';
        return `<div class="pslot ${has?'done':''}"><div class="pslot-head"><span>${i+1}. ${l}</span><span class="pchk ${has?'ok':'need'}">${has?'✓':'•'}</span></div>${thumb}<div style="display:flex;gap:6px;margin-top:6px"><label class="addphoto pmini">${svg('camera')} Camera<input type="file" accept="image/*" capture="environment" hidden data-up="${id}" data-label="${lab}"></label><label class="addphoto pmini">${svg('note')} Album<input type="file" accept="image/*" hidden data-up="${id}" data-label="${lab}"></label></div></div>`;
      }).join('');
      return `<div class="photos"><div class="photos-head"><span>Proof photos (${PHOTOS_REQUIRED} required)</span><span class="count ${done>=PHOTOS_REQUIRED?'ok':'need'}">${done}/${PHOTOS_REQUIRED}</span></div>
        <label class="addphoto" style="margin:4px 0 8px;background:#e9f6f0;border-color:#a8e6c9;color:#0e7a55;font-weight:800">📁 Quick upload — select many from the album<input type="file" accept="image/*" multiple hidden data-bulk="${id}"></label>
        <div style="font-size:10px;color:#8a9894;margin:-4px 0 6px">The selected photos will go into the remaining slots in order (1→12).</div>
        <div class="pslots">${rows}</div></div>`;
    }
    let knownJobIds=null;   // for detecting newly-arrived loads (sound)
    async function refresh(){
      await flushQueue();   // retry any queued (offline) writes before showing status
      flushPhotoQueue();    // retry any queued photo uploads (background)
      try{
        jobs=await loadJobs();
        // Keep not-yet-synced (queued) job changes visible so a poll can't flicker them back to old state.
        try{ syncQLoad().forEach(it=>{ if((it.table||'jobs')!=='jobs')return; const id=(it.match&&it.match.id)||it.id; const j=jobs.find(x=>x.id===id); if(j) Object.assign(j, it.payload||it.patch); }); }catch(e){}
        await loadPhotos();
        // Detect brand-new load(s) for this team → distinct sound + notification
        const ids=new Set(jobs.map(j=>j.id));
        if(knownJobIds){
          const fresh=jobs.filter(j=>!knownJobIds.has(j.id) && !['completed','cancelled'].includes(j.status));
          if(fresh.length){ playLoadSound(); notify('🆕 New load', fresh[0].subscriber||fresh[0].id); }
        }
        knownJobIds=ids;
        render(); if(syncQCount()>0) setSync('syncing', syncQCount()+' pending sync'); else setSync('live','Synced');
      }
      catch(err){ setSync('error', syncQCount()>0 ? (syncQCount()+' pending — offline') : 'Sync error'); console.warn('sync:',err.message) }
    }
    // Serial workflow — a technician works ONE load at a time. Cannot update another load
    // until the current in-progress one is Completed / Cancelled / Incomplete.
    function serialBlocked(id){
      const x=jobs.find(j=>j.id===id);
      if(x && ['en-route','on-site','in-progress'].includes(x.status)) return false;   // acting on the active load — OK
      const busy=jobs.find(j=>['en-route','on-site','in-progress'].includes(j.status));
      if(busy){ toast('⚠ Tapusin muna ang kasalukuyang load: '+busy.id+(busy.subscriber?' ('+busy.subscriber+')':'')+' — Complete, Cancel, o Incomplete bago mag-update ng iba.'); return true; }
      return false;
    }
    async function advance(id,next){
      if(serialBlocked(id)) return;
      const job=jobs.find(j=>j.id===id); if(!job) return;
      if(next==='completed'){
        if(photoCount(id)<PHOTOS_REQUIRED){ toast(`Attach ${PHOTOS_REQUIRED} photos first (${photoCount(id)}/${PHOTOS_REQUIRED})`); return; }
        openComplete(id); return;   // capture payment before completing
      }
      const prev=job.status; job.status=next; render(); setSync('syncing','Saving…');
      const hist=appendHist(await freshHist(id, job.history), `→ ${statusLabel(next)} (by ${myTeam})`);
      job.history=hist;
      // Never roll back / lose the action: on failure it is queued and retried automatically.
      const ok=await saveJobPatch(id, {status:next, history:hist, updated_at:new Date().toISOString()});
      if(ok){ setSync('live','Synced'); toast(`${id} → ${statusLabel(next)}`); }
      else { setSync('syncing', syncQCount()+' pending sync'); toast('Saved — will sync when back online'); }
      logTrack('status:'+next, job.area||job.city);
    }
    // Compress/resize a photo to the smallest readable size (~60 KB) to save cloud space + data.
    function compressImage(file, maxDim=900, targetKB=60){
      return new Promise(resolve=>{
        if(!file || !(file.type||'').startsWith('image/')){ resolve(file); return; }
        const img=new Image(); const url=URL.createObjectURL(file);
        img.onload=async ()=>{
          let w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
          let scale=Math.min(1, maxDim/Math.max(w,h)); w=Math.round(w*scale); h=Math.round(h*scale);
          const draw=(ww,hh)=>{const cv=document.createElement('canvas');cv.width=ww;cv.height=hh;cv.getContext('2d').drawImage(img,0,0,ww,hh);return cv;};
          let cv=draw(w,h);
          const toBlob=(c,q)=>new Promise(r=>c.toBlob(b=>r(b),'image/jpeg',q));
          let q=0.5, blob=await toBlob(cv,q);
          // step quality down to 0.3
          while(blob && blob.size>targetKB*1024 && q>0.3){ q=Math.round((q-0.05)*100)/100; blob=await toBlob(cv,q); }
          // still too big? shrink dimensions once more and retry at low quality
          if(blob && blob.size>targetKB*1024 && Math.max(w,h)>640){ w=Math.round(w*0.75); h=Math.round(h*0.75); cv=draw(w,h); blob=await toBlob(cv,0.4); }
          URL.revokeObjectURL(url); resolve(blob||file);
        };
        img.onerror=()=>{ URL.revokeObjectURL(url); resolve(file); };
        img.src=url;
      });
    }
    // Upload one image to a given label
    // ---- Photo upload queue (IndexedDB) ----
    // A proof photo attached on a flaky connection is never lost: the compressed blob is
    // persisted and retried on reconnect. Per policy, it counts toward the required set only
    // AFTER it actually uploads — so completion still requires photos in the cloud.
    let _pqDb=null;
    function pqOpen(){ return new Promise((res,rej)=>{ if(_pqDb) return res(_pqDb); const r=indexedDB.open('ahba_photoq',1);
      r.onupgradeneeded=()=>{ r.result.createObjectStore('q',{keyPath:'key',autoIncrement:true}); };
      r.onsuccess=()=>{ _pqDb=r.result; res(_pqDb); }; r.onerror=()=>rej(r.error); }); }
    async function pqAdd(rec){ const db=await pqOpen(); return new Promise((res,rej)=>{ const tx=db.transaction('q','readwrite'); tx.objectStore('q').add(rec); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
    async function pqAll(){ const db=await pqOpen(); return new Promise(res=>{ const out=[]; const tx=db.transaction('q','readonly'); const cur=tx.objectStore('q').openCursor(); cur.onsuccess=e=>{ const c=e.target.result; if(c){ out.push(c.value); c.continue(); } else res(out); }; cur.onerror=()=>res(out); }); }
    async function pqDel(key){ const db=await pqOpen(); return new Promise(res=>{ const tx=db.transaction('q','readwrite'); tx.objectStore('q').delete(key); tx.oncomplete=()=>res(); tx.onerror=()=>res(); }); }
    async function pqCount(){ try{ return (await pqAll()).length; }catch(e){ return 0; } }
    // Retry any queued photo uploads; on success, insert the row + count it, then re-render.
    async function flushPhotoQueue(){
      let items=[]; try{ items=await pqAll(); }catch(e){ return; }
      if(!items.length) return; let changed=false;
      for(const it of items){
        try{
          const {error}=await sb.storage.from('job-photos').upload(it.path, it.blob, {contentType:'image/jpeg', upsert:false});
          if(error) throw error;
          await sb.from('job_photos').insert({job_id:it.jobId, team:myTeam, path:it.path, label:it.label||''});
          await pqDel(it.key);
          (photoData[it.jobId]=photoData[it.jobId]||[]).push({path:it.path,label:it.label||''});
          changed=true;
        }catch(e){ break; }   // still offline / failing → stop, retry next cycle
      }
      if(changed) render();
    }
    async function uploadOne(jobId, file, label){
      const blob=await compressImage(file);
      const safe=(label||'photo').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,40);
      const path=`${jobId}/${safe}_${Date.now()}_${Math.random().toString(36).slice(2,7)}.jpg`;
      try{
        const {error}=await sb.storage.from('job-photos').upload(path, blob, {contentType:'image/jpeg', upsert:false});
        if(error) throw error;
        await sb.from('job_photos').insert({job_id:jobId, team:myTeam, path, label:label||''});
        (photoData[jobId]=photoData[jobId]||[]).push({path,label:label||''});
      }catch(e){
        // Persist the photo so a flaky connection can't lose it; it retries on reconnect.
        try{ await pqAdd({jobId, label:label||'', path, blob}); }catch(_){}
        throw e;   // caller still treats it as not-yet-uploaded (gate unchanged)
      }
    }
    // Delete a wrongly-uploaded proof photo (DB row + storage file), then re-render.
    async function deletePhoto(jobId, path){
      if(!confirm('Delete this photo? This cannot be undone.')) return;
      try{
        const {error}=await sb.from('job_photos').delete().eq('job_id',jobId).eq('path',path); if(error) throw error;
        try{ await sb.storage.from('job-photos').remove([path]); }catch(e){}
        photoData[jobId]=(photoData[jobId]||[]).filter(p=>p.path!==path);
        toast('Photo deleted'); render();
      }catch(e){ toast('Delete failed: '+e.message); }
    }
    // Bulk: pick many photos at once → auto-assign to the remaining empty slots in order, upload in parallel
    async function uploadBulk(jobId, fileList){
      const files=[...fileList]; if(!files.length)return;
      const done=labelsDone(jobId);
      const empty=PHOTO_LABELS.filter(l=>!done.has(l));
      if(!empty.length){ toast('All 12 are complete — no empty slot'); return; }
      const pairs=files.slice(0,empty.length).map((f,i)=>({f,label:empty[i]}));
      const extra=files.length-pairs.length;
      toast(`Uploading ${pairs.length} photo(s)…`);
      let ok=0;
      await Promise.all(pairs.map(async ({f,label})=>{ try{ await uploadOne(jobId,f,label); ok++; }catch(e){ console.warn('bulk',e.message); } }));
      render();
      toast(`${photoCount(jobId)}/${PHOTOS_REQUIRED} complete${extra>0?` · ${extra} extra (full)`:''}${ok<pairs.length?` · ${pairs.length-ok} queued (will upload when online)`:''}`);
    }
    async function uploadPhotos(jobId, fileList, label){
      const files=[...fileList]; if(!files.length)return;
      label=label||'';
      toast(`Uploading ${label||'photo'}…`);
      let ok=0;
      // upload all selected (for this label) in parallel
      await Promise.all(files.map(async f=>{ try{ await uploadOne(jobId,f,label); ok++; }catch(e){ console.warn('upload',e.message); } }));
      render();
      toast(ok===files.length?`${ok} photo${ok>1?'s':''} added`:`${ok}/${files.length} uploaded — try the rest again`);
    }

    // ---------- technician expense ----------
    function openMobileExpense(jobId){
      $('#mexpModal').dataset.job=jobId; $('#mexpJob').textContent='For '+jobId;
      $('#mexp_amount').value=''; $('#mexp_desc').value=''; clearErr('#mexpErr');
      $('#mexpBack').classList.remove('hidden'); $('#mexpModal').classList.remove('hidden');
    }
    function closeMobileExpense(){ $('#mexpBack').classList.add('hidden'); $('#mexpModal').classList.add('hidden'); }
    async function saveMobileExpense(){
      const jobId=$('#mexpModal').dataset.job, cat=$('#mexp_cat').value, amt=Number($('#mexp_amount').value), desc=$('#mexp_desc').value.trim();
      if(!amt||amt<=0){ showErr('#mexpErr','Enter a valid amount.'); return; }
      const btn=$('#mexpSave'); btn.disabled=true; btn.textContent='Saving…';
      try{
        const {error}=await sb.from('expenses').insert({team:myTeam, job_id:jobId, category:cat, description:desc, amount:amt, status:'Pending', work_date:manilaDate()});
        if(error) throw error;
        toast('Expense submitted'); closeMobileExpense();
      }catch(e){ showErr('#mexpErr','Failed: '+e.message); }
      btn.disabled=false; btn.textContent='Save expense';
    }

    // ---------- negative job order ----------
    let negPhotoFiles=[];   // mandatory reference photo(s) for an Incomplete/Negative load
    function renderNegThumbs(){ const t=$('#negPhotoThumbs'); if(!t) return; t.innerHTML=negPhotoFiles.map((f,i)=>`<span style="position:relative;display:inline-block"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" data-negdel="${i}" style="position:absolute;top:-6px;right:-6px;background:#c2503a;color:#fff;border:0;border-radius:50%;width:19px;height:19px;font-size:11px;line-height:1;padding:0">✕</button></span>`).join(''); t.querySelectorAll('[data-negdel]').forEach(b=>b.onclick=()=>{ negPhotoFiles.splice(Number(b.dataset.negdel),1); renderNegThumbs(); }); }
    const NEG_REASONS=['RS BY SUBS','UNCONTACTED/UNLOCATED','BARANGAY/ADMIN/PERMIT ISSUE','SUBS FACILITY CONCERN','FULL NAP','OTHERS'];
    const CANCEL_REASONS=['DUPLICATE ENTRY','WRONG/INCOMPLETE INFO','SUBS BACKED OUT','NO LONGER INTERESTED','NOT SERVICEABLE','OTHERS'];
    function openNegative(jobId, mode){
      if(serialBlocked(jobId)) return;
      mode = mode==='cancel' ? 'cancel' : 'negative';
      const m=$('#negModal'); m.dataset.job=jobId; m.dataset.mode=mode; $('#negJob').textContent='For '+jobId;
      const h3=m.querySelector('h3'); if(h3) h3.textContent = mode==='cancel' ? 'Cancel job (photo required)' : 'Mark as Incomplete';
      const sb=$('#negSave'); if(sb) sb.textContent = mode==='cancel' ? 'Cancel job' : 'Save as Negative';
      const sel=$('#neg_remark'); if(sel){ sel.innerHTML=(mode==='cancel'?CANCEL_REASONS:NEG_REASONS).map(o=>`<option>${o}</option>`).join(''); sel.onchange=()=>$('#negOtherWrap').classList.toggle('hidden', sel.value!=='OTHERS'); }
      $('#neg_other').value=''; $('#negOtherWrap').classList.add('hidden'); clearErr('#negErr');
      negPhotoFiles=[]; if($('#neg_photo_cam'))$('#neg_photo_cam').value=''; if($('#neg_photo_alb'))$('#neg_photo_alb').value=''; renderNegThumbs();
      $('#negBack').classList.remove('hidden'); $('#negModal').classList.remove('hidden');
    }
    function closeNegative(){ $('#negBack').classList.add('hidden'); $('#negModal').classList.add('hidden'); }
    async function saveNegative(){
      const m=$('#negModal'); const jobId=m.dataset.job; const mode=m.dataset.mode==='cancel'?'cancel':'negative';
      const sel=$('#neg_remark').value, other=$('#neg_other').value.trim();
      if(sel==='OTHERS'&&!other){ showErr('#negErr','Please specify the reason.'); return; }
      if(!negPhotoFiles.length){ showErr('#negErr', mode==='cancel'?'At least one reference photo is required to cancel this load.':'At least one reference photo is required to mark Incomplete.'); return; }
      const remark=sel==='OTHERS'?('OTHERS: '+other):sel;
      const btn=$('#negSave'); btn.disabled=true; btn.textContent='Uploading photo…';
      try{
        // Upload the mandatory reference photo(s) FIRST — must succeed before closing the JO.
        const label = mode==='cancel'?'Cancelled proof':'Incomplete proof';
        let ok=0; for(const f of negPhotoFiles){ try{ await uploadOne(jobId, f, label); ok++; }catch(e){ console.warn('proof',e.message); } }
        if(!ok){ btn.disabled=false; btn.textContent=(mode==='cancel'?'Cancel job':'Save as Negative'); showErr('#negErr','Photo upload failed — please try again.'); return; }
        btn.textContent='Saving…';
        const now=new Date().toISOString();
        const j=jobs.find(x=>x.id===jobId);
        const verb = mode==='cancel'?'Cancelled':'Negative';
        const hist=appendHist(await freshHist(jobId, j&&j.history), verb+': '+remark+' ('+ok+' photo'+(ok>1?'s':'')+') (by '+myTeam+(shiftAccount?' / '+shiftAccount:'')+')');
        const patch = mode==='cancel'
          ? {status:'cancelled', updated_at:now, history:hist}
          : {status:'negative', negative_remark:remark, negative_at:now, updated_at:now, history:hist};
        if(mode!=='cancel' && shiftAccount){ patch.work_account=shiftAccount; patch.crew_driver=shiftDriver; patch.crew_tech1=shiftTech1; patch.crew_tech2=shiftTech2; }
        const synced=await saveJobPatch(jobId, patch);
        if(j){ Object.assign(j, patch); logTrack('status:'+patch.status, j.area||j.city); }
        closeNegative(); viewMode = mode==='cancel'?'todo':'negative'; render();
        toast(synced ? (mode==='cancel'?'Job cancelled':'Marked as Incomplete') : 'Saved — will sync when back online');
        if(!synced) setSync('syncing', syncQCount()+' pending sync');
      }catch(e){ showErr('#negErr','Failed: '+e.message); }
      btn.disabled=false; btn.textContent = ($('#negModal').dataset.mode==='cancel'?'Cancel job':'Save as Negative');
    }

    // Re-read the latest history straight from the cloud right before appending, so a concurrent
    // console/dispatcher edit isn't clobbered by a stale in-memory copy (last-writer-wins guard).
    async function freshHist(id, fallback){
      try{ const {data}=await sb.from('jobs').select('history').eq('id',id).single(); if(data) return data.history; }catch(e){}
      return fallback;
    }
    // ---------- cancel job (→ Cancelled column on dashboard) ----------
    async function cancelJob(id){
      const job=jobs.find(j=>j.id===id); if(!job)return;
      const reason=prompt('Cancel this job order?\nIt will go to Cancelled on the dashboard.\n\nReason (optional):');
      if(reason===null) return;   // dismissed
      const now=new Date().toISOString();
      const hist=appendHist(await freshHist(id, job.history), 'Cancelled (by '+myTeam+')'+(reason.trim()?': '+reason.trim():''));
      const patch={status:'cancelled', updated_at:now, history:hist};
      try{
        const ok=await saveJobPatch(id, patch);
        Object.assign(job, patch);
        render(); logTrack('status:cancelled', job.area||job.city);
        toast(ok?'Job cancelled':'Cancelled — will sync when back online');
        setSync(ok?'live':'syncing', ok?'Synced':(syncQCount()+' pending sync'));
      }catch(e){ toast('Failed: '+e.message); }
    }

    // ---------- complete with payment ----------
    let payProofFile=null;   // Proof of Remittance photo (required when Gcash)
    function togglePayProof(){ const g=$('#pay_mode').value==='Gcash'; $('#payProofWrap').classList.toggle('hidden',!g); }
    function openComplete(jobId){
      $('#payModal').dataset.job=jobId; $('#payJob').textContent='For '+jobId;
      $('#pay_amount').value=''; $('#pay_ar').value=''; clearErr('#payErr');
      payProofFile=null; if($('#pay_proof_cam'))$('#pay_proof_cam').value=''; if($('#pay_proof_alb'))$('#pay_proof_alb').value=''; if($('#payProofName'))$('#payProofName').textContent='';
      togglePayProof();
      $('#payBack').classList.remove('hidden'); $('#payModal').classList.remove('hidden');
    }
    function closeComplete(){ $('#payBack').classList.add('hidden'); $('#payModal').classList.add('hidden'); }
    async function confirmComplete(){
      const id=$('#payModal').dataset.job, mode=$('#pay_mode').value, amt=Number($('#pay_amount').value), ar=$('#pay_ar').value.trim();
      if(isNaN(amt)||amt<0){ showErr('#payErr','Enter a valid amount.'); return; }
      if(!ar){ showErr('#payErr','Enter the AR No.'); return; }
      if(mode==='Gcash' && !payProofFile){ showErr('#payErr','Proof of Remittance photo is required for Gcash.'); return; }
      const job=jobs.find(j=>j.id===id); if(!job)return;
      const btn=$('#paySave'); btn.disabled=true; btn.textContent='Saving…';
      const now=new Date().toISOString();
      const hist=appendHist(await freshHist(id, job.history), `→ Completed (by ${myTeam} / ${shiftAccount}) · ${mode} ₱${amt} · AR ${ar}`);
      const patch={status:'completed', payment_mode:mode, payment_amount:amt, ar_no:ar, history:hist, updated_at:now, completed_at:now};
      if(shiftAccount){ patch.work_account=shiftAccount; patch.crew_driver=shiftDriver; patch.crew_tech1=shiftTech1; patch.crew_tech2=shiftTech2; }
      // Never lose the completion/payment: queued + retried automatically if the write fails.
      const ok=await saveJobPatch(id, patch);
      // Upload the Gcash Proof of Remittance (best-effort) so it appears with the load's photos.
      if(mode==='Gcash' && payProofFile){ try{ await uploadOne(id, payProofFile, 'Proof of Remittance'); }catch(e){ console.warn('proof upload',e.message); } }
      btn.disabled=false; btn.textContent='Complete job';
      Object.assign(job, patch);
      closeComplete(); render(); logTrack('status:completed', job.area||job.city);
      if(ok){ toast('Job completed'); setSync('live','Synced'); }
      else { toast('Completed — will sync when back online'); setSync('syncing', syncQCount()+' pending sync'); }
    }
    const sameManilaDay = ts => ts && new Date(ts).toLocaleDateString('en-CA',{timeZone:TZ})===manilaDate();
    // Clickable JO → full info (sales + installer)
    async function showJobInfo(id){
      const body=$('#mInfoBody'); if(!body) return;
      $('#mInfoBack').classList.remove('hidden'); $('#mInfoModal').classList.remove('hidden');
      body.innerHTML='<div class="empty">Loading…</div>';
      try{
        const {data:j}=await sb.from('jobs').select('*').eq('id',id).single();
        if(!j){ body.innerHTML='<div class="empty">Not found.</div>'; return; }
        $('#mInfoTitle').textContent=(j.id||'')+' · '+(j.subscriber||'');
        // Sales Agent = account · renamed mobile-user name (same format as the Validation page).
        let agentLbl=j.created_by||'—';
        if(j.created_by && !/^(CONSOLE|IMPORT)$/i.test(j.created_by)){
          try{ const {data:t}=await sb.from('technicians').select('display_name').eq('username',j.created_by).maybeSingle();
            if(t && t.display_name) agentLbl=j.created_by+' · '+t.display_name; }catch(e){}
        }
        const esc=s=>(s==null?'':String(s)).replace(/</g,'&lt;');
        const row=(label,val)=>(val==null||val==='')?'':`<div class="row" style="justify-content:space-between;gap:12px"><span style="color:#9aa6a2">${label}</span><span style="text-align:right;font-weight:600">${esc(val)}</span></div>`;
        const sec=t=>`<div class="form-sec" style="margin-top:8px">${t}</div>`;
        const money=v=>(v!=null&&v!=='')?('₱'+Number(v).toLocaleString()):'';
        body.innerHTML=[
          sec('Status'), row('Status',saStatusLabel(j.status)), row('Team',j.team), row('Sales Agent',agentLbl), row('Priority',j.priority),
          sec('Subscriber'), row('Name',j.subscriber), row('Primary no.',j.primary_no), row('Other no.',j.other_contact_no),
          sec('Address'), row('Address',j.address), row('District',j.district?('District '+j.district):''), row('Barangay',j.brgy), row('City',j.city||j.area),
          sec('Service'), row('Unit type',j.dwelling_type), row('Plan',j.plan), row('Add-on',j.add_on), row('Reference no.',j.ref_no),
          row('1P/2P',j.play_type), row('Add-ons (2P)',j.addon_count), row('Installation fee',j.install_fee_type), row('Amount to collect',money(j.amount_to_collect)),
          row('JO Number',j.job_order_no), row('IBAS',j.ibass_acct_no), row('VAS no.',j.vas_no), row('Source',j.source_of_sales), row('Referral',j.referral_name),
          row('Special note',j.special_note),
          (j.dispatched_remarks?sec('Dispatcher')+row('Remarks',j.dispatched_remarks):''),
          (j.negative_remark?sec('Incomplete')+row('Reason',j.negative_remark):''),
          (j.payment_mode||j.payment_amount?sec('Payment')+row('Mode',j.payment_mode)+row('Amount',money(j.payment_amount))+row('AR No.',j.ar_no):'')
        ].join('');
      }catch(e){ body.innerHTML='<div class="empty">Could not load.</div>'; }
    }
    function closeMInfo(){ $('#mInfoBack').classList.add('hidden'); $('#mInfoModal').classList.add('hidden'); }
    // Technician history — browse ALL previously dispatched JOs (any date/status); tap a JO for full detail.
    function renderTechHistory(el){
      const dEl=$('#techHistDate');
      if(dEl && !dEl.dataset.wired){
        dEl.dataset.wired='1';
        dEl.onchange=render;
        const allB=$('#techHistAll'); if(allB) allB.onclick=()=>{ dEl.value=''; dEl.dataset.cur=''; render(); };
      }
      const mday=ts=>ts?new Date(ts).toLocaleDateString('en-CA',{timeZone:TZ}):'';
      const escq=s=>(s==null?'':String(s)).replace(/"/g,'&quot;').replace(/</g,'&lt;');
      const pick=(dEl&&dEl.value)||'';
      let rows=jobs.slice().sort((a,b)=>new Date(b.scheduled_at||b.created_at||b.updated_at||0)-new Date(a.scheduled_at||a.created_at||a.updated_at||0));
      if(pick) rows=rows.filter(j=>mday(j.scheduled_at||j.created_at)===pick);
      const cEl=$('#techHistCount'); if(cEl) cEl.textContent=`${rows.length} JO${rows.length===1?'':'s'}${pick?(' · '+pick):' total'}`;
      if(!rows.length){ el.innerHTML=`<div class="empty">${svg('inbox')}${pick?('Walang JO noong '+pick+'.'):'Wala pang naunang job order.'}<br>Lalabas dito ang mga naunang na-dispatch sa inyo.</div>`; return; }
      el.innerHTML=rows.map(j=>{
        const when=mday(j.scheduled_at||j.created_at);
        const meta=[j.plan,j.play_type].filter(Boolean).map(escq).join(' · ');
        return `<div class="job" data-info="${escq(j.id)}" style="cursor:pointer">
          <div class="job-head"><div><span class="job-id">${escq(j.id)}</span><h3>${escq(j.subscriber)||'—'}</h3>${meta?`<p class="plan">${meta}</p>`:''}</div><span class="badge b-${j.status}">${statusLabel(j.status)}</span></div>
          <div class="job-meta"><div class="row">${svg('pin')}<span>${escq(j.area||j.address||'—')}</span></div>${when?`<div class="row">${svg('clock')}<span>${when}</span></div>`:''}${j.job_order_no?`<div class="row">${svg('note')}<span>JO ${escq(j.job_order_no)}</span></div>`:''}</div>
          <button class="act ghost" data-info="${escq(j.id)}" style="width:100%;margin-top:8px">${svg('note')} Tingnan ang buong detalye</button>
        </div>`;
      }).join('');
      el.querySelectorAll('[data-info]').forEach(b=>b.onclick=()=>showJobInfo(b.dataset.info));
    }

    function render(){
      const order={'en-route':0,'on-site':1,'in-progress':2,assigned:0,pending:1};
      const todo=jobs.filter(j=>['assigned','pending'].includes(j.status));
      const inprog=jobs.filter(j=>['en-route','on-site','in-progress'].includes(j.status));
      const negs=jobs.filter(j=>j.status==='negative'&&sameManilaDay(j.negative_at||j.updated_at));
      const doneToday=jobs.filter(j=>j.status==='completed'&&sameManilaDay(j.updated_at));
      $('#cToDo').textContent=todo.length;
      $('#cActive').textContent=inprog.length;
      $('#cDone').textContent=doneToday.length;
      document.querySelectorAll('.jobtabs .jt').forEach(b=>b.classList.toggle('active',b.dataset.view===viewMode));

      let list = viewMode==='todo'?todo : viewMode==='inprogress'?inprog : viewMode==='negative'?negs : doneToday;
      list=list.slice();
      if(viewMode==='todo'||viewMode==='inprogress') list.sort((a,b)=>(order[a.status]??9)-(order[b.status]??9));
      else list.sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));

      const el=$('#jobsList');
      const _thb=$('#techHistBar'); if(_thb) _thb.style.display=(viewMode==='history')?'':'none';
      if(viewMode==='history'){ renderTechHistory(el); return; }
      if(!list.length){
        const msg={todo:'No jobs to do right now.',inprogress:'No jobs in progress.',negative:'No negative job orders today.',done:'No completed jobs yet today.'}[viewMode];
        el.innerHTML=`<div class="empty">${svg('inbox')}${msg}<br>New assignments appear here automatically.</div>`;return;
      }
      const busyId=(jobs.find(x=>['en-route','on-site','in-progress'].includes(x.status))||{}).id;   // serial lock: the one active load
      el.innerHTML=list.map(j=>{
        const f=FLOW[j.status]||{};
        const prio=j.priority?`<span class="prio" style="${j.priority!=='1st Load'?'color:#687974;background:#f1f3f1':''}">${j.priority}</span>`:'';
        const addr=(j.address||j.area||'').replace(/"/g,'');
        const n=photoCount(j.id);
        const allPhotos=jobPhotos(j.id);
        const thumbs=allPhotos.slice(0,6).map(p=>`<img src="${pubUrl(p.path)}" alt="proof">`).join('')+(allPhotos.length>6?`<span class="more">+${allPhotos.length-6}</span>`:'');

        let extra='', actions='';
        const mapLink=`<a class="act ghost" href="https://maps.google.com/?q=${encodeURIComponent(addr)}" target="_blank" rel="noopener" aria-label="Map">${svg('pin')}</a>`;

        if(j.status==='in-progress'){
          const canDone=n>=PHOTOS_REQUIRED;
          extra=photoSlots(j.id);
          actions=`<div class="job-actions">${mapLink}<button class="act done" data-next="completed" data-id="${j.id}" ${canDone?'':'disabled'}>${svg('check')}Mark complete${canDone?'':` (${n}/${PHOTOS_REQUIRED})`}</button></div>`;
        } else if(j.status==='completed'){
          extra=allPhotos.length?`<div class="photos"><div class="photos-head"><span>Proof photos</span><span class="count ok">${allPhotos.length}</span></div><div class="thumbs">${thumbs}</div></div>`:'';
          actions=`<div class="job-actions">${mapLink}<span class="act ghost" style="flex:1;justify-content:center">Completed ${j.updated_at?manilaTime(j.updated_at):''}</span></div>`;
        } else if(j.status==='negative'){
          actions=`<div class="job-actions">${mapLink}<span class="act ghost" style="flex:1;justify-content:center;color:#c2503a">Incomplete</span></div>`;
        } else {
          const act=f.next?`<button class="act ${f.cls}" data-next="${f.next}" data-id="${j.id}">${svg(f.icon)}${f.action}</button>`:'<button class="act ghost" disabled style="flex:1;opacity:.5">No action</button>';
          actions=`<div class="job-actions">${mapLink}${act}</div>`;
        }
        const contact=j.primary_no?`<div class="row">${svg('phone')}<a href="tel:${j.primary_no}" style="color:inherit;text-decoration:none">${j.primary_no}${j.other_contact_no?' / '+j.other_contact_no:''}</a></div>`:'';
        const acct=(j.job_order_no||j.ibass_acct_no)?`<div class="row">${svg('note')}<span>JO ${j.job_order_no||'—'} · Acct ${j.ibass_acct_no||'—'}</span></div>`:'';
        const svc=(j.plan||j.play_type)?`<div class="row">${svg('note')}<span>${[j.plan,j.play_type].filter(Boolean).join(' · ')}</span></div>`:'';
        const src=(j.source_of_sales||j.referral_name)?`<div class="row">${svg('note')}<span>${[j.source_of_sales,j.referral_name&&('Ref: '+j.referral_name)].filter(Boolean).join(' · ')}</span></div>`:'';
        const drem=j.dispatched_remarks?`<div class="row" style="color:#107b5e;font-weight:700">${svg('note')}<span>Dispatcher: ${j.dispatched_remarks}</span></div>`:'';
        const note=j.special_note?`<div class="row" style="color:#c2503a">${svg('note')}<span>${j.special_note}</span></div>`:'';
        const negRemark=(j.status==='negative'&&j.negative_remark)?`<div class="row" style="color:#c2503a;font-weight:700">${svg('note')}<span>${j.negative_remark}</span></div>`:'';
        const activeJob=!['completed','negative'].includes(j.status);
        const expBtn=activeJob?`<button class="addphoto" style="margin-top:10px;color:#a4690f;border-color:#f0d9a8;background:#fff8eb" data-exp="${j.id}">+ Add expense for this job</button>`:'';
        const negBtn=activeJob?`<button class="addphoto" style="margin-top:8px;color:#c2503a;border-color:#f0c4b9;background:#fff3f0" data-neg="${j.id}">⚠ Mark as Negative</button>`:'';
        const cancelBtn=activeJob?`<button class="addphoto" style="margin-top:8px;color:#7a7f7d;border-color:#d8dcd9;background:#f5f6f5" data-cancel="${j.id}">✖ Cancel job</button>`:'';
        // Serial lock: while another load is in progress, disable this one's status actions.
        const locked = busyId && j.id!==busyId && !['completed','negative','cancelled'].includes(j.status);
        const actionsF = locked ? `<div class="job-actions">${mapLink}<button class="act ghost" disabled style="flex:1;opacity:.6">🔒 Tapusin muna ang kasalukuyang load</button></div>` : actions;
        const negBtnF = locked?'':negBtn, cancelBtnF = locked?'':cancelBtn;
        return `<div class="job"><div class="job-head"><div><span class="job-id" data-info="${j.id}" style="cursor:pointer;text-decoration:underline">${j.id} ℹ︎</span><h3>${j.subscriber||'—'}${prio}</h3><p class="plan">${j.service_type||''} · ${j.plan||''}</p></div><span class="badge b-${j.status}">${statusLabel(j.status)}</span></div>
        <div class="job-meta"><div class="row">${svg('pin')}<span>${addr||'—'}</span></div><div class="row">${svg('clock')}<span>${(j.schedule||'Today').replace('Today, ','Today · ')}</span></div>${contact}${acct}${svc}${src}${drem}${note}${negRemark}</div>
        ${extra}${actionsF}${expBtn}${negBtnF}${cancelBtnF}</div>`;
      }).join('');
      el.querySelectorAll('[data-next]').forEach(b=>b.onclick=()=>advance(b.dataset.id,b.dataset.next));
      el.querySelectorAll('[data-up]').forEach(inp=>inp.onchange=()=>{const id=inp.dataset.up,files=inp.files;uploadPhotos(id,files,inp.dataset.label);inp.value='';});
      el.querySelectorAll('[data-bulk]').forEach(inp=>inp.onchange=()=>{const id=inp.dataset.bulk,files=inp.files;uploadBulk(id,files);inp.value='';});
      el.querySelectorAll('[data-delp]').forEach(b=>b.onclick=()=>deletePhoto(b.dataset.deljob,b.dataset.delp));
      el.querySelectorAll('[data-exp]').forEach(b=>b.onclick=()=>openMobileExpense(b.dataset.exp));
      el.querySelectorAll('[data-neg]').forEach(b=>b.onclick=()=>openNegative(b.dataset.neg));
      el.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>openNegative(b.dataset.cancel,'cancel'));
      el.querySelectorAll('[data-info]').forEach(b=>b.onclick=()=>showJobInfo(b.dataset.info));
    }

    // ---------- Auto-logout (technicians only): past 7PM AND idle >= 2 hours ----------
    let lastActivity = Date.now();
    ['click','touchstart','pointerdown','keydown','input'].forEach(ev=>
      document.addEventListener(ev, ()=>{ lastActivity = Date.now(); }, {passive:true, capture:true}));
    const manilaHourNow = () => {
      try{ return Number(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hourCycle:'h23',timeZone:TZ}).format(new Date())); }
      catch(e){ return new Date().getHours(); }
    };
    const IDLE_MS = 2*60*60*1000;   // 2 hours
    function checkAutoLogout(){
      if(myRole!=='technician' || !myTeam) return;          // technicians only, must be signed in
      if(manilaHourNow() >= 19 && (Date.now()-lastActivity) >= IDLE_MS){
        signOff('Auto-logged out: past 7PM and 2 hours of inactivity');
      }
    }
    function startApp(){
      $('#teamName').textContent=headerName();
      show('appView'); setSync('syncing','Connecting…'); signature=''; knownJobIds=null; primeAudio();
      refresh();
      if(realtimeChan) sb.removeChannel(realtimeChan);
      realtimeChan = sb.channel('ahba-tech-'+myTeam).on('postgres_changes',{event:'*',schema:'public',table:'jobs',filter:'team=eq.'+myTeam},()=>refresh()).subscribe();
      clearInterval(startApp._t); startApp._t=setInterval(refresh,15000);
      if(!startApp._onhook){ startApp._onhook=1; window.addEventListener('online', ()=>{ flushQueue(); flushPhotoQueue(); }); }
      clearInterval(startApp._loc); startApp._loc=setInterval(()=>captureLocation(false),600000); // refresh GPS every 10 min
      clearInterval(startApp._track); startApp._track=setInterval(()=>logTrack('auto'),1200000); // travel trail every 20 min
      lastActivity=Date.now();
      clearInterval(startApp._idle); startApp._idle=setInterval(checkAutoLogout,60000); // auto-logout check every minute
      startComms();
    }

    // ---------- auth ----------
    // fresh=true means an explicit sign-in (record a new time-in);
    // fresh=false means resuming an existing session (reuse open time-in).
    async function afterLogin(email, fresh){
      myTeam = teamFromEmail(email);
      let must=false;
      try{
        const {data}=await sb.from('technicians').select('must_change,role,display_name').eq('username',myTeam).maybeSingle();
        must = !!(data && data.must_change);
        myRole = (data && data.role) || 'technician';
        myName = (data && data.display_name) || '';
        sb.from('technicians').update({last_login:new Date().toISOString(), updated_at:new Date().toISOString()}).eq('username',myTeam).then(()=>{});
      }catch(e){}
      if(must){ pwForced = true; openPw(true); return; }
      await enterFlow(fresh);
    }

    // Clock in (fresh sign-in) or re-attach to an open time-in (resume), then open the right home.
    async function enterFlow(fresh){
      if(fresh){ await clockIn(); } else { await findOpenAttendance(); }
      captureLocation(false);   // grab GPS on entry (prompts for permission first time)
      if(myRole==='sales_agent'){ startSA(); return; }
      if(myRole==='security'){ startSecurity(); return; }
      // On a FRESH login, always make the user pick the account manually (no auto-select).
      // On a refresh/resume of the SAME open session, restore the locked account.
      // resumeShift() already adopted the cloud's crew/account, so there's nothing to write
      // back — writing here is what used to clobber dispatcher edits with stale values.
      if(!fresh && await resumeShift()){ startApp(); return; }
      openShift();              // otherwise technicians must set account + crew first
    }
    // Restore today's account+crew. Cloud is the SOURCE OF TRUTH — a dispatcher may have
    // changed the crew/account, so read the attendance row FIRST; the local cache is used
    // only as an offline fallback (never to overwrite newer cloud data).
    async function resumeShift(){
      let cloudReached=false;
      try{
        const {data}=await sb.from('attendance').select('work_account,crew_driver,crew_tech1,crew_tech2')
          .eq('username',myTeam).eq('work_date',manilaDate()).not('work_account','is',null).is('time_out',null)
          .order('time_in',{ascending:false}).limit(1);
        cloudReached=true;
        const a=data&&data[0];
        if(a && a.work_account && a.crew_driver && a.crew_tech1){
          shiftAccount=a.work_account; shiftDriver=a.crew_driver; shiftTech1=a.crew_tech1; shiftTech2=a.crew_tech2||'';
          try{ localStorage.setItem(shiftKey(), JSON.stringify({date:manilaDate(),account:shiftAccount,driver:shiftDriver,tech1:shiftTech1,tech2:shiftTech2})); }catch(e){}
          return true;
        }
      }catch(e){}
      // Cloud reachable but no active shift row (account freed / timed out) → do NOT resume
      // from a stale cache; send the tech back to the shift picker.
      if(cloudReached) return false;
      // Offline only: cloud unreachable → use today's local cache so the tech isn't blocked.
      try{ const s=JSON.parse(localStorage.getItem(shiftKey())||'null');
        if(s && s.date===manilaDate() && s.account && s.driver && s.tech1){
          shiftAccount=s.account; shiftDriver=s.driver; shiftTech1=s.tech1; shiftTech2=s.tech2||''; return true;
        }
      }catch(e){}
      return false;
    }

    $('#shiftForm').addEventListener('submit', async e=>{
      e.preventDefault(); clearErr('#shiftErr');
      const omt=/OMT/i.test(myTeam||'');
      const acc=$('#sf_account').value, t1=$('#sf_tech1').value.trim();
      let drv=$('#sf_driver').value.trim(), t2=$('#sf_tech2').value.trim();
      if(!acc){ showErr('#shiftErr','Select an account.'); return; }
      if(omt){ if(!t1){ showErr('#shiftErr','Technician name is required.'); return; } drv=t1; t2=''; }   // one-man team: technician also drives
      else { if(!drv){ showErr('#shiftErr','Driver is required.'); return; } if(!t1){ showErr('#shiftErr','Technician 1 is required.'); return; } }
      const btn=$('#shiftBtn'); btn.disabled=true; btn.textContent='Starting…';
      // make sure no other active team grabbed this account in the meantime
      try{
        const {data}=await sb.from('attendance').select('username').eq('work_date',manilaDate()).eq('work_account',acc).is('time_out',null).neq('username',myTeam);
        if(data && data.length){ btn.disabled=false; btn.textContent='Start shift'; showErr('#shiftErr','Account '+acc+' is already in use by '+data[0].username+'. Please pick another.'); openShift(); return; }
      }catch(e){}
      shiftAccount=acc; shiftDriver=drv; shiftTech1=t1; shiftTech2=t2;
      try{ localStorage.setItem(shiftKey(), JSON.stringify({date:manilaDate(),account:acc,driver:drv,tech1:t1,tech2:t2})); }catch(e){}
      // record the shift on today's open attendance row → dashboard + account lock
      try{
        if(!attendanceId) await findOpenAttendance();
        if(attendanceId) await saveWrite('attendance','update',{id:attendanceId},{work_account:acc,crew_driver:drv,crew_tech1:t1,crew_tech2:t2});   // queued if offline
      }catch(e){ console.warn('shift save',e.message); }
      btn.disabled=false; btn.textContent='Start shift';
      startApp();
    });

    function openPw(forced){
      $('#pwForceHint').classList.toggle('hidden', !forced);
      $('#pwCancel').classList.toggle('hidden', !!forced);
      $('#pwTitle').textContent = forced ? 'Set a new password' : 'Change password';
      clearErr('#pwErr'); $('#np1').value=''; $('#np2').value='';
      show('pwView');
    }

    $('#loginForm').addEventListener('submit', async e=>{
      e.preventDefault(); clearErr('#loginErr');
      const u=$('#uName').value.trim(), p=$('#uPass').value;
      if(!u||!p) return;
      const btn=$('#loginBtn'); btn.disabled=true; btn.textContent='Signing in…';
      const {data,error}=await sb.auth.signInWithPassword({email:emailFor(u), password:p});
      btn.disabled=false; btn.textContent='Sign in';
      if(error){ const m=error&&error.message?error.message:'Sign-in failed. Please try again.'; showErr('#loginErr', /invalid/i.test(m)?'Wrong username or password.':m); return; }
      try{ await sb.auth.signOut({scope:'others'}); }catch(e){}   // single active session — sign out any other device using this account
      afterLogin(data.user.email, true);
    });

    $('#pwForm').addEventListener('submit', async e=>{
      e.preventDefault(); clearErr('#pwErr');
      const a=$('#np1').value, b=$('#np2').value;
      if(a.length<8){ showErr('#pwErr','Password must be at least 8 characters.'); return; }
      if(a!==b){ showErr('#pwErr','Passwords do not match.'); return; }
      const btn=$('#pwBtn'); btn.disabled=true; btn.textContent='Saving…';
      const {error}=await sb.auth.updateUser({password:a});
      btn.disabled=false; btn.textContent='Save password';
      if(error){ showErr('#pwErr', error.message); return; }
      sb.from('technicians').update({must_change:false, password_changed_at:new Date().toISOString(), updated_at:new Date().toISOString()}).eq('username',myTeam).then(()=>{});
      toast('Password updated');
      if(pwForced){ pwForced=false; await enterFlow(true); }   // first-login: clock in now
      else { startApp(); }                                      // voluntary change: already clocked in
    });

    $('#pwCancel').onclick=()=>{ pwForced=false; startApp(); };
    $('#menuBtn').onclick=e=>{e.stopPropagation();$('#menuPop').classList.toggle('hidden')};
    document.addEventListener('click',()=>$('#menuPop').classList.add('hidden'));
    $('#menuPop').onclick=e=>e.stopPropagation();
    $('#secSave')?.addEventListener('click',submitGate);
    $('#sec_photo')?.addEventListener('change',e=>{ secPhotoFile=e.target.files[0]||null; const n=$('#secPhotoName'); if(n){ n.innerHTML=secPhotoFile?('📎 '+secPhotoFile.name+' <span id="secPhotoClear" style="color:#c2503a;text-decoration:underline;cursor:pointer">✕ remove</span>'):''; const c=$('#secPhotoClear'); if(c) c.onclick=()=>{ secPhotoFile=null; if($('#sec_photo'))$('#sec_photo').value=''; n.innerHTML=''; }; } });
    $('#secCancel')?.addEventListener('click',closeSec);
    $('#secBack')?.addEventListener('click',closeSec);
    $$('.sec-tab').forEach(b=>b.addEventListener('click',()=>secSwitch(b.dataset.sectab)));
    $('#chatFab').onclick=openChat;
    $('#mChat').onclick=()=>{$('#menuPop').classList.add('hidden');openChat()};
    $('#mAnnounce').onclick=()=>{$('#menuPop').classList.add('hidden');openAnn()};
    $('#chatSend').onclick=sendChat;
    $('#chatTo')?.addEventListener('change',e=>selectChatThread(e.target.value));
    $('#chatInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendChat();});
    $('#chatPhotoCamBtn')?.addEventListener('click',()=>$('#chat_photo_cam')?.click());
    $('#chatPhotoAlbBtn')?.addEventListener('click',()=>$('#chat_photo_alb')?.click());
    ['chat_photo_cam','chat_photo_alb'].forEach(id=>{ const el=$('#'+id); if(el) el.onchange=()=>{ const f=el.files&&el.files[0]; if(f) setChatPhoto(f); }; });
    $('#chatClose').onclick=closeChat; $('#chatBack').onclick=closeChat;
    $('#annClose').onclick=closeAnn; $('#annBack').onclick=closeAnn;
    $('#mChangePw').onclick=()=>{$('#menuPop').classList.add('hidden');openPw(false)};
    $('#mName').onclick=async()=>{
      $('#menuPop').classList.add('hidden');
      const n=prompt('Your full name (as it should appear on records):', myName||'');
      if(n===null)return;
      myName=n.trim();
      try{ await sb.from('technicians').update({display_name:myName, updated_at:new Date().toISOString()}).eq('username',myTeam); toast('Name updated'); }
      catch(e){ toast('Could not save name'); }
      $('#teamName').textContent=headerName();
    };
    $('#mLocate').onclick=()=>{$('#menuPop').classList.add('hidden');captureLocation(true)};
    document.querySelectorAll('.jobtabs .jt').forEach(b=>b.onclick=()=>{viewMode=b.dataset.view;render()});
    $('#neg_remark')?.addEventListener('change',()=>$('#negOtherWrap').classList.toggle('hidden',$('#neg_remark').value!=='OTHERS'));
    $('#negCancel')?.addEventListener('click',closeNegative);
    $('#negSave')?.addEventListener('click',saveNegative);
    ['neg_photo_cam','neg_photo_alb'].forEach(id=>{ const el=$('#'+id); if(el) el.onchange=()=>{ [...el.files].forEach(f=>negPhotoFiles.push(f)); el.value=''; renderNegThumbs(); }; });
    $('#mInfoClose')?.addEventListener('click',closeMInfo); $('#mInfoBack')?.addEventListener('click',closeMInfo);
    $('#negBack')?.addEventListener('click',closeNegative);
    // sales agent bindings
    document.querySelectorAll('[data-doc]').forEach(inp=>inp.onchange=()=>{const cat=inp.dataset.doc;[...inp.files].forEach(f=>saDocs[cat].push(f));inp.value='';saRenderDocs();});
    $('#saTabNew')?.addEventListener('click',()=>{ if(saEditingId){ saEditingId=null; $('#saSubmit').textContent='Submit for validation'; saReset(); } saSwitch('new'); });
    $('#saTabMine')?.addEventListener('click',()=>saSwitch('mine'));
    ['sa_primary_no','sa_other_contact_no'].forEach(id=>{const el=$('#'+id);if(el)el.oninput=()=>{el.value=el.value.replace(/\D/g,'').slice(0,11)};});
    $('#sa_dwelling')?.addEventListener('change',populatePlans);
    $('#sa_play_type')?.addEventListener('change',toggleAddonCount);
    $('#saSubmit')?.addEventListener('click',saSubmit);
    $('#mexpCancel')?.addEventListener('click',closeMobileExpense);
    $('#mexpSave')?.addEventListener('click',saveMobileExpense);
    $('#mexpBack')?.addEventListener('click',closeMobileExpense);
    $('#payCancel')?.addEventListener('click',closeComplete);
    $('#paySave')?.addEventListener('click',confirmComplete);
    $('#pay_mode')?.addEventListener('change',togglePayProof);
    ['pay_proof_cam','pay_proof_alb'].forEach(id=>{ const el=$('#'+id); if(el) el.onchange=()=>{ payProofFile=el.files&&el.files[0]||null; const n=$('#payProofName'); if(n) n.textContent=payProofFile?('📎 '+payProofFile.name):''; }; });
    $('#payBack')?.addEventListener('click',closeComplete);
    async function signOff(message){
      $('#menuPop')?.classList.add('hidden');
      try{ await clockOut(); }catch(e){}      // record time-out
      if(realtimeChan)sb.removeChannel(realtimeChan);
      if(chatChan)sb.removeChannel(chatChan); if(annChan)sb.removeChannel(annChan);
      clearInterval(startApp._t); clearInterval(startApp._loc); clearInterval(startApp._track); clearInterval(startApp._idle);
      try{ localStorage.removeItem(shiftKey()); }catch(e){}   // clear saved shift → next login picks account manually
      shiftAccount=''; shiftDriver=''; shiftTech1=''; shiftTech2='';
      try{ await sb.auth.signOut(); }catch(e){}
      myTeam=''; jobs=[]; $('#uName').value=''; $('#uPass').value='';
      toast(message||'Signed off');
      show('loginView');
    }
    $('#mLogout').onclick=()=>signOff('Timed out — signed off');

    // Show/Hide password toggles (all login + change-password fields)
    document.querySelectorAll('[data-eye]').forEach(b=>b.onclick=()=>{ const inp=$('#'+b.dataset.eye); if(!inp)return; const reveal=inp.type==='password'; inp.type=reveal?'text':'password'; b.textContent=reveal?'Hide':'Show'; });

    // resume existing session on load (do NOT create a new time-in)
    (async function init(){
      const {data}=await sb.auth.getSession();
      if(data.session && data.session.user){ afterLogin(data.session.user.email, false); }
      else { show('loginView'); }
    })();
