import type { Candle, StockData } from "./types";
import { completedCandles } from "./screener";
import { findSwingPoints } from "./swing";
import { analyzeTrend } from "./trend";

export type SignalState = "yes" | "partial" | "no";
export interface ReversalSignal { label: string; state: SignalState; detail: string; group: "early" | "confirm" }
export interface ReversalResult {
  signals: ReversalSignal[];
  /** ผ่าน = 1, เริ่มเห็น = 0.5 */
  score: number;
  verdict: string;
  verdictKind: "none" | "early" | "clear" | "confirmed";
  context: string | null;
  rsi: number;
}

const avg = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const f2 = (n: number) => n.toFixed(2);

/** RSI แบบ Wilder 14 วัน — คืนค่าทุกแท่ง (NaN ช่วงแรกที่ข้อมูลยังไม่พอ) */
export function rsiSeries(closes: number[], period = 14): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

function isHammer(c: Candle): boolean {
  const range = c.high - c.low;
  if (range <= 0) return false;
  const body = Math.abs(c.close - c.open);
  const lower = Math.min(c.open, c.close) - c.low;
  const upper = c.high - Math.max(c.open, c.close);
  return lower >= Math.max(body * 2, range * 0.5) && upper <= range * 0.25 && (c.close - c.low) / range >= 0.6;
}

function isBullishEngulfing(prev: Candle, cur: Candle): boolean {
  return prev.close < prev.open && cur.close > cur.open && cur.open <= prev.close && cur.close >= prev.open;
}

