/**
 * Exponential moving average on close prices.
 * First value at index (period - 1) uses SMA seed.
 */
export function calculateEma(
  closes: number[],
  period: number
): (number | null)[] {
  if (period <= 0 || closes.length === 0) {
    return closes.map(() => null);
  }

  const result: (number | null)[] = [];
  let ema: number | null = null;

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }

    if (ema === null) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += closes[j];
      }
      ema = sum / period;
    } else {
      const k = 2 / (period + 1);
      ema = closes[i] * k + ema * (1 - k);
    }

    result.push(ema);
  }

  return result;
}

export const EMA_PERIODS = [20, 50, 200] as const;

/** Default visible window on chart (~6 months of trading days) */
export const CHART_VISIBLE_BARS = 126;

export type EmaPeriod = (typeof EMA_PERIODS)[number];

export interface EmaPoint {
  date: string;
  value: number;
}

export function buildEmaSeries(
  candles: { date: string; close: number }[],
  period: EmaPeriod
): EmaPoint[] {
  const closes = candles.map((c) => c.close);
  const ema = calculateEma(closes, period);
  const points: EmaPoint[] = [];

  for (let i = 0; i < candles.length; i++) {
    const value = ema[i];
    if (value != null) {
      points.push({ date: candles[i].date, value });
    }
  }

  return points;
}
