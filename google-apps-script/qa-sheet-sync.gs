// AHBA QA — sheet → FieldOps pusher. Bound to the "FOR QA VALIDATION" spreadsheet. READS ONLY; never writes to the sheet.
// Setup: Extensions → Apps Script → paste → Project Settings → Script properties: QA_SYNC_URL, QA_SYNC_SECRET → run setupTrigger() once.
// Two ways in: (1) the 15-minute time trigger → syncNow('tail'), which flags its last batch `final` so the receiver ingests;
// (2) the console's "Sync now" button → doPost() → syncNow(mode, true), which sends every batch with final:false and leaves the
// ingest to the caller (the Edge Function's pull path) — see the `final` comment in runSync_(). The button needs the Web App
// deployment described in README-qa-sheet-sync.md ("Sync now button (Web App)"). Both ways share one script lock.
var SHEET_NAME = "NEW COMPLETED JO'S";
var SHEET_PREFIX = 'NEW COMPLETED JO';   // the tab has been renamed before (JOS → JO'S); a prefix match keeps a rename from silently stopping the sync
var WINDOW_DAYS = 60;      // 'tail' mode: rows whose JODATECLOSED is within the last N days are (re)sent every run — upsert on the server, so re-sending is safe
var BATCH = 500;
var TAIL_ROWS = 8000;   // 'tail' mode: rows read from the bottom of the tab per run (≈ 3-4 months at 2,000 installs/month)

// Exact tab name first. If it was renamed, fall back on the prefix — but prefer a prefix match that actually LOOKS like the
// QA tab (header row carries JONO and JODATECLOSED), so a stray "NEW COMPLETED JO'S (old)" / "... copy" sheet sitting earlier
// in the tab order cannot hijack the sync. Only if no prefix match has the headers do we return the first one (its missing
// columns then raise the explicit "Missing JONO or JODATECLOSED" error instead of a silent no-op).
function findSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (sh) return sh;
  var all = ss.getSheets(), first = null;
  for (var i = 0; i < all.length; i++) {
    if (all[i].getName().indexOf(SHEET_PREFIX) !== 0) continue;
    if (!first) first = all[i];
    if (hasQaHeaders_(all[i])) return all[i];
  }
  return first;
}

function hasQaHeaders_(sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return false;
  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h || '').trim(); });
  return hdr.indexOf('JONO') >= 0 && hdr.indexOf('JODATECLOSED') >= 0;
}

// mode: 'tail' (default — last TAIL_ROWS rows, last WINDOW_DAYS days) or 'full' (every data row, no date cutoff: 100% capture, heavy).
// skipIngest: leave falsy on the timer path (the last batch carries final:true, so the receiver ingests straight away). doPost passes
// true — see the comment on the `final` flag in runSync_().
// Returns { ok:true, mode, rows, sent, created } — the "Sync now" button relays this to the console.
function syncNow(mode, skipIngest) {
  mode = mode === 'full' ? 'full' : 'tail';
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'busy' };   // the 15-minute trigger (or another button press) is mid-run
  try { return runSync_(mode, !!skipIngest); } finally { lock.releaseLock(); }
}

