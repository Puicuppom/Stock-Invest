import type { StockData } from "./types";
import { completedCandles } from "./screener";
import { adxSeries } from "./indicators";

export type TrendKind = "up" | "down" | "sideway";
export interface TrendResult {
  kind: TrendKind;
  strong: boolean;
  /** เช่น "ขาขึ้นแรง", "Sideway เอียงลง" */
  label: string;
  /** เหตุผลสั้น ๆ ที่ใช้จัดแนวโน้ม */
  reasons: string[];
  /** ADX 14 วัน: ต่ำกว่า 20 = ไม่มีแนวโน้ม · 20–25 = เริ่มมี · มากกว่า 25 = แนวโน้มชัด */
  adx: number | null;
  /** เส้น 50 วันตัดเส้น 200 วัน ภายใน 20 วันทำการล่าสุด */
  cross: "golden" | "death" | null;
  change3mPercent: number | null;
  rangeLow: number;
  rangeHigh: number;
}

export const TREND_METHOD =
  "กราฟรายวัน (ราคาปิดของวันที่ตลาดปิดแล้ว) ตามหลักที่นักวิเคราะห์ใช้กันทั่วไป:\n" +
  "• ขาขึ้น = ราคาเหนือ SMA50 · SMA50 ชันขึ้นเกิน 1% ใน 20 วัน · SMA50 เหนือ SMA200 · ADX(14) ≥ 20 (มีแนวโน้มจริง)\n" +
  "• ขาขึ้นแรง = เพิ่ม ราคาเหนือ SMA20 เหนือ SMA50 และ ADX ≥ 25\n" +
  "• ขาลงกลับด้านกัน · ADX < 20 = แกว่งในกรอบ (Sideway)\n" +
  "• Golden Cross / Death Cross = SMA50 ตัดขึ้น / ตัดลง SMA200 ภายใน 20 วันทำการ\n" +
  "แนวโน้มในอดีตไม่รับประกันอนาคต";

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

  // ADX(14) แบบ Wilder: วัดความแรงของแนวโน้ม (ไม่บอกทิศ)
  const adxRaw = adxSeries(candles).adx.at(-1);
  const adx = adxRaw != null && Number.isFinite(adxRaw) ? adxRaw : null;
  const trending = adx == null || adx >= 20;
  const strongTrend = adx != null && adx >= 25;

  // Golden / Death Cross ภายใน 20 วันทำการ
  let cross: TrendResult["cross"] = null;
  if (n >= 221) {
    const s50then = sma(50, n - 20)!, s200then = sma(200, n - 20)!;
    if (s200 != null && s50then <= s200then && s50 > s200) cross = "golden";
    else if (s200 != null && s50then >= s200then && s50 < s200) cross = "death";
  }

  const last60 = candles.slice(-60);
  const rangeLow = Math.min(...last60.map(c => c.low));
  const rangeHigh = Math.max(...last60.map(c => c.high));
  const change3mPercent = n > 63 ? (close / closes[n - 64] - 1) * 100 : null;
  const vs50 = (close / s50 - 1) * 100;

  const upTrend = close > s50 && slope50 > 1 && (s200 == null || s50 > s200) && trending;
  const downTrend = close < s50 && slope50 < -1 && (s200 == null || s50 < s200) && trending;
  const kind: TrendKind = upTrend ? "up" : downTrend ? "down" : "sideway";
  const strong = kind === "up"
    ? close > s20 && s20 > s50 && strongTrend
    : kind === "down"
      ? close < s20 && s20 < s50 && strongTrend
      : false;

  const reasons = [
    `ราคา${close >= s50 ? "เหนือ" : "ใต้"}เส้นเฉลี่ย 50 วัน ${pct(vs50)}`,
    `เส้นเฉลี่ย 50 วันเปลี่ยน ${pct(slope50)} ใน 20 วัน`,
  ];
  if (s200 != null) reasons.push(`เส้นเฉลี่ย 50 วัน${s50 >= s200 ? "เหนือ" : "ใต้"} 200 วัน`);
  if (adx != null) reasons.push(`ADX ${adx.toFixed(0)} · ${adx >= 25 ? "แนวโน้มชัด" : adx >= 20 ? "เริ่มมีแนวโน้ม" : "ไม่มีแนวโน้ม (แกว่งในกรอบ)"}`);
  if (cross) reasons.push(cross === "golden" ? "Golden Cross: เส้น 50 วันเพิ่งตัดขึ้นเหนือ 200 วัน" : "Death Cross: เส้น 50 วันเพิ่งตัดลงใต้ 200 วัน");

  let label: string;
  if (kind === "up") label = strong ? "ขาขึ้นแรง" : "ขาขึ้น";
  else if (kind === "down") label = strong ? "ขาลงแรง" : "ขาลง";
  else {
    // ทิศทางระยะสั้นชัดแต่ยังสวนเส้น 200 วัน = อาจกำลังกลับตัว
    const turningUp = close > s50 && slope50 > 1 && trending && s200 != null && s50 < s200;
    const turningDown = close < s50 && slope50 < -1 && trending && s200 != null && s50 > s200;
    const lean = close > s50 && slope50 > 0 ? " เอียงขึ้น" : close < s50 && slope50 < 0 ? " เอียงลง" : "";
    label = turningUp ? "กำลังกลับตัวขึ้น" : turningDown ? "กำลังกลับตัวลง" : "Sideway" + lean;
    reasons.push(`กรอบ 3 เดือน ${rangeLow.toFixed(2)}–${rangeHigh.toFixed(2)}`);
  }
  return { kind, strong, label, reasons, adx, cross, change3mPercent, rangeLow, rangeHigh };
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
