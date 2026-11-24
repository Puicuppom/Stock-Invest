import { NextResponse } from "next/server";
import { isCash, loadPortfolios } from "@/lib/portfolio-summary";

/** หุ้นที่ถืออยู่ในหน้าปรับพอร์ต (เฉพาะชื่อ ไม่ส่งจำนวน/ต้นทุน) → ให้ Watchlist ดันขึ้นบนสุด */
// จำไว้ 2 นาทีต่อเครื่องเซิร์ฟเวอร์ ไม่ต้องอ่านพอร์ตจากคลาวด์ทุกครั้งที่ Watchlist ซิงค์ (ทุก 30 วิ)
let heldCache: { at: number; v: { symbol: string; market: string }[] } | null = null;
async function heldSymbols() {
  if (heldCache && Date.now() - heldCache.at < 120_000) return heldCache.v;
  const v = await heldSymbolsFresh();
  heldCache = { at: Date.now(), v };
  return v;
}
async function heldSymbolsFresh() {
  try {
    const { pfs } = await loadPortfolios();
    const out = new Set<string>();
    for (const p of pfs) { if (p.cur !== "USD") continue; for (const a of p.assets) if (!isCash(a) && a.name) out.add(String(a.name).toUpperCase()); }
    return [...out].map(s => ({ symbol: s.replace(/\.BK$/, ""), market: /\.BK$/.test(s) ? "TH" : "US" }));
  } catch { return []; }
}

function config() {
  const url = process.env.REBALANCE_SUPABASE_URL;
  const key = process.env.REBALANCE_SUPABASE_ANON_KEY;
  const syncKey = process.env.REBALANCE_SYNC_KEY;
  if (!url || !key || !syncKey) return null;
  return { url, syncKey, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "x-watchlist-key": syncKey } };
}
export async function GET() {
  const c = config();
  if (!c) return NextResponse.json({enabled: false});
  try {
    const query = new URLSearchParams({sync_key: `eq.${c.syncKey}`, select: "items", limit: "1"});
    const [response, held] = await Promise.all([
      fetch(`${c.url}/rest/v1/watchlists?${query}`, {headers:c.headers,cache:"no-store",signal:AbortSignal.timeout(10000)}),
      heldSymbols(),
    ]);
    if (!response.ok) throw new Error();
    const rows = await response.json();
    return NextResponse.json({enabled:true, items:rows[0]?.items ?? null, held});
  } catch { return NextResponse.json({error:"ซิงค์ไม่ได้ ตรวจตาราง watchlists และค่าตั้งค่า Supabase"},{status:502}); }
}
export async function PUT(request: Request) {
  const c = config();
  if (!c) return NextResponse.json({enabled:false},{status:503});
  try {
    const {items} = await request.json();
    if (!Array.isArray(items) || items.length > 500 || items.some(i=>!i || typeof i.symbol !== "string" || !/^[A-Z0-9.^=/-]{1,40}$/.test(i.symbol) || !["US","TH"].includes(i.market)))
      return NextResponse.json({error:"รายการหุ้นไม่ถูกต้อง"},{status:400});
    const response = await fetch(`${c.url}/rest/v1/watchlists?on_conflict=sync_key`, {method:"POST",headers:{...c.headers,Prefer:"resolution=merge-duplicates"},body:JSON.stringify({sync_key:c.syncKey,items,updated_at:new Date().toISOString()}),signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error();
    return NextResponse.json({saved:true});
  } catch { return NextResponse.json({error:"บันทึก Watchlist ไม่สำเร็จ"},{status:502}); }
}
