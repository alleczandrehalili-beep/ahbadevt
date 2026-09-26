// AHBA QA — sheet sync receiver. Deploy: Supabase → Edge Functions → "qa-sheet-sync" → paste → Deploy. Turn OFF "Verify JWT".
// Secrets: QA_SYNC_SECRET (shared with the Apps Script) and QA_SHEET_WEBAPP_URL (the sheet's Apps Script Web App /exec URL, for the
// console's "Sync now" button). "Verify JWT" must stay OFF — the Apps Script push path authenticates with the shared secret and the
// console's pull path verifies the caller's JWT itself, by calling qa.is_head() as that user.
// Two paths:
//   push (Apps Script → here, header x-qa-secret): upserts qa.sheet_rows, then on the final batch runs qa.ingest_sheet_rows().
//   pull ({action:'pull'} from the console, Authorization: Bearer <user jwt>): QA Head only → POSTs the secret to the Web App, which
//        pushes the rows back through the push path above with final:false (no nested ingest — UrlFetchApp would time out), then
//        drains the ingest here and records the true row total in last_sync_rows.
// Never deletes. Normalization mirrors qa-core.js normalizeSheetRow — keep both in sync.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// `authorization`/`apikey` are needed for the browser preflight of the pull path (supabase-js sends both).
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-qa-secret, authorization, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const ymd = (y: string, m: string, d: string): string | null => { const mi = +m, di = +d; return mi >= 1 && mi <= 12 && di >= 1 && di <= 31 ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : null; };
function toDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return ymd(m[1], m[2], m[3]);
  m = /^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m && MONTHS[m[1].toLowerCase()]) return ymd(m[3], String(MONTHS[m[1].toLowerCase()]), m[2]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); if (m) return ymd(m[3], m[1], m[2]);
  return null;
}
const up = (v: unknown) => { const s = v == null ? "" : String(v).trim(); return s ? s.toUpperCase() : null; };
const txt = (v: unknown) => { const s = v == null ? "" : String(v).trim(); return s ? s : null; };
function normalize(raw: Record<string, unknown>) {
  const jo = up(raw.JONO); if (!jo) return null;
  return { jo_no: jo, acct_no: txt(raw.ACCTNO)?.replace(/\.0$/, "") ?? null, comp: up(raw.COMP), jo_date_closed: toDate(raw.JODATECLOSED), ssp_code: up(raw.SSPCODE),
    subscriber_name: up(raw.SUBSCRIBERNAME), mobile_no: txt(raw.MOBILENO), barangay: up(raw.BARANGAYNAME), complete_address: up(raw.COMPLETEADDRESS), tran_type: up(raw.TRANTYPECODE),
    nap_code: up(raw.NAPCODE), port_no: up(raw.PORTNO), serial_no: up(raw.SERIALNO), driver: up(raw.DRIVER), tech: up(raw.TECH), tech2: up(raw["TECH 2"]),
    sheet_qa_gc: up(raw["QA / GC"]), sheet_visited: up(raw.VISITED), sheet_date_qa: toDate(raw["DATE QA"]), sheet_latlong: txt(raw.LATLONG), sheet_wire: up(raw.WIRE),
    sheet_others: up(raw.OTHERS), sheet_assessment: up(raw.ASSESMENT || raw.ASSESSMENT), sheet_inspected_by: up(raw["INSPECTED BY"]), sheet_remarks: txt(raw.REMARKS), raw, updated_at: new Date().toISOString() };
}
const adminClient = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "qa" } });
type Admin = ReturnType<typeof adminClient>;
// ingest_sheet_rows() handles at most 300 rows per call (statement timeout); loop within our own time budget, the next sync continues if needed.
// budgetMs: the push path (nobody waiting but the Apps Script's own fetch) may spend 90 s; the pull path has a browser waiting behind an
// already-spent sheet read, so it gets 25 s — `more:true` then tells the head to press again (the toast says so).
async function ingestLoop(admin: Admin, budgetMs = 90000): Promise<{ created: number; more: boolean }> {
  let created = 0, more = false;
  const t0 = Date.now();
  for (let k = 0; k < 40; k++) {
    const { data, error } = await admin.rpc("ingest_sheet_rows");
    if (error) throw error;
    const n = (data as number) ?? 0; created += n;
    if (n < 300) break;
    if (Date.now() - t0 > budgetMs) { more = true; break; }
  }
  return { created, more };
}
// Console "Sync now". The caller is a browser session, not the Apps Script, so authenticate with the caller's own JWT:
// qa.is_head() runs as that user (RLS/grants decide), and only a head may trigger a sheet read.
async function pull(req: Request, body: Record<string, unknown>): Promise<Response> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth) return json({ error: "QA Head only" }, 403);
  const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, db: { schema: "qa" } });
  const { data: head, error: eHead } = await user.rpc("is_head");
  if (eHead || head !== true) return json({ error: "QA Head only" }, 403);
  const webapp = Deno.env.get("QA_SHEET_WEBAPP_URL") || "";
  if (!webapp) return json({ error: "QA_SHEET_WEBAPP_URL not set" }, 503);
  const secret = Deno.env.get("QA_SYNC_SECRET") || "";
  if (!secret) return json({ error: "QA_SYNC_SECRET not set" }, 503);   // without it doPost answers 'unauthorized' — say which secret is missing
  const mode = body.mode === "full" ? "full" : "tail";
  // Apps Script answers a POST with a 302 to script.googleusercontent.com — the result only arrives if we follow it.
  // Time budget for the whole pull: 70 s here + 25 s of ingest drain below ≈ 95 s worst case, inside the platform's ~150 s wall
  // and comfortably inside the browser's patience. A sheet read that needs longer keeps running on Google's side; "Last sync"
  // and the 15-minute trigger pick the result up.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 70000);
  let r: { ok?: boolean; error?: string; sent?: number; created?: number; rows?: number } | null = null;
  try {
    const res = await fetch(webapp, {
      method: "POST", redirect: "follow", signal: ctl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, mode }),
    });
    const text = await res.text();
    // Never hand the caller the script's body or URL — a misconfigured deployment answers with Google's sign-in HTML, and the
    // /exec URL is itself a capability. Status only for the console; the detail goes to the function log.
    if (!res.ok) { console.error("sheet script non-2xx", res.status, text.slice(0, 500)); return json({ error: `sheet script error HTTP ${res.status}` }, 502); }
    try { r = JSON.parse(text); } catch { console.error("sheet script body not JSON", res.status, text.slice(0, 500)); return json({ error: `sheet script error HTTP ${res.status}` }, 502); }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return json({ error: "sheet script timed out after 70 s — it may still be running; check Last sync in a minute" }, 502);
    console.error("sheet script fetch failed", String((e as Error)?.message || e));
    return json({ error: "sheet script unreachable" }, 502);
  } finally { clearTimeout(timer); }
  if (!r || r.ok !== true) return json({ error: String(r?.error || "sheet script failed") }, 502);
  // The button path deliberately sends every batch with final:false (UrlFetchApp would time out waiting on an ingest), so the
  // whole drain happens here — plus anything the push path left behind, and the case of a run with no rows to POST at all.
  const admin = adminClient();
  const { created: drained, more } = await ingestLoop(admin, 25000);
  const sent = Number(r.sent || 0);
  const { error: eSet } = await admin.from("settings").upsert([{ key: "last_sync_at", value: new Date().toISOString() }, { key: "last_sync_rows", value: String(sent) }], { onConflict: "key" });
  if (eSet) throw eSet;
  return json({ ok: true, mode, sent, created: Number(r.created || 0) + drained, more });
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ error: "invalid JSON body" }, 400);
  if (body.action === "pull") {
    try { return await pull(req, body); } catch (e) { return json({ error: String((e as Error)?.message || e) }, 500); }
  }
  const secret = Deno.env.get("QA_SYNC_SECRET") || "";
  if (!secret || req.headers.get("x-qa-secret") !== secret) return json({ error: "unauthorized" }, 401);
  try {
    if (!Array.isArray(body?.rows)) return json({ error: "rows[] required" }, 400);
    const rows = body.rows as Record<string, unknown>[];
    if (rows.length > 2000) return json({ error: "max 2000 rows per call" }, 413);
    const admin = adminClient();
    const rejected: string[] = []; const byJo = new Map<string, ReturnType<typeof normalize>>();
    // The sheet can carry the same JONO on two rows; Postgres rejects a second ON CONFLICT hit in one statement, so keep the LAST row per JONO.
    for (const r of rows) { const n = normalize(r); if (n) byJo.set(n.jo_no, n); else rejected.push(String(r.JONO ?? "") + "/" + String(r.ACCTNO ?? "")); }
    const norm = [...byJo.values()];
    for (let i = 0; i < norm.length; i += 500) {
      const { error } = await admin.from("sheet_rows").upsert(norm.slice(i, i + 500), { onConflict: "jo_no" });
      if (error) throw error;
    }
    const isFinal = body.final !== false;
    let created = 0, more = false;
    if (isFinal) ({ created, more } = await ingestLoop(admin));
    // last_sync_rows here is this batch only (the pusher has no idea of the run total); the pull path overwrites it with the true total.
    const { error: e3 } = await admin.from("settings").upsert([{ key: "last_sync_at", value: new Date().toISOString() }, { key: "last_sync_rows", value: String(norm.length) }], { onConflict: "key" });
    if (e3) throw e3;
    return json({ ok: true, upserted: norm.length, audits_created: created, more, rejected });
  } catch (e) { return json({ error: String((e as Error)?.message || e) }, 500); }
});
