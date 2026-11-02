import { NextResponse } from "next/server";
import { fetchLiveQuotes } from "@/lib/yahoo-quote";
import { resolveSymbol } from "@/lib/symbol";
import { fundNav } from "@/lib/fund";
import { fetchFx } from "@/lib/valuation-currency";

export const dynamic = "force-dynamic";

/**
 * GET /api/portfolio-summary → มูลค่ารวมของทุกพอร์ตในหน้าปรับพอร์ต (ราคาสด) เป็นบาท
 * ให้แอปอื่น (เช่น ลงทุนแมน) ดึงไปอัปเดตอัตโนมัติ · ส่งเฉพาะยอดรวม ไม่ส่งรายการหุ้น
 */
type Asset = { name?: string; kind?: string; group?: string; shares?: number; avgCost?: number };
type Row = { sync_key: string; data: { portfolio?: Asset[]; list?: { id: string; name: string; cur?: string }[]; deleted?: string[] } | null };

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Cache-Control": "no-store" };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

async function rows(url: string, key: string, keys: string[]): Promise<Row[]> {
  const q = `${url}/rest/v1/portfolios?select=sync_key,data&sync_key=in.(${keys.map(k => `"${k.replace(/"/g, "")}"`).join(",")})`;
  const res = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error("อ่านข้อมูลพอร์ตไม่ได้");
  return res.json();
}

const isCash = (a: Asset) => a.kind === "cash" || /^(USD|THB|CASH|เงินสด)$/i.test(String(a.name ?? ""));

export async function GET() {
  const url = process.env.REBALANCE_SUPABASE_URL, key = process.env.REBALANCE_SUPABASE_ANON_KEY, sync = process.env.REBALANCE_SYNC_KEY;
  if (!url || !key || !sync) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่าการซิงค์พอร์ต" }, { status: 503, headers: CORS });
  try {
    const [indexRow] = await rows(url, key, [`${sync}__portfolios`]);
    const deleted = new Set(indexRow?.data?.deleted ?? []);
    const list = (indexRow?.data?.list ?? [{ id: "main", name: "พอร์ตหลัก" }]).filter(p => p.id && !deleted.has(p.id));
    if (!list.some(p => p.id === "main") && !deleted.has("main")) list.unshift({ id: "main", name: "พอร์ตหลัก" });
    const keyOf = (id: string) => (id === "main" ? sync : `${sync}__pf_${id}`);
    const data = await rows(url, key, list.map(p => keyOf(p.id)));
    const byKey = new Map(data.map(r => [r.sync_key, r.data?.portfolio ?? []]));

    const pfs = list.map(p => ({ ...p, cur: p.cur === "THB" ? "THB" : "USD", assets: (byKey.get(keyOf(p.id)) ?? []).filter(a => (a.shares ?? 0) > 0) }));
    const usSymbols = [...new Set(pfs.filter(p => p.cur === "USD").flatMap(p => p.assets.filter(a => !isCash(a)).map(a => String(a.name))))];
    const fundCodes = [...new Set(pfs.filter(p => p.cur === "THB").flatMap(p => p.assets.filter(a => !isCash(a)).map(a => String(a.name))))];
    const [quotes, navs, fx] = await Promise.all([
      fetchLiveQuotes(usSymbols.map(s => resolveSymbol(s, /\.BK$/i.test(s) ? "TH" : "US")).filter(Boolean)).catch(() => []),
      Promise.all(fundCodes.map(c => fundNav(c).catch(() => null))),
      fetchFx("USD", "THB"),
    ]);
    const price = new Map<string, number>();
    for (const q of quotes) price.set(q.symbol.toUpperCase(), q.price);
    fundCodes.forEach((c, i) => { if (navs[i]) price.set(c.toUpperCase(), navs[i]!.nav); });
    const usdThb = fx?.rate ?? null;

    const portfolios = pfs.map(p => {
      let invested = 0, cost = 0, cash = 0;
      const missing: string[] = [];
      for (const a of p.assets) {
        const shares = a.shares ?? 0;
        if (isCash(a)) { cash += shares; continue; }
        const sym = String(a.name).toUpperCase();
        const px = price.get(p.cur === "USD" ? resolveSymbol(sym, /\.BK$/i.test(sym) ? "TH" : "US").toUpperCase() : sym);
        if (!px) { missing.push(sym); continue; }
        invested += shares * px;
        cost += shares * (a.avgCost ?? 0);
      }
      const toThb = p.cur === "THB" ? 1 : usdThb;
      const thb = (n: number) => (toThb ? Math.round(n * toThb * 100) / 100 : null);
      return { id: p.id, name: p.name, cur: p.cur, invested, cost, cash, investedThb: thb(invested), costThb: thb(cost), cashThb: thb(cash), missing };
    });
    const sum = (k: "investedThb" | "cashThb" | "costThb") => portfolios.reduce((s, p) => s + (p[k] ?? 0), 0);
    return NextResponse.json({ at: Date.now(), usdThb, portfolios, total: { investedThb: sum("investedThb"), cashThb: sum("cashThb"), costThb: sum("costThb") } }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "summary failed" }, { status: 502, headers: CORS });
  }
}
