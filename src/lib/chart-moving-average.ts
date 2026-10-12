import { buildEmaSeries } from "./ema";
export const CHART_MA_PERIODS = [20, 50, 200] as const;
export function buildChartMovingAverage(candles: {date: string; close: number}[], period: (typeof CHART_MA_PERIODS)[number]) {
  if (period !== 200) return buildEmaSeries(candles, period);
  const points: {date: string; value: number}[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i-period].close;
    if (i >= period-1) points.push({date:candles[i].date,value:sum/period});
  }
  return points;
}
