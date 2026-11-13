import type { Candle } from "./types";
import { calculateEma } from "./ema";
import { rsiSeries } from "./reversal";

/**
 * ตัวชี้วัดทางเทคนิคมาตรฐาน (สูตรเดียวกับที่ TradingView / ตำราเทคนิคใช้)
 * ทุกฟังก์ชันคืนค่าเป็นอาร์เรย์ยาวเท่าข้อมูล ช่วงที่ข้อมูลยังไม่พอเป็น NaN
 */

const NaNs = (n: number) => new Array<number>(n).fill(NaN);
const ok = (v: number | undefined): v is number => v != null && Number.isFinite(v);

export function smaSeries(v: number[], len: number): number[] {
  const out = NaNs(v.length);
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i];
    if (i >= len) sum -= v[i - len];
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

export function emaSeries(v: number[], len: number): number[] {
  return calculateEma(v, len).map(x => (x == null ? NaN : x));
}

/** ค่าเฉลี่ยแบบ Wilder (RMA) — ใช้กับ ATR / ADX */
function rma(v: number[], len: number): number[] {
  const out = NaNs(v.length);
  let prev = NaN, seed = 0, count = 0;
  for (let i = 0; i < v.length; i++) {
    if (!Number.isFinite(v[i])) continue;
    if (Number.isNaN(prev)) {
      seed += v[i]; count++;
      if (count === len) { prev = seed / len; out[i] = prev; }
    } else {
      prev = (prev * (len - 1) + v[i]) / len;
      out[i] = prev;
    }
  }
  return out;
}

const trueRange = (c: Candle[]) => c.map((x, i) => i === 0 ? x.high - x.low
  : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close)));

/** ATR 14 วัน (Wilder) — ความผันผวนเฉลี่ยต่อวัน เป็นหน่วยราคา */
export function atrSeries(c: Candle[], len = 14): number[] {
  return rma(trueRange(c), len);
}

/** ADX / +DI / −DI 14 วัน (Wilder) */
export function adxSeries(c: Candle[], len = 14) {
  const plusDM = c.map((x, i) => {
    if (i === 0) return 0;
    const up = x.high - c[i - 1].high, down = c[i - 1].low - x.low;
    return up > down && up > 0 ? up : 0;
  });
  const minusDM = c.map((x, i) => {
    if (i === 0) return 0;
    const up = x.high - c[i - 1].high, down = c[i - 1].low - x.low;
    return down > up && down > 0 ? down : 0;
  });
  const tr = rma(trueRange(c), len);
  const pdm = rma(plusDM, len), mdm = rma(minusDM, len);
  const plus = tr.map((t, i) => (t > 0 ? (100 * pdm[i]) / t : NaN));
  const minus = tr.map((t, i) => (t > 0 ? (100 * mdm[i]) / t : NaN));
  const dx = plus.map((p, i) => {
    const s = p + minus[i];
    return Number.isFinite(s) && s > 0 ? (100 * Math.abs(p - minus[i])) / s : NaN;
  });
  return { adx: rma(dx, len), plus, minus };
}

export function macdSeries(closes: number[], fast = 12, slow = 26, signal = 9) {
  const f = emaSeries(closes, fast), s = emaSeries(closes, slow);
  const macd = f.map((x, i) => x - s[i]);
  const start = macd.findIndex(Number.isFinite);
  const sig = NaNs(closes.length);
  if (start >= 0) emaSeries(macd.slice(start), signal).forEach((v, i) => { sig[start + i] = v; });
  return { macd, signal: sig, hist: macd.map((m, i) => m - sig[i]) };
}

/** Stochastic %K(14) ปรับเรียบ 3 · %D = เฉลี่ย 3 ของ %K */
export function stochSeries(c: Candle[], len = 14, smoothK = 3, smoothD = 3) {
  const raw = c.map((_, i) => {
    if (i < len - 1) return NaN;
    const w = c.slice(i - len + 1, i + 1);
    const hi = Math.max(...w.map(x => x.high)), lo = Math.min(...w.map(x => x.low));
    return hi > lo ? (100 * (c[i].close - lo)) / (hi - lo) : 50;
  });
  const k = smaNaN(raw, smoothK);
  return { k, d: smaNaN(k, smoothD) };
}

/** SMA ที่ข้ามช่วง NaN ต้นอาร์เรย์ */
function smaNaN(v: number[], len: number): number[] {
  const start = v.findIndex(Number.isFinite);
  const out = NaNs(v.length);
  if (start < 0) return out;
  smaSeries(v.slice(start), len).forEach((x, i) => { out[start + i] = x; });
  return out;
}

export function cciSeries(c: Candle[], len = 20): number[] {
  const tp = c.map(x => (x.high + x.low + x.close) / 3);
  const ma = smaSeries(tp, len);
  return tp.map((t, i) => {
    if (!Number.isFinite(ma[i])) return NaN;
    const w = tp.slice(i - len + 1, i + 1);
    const md = w.reduce((s, x) => s + Math.abs(x - ma[i]), 0) / len;
    return md > 0 ? (t - ma[i]) / (0.015 * md) : 0;
  });
}

