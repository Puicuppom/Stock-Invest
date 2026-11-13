import type { Candle } from "./types";

/**
 * ประมาณต้นทุนของผู้ถือหุ้นตอนนี้ (Chip Distribution แบบเดียวกับแอปอย่าง Futu)
 * ไล่ทีละวัน: หุ้นที่เปลี่ยนมือวันนั้น (Volume ÷ จำนวนหุ้นทั้งหมด) ย้ายต้นทุนไปอยู่ช่วงราคาของวันนั้น
 * ส่วนที่ไม่เปลี่ยนมือคงต้นทุนเดิม → ได้การกระจายต้นทุนของคนที่ถืออยู่ ณ วันนี้
 * เป็นค่าประมาณจากราคาและปริมาณซื้อขาย ไม่ใช่ข้อมูลพอร์ตจริงของนักลงทุน
 */
export interface HolderCost {
  /** ต้นทุนเฉลี่ยของผู้ถือทั้งหมด */
  avg: number;
  /** ช่วงราคาที่คนถือหนาแน่นที่สุด */
  peakLow: number; peakHigh: number;
  /** สัดส่วนผู้ถือที่กำไรอยู่ที่ราคาปัจจุบัน (0–100) */
  profitPct: number;
  /** ครึ่งกลางของผู้ถือ (25%–75%) */
  rangeLow: number; rangeHigh: number;
}

export function estimateHolderCost(candles: Candle[], price: number, sharesOutstanding: number | null): HolderCost | null {
  const c = candles.filter(x => x.high > 0 && x.low > 0 && x.close > 0).slice(-500);
  if (c.length < 60 || !(price > 0)) return null;
  const lo = Math.min(...c.map(x => x.low)), hi = Math.max(...c.map(x => x.high));
  if (!(hi > lo)) return null;
  const N = 80, step = (hi - lo) / N;
  const binOf = (p: number) => Math.min(N - 1, Math.max(0, Math.floor((p - lo) / step)));
  const avgVol = c.reduce((s, x) => s + (x.volume || 0), 0) / c.length;
  // ไม่รู้จำนวนหุ้น → สมมติว่าหุ้นเปลี่ยนมือครบรอบใน ~1 ปี
  const float = sharesOutstanding && sharesOutstanding > 0 ? sharesOutstanding : avgVol * 250;
  if (!(float > 0)) return null;
  let dist = new Array<number>(N).fill(0);
  let seeded = false;
  for (const d of c) {
    const t = Math.min(1, (d.volume || 0) / float);
    // วันแรก: ถือว่าทุกคนมีต้นทุนช่วงราคาวันนั้น
    const turn = seeded ? t : 1;
    if (turn <= 0) continue;
    dist = dist.map(w => w * (1 - turn));
    // กระจายแบบสามเหลี่ยม หนาที่ราคาปิด/กลางแท่ง
    const a = binOf(d.low), b = binOf(d.high), mid = binOf((d.high + d.low + d.close) / 3);
    const weights: number[] = [];
    for (let i = a; i <= b; i++) weights.push(1 + (b > a ? 1 - Math.abs(i - mid) / (b - a + 1) : 0));
    const sum = weights.reduce((s, w) => s + w, 0);
    for (let i = a; i <= b; i++) dist[i] += turn * weights[i - a] / sum;
    seeded = true;
  }
  const total = dist.reduce((s, w) => s + w, 0);
  if (!(total > 0)) return null;
  const mid = (i: number) => lo + (i + 0.5) * step;
  const avg = dist.reduce((s, w, i) => s + w * mid(i), 0) / total;
  const profitPct = (dist.reduce((s, w, i) => s + (mid(i) <= price ? w : 0), 0) / total) * 100;
  // ช่วงหนาแน่นสุด: หน้าต่าง 5 ช่องที่น้ำหนักรวมมากที่สุด
  let best = 0, bi = 0;
  for (let i = 0; i + 5 <= N; i++) { const w = dist.slice(i, i + 5).reduce((s, x) => s + x, 0); if (w > best) { best = w; bi = i; } }
  const q = (p: number) => { let acc = 0; for (let i = 0; i < N; i++) { acc += dist[i]; if (acc / total >= p) return mid(i); } return hi; };
  return { avg, peakLow: lo + bi * step, peakHigh: lo + (bi + 5) * step, profitPct, rangeLow: q(0.25), rangeHigh: q(0.75) };
}
