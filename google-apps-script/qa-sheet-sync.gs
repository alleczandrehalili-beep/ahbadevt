// AHBA QA — sheet → FieldOps pusher. Bound to the "FOR QA VALIDATION" spreadsheet. READS ONLY; never writes to the sheet.
// Setup: Extensions → Apps Script → paste → Project Settings → Script properties: QA_SYNC_URL, QA_SYNC_SECRET → run setupTrigger() once.
var SHEET_NAME = 'NEW COMPLETED JOS';
var WINDOW_DAYS = 60;      // rows whose JODATECLOSED is within the last N days are (re)sent every run — upsert on the server, so re-sending is safe
var BATCH = 500;
var TAIL_ROWS = 8000;   // rows read from the bottom of the tab per run (≈ 3-4 months at 2,000 installs/month)

function syncNow() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('QA_SYNC_URL'), secret = props.getProperty('QA_SYNC_SECRET');
  if (!url || !secret) throw new Error('Set QA_SYNC_URL and QA_SYNC_SECRET in Script properties');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('Sheet not found: ' + SHEET_NAME);
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 2) return;
  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h || '').trim(); });
  var iClosed = hdr.indexOf('JODATECLOSED'), iJo = hdr.indexOf('JONO');
  if (iJo < 0 || iClosed < 0) throw new Error('Missing JONO or JODATECLOSED column in ' + SHEET_NAME + ' — sync stopped');
  // Rows are appended chronologically, so only the tail can hold the last WINDOW_DAYS; reading the whole tab (20k+ rows) every 15 min would burn the account's daily script quota.
  var start = Math.max(2, lastRow - TAIL_ROWS + 1);
  var values = sh.getRange(start, 1, lastRow - start + 1, lastCol).getValues();
  var cutoff = new Date(); cutoff.setDate(cutoff.getDate() - WINDOW_DAYS);
  var rows = [];
  for (var r = 0; r < values.length; r++) {
    var v = values[r]; if (!v[iJo]) continue;
    var d = v[iClosed] instanceof Date ? v[iClosed] : (v[iClosed] ? new Date(v[iClosed]) : null);
    if (!d || isNaN(d) || d < cutoff) continue;
    var o = {};
    for (var c = 0; c < hdr.length; c++) {
      if (!hdr[c]) continue;
      var x = v[c];
      if (x instanceof Date) x = Utilities.formatDate(x, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
      o[hdr[c]] = x === '' ? null : x;
    }
    rows.push(o);
  }
  var sent = 0, created = 0;
  for (var i = 0; i < rows.length; i += BATCH) {
    var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', headers: { 'x-qa-secret': secret },
      payload: JSON.stringify({ rows: rows.slice(i, i + BATCH), source: 'apps-script', final: (i + BATCH) >= rows.length }), muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('Sync failed ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
    var j = JSON.parse(res.getContentText()); sent += j.upserted || 0; created += j.audits_created || 0;
  }
  Logger.log('QA sync: sent ' + sent + ' rows, ' + created + ' new audits');
}

function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'syncNow') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncNow').timeBased().everyMinutes(15).create();
  Logger.log('Trigger installed: syncNow every 15 minutes');
}