export function williamsRSeries(c: Candle[], len = 14): number[] {
  return c.map((_, i) => {
    if (i < len - 1) return NaN;
    const w = c.slice(i - len + 1, i + 1);
    const hi = Math.max(...w.map(x => x.high)), lo = Math.min(...w.map(x => x.low));
    return hi > lo ? (-100 * (hi - c[i].close)) / (hi - lo) : -50;
  });
}

/** Awesome Oscillator = SMA5 − SMA34 ของจุดกึ่งกลางแท่ง */
export function aoSeries(c: Candle[]): number[] {
  const mid = c.map(x => (x.high + x.low) / 2);
  const a = smaSeries(mid, 5), b = smaSeries(mid, 34);
  return a.map((x, i) => x - b[i]);
}

/** Ultimate Oscillator (7, 14, 28) */
export function uoSeries(c: Candle[]): number[] {
  const bp = c.map((x, i) => x.close - Math.min(x.low, i ? c[i - 1].close : x.low));
  const tr = trueRange(c);
  const avgRatio = (len: number, i: number) => {
    if (i < len) return NaN;
    let b = 0, t = 0;
    for (let j = i - len + 1; j <= i; j++) { b += bp[j]; t += tr[j]; }
    return t > 0 ? b / t : NaN;
  };
  return c.map((_, i) => (100 * (4 * avgRatio(7, i) + 2 * avgRatio(14, i) + avgRatio(28, i))) / 7);
}

/** Stochastic RSI (3, 3, 14, 14) */
export function stochRsiSeries(closes: number[], len = 14, smoothK = 3, smoothD = 3) {
  const rsi = rsiSeries(closes, len);
  const raw = rsi.map((r, i) => {
    if (!Number.isFinite(r) || i < len * 2 - 1) return NaN;
    const w = rsi.slice(i - len + 1, i + 1).filter(Number.isFinite);
    const hi = Math.max(...w), lo = Math.min(...w);
    return hi > lo ? (100 * (r - lo)) / (hi - lo) : 50;
  });
  const k = smaNaN(raw, smoothK);
  return { k, d: smaNaN(k, smoothD) };
}

/* ── คะแนนรวมทางเทคนิค (Technical Rating) ── */

export type RatingAction = "buy" | "sell" | "neutral";
export interface RatingItem { name: string; value: string; action: RatingAction }
export type RatingKind = "strong-buy" | "buy" | "neutral" | "sell" | "strong-sell";
export interface TechnicalRating {
  /** −1 (ขายแรง) ถึง +1 (ซื้อแรง) */
  score: number;
  kind: RatingKind;
  label: string;
  ma: { score: number; items: RatingItem[] };
  osc: { score: number; items: RatingItem[] };
  counts: Record<RatingAction, number>;
}

export const RATING_LABEL: Record<RatingKind, string> = {
  "strong-buy": "ซื้อแรง", buy: "ซื้อ", neutral: "กลาง", sell: "ขาย", "strong-sell": "ขายแรง",
};

export const RATING_METHOD =
  "คะแนนรวมทางเทคนิคแบบ TradingView จากกราฟรายวัน (ราคาปิดวันที่ตลาดปิดแล้ว)\n" +
  "• เส้นเฉลี่ย 12 เส้น: SMA และ EMA 10/20/30/50/100/200 วัน · ราคาอยู่เหนือเส้น = ซื้อ ใต้เส้น = ขาย\n" +
  "• ตัวชี้วัดโมเมนตัม 11 ตัว: RSI(14), Stochastic(14,3,3), CCI(20), ADX(14), Awesome Oscillator, Momentum(10), MACD(12,26,9), Stoch RSI(3,3,14,14), Williams %R(14), Bull Bear Power(13), Ultimate Oscillator(7,14,28)\n" +
  "• คะแนนแต่ละกลุ่ม = (ซื้อ − ขาย) ÷ จำนวนตัว · คะแนนรวม = เฉลี่ย 2 กลุ่ม\n" +
  "• มากกว่า +0.5 ซื้อแรง · +0.1 ถึง +0.5 ซื้อ · −0.1 ถึง +0.1 กลาง · −0.5 ถึง −0.1 ขาย · ต่ำกว่า −0.5 ขายแรง\n" +
  "เป็นสัญญาณจากราคาอย่างเดียว ไม่ได้ดูพื้นฐาน · ไม่ใช่คำแนะนำการลงทุน";

const f = (v: number, d = 2) => (ok(v) ? v.toFixed(d) : "—");
const groupScore = (items: RatingItem[]) => {
  const n = items.length;
  if (!n) return 0;
  return (items.filter(i => i.action === "buy").length - items.filter(i => i.action === "sell").length) / n;
};
export function ratingKind(score: number): RatingKind {
  return score > 0.5 ? "strong-buy" : score > 0.1 ? "buy" : score >= -0.1 ? "neutral" : score >= -0.5 ? "sell" : "strong-sell";
}

