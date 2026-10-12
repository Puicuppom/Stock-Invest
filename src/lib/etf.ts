import { getYahooAuth, USER_AGENT } from "./yahoo-auth";
import type { Candle } from "./types";

/** ข้อมูลเฉพาะ ETF (Yahoo quoteSummary: topHoldings · fundProfile · defaultKeyStatistics · summaryDetail) */
export interface EtfHolding { symbol: string | null; name: string; percent: number }
export interface EtfSector { key: string; label: string; percent: number }
export interface EtfInfo {
  category: string | null;
  family: string | null;
  /** ค่าธรรมเนียมต่อปี (%) */
  expenseRatio: number | null;
  /** ขนาดกองทุน (สกุลเงินของกอง) */
  totalAssets: number | null;
  /** อัตราปันผล (%) */
  yieldPercent: number | null;
  inceptionDate: string | null;
  holdings: EtfHolding[];
  /** รวม % ของ 10 ตัวแรก */
  top10Percent: number | null;
  sectors: EtfSector[];
  /** หุ้น/พันธบัตร/เงินสด (%) */
  stockPercent: number | null;
  bondPercent: number | null;
  /** กองที่ใช้เลเวอเรจหรือสวนตลาด (2x/3x/Inverse) — ไม่เหมาะถือยาว */
  leveraged: boolean;
}

export const SECTOR_TH: Record<string, string> = {
  technology: "เทคโนโลยี", financial_services: "การเงิน", healthcare: "สุขภาพ",
  consumer_cyclical: "สินค้าตามวัฏจักร", consumer_defensive: "สินค้าจำเป็น",
  communication_services: "สื่อสาร", industrials: "อุตสาหกรรม", energy: "พลังงาน",
  basic_materials: "วัสดุพื้นฐาน", realestate: "อสังหาฯ", utilities: "สาธารณูปโภค",
};

type Raw = { raw?: number; fmt?: string } | number | null | undefined;
const val = (v: Raw): number | null => {
  const n = typeof v === "number" ? v : v?.raw;
  return n != null && Number.isFinite(n) ? n : null;
};
const pct = (v: Raw) => { const n = val(v); return n == null ? null : n * 100; };

export function isLeveragedName(name: string | null | undefined): boolean {
  return /\b(?:[2-4]x|ultra(?:pro|short)?|leveraged|inverse|bear|short)\b/i.test(name ?? "");
}

