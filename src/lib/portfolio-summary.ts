import { fetchLiveQuotes } from "./yahoo-quote";
import { resolveSymbol } from "./symbol";
import { fundNav } from "./fund";
import { fetchFx } from "./valuation-currency";
import { cloudConfig, readRows } from "./cloud-store";

/** มูลค่ารวมของทุกพอร์ตในหน้าปรับพอร์ต (ราคาสด) — ใช้ทั้ง /api/portfolio-summary และบันทึกรายวัน */
export type Asset = { name?: string; kind?: string; group?: string; shares?: number; avgCost?: number };
type IndexData = { list?: { id: string; name: string; cur?: string }[]; deleted?: string[]; fx?: string };
type PfData = { portfolio?: Asset[] };

export const isCash = (a: Asset) => a.kind === "cash" || /^(USD|THB|CASH|เงินสด)$/i.test(String(a.name ?? ""));

export type PortfolioTotal = { id: string; name: string; cur: "USD" | "THB"; invested: number; cost: number; cash: number; investedThb: number | null; costThb: number | null; cashThb: number | null; missing: string[] };
export type PortfolioSummary = { at: number; usdThb: number | null; usdThbMid: number | null; fxMode: "dime" | "mid"; portfolios: PortfolioTotal[]; total: { investedThb: number; cashThb: number; costThb: number }; holdings: { symbol: string; market: "US" | "TH" }[] };

export async function loadPortfolios() {
  const c = cloudConfig();
  if (!c) throw new Error("ยังไม่ได้ตั้งค่าการซิงค์พอร์ต");
  const sync = c.sync;
  const [indexRow] = await readRows<IndexData>([`${sync}__portfolios`]);
  const deleted = new Set(indexRow?.data?.deleted ?? []);
  const list = (indexRow?.data?.list ?? [{ id: "main", name: "พอร์ตหลัก" }]).filter(p => p.id && !deleted.has(p.id));
  if (!list.some(p => p.id === "main") && !deleted.has("main")) list.unshift({ id: "main", name: "พอร์ตหลัก" });
  const keyOf = (id: string) => (id === "main" ? sync : `${sync}__pf_${id}`);
  const data = await readRows<PfData>(list.map(p => keyOf(p.id)));
  const byKey = new Map(data.map(r => [r.sync_key, r.data?.portfolio ?? []]));
  const pfs = list.map(p => ({ ...p, cur: (p.cur === "THB" ? "THB" : "USD") as "USD" | "THB", assets: (byKey.get(keyOf(p.id)) ?? []).filter(a => (a.shares ?? 0) > 0) }));
  return { pfs, fx: indexRow?.data?.fx };
}

export async function computeSummary(): Promise<PortfolioSummary> {
  const { pfs, fx: fxPref } = await loadPortfolios();
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
  // เรตเดียวกับหน้าปรับพอร์ต: แบบ Dime = อัตรากลางหัก 0.18% (ค่าเริ่มต้น)
  const fxMode = fxPref === "mid" ? "mid" : "dime";
  const usdThbMid = fx?.rate ?? null;
  const usdThb = usdThbMid != null ? usdThbMid * (fxMode === "dime" ? 1 - 0.0018 : 1) : null;

  const portfolios: PortfolioTotal[] = pfs.map(p => {
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
  const holdings = usSymbols.map(s => ({ symbol: s.toUpperCase().replace(/\.BK$/i, ""), market: (/\.BK$/i.test(s) ? "TH" : "US") as "US" | "TH" }));
  return { at: Date.now(), usdThb, usdThbMid, fxMode, portfolios, total: { investedThb: sum("investedThb"), cashThb: sum("cashThb"), costThb: sum("costThb") }, holdings };
}
