# QA sheet sync — install (sheet owner: sky.ahbacx@gmail.com)

Ang script ay **nagbabasa lang** ng tab `NEW COMPLETED JO'S` (o kung ano man ang tab na nagsisimula sa `NEW COMPLETED JO`) at ipinapadala ang rows ng huling 60 araw sa FieldOps bawat 15 minuto. **Walang isusulat sa sheet.**

1. Buksan ang spreadsheet **FOR QA VALIDATION** → menu **Extensions → Apps Script**.
2. Sa kaliwa, pindutin ang **+** → **Script**, pangalanan itong `qa-sheet-sync`, at doon i-paste ang buong `qa-sheet-sync.gs`, tapos **Save** (💾). **Huwag burahin** ang `Code.gs` o ibang script na nandoon na — kung may laman ang mga ito, ipakita muna sa admin.
3. Kaliwa: ⚙ **Project Settings** → **Script properties** → Add:
3b. ⚙ **Project Settings** → **Time zone** = (GMT+08:00) Manila. Ito ang gamit sa petsa ng JO close.
   - `QA_SYNC_URL` = `https://avjzkfxgzeyxtihkofed.supabase.co/functions/v1/qa-sheet-sync`
   - `QA_SYNC_SECRET` = ang secret na ibibigay ng admin (pareho sa Edge Function secret). Huwag i-share sa chat.
4. Balik sa Editor → piliin ang function **`syncNow`** → **Run**. Sa unang run hihingi ng permission (Sheets read + external request) → **Allow**. Tingnan ang **Execution log**: dapat `QA sync: sent N rows, M new audits`.
5. Piliin ang function **`setupTrigger`** → **Run** (isang beses lang). Ito ang naglalagay ng 15-minute trigger.
6. Verify sa FieldOps console → QA Audit → Settings: "Last sync" ay dapat mag-update sa loob ng 15 minuto.

## Sync now button (Web App)

Para gumana ang **🔄 Sync sheet now** sa FieldOps console (QA Audit → Queue at Settings), kailangan ma-deploy ang script bilang Web App. Ito ang nagpapahintulot sa console na ipatakbo ang `syncNow` kahit hindi pa sumapit ang 15-minutong timer.

1. Sa Apps Script editor: **Deploy** (kanang-itaas) → **New deployment**.
2. ⚙ (Select type) → **Web app**.
3. **Execute as:** `Me` (ang may-ari ng sheet — siya ang may access sa sheet).
4. **Who has access:** `Anyone`. *(Hindi ito bukas sa publiko: ang `doPost` ay tumatanggap lamang ng request na may tamang `QA_SYNC_SECRET`, at ang Edge Function lang ang may hawak nito.)*
5. **Deploy** → i-copy ang **Web app URL** (`https://script.google.com/macros/s/.../exec`).
6. Ibigay ang URL sa admin **sa labas ng chat** (hal. direktang i-paste sa Supabase). Ilalagay ito ng admin sa Edge Function secret `QA_SHEET_WEBAPP_URL`. **Huwag i-post sa chat o sa kahit anong group.**
7. Verify: console → QA Audit → Settings → **🔄 Sync now (last 60 days)** → dapat may toast na `Sync done: N rows sent · M new audits` at mag-update ang "Last sync".

**Tuwing binabago ang script:** ulitin ang **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy.** Kung hindi, luma pa rin ang tumatakbo sa URL. (Hindi nagbabago ang URL, kaya hindi na kailangang baguhin ang secret.)

**Full re-scan (whole sheet):** binabasa nito ang **buong** tab (20k+ rows) at walang date cutoff — mabagal at malaki ang kain sa daily script quota ng account. Gamitin lang kung may nawawalang JO na mas matanda sa 60 araw. Ang pang-araw-araw na paggamit ay ang **Sync now (last 60 days)**.

**Paano ito gumagana (para sa admin):** kapag ang button ang pumindot (`doPost`), lahat ng batch ay ipinapadala nang may `final:false` — hindi hinihintay ng script ang ingest, dahil may ~60-segundong limitasyon ang `UrlFetchApp` sa isang request at maaaring mas matagal pa ang ingest. Ang FieldOps side na ang humahabol ng ingest pagkatapos sumagot ng script, kaya galing doon ang bilang na "M new audits" (`created` = 0 sa sagot ng script mismo). Ang 15-minutong timer ay walang naghihintay, kaya doon lang may `final:true` ang huling batch.

**Kung "busy":** may kasalukuyang tumatakbong sync — halos palaging ang 15-minutong trigger na nasa kalagitnaan ng run (o ibang pindot ng button). Maghintay ng isang minuto at pindutin muli; hindi ito error at walang nasirang data.

**Kung may error 401:** hindi tugma ang secret, o mali ang URL, o naka-ON pa ang "Verify JWT" sa Edge Function (sabihin sa admin kung tama ang secret pero 401 pa rin). **Kung 500:** ipadala ang Execution log sa admin. **Para itigil:** Triggers (⏰ sa kaliwa) → delete ang `syncNow` trigger.