export async function fetchEtfInfo(symbol: string, longName: string | null): Promise<EtfInfo | null> {
  try {
    const { cookie, crumb } = await getYahooAuth();
    const url = new URL(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`);
    url.searchParams.set("modules", "topHoldings,fundProfile,defaultKeyStatistics,summaryDetail");
    url.searchParams.set("crumb", crumb);
    const res = await fetch(url.toString(), { headers: { "User-Agent": USER_AGENT, Cookie: cookie }, next: { revalidate: 21600 }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const r = (await res.json()).quoteSummary?.result?.[0];
    if (!r) return null;
    const th = r.topHoldings ?? {}, fp = r.fundProfile ?? {}, ks = r.defaultKeyStatistics ?? {}, sd = r.summaryDetail ?? {};
    const holdings: EtfHolding[] = (Array.isArray(th.holdings) ? th.holdings : [])
      .map((h: { symbol?: string; holdingName?: string; holdingPercent?: Raw }) => ({ symbol: h.symbol || null, name: h.holdingName || h.symbol || "", percent: pct(h.holdingPercent) ?? 0 }))
      .filter((h: EtfHolding) => h.percent > 0)
      .slice(0, 10);
    const sectors: EtfSector[] = (Array.isArray(th.sectorWeightings) ? th.sectorWeightings : [])
      .flatMap((o: Record<string, Raw>) => Object.entries(o).map(([key, v]) => ({ key, label: SECTOR_TH[key] ?? key, percent: pct(v) ?? 0 })))
      .filter((s: EtfSector) => s.percent >= 0.5)
      .sort((a: EtfSector, b: EtfSector) => b.percent - a.percent);
    const fee = pct(fp.feesExpensesInvestment?.annualReportExpenseRatio) ?? pct(ks.annualReportExpenseRatio) ?? pct(sd.expenseRatio);
    const yieldPct = pct(sd.yield) ?? pct(ks.yield) ?? pct(sd.trailingAnnualDividendYield);
    const inception = val(ks.fundInceptionDate);
    return {
      category: fp.categoryName || ks.category || null,
      family: fp.family || ks.fundFamily || null,
      expenseRatio: fee,
      totalAssets: val(sd.totalAssets) ?? val(ks.totalAssets),
      yieldPercent: yieldPct,
      inceptionDate: inception ? new Date(inception * 1000).toISOString().slice(0, 10) : null,
      holdings,
      top10Percent: holdings.length ? holdings.reduce((s, h) => s + h.percent, 0) : null,
      sectors,
      stockPercent: pct(th.stockPosition),
      bondPercent: pct(th.bondPosition),
      leveraged: isLeveragedName(longName) || isLeveragedName(fp.categoryName),
    };
  } catch {
    return null;
  }
}

/** ผลตอบแทนจากราคา (ไม่รวมปันผล) · 3/5 ปีเป็นต่อปี */
export function etfReturns(candles: Candle[]): { y1: number | null; y3: number | null; y5: number | null } {
  const last = candles.at(-1);
  if (!last) return { y1: null, y3: null, y5: null };
  const at = (years: number) => {
    const target = new Date(last.date);
    target.setUTCFullYear(target.getUTCFullYear() - years);
    const t = target.toISOString().slice(0, 10);
    const c = candles.find(x => x.date >= t);
    if (!c || c.date > new Date(target.getTime() + 20 * 86400000).toISOString().slice(0, 10) || !(c.close > 0)) return null;
    const total = last.close / c.close;
    return (years === 1 ? total - 1 : Math.pow(total, 1 / years) - 1) * 100;
  };
  return { y1: at(1), y3: at(3), y5: at(5) };
}

/* ── ETF ลดราคา: เทียบกับประวัติของกองเอง ── */
export type EtfDipKind = "good" | "watch" | "notdeep" | "na";
export interface EtfDip {
  kind: EtfDipKind;
  verdict: string;
  drawdownPercent: number | null;
  high52: number | null;
  /** ลงลึกสุดในประวัติที่มี (%) */
  maxDrawdown: number | null;
  maxDrawdownDate: string | null;
  /** % ของวันในอดีตที่ลงลึกกว่าตอนนี้ */
  deeperShare: number | null;
  /** รอบที่เคยลง ≥ 10% · ฟื้นกลับจุดเดิมแล้วกี่รอบ · จากจุดต่ำสุดใช้เวลากลางกี่วัน (ปฏิทิน) */
  episodes: number;
  recovered: number;
  medianRecoveryDays: number | null;
  years: number;
  score: number;
}

export const ETF_DIP_PERCENT = 10;

export function analyzeEtfDip(candles: Candle[]): EtfDip | null {
  if (candles.length < 120) return null;
  const last = candles[candles.length - 1];
  const high52 = Math.max(...candles.slice(-252).map(c => c.high || c.close));
  const dd = high52 > 0 ? (last.close / high52 - 1) * 100 : null;

  // drawdown จากจุดสูงสุดสะสม ทุกวันในประวัติ
  let peak = 0, maxDd = 0;
  let maxDdDate: string | null = null;
  const dds: number[] = [];
  // รอบที่ลง ≥ 10%: นับเวลาจาก "จุดต่ำสุดของรอบ" จนกลับขึ้นจุดสูงสุดเดิม
  const episodes: { trough: number; troughDd: number; end: number | null }[] = [];
  let ep: { trough: number; troughDd: number; end: number | null } | null = null;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (c.close >= peak) {
      if (ep) { ep.end = i; episodes.push(ep); ep = null; }
      peak = c.close;
    }
    const d = peak > 0 ? (c.close / peak - 1) * 100 : 0;
    dds.push(d);
    if (d < maxDd) { maxDd = d; maxDdDate = c.date; }
    if (d <= -ETF_DIP_PERCENT) {
      if (!ep) ep = { trough: i, troughDd: d, end: null };
      else if (d < ep.troughDd) { ep.trough = i; ep.troughDd = d; }
    }
  }
  if (ep) episodes.push(ep);
  const recoveries = episodes.filter(e => e.end != null).map(e => e.end! - e.trough).sort((a, b) => a - b);
  const median = recoveries.length ? recoveries[Math.floor(recoveries.length / 2)] : null;
  const deeperShare = dd != null ? (dds.filter(x => x < dd).length / dds.length) * 100 : null;

  let kind: EtfDipKind, verdict: string;
  if (dd == null) { kind = "na"; verdict = "ข้อมูลไม่พอ"; }
  else if (dd <= -ETF_DIP_PERCENT) { kind = "good"; verdict = "ETF ลดราคา"; }
  else if (dd <= -5) { kind = "watch"; verdict = "เริ่มย่อตัว"; }
  else { kind = "notdeep"; verdict = "ใกล้จุดสูงสุด"; }

  const depth = dd != null ? Math.max(0, Math.min(1, -dd / 25)) : 0;
  const rarity = deeperShare != null ? Math.max(0, Math.min(1, 1 - deeperShare / 50)) : 0;
  return {
    kind, verdict, drawdownPercent: dd, high52, maxDrawdown: maxDd, maxDrawdownDate: maxDdDate, deeperShare,
    episodes: episodes.length, recovered: recoveries.length,
    medianRecoveryDays: median != null ? Math.round(median * 365 / 252) : null,
    years: Math.round(candles.length / 252 * 10) / 10,
    score: Math.round(60 * depth + 40 * rarity),
  };
}
