# QA sheet sync — install (sheet owner: sky.ahbacx@gmail.com)

Ang script ay **nagbabasa lang** ng tab `NEW COMPLETED JOS` at ipinapadala ang rows ng huling 60 araw sa FieldOps bawat 15 minuto. **Walang isusulat sa sheet.**

1. Buksan ang spreadsheet **FOR QA VALIDATION** → menu **Extensions → Apps Script**.
2. Sa kaliwa, pindutin ang **+** → **Script**, pangalanan itong `qa-sheet-sync`, at doon i-paste ang buong `qa-sheet-sync.gs`, tapos **Save** (💾). **Huwag burahin** ang `Code.gs` o ibang script na nandoon na — kung may laman ang mga ito, ipakita muna sa admin.
3. Kaliwa: ⚙ **Project Settings** → **Script properties** → Add:
3b. ⚙ **Project Settings** → **Time zone** = (GMT+08:00) Manila. Ito ang gamit sa petsa ng JO close.
   - `QA_SYNC_URL` = `https://avjzkfxgzeyxtihkofed.supabase.co/functions/v1/qa-sheet-sync`
   - `QA_SYNC_SECRET` = ang secret na ibibigay ng admin (pareho sa Edge Function secret). Huwag i-share sa chat.
4. Balik sa Editor → piliin ang function **`syncNow`** → **Run**. Sa unang run hihingi ng permission (Sheets read + external request) → **Allow**. Tingnan ang **Execution log**: dapat `QA sync: sent N rows, M new audits`.
5. Piliin ang function **`setupTrigger`** → **Run** (isang beses lang). Ito ang naglalagay ng 15-minute trigger.
6. Verify sa FieldOps console → QA Audit → Settings: "Last sync" ay dapat mag-update sa loob ng 15 minuto.

**Kung may error 401:** hindi tugma ang secret, o mali ang URL, o naka-ON pa ang "Verify JWT" sa Edge Function (sabihin sa admin kung tama ang secret pero 401 pa rin). **Kung 500:** ipadala ang Execution log sa admin. **Para itigil:** Triggers (⏰ sa kaliwa) → delete ang `syncNow` trigger.
