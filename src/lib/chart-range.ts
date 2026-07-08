export type ChartTimeRange = "1D" | "5D" | "1M" | "6M" | "1Y" | "5Y" | "MAX";

export const CHART_TIME_RANGES: ChartTimeRange[] = [
  "1D",
  "5D",
  "1M",
  "6M",
  "1Y",
  "5Y",
  "MAX",
];

export const DEFAULT_CHART_RANGE: ChartTimeRange = "6M";

/** Approximate trading-day bars per range (daily chart) */
export function barsForRange(
  range: ChartTimeRange,
  totalBars: number
): number {
  switch (range) {
    case "1D":
      return 1;
    case "5D":
      return 5;
    case "1M":
      return 22;
    case "6M":
      return 126;
    case "1Y":
      return 252;
    case "5Y":
      return 1260;
    case "MAX":
      return totalBars;
  }
}

export function visibleStartIndex(
  totalBars: number,
  range: ChartTimeRange
): number {
  if (totalBars <= 0) return 0;
  const bars = Math.min(barsForRange(range, totalBars), totalBars);
  return Math.max(0, totalBars - bars);
}
