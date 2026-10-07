import type { StockData } from "./types";
import { completedCandles } from "./screener";

export type TrendKind = "up" | "down" | "sideway";
export interface TrendResult {
  kind: TrendKind;
  strong: boolean;
  /** เช่น "ขาขึ้นแรง", "Sideway เอียงลง" */
  label: string;
  /** เหตุผลสั้น ๆ ที่ใช้จัดแนวโน้ม */
  reasons: string[];
  change3mPercent: number | null;
  rangeLow: number;
  rangeHigh: number;
}

export const TREND_METHOD =
  "ใช้ราคาปิดรายวันของวันที่ตลาดปิดแล้ว: ขาขึ้น = ราคาเหนือ SMA50, SMA50 ชันขึ้นเกิน 1% ใน 20 วัน, SMA50 เหนือ SMA200 และราคาวิ่งเป็นทิศทาง (Efficiency Ratio 3 เดือน ≥ 0.2) · ขาลงกลับด้านกัน · นอกนั้น Sideway · แนวโน้มในอดีตไม่รับประกันอนาคต";

const avg = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

/** จัดแนวโน้มระยะกลาง (~3 เดือน) จากราคารายวัน — null ถ้าข้อมูลไม่พอ */
export function analyzeTrend(data: StockData): TrendResult | null {
  const candles = completedCandles(data);
  if (candles.length < 70) return null;
  const closes = candles.map(c => c.close);
  const n = closes.length;
  const close = closes[n - 1];
  const sma = (len: number, end = n) => (end >= len ? avg(closes.slice(end - len, end)) : null);
  const s20 = sma(20)!, s50 = sma(50)!, s200 = sma(200), s50prev = sma(50, n - 20)!;
  const slope50 = (s50 / s50prev - 1) * 100;

  // Efficiency Ratio: ระยะที่ราคาไปได้จริง ÷ ระยะที่วิ่งไปมาทั้งหมด (0 = แกว่งในกรอบ, 1 = วิ่งทางเดียว)
  const window = closes.slice(-61);
  let path = 0;
  for (let i = 1; i < window.length; i++) path += Math.abs(window[i] - window[i - 1]);
  const er = path > 0 ? Math.abs(window[window.length - 1] - window[0]) / path : 0;

  const last60 = candles.slice(-60);
  const rangeLow = Math.min(...last60.map(c => c.low));
  const rangeHigh = Math.max(...last60.map(c => c.high));
  const change3mPercent = n > 63 ? (close / closes[n - 64] - 1) * 100 : null;
  const vs50 = (close / s50 - 1) * 100;

  const upTrend = close > s50 && slope50 > 1 && (s200 == null || s50 > s200) && er >= 0.2;
  const downTrend = close < s50 && slope50 < -1 && (s200 == null || s50 < s200) && er >= 0.2;
  const kind: TrendKind = upTrend ? "up" : downTrend ? "down" : "sideway";
  const strong = kind === "up"
    ? close > s20 && s20 > s50 && slope50 > 3 && er >= 0.35
    : kind === "down"
      ? close < s20 && s20 < s50 && slope50 < -3 && er >= 0.35
      : false;

  const reasons = [
    `ราคา${close >= s50 ? "เหนือ" : "ใต้"}เส้นเฉลี่ย 50 วัน ${pct(vs50)}`,
    `เส้นเฉลี่ย 50 วันเปลี่ยน ${pct(slope50)} ใน 20 วัน`,
  ];
  if (s200 != null) reasons.push(`เส้นเฉลี่ย 50 วัน${s50 >= s200 ? "เหนือ" : "ใต้"} 200 วัน`);
  reasons.push(`ทิศทางชัดเจน${er >= 0.35 ? "สูง" : er >= 0.2 ? "ปานกลาง" : "ต่ำ (แกว่งไปมา)"}`);

  let label: string;
  if (kind === "up") label = strong ? "ขาขึ้นแรง" : "ขาขึ้น";
  else if (kind === "down") label = strong ? "ขาลงแรง" : "ขาลง";
  else {
    // ทิศทางระยะสั้นชัดแต่ยังสวนเส้น 200 วัน = อาจกำลังกลับตัว
    const turningUp = close > s50 && slope50 > 1 && er >= 0.2 && s200 != null && s50 < s200;
    const turningDown = close < s50 && slope50 < -1 && er >= 0.2 && s200 != null && s50 > s200;
    const lean = close > s50 && slope50 > 0 ? " เอียงขึ้น" : close < s50 && slope50 < 0 ? " เอียงลง" : "";
    label = turningUp ? "กำลังกลับตัวขึ้น" : turningDown ? "กำลังกลับตัวลง" : "Sideway" + lean;
    reasons.push(`กรอบ 3 เดือน ${rangeLow.toFixed(2)}–${rangeHigh.toFixed(2)}`);
  }
  return { kind, strong, label, reasons, change3mPercent, rangeLow, rangeHigh };
}

export type TrendLean = "up" | "upish" | "flat" | "downish" | "down";
/** แยก Sideway เอียงขึ้น/เอียงลง (และกำลังกลับตัว) ออกจาก Sideway ธรรมดา */
export function trendLean(kind: TrendKind, label?: string | null): TrendLean {
  if (kind === "up") return "up";
  if (kind === "down") return "down";
  if (label && /เอียงขึ้น|กลับตัวขึ้น/.test(label)) return "upish";
  if (label && /เอียงลง|กลับตัวลง/.test(label)) return "downish";
  return "flat";
}
export const LEAN_GLYPH: Record<TrendLean, string> = { up: "▲", upish: "↗", flat: "↔", downish: "↘", down: "▼" };
export const LEAN_SHORT: Record<TrendLean, string> = { up: "ขาขึ้น", upish: "เอียงขึ้น", flat: "ไซด์เวย์", downish: "เอียงลง", down: "ขาลง" };

export function trendIcon(kind: TrendKind, label?: string | null): string {
  return LEAN_GLYPH[trendLean(kind, label)];
}
