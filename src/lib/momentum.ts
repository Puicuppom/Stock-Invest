import type { StockData } from "./types";
import { completedCandles } from "./screener";
import { analyzeTrend } from "./trend";
import { rsiSeries } from "./reversal";

/** ข้อมูลตลาดที่ใช้เทียบ (คำนวณครั้งเดียวต่อการค้นหา) */
export interface MarketContext {
  /** ผลตอบแทน 6 เดือนของดัชนี (S&P 500 / SET) เป็น % */
  index6mPercent: number | null;
  indexName: string;
}

const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const avg = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

/** ผลตอบแทนย้อนหลัง n แท่ง (%) */
export function returnPercent(closes: number[], bars: number): number | null {
  if (closes.length <= bars) return null;
  const a = closes[closes.length - 1 - bars], b = closes[closes.length - 1];
  return a > 0 ? (b / a - 1) * 100 : null;
}

export interface TechSnapshot {
  close: number;
  sma20: number | null;
  sma50: number | null;
  rsi: number | null;
  ret6m: number | null;
  fromHigh52: number | null;
  fromHigh3m: number | null;
  /** Volume เฉลี่ย 5 วัน ÷ 50 วันก่อนหน้า */
  volRatio5v50: number | null;
  /** มูลค่าซื้อขายเฉลี่ย 20 วัน */
  tradedValue20: number | null;
  epsGrowthPercent: number | null;
  peg: number | null;
}

export function techSnapshot(data: StockData): TechSnapshot | null {
  const c = completedCandles(data);
  if (c.length < 60) return null;
  const closes = c.map(x => x.close);
  const n = closes.length;
  const close = closes[n - 1];
  const sma = (len: number) => (n >= len ? avg(closes.slice(-len)) : null);
  const rsi = rsiSeries(closes).at(-1);
  const high52 = Math.max(...c.slice(-252).map(x => x.high || x.close));
  const high3m = Math.max(...c.slice(-63).map(x => x.high || x.close));
  const v5 = avg(c.slice(-5).map(x => x.volume || 0));
  const v50 = c.length >= 55 ? avg(c.slice(-55, -5).map(x => x.volume || 0)) : 0;
  const f = data.fairValue;
  const ttm = f.trailingEps, fwd = f.forwardEps;
  const epsGrowthPercent = finite(ttm) && ttm > 0 && finite(fwd) ? (fwd / ttm - 1) * 100 : null;
  const pe = finite(f.forwardPE) && f.forwardPE > 0 ? f.forwardPE : finite(f.trailingPE) && f.trailingPE > 0 ? f.trailingPE : null;
  const peg = pe != null && epsGrowthPercent != null && epsGrowthPercent > 0 ? pe / epsGrowthPercent : null;
  return {
    close, sma20: sma(20), sma50: sma(50), rsi: finite(rsi) ? rsi : null,
    ret6m: returnPercent(closes, 126),
    fromHigh52: high52 > 0 ? (close / high52 - 1) * 100 : null,
    fromHigh3m: high3m > 0 ? (close / high3m - 1) * 100 : null,
    volRatio5v50: v50 > 0 ? v5 / v50 : null,
    tradedValue20: avg(c.slice(-20).map(x => x.close * (x.volume || 0))),
    epsGrowthPercent, peg,
  };
}

export type MomentumKind = "go" | "wait" | "hype" | "none" | "na";
export interface MomentumResult { kind: MomentumKind; verdict: string; score: number }

/** สรุป "หุ้นแกร่งไปต่อ" — ใช้เรียงคะแนนและป้าย */
export function analyzeMomentum(data: StockData, ctx?: MarketContext | null): MomentumResult | null {
  if (data.assetKind !== "stock") return null;
  const t = techSnapshot(data);
  if (!t) return { kind: "na", verdict: "ข้อมูลไม่พอ", score: 0 };
  const q = data.fairValue.quality ?? null;
  const financial = q?.sector === "Financial Services";
  const trend = analyzeTrend(data);
  const quality = [
    finite(q?.roePercent) && q.roePercent >= 15,
    financial || (finite(q?.operatingMarginPercent) && q.operatingMarginPercent >= 15),
    finite(q?.revenueGrowthPercent) && q.revenueGrowthPercent >= 10,
    t.epsGrowthPercent != null && t.epsGrowthPercent > 0,
    financial || (finite(q?.netDebtToEbitda) && q.netDebtToEbitda <= 2),
  ];
  const qualityOk = quality.filter(Boolean).length >= 4;
  const beats = ctx?.index6mPercent != null && t.ret6m != null ? t.ret6m > ctx.index6mPercent : t.ret6m != null && t.ret6m > 10;
  const uptrend = trend?.kind === "up" && beats && t.fromHigh52 != null && t.fromHigh52 >= -15;
  const extended = (t.sma50 != null && t.close > t.sma50 * 1.15) || (t.rsi != null && t.rsi > 75) || (t.peg != null && t.peg > 2);
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const score = Math.round(
    40 * quality.filter(Boolean).length / quality.length
    + 15 * clamp01(((t.ret6m ?? 0) - (ctx?.index6mPercent ?? 0)) / 30)
    + 15 * clamp01(1 + (t.fromHigh52 ?? -100) / 15)
    + 15 * (trend?.kind === "up" ? 1 : 0)
    + 15 * (extended ? 0 : 1),
  );
  if (!uptrend) return { kind: "none", verdict: "ยังไม่ใช่ขาขึ้น", score };
  if (!qualityOk) return { kind: "hype", verdict: "ขึ้นแรง แต่พื้นฐานไม่ถึง", score };
  if (extended) return { kind: "wait", verdict: "แกร่ง แต่รอย่อ", score };
  return { kind: "go", verdict: "แกร่ง ไปต่อได้", score };
}
