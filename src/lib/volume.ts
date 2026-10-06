import type { StockData } from "./types";
import { completedCandles } from "./screener";
import { clusterZones, findSwingPoints } from "./swing";

export type VolumeTone = "good" | "bad" | "mid" | "dim";

export interface VolumeBreakout {
  dir: "up" | "down";
  level: number;
  ratio: number;
  /** Volume ≥ 1.5 เท่าของค่าเฉลี่ย 20 วัน = ทะลุจริง */
  strong: boolean;
  daysAgo: number;
}

export interface VolumeResult {
  /** แท่ง 20 วันล่าสุด (เก่า → ใหม่) สำหรับกราฟแท่งเล็ก */
  bars: { volume: number; up: boolean }[];
  avg20: number;
  lastRatio: number;
  lastUp: boolean;
  label: string;
  tone: VolumeTone;
  /** Volume วันขึ้น ÷ Volume วันลง ใน 10 วันล่าสุด */
  balance: number | null;
  balanceLabel: string;
  balanceTone: VolumeTone;
  breakout: VolumeBreakout | null;
}

const avg = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

export const VOLUME_METHOD =
  "Volume เทียบกับค่าเฉลี่ย 20 วันก่อนหน้า (ใช้เฉพาะวันที่ตลาดปิดแล้ว)\n" +
  "• ≥1.5 เท่า วันขึ้น = แรงซื้อเข้า, วันลง = แรงขายออก\n" +
  "• <0.6 เท่า = เบาบาง (ตลาดยังไม่เลือกทาง)\n" +
  "• 10 วัน: Volume วันขึ้น ÷ วันลง ≥1.3 = ซื้อสะสม, ≤0.77 = ขายออก\n" +
  "• ทะลุแนวรับ/ต้าน (Swing) ใน 3 วันล่าสุดพร้อม Volume ≥1.5 เท่า = ทะลุจริง, ต่ำกว่านั้น = ทะลุเบา (ระวังหลอก)";

/** วิเคราะห์ Volume — null ถ้าไม่มีข้อมูล Volume (เช่น ทองคำ spot) */
export function analyzeVolume(data: StockData): VolumeResult | null {
  const candles = completedCandles(data);
  const n = candles.length;
  if (n < 25) return null;
  const vols = candles.map(c => c.volume || 0);
  if (vols.slice(-20).filter(v => v > 0).length < 15) return null;
  const isUp = (i: number) => candles[i].close >= candles[i - 1].close;
  const baseAvg = (i: number) => avg(vols.slice(Math.max(0, i - 20), i).filter(v => v > 0)) || 0;

  const last = n - 1;
  const avg20 = baseAvg(last);
  if (avg20 <= 0) return null;
  const lastRatio = vols[last] / avg20;
  const lastUp = isUp(last);
  const [label, tone]: [string, VolumeTone] =
    lastRatio >= 1.5 ? (lastUp ? ["แรงซื้อเข้า", "good"] : ["แรงขายออก", "bad"])
    : lastRatio < 0.6 ? ["เบาบาง", "dim"]
    : ["ปกติ", "mid"];

  let upVol = 0, downVol = 0;
  for (let i = n - 10; i < n; i++) { if (isUp(i)) upVol += vols[i]; else downVol += vols[i]; }
  const balance = downVol > 0 ? upVol / downVol : upVol > 0 ? 9.9 : null;
  const [balanceLabel, balanceTone]: [string, VolumeTone] =
    balance == null ? ["—", "dim"]
    : balance >= 1.3 ? ["ซื้อสะสม", "good"]
    : balance <= 0.77 ? ["ขายออก", "bad"]
    : ["สมดุล", "mid"];

  // ทะลุแนวรับ/แนวต้านแบบ Swing ใน 3 วันล่าสุด และราคายังอยู่ฝั่งใหม่
  const close = candles[last].close;
  // ใช้โซน Swing ที่เกิดก่อนช่วง 3 วันล่าสุด และราคาเคยกลับตัว ≥2 ครั้ง (รวมแนวที่ถูกทะลุไปแล้วด้วย)
  const zones = clusterZones(findSwingPoints(candles.slice(0, n - 3))).filter(z => (z.strength ?? 1) >= 2);
  const res = zones.filter(z => z.type === "resistance").map(z => z.price);
  const sup = zones.filter(z => z.type === "support").map(z => z.price);
  let breakout: VolumeBreakout | null = null;
  for (let i = last; i >= n - 3 && !breakout; i--) {
    const prev = candles[i - 1].close, cur = candles[i].close;
    const ratio = baseAvg(i) > 0 ? vols[i] / baseAvg(i) : 0;
    const up = res.filter(l => prev <= l && cur > l && close > l).sort((a, b) => b - a)[0];
    const down = sup.filter(l => prev >= l && cur < l && close < l).sort((a, b) => a - b)[0];
    if (up != null) breakout = { dir: "up", level: up, ratio, strong: ratio >= 1.5, daysAgo: last - i };
    else if (down != null) breakout = { dir: "down", level: down, ratio, strong: ratio >= 1.5, daysAgo: last - i };
  }

  return {
    bars: candles.slice(-20).map((c, k) => ({ volume: vols[n - 20 + k], up: c.close >= candles[n - 21 + k].close })),
    avg20, lastRatio, lastUp, label, tone, balance, balanceLabel, balanceTone, breakout,
  };
}
