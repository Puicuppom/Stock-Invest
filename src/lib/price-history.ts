import type { Candle } from "./types";

export function priceHistoryExtremes(candles: Candle[]) {
  const valid = candles.filter(c => Number.isFinite(c.high) && Number.isFinite(c.low) && c.low > 0 && c.high >= c.low);
  if (!valid.length) throw new Error("ไม่มีข้อมูลราคาย้อนหลัง");
  const sorted = [...valid].sort((a,b) => a.date.localeCompare(b.date));
  let low = sorted[0], high = sorted[0];
  for (const candle of sorted) {
    if (candle.low < low.low) low = candle;
    if (candle.high > high.high) high = candle;
  }
  return { low: low.low, lowDate: low.date, high: high.high, highDate: high.date,
    from: sorted[0].date, to: sorted[sorted.length-1].date };
}