/** คำนวณจากแท่งรายวันที่ปิดแล้ว — null ถ้าข้อมูลน้อยกว่า 60 วัน */
export function technicalRating(c: Candle[]): TechnicalRating | null {
  const n = c.length;
  if (n < 60) return null;
  const closes = c.map(x => x.close);
  const close = closes[n - 1];
  const last = (s: number[], back = 0) => s[n - 1 - back];

  // เส้นเฉลี่ย
  const ma: RatingItem[] = [];
  for (const len of [10, 20, 30, 50, 100, 200]) {
    for (const [kind, series] of [["EMA", emaSeries(closes, len)], ["SMA", smaSeries(closes, len)]] as const) {
      const v = last(series);
      if (!ok(v)) continue;
      ma.push({ name: `${kind} ${len}`, value: f(v), action: close > v ? "buy" : close < v ? "sell" : "neutral" });
    }
  }

  const osc: RatingItem[] = [];
  const add = (name: string, value: string, buy: boolean, sell: boolean) =>
    osc.push({ name, value, action: buy ? "buy" : sell ? "sell" : "neutral" });

  const rsi = rsiSeries(closes);
  const r0 = last(rsi), r1 = last(rsi, 1);
  if (ok(r0) && ok(r1)) add("RSI (14)", f(r0), r0 < 30 && r0 > r1, r0 > 70 && r0 < r1);

  const st = stochSeries(c);
  const k0 = last(st.k), d0 = last(st.d);
  if (ok(k0) && ok(d0)) add("Stochastic %K (14,3,3)", f(k0), k0 < 20 && k0 > d0, k0 > 80 && k0 < d0);

  const cci = cciSeries(c);
  const c0 = last(cci), c1 = last(cci, 1);
  if (ok(c0) && ok(c1)) add("CCI (20)", f(c0), c0 < -100 && c0 > c1, c0 > 100 && c0 < c1);

  const dmi = adxSeries(c);
  const a0 = last(dmi.adx), a1 = last(dmi.adx, 1), p0 = last(dmi.plus), m0 = last(dmi.minus);
  if (ok(a0) && ok(a1) && ok(p0) && ok(m0)) add("ADX (14)", f(a0), a0 > 20 && a0 > a1 && p0 > m0, a0 > 20 && a0 > a1 && p0 < m0);

  const ao = aoSeries(c);
  const o0 = last(ao), o1 = last(ao, 1), o2 = last(ao, 2);
  if (ok(o0) && ok(o1) && ok(o2)) {
    const saucerUp = o0 > 0 && o1 < o2 && o0 > o1;
    const saucerDown = o0 < 0 && o1 > o2 && o0 < o1;
    add("Awesome Oscillator", f(o0), (o1 <= 0 && o0 > 0) || saucerUp, (o1 >= 0 && o0 < 0) || saucerDown);
  }

  if (n > 11) {
    const mom0 = close - closes[n - 11], mom1 = closes[n - 2] - closes[n - 12];
    add("Momentum (10)", f(mom0), mom0 > mom1, mom0 < mom1);
  }

  const md = macdSeries(closes);
  const mc = last(md.macd), ms = last(md.signal);
  if (ok(mc) && ok(ms)) add("MACD (12,26,9)", f(mc), mc > ms, mc < ms);

  const sma50 = last(smaSeries(closes, 50));
  const sr = stochRsiSeries(closes);
  const sk = last(sr.k), sd = last(sr.d);
  if (ok(sk) && ok(sd) && ok(sma50)) add("Stoch RSI (3,3,14,14)", f(sk), close < sma50 && sk < 20 && sk > sd, close > sma50 && sk > 80 && sk < sd);

  const wr = williamsRSeries(c);
  const w0 = last(wr), w1 = last(wr, 1);
  if (ok(w0) && ok(w1)) add("Williams %R (14)", f(w0), w0 < -80 && w0 > w1, w0 > -20 && w0 < w1);

  const e13 = emaSeries(closes, 13);
  const bbp = c.map((x, i) => (x.high - e13[i]) + (x.low - e13[i]));
  const b0 = last(bbp), b1 = last(bbp, 1), e0 = last(e13), e1 = last(e13, 1);
  if (ok(b0) && ok(b1) && ok(e0) && ok(e1)) add("Bull Bear Power (13)", f(b0), e0 > e1 && b0 < 0 && b0 > b1, e0 < e1 && b0 > 0 && b0 < b1);

  const uo = last(uoSeries(c));
  if (ok(uo)) add("Ultimate Oscillator (7,14,28)", f(uo), uo > 70, uo < 30);

  const maScore = groupScore(ma), oscScore = groupScore(osc);
  const score = (maScore + oscScore) / 2;
  const kind = ratingKind(score);
  const all = [...ma, ...osc];
  return {
    score, kind, label: RATING_LABEL[kind],
    ma: { score: maScore, items: ma },
    osc: { score: oscScore, items: osc },
    counts: { buy: all.filter(i => i.action === "buy").length, neutral: all.filter(i => i.action === "neutral").length, sell: all.filter(i => i.action === "sell").length },
  };
}