function runSync_(mode, skipIngest) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('QA_SYNC_URL'), secret = props.getProperty('QA_SYNC_SECRET');
  if (!url || !secret) throw new Error('Set QA_SYNC_URL and QA_SYNC_SECRET in Script properties');
  var sh = findSheet_();
  if (!sh) throw new Error('Sheet not found: ' + SHEET_NAME);
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 2) return { ok: true, mode: mode, rows: 0, sent: 0, created: 0 };
  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h || '').trim(); });
  var iClosed = hdr.indexOf('JODATECLOSED'), iJo = hdr.indexOf('JONO');
  if (iJo < 0 || iClosed < 0) throw new Error('Missing JONO or JODATECLOSED column in ' + sh.getName() + ' — sync stopped');
  // Rows are appended chronologically, so only the tail can hold the last WINDOW_DAYS; reading the whole tab (20k+ rows) every 15 min would burn the account's daily script quota.
  // 'full' pays that cost on purpose — it is the manual "Full re-scan" for rows the tail/date window would never reach.
  var start = mode === 'full' ? 2 : Math.max(2, lastRow - TAIL_ROWS + 1);
  var values = sh.getRange(start, 1, lastRow - start + 1, lastCol).getValues();
  var cutoff = null;
  if (mode !== 'full') { cutoff = new Date(); cutoff.setDate(cutoff.getDate() - WINDOW_DAYS); }
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var rows = [];
  for (var r = 0; r < values.length; r++) {
    var v = values[r]; if (!v[iJo]) continue;
    if (cutoff) {
      var d = v[iClosed] instanceof Date ? v[iClosed] : (v[iClosed] ? new Date(v[iClosed]) : null);
      if (!d || isNaN(d) || d < cutoff) continue;
    }
    var o = {};
    for (var c = 0; c < hdr.length; c++) {
      if (!hdr[c]) continue;
      var x = v[c];
      if (x instanceof Date) x = Utilities.formatDate(x, tz, 'yyyy-MM-dd');
      o[hdr[c]] = x === '' ? null : x;
    }
    rows.push(o);
  }
  var sent = 0, created = 0;
  for (var i = 0; i < rows.length; i += BATCH) {
    // `final` = "ingest now". UrlFetchApp gives up on a single call after roughly a minute, and the receiver's ingest drain can run
    // far longer than that, so a button-triggered run must NEVER ask for the ingest inside a batch: one slow drain would abort the
    // fetch, the whole run would look failed, and the console would show an error for work that actually landed. The button path
    // (doPost → skipIngest) therefore sends every batch with final:false and lets the Edge Function's pull path drain
    // qa.sheet_rows itself after we return. The 15-minute timer has no caller waiting on it, so it keeps final:true on its last
    // batch — its ingest is the only one that runs when nobody presses the button.
    var isLast = (i + BATCH) >= rows.length;
    var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', headers: { 'x-qa-secret': secret },
      payload: JSON.stringify({ rows: rows.slice(i, i + BATCH), source: 'apps-script', final: skipIngest ? false : isLast }), muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('Sync failed ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
    var j = JSON.parse(res.getContentText()); sent += j.upserted || 0; created += j.audits_created || 0;
  }
  // With zero matching rows nothing is POSTed, so no batch is flagged `final` and no ingest runs here; the "Sync now" path drains qa.sheet_rows itself afterwards.
  Logger.log('QA sync (' + mode + '): sent ' + sent + ' rows, ' + created + ' new audits');
  return { ok: true, mode: mode, rows: rows.length, sent: sent, created: created };
}

// "Sync now" from the FieldOps console. Called by the qa-sheet-sync Edge Function (never by a browser), which holds QA_SYNC_SECRET
// and only calls this after it has verified the caller is the QA Head. Answers JSON; Apps Script replies through a 302, so callers must follow redirects.
function doPost(e) {
  var out;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var secret = PropertiesService.getScriptProperties().getProperty('QA_SYNC_SECRET');
    // skipIngest = true: every batch goes out with final:false, so no fetch of ours sits waiting on the receiver's ingest drain
    // (that would blow UrlFetchApp's ~60 s ceiling). The caller — the Edge Function's pull path — drains the ingest after we answer,
    // which is why `created` is 0 here and the console's "new audits" number comes from that drain.
    out = (!secret || body.secret !== secret) ? { ok: false, error: 'unauthorized' } : syncNow(body.mode === 'full' ? 'full' : 'tail', true);
  } catch (err) { out = { ok: false, error: (err && err.message) || String(err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'syncNow') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncNow').timeBased().everyMinutes(15).create();
  Logger.log('Trigger installed: syncNow every 15 minutes');
}
