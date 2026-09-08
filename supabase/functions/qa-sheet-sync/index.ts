// AHBA QA — sheet sync receiver. Deploy: Supabase → Edge Functions → "qa-sheet-sync" → paste → Deploy. Turn OFF "Verify JWT".
// Secrets: QA_SYNC_SECRET (shared with the Apps Script). Never deletes; upserts qa.sheet_rows then runs qa.ingest_sheet_rows().
// Normalization mirrors qa-core.js normalizeSheetRow — keep both in sync.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-qa-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
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
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const secret = Deno.env.get("QA_SYNC_SECRET") || "";
  if (!secret || req.headers.get("x-qa-secret") !== secret) return json({ error: "unauthorized" }, 401);
  try {
    const body = await req.json();
    if (!Array.isArray(body?.rows)) return json({ error: "rows[] required" }, 400);
    const rows: Record<string, unknown>[] = body.rows;
    if (rows.length > 2000) return json({ error: "max 2000 rows per call" }, 413);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "qa" } });
    const rejected: string[] = []; const byJo = new Map<string, ReturnType<typeof normalize>>();
    // The sheet can carry the same JONO on two rows; Postgres rejects a second ON CONFLICT hit in one statement, so keep the LAST row per JONO.
    for (const r of rows) { const n = normalize(r); if (n) byJo.set(n.jo_no, n); else rejected.push(String(r.JONO ?? "") + "/" + String(r.ACCTNO ?? "")); }
    const norm = [...byJo.values()];
    for (let i = 0; i < norm.length; i += 500) {
      const { error } = await admin.from("sheet_rows").upsert(norm.slice(i, i + 500), { onConflict: "jo_no" });
      if (error) throw error;
    }
    const isFinal = body.final !== false;
    let created = 0;
    if (isFinal) {
      const { data, error: e2 } = await admin.rpc("ingest_sheet_rows");
      if (e2) throw e2;
      created = data ?? 0;
    }
    const { error: e3 } = await admin.from("settings").upsert([{ key: "last_sync_at", value: new Date().toISOString() }, { key: "last_sync_rows", value: String(norm.length) }], { onConflict: "key" });
    if (e3) throw e3;
    return json({ ok: true, upserted: norm.length, audits_created: created, rejected });
  } catch (e) { return json({ error: String((e as Error)?.message || e) }, 500); }
});