/** เช็กลิสต์สัญญาณกลับตัวขึ้น 7 ข้อ จากราคาปิดของวันที่ตลาดปิดแล้ว — null ถ้าข้อมูลไม่พอ */
export function analyzeReversal(data: StockData): ReversalResult | null {
  const candles = completedCandles(data);
  if (candles.length < 70) return null;
  const n = candles.length;
  const closes = candles.map(c => c.close);
  const close = closes[n - 1];
  const rsi = rsiSeries(closes);
  const rsiNow = rsi[n - 1];
  const signals: ReversalSignal[] = [];

  // 1. ราคาอยู่ใกล้แนวรับ
  const supports: { price: number; note: string }[] = [
    ...data.zones.filter(z => z.type === "support").map(z => ({ price: z.price, note: `แนวรับ (เด้ง ×${z.strength})` })),
  ];
  // จุดต่ำสุด 3 เดือนนับเป็นแนวรับได้เมื่อเกิดก่อนหน้าอย่างน้อย 5 วันและราคายืนเหนือได้ (ไม่ใช่วันที่กำลังร่วงทำจุดต่ำใหม่)
  const window60 = candles.slice(-60);
  const lowIdx = window60.reduce((best, c, i) => (c.low < window60[best].low ? i : best), 0);
  if (window60.length - 1 - lowIdx >= 5) supports.push({ price: window60[lowIdx].low, note: "จุดต่ำสุด 3 เดือน" });
  const below = supports.filter(s => s.price <= close * 1.01);
  const nearest = below.sort((a, b) => b.price - a.price)[0];
  const gap = nearest ? (close / nearest.price - 1) * 100 : null;
  const atSupport = gap != null && gap <= 3;
  signals.push({
    group: "early",
    label: "ราคาอยู่ใกล้แนวรับ",
    state: atSupport ? "yes" : gap != null && gap <= 6 ? "partial" : "no",
    detail: nearest ? `${nearest.note} ${f2(nearest.price)} · ห่าง ${gap!.toFixed(1)}%` : "ไม่มีแนวรับใต้ราคา",
  });

  // 2. RSI ต่ำกว่า 30 แล้วกลับขึ้นมา
  const recentRsi = rsi.slice(-10).filter(Number.isFinite);
  const minRsi = Math.min(...recentRsi);
  signals.push({
    group: "early",
    label: "RSI เคยต่ำกว่า 30 แล้วกลับขึ้นมา",
    state: minRsi < 30 && rsiNow >= 30 ? "yes" : rsiNow < 30 || (minRsi < 35 && rsiNow > minRsi + 5) ? "partial" : "no",
    detail: `RSI ตอนนี้ ${rsiNow.toFixed(0)} · ต่ำสุด 10 วัน ${minRsi.toFixed(0)}${rsiNow < 30 ? " (ยังอยู่โซนขายมาก รอกลับขึ้น)" : ""}`,
  });

  // จุดกลับตัวย่อย (swing) ช่วง 90 วัน — ใช้กับข้อ 3 และ 6
  const offset = Math.max(0, n - 90);
  const recent = candles.slice(offset);
  const index = new Map(recent.map((c, i) => [c.date, i + offset]));
  const swings = findSwingPoints(recent, 3);
  const lows = swings.filter(s => s.type === "low");
  const highs = swings.filter(s => s.type === "high");
  // จุดต่ำล่าสุดจะยืนยันเป็น swing ได้หลังผ่านไป 3 วัน — ถ้าราคา 5 วันล่าสุดหลุดจุดต่ำล่าสุดไปแล้ว ให้นับจุดนั้นเป็นจุดต่ำใหม่
  let [low1, low2] = lows.slice(-2);
  const last5 = candles.slice(-5);
  const fresh5 = last5.reduce((best, c) => (c.low < best.low ? c : best), last5[0]);
  const lastLow = low2 ?? low1;
  if (lastLow && fresh5.low < lastLow.price) {
    low1 = lastLow;
    low2 = { date: fresh5.date, price: fresh5.low, type: "low" };
  }
  const i1 = low1 ? index.get(low1.date) : undefined;
  const i2 = low2 ? index.get(low2.date) : undefined;

  // 3. Bullish divergence: ราคาทำจุดต่ำใหม่ แต่ RSI ไม่ทำตาม
  let divergence: SignalState = "no";
  let divDetail = "ไม่พบจุดต่ำ 2 จุดล่าสุดที่เทียบกันได้";
  if (low1 && low2 && i1 != null && i2 != null && Number.isFinite(rsi[i1]) && Number.isFinite(rsi[i2])) {
    const fresh = n - 1 - i2 <= 25;
    if (low2.price < low1.price && rsi[i2] > rsi[i1] + 2) {
      divergence = fresh ? "yes" : "partial";
      divDetail = `ราคาต่ำลง ${f2(low1.price)} → ${f2(low2.price)} แต่ RSI สูงขึ้น ${rsi[i1].toFixed(0)} → ${rsi[i2].toFixed(0)}${fresh ? "" : " (เกิดนานแล้ว)"}`;
    } else divDetail = `จุดต่ำล่าสุด ${f2(low1.price)} → ${f2(low2.price)} · RSI ${rsi[i1].toFixed(0)} → ${rsi[i2].toFixed(0)}`;
  }
  signals.push({ group: "early", label: "Bullish Divergence (ราคาลงแต่ RSI ไม่ลง)", state: divergence, detail: divDetail });

  // 4. แท่งเทียนกลับตัว 3 วันล่าสุด
  let pattern: string | null = null;
  for (let i = n - 1; i >= n - 3 && i >= 1; i--) {
    if (isBullishEngulfing(candles[i - 1], candles[i])) { pattern = `Bullish Engulfing ${candles[i].date}`; break; }
    if (isHammer(candles[i])) { pattern = `Hammer ${candles[i].date}`; break; }
  }
  signals.push({
    group: "early",
    label: "แท่งเทียนกลับตัว (Hammer / Engulfing)",
    state: pattern ? (atSupport ? "yes" : "partial") : "no",
    detail: pattern ? `${pattern}${atSupport ? " ที่แนวรับ" : " (ไม่ได้อยู่ที่แนวรับ น้ำหนักน้อย)"}` : "ไม่พบใน 3 วันล่าสุด",
  });

  // 5. วันขึ้นมี Volume หนุน
  let bestRatio = 0;
  for (let i = n - 1; i >= n - 3; i--) {
    const base = candles.slice(i - 20, i);
    if (base.length < 20 || closes[i] <= closes[i - 1]) continue;
    bestRatio = Math.max(bestRatio, candles[i].volume / avg(base.map(c => c.volume)));
  }
  signals.push({
    group: "early",
    label: "วันที่ราคาขึ้นมี Volume หนุน",
    state: bestRatio >= 1.5 ? "yes" : bestRatio >= 1.2 ? "partial" : "no",
    detail: bestRatio > 0 ? `Volume วันขึ้น ${bestRatio.toFixed(1)} เท่าของค่าเฉลี่ย 20 วัน` : "ไม่มีวันปิดบวกใน 3 วันล่าสุด",
  });

  // 6. โครงสร้างเปลี่ยน: Higher Low + ทะลุจุดสูงล่าสุด
  let structure: SignalState = "no";
  let structDetail = "ยังไม่พบจุดต่ำ 2 จุดล่าสุดให้เทียบ";
  if (low1 && low2) {
    if (low2.price > low1.price) {
      const pivotHigh = highs.filter(h => h.date > low1.date && h.date < low2.date).sort((a, b) => b.price - a.price)[0]
        ?? highs.filter(h => h.date < low2.date).at(-1);
      if (pivotHigh && close > pivotHigh.price) {
        structure = "yes";
        structDetail = `จุดต่ำยกตัว ${f2(low1.price)} → ${f2(low2.price)} และทะลุจุดสูง ${f2(pivotHigh.price)}`;
      } else {
        structure = "partial";
        structDetail = `จุดต่ำยกตัว ${f2(low1.price)} → ${f2(low2.price)}${pivotHigh ? ` · รอทะลุ ${f2(pivotHigh.price)}` : ""}`;
      }
    } else structDetail = `จุดต่ำล่าสุดยังต่ำลง ${f2(low1.price)} → ${f2(low2.price)}`;
  }
  signals.push({ group: "confirm", label: "โครงสร้างเปลี่ยน (Higher Low + ทะลุจุดสูง)", state: structure, detail: structDetail });

  // 7. กลับมายืนเหนือเส้นเฉลี่ย
  const sma20 = avg(closes.slice(-20)), sma50 = avg(closes.slice(-50));
  signals.push({
    group: "confirm",
    label: "ราคากลับมายืนเหนือเส้นเฉลี่ย",
    state: close > sma20 && close > sma50 ? "yes" : close > sma20 ? "partial" : "no",
    detail: `เส้น 20 วัน ${f2(sma20)} (${close > sma20 ? "เหนือ" : "ใต้"}) · 50 วัน ${f2(sma50)} (${close > sma50 ? "เหนือ" : "ใต้"})`,
  });

  const score = signals.reduce((s, x) => s + (x.state === "yes" ? 1 : x.state === "partial" ? 0.5 : 0), 0);
  const confirmed = signals.filter(x => x.group === "confirm").every(x => x.state === "yes");
  // สัญญาณเริ่มต้นจะจางลงหลังราคาวิ่งขึ้นแล้ว จึงให้สัญญาณยืนยันครบ 2 ข้อชนะ
  const verdictKind: ReversalResult["verdictKind"] = confirmed ? "confirmed" : score >= 4.5 ? "clear" : score >= 2.5 ? "early" : "none";
  const verdict = {
    confirmed: "กลับตัวขึ้นแล้ว (ยืนยัน)",
    clear: "สัญญาณกลับตัวขึ้นค่อนข้างชัด",
    early: "เริ่มมีสัญญาณ · รอยืนยัน",
    none: "ยังไม่มีสัญญาณกลับตัว",
  }[verdictKind];
  const trend = analyzeTrend(data);
  const context = trend?.kind === "up"
    ? "หุ้นอยู่ในขาขึ้นอยู่แล้ว ใช้การ์ดนี้ดูจังหวะซื้อตอนย่อตัวลงมาแนวรับ"
    : null;
  return { signals, score, verdict, verdictKind, context, rsi: rsiNow };
}
