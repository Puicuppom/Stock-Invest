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

export interface ChartFetchConfig {
  interval: string;
  range: string;
  intraday: boolean;
  label: string;
}

/** Yahoo interval + range per timeline button */
export function chartFetchConfig(timeRange: ChartTimeRange): ChartFetchConfig {
  switch (timeRange) {
    case "1D":
      return {
        interval: "1h",
        range: "1d",
        intraday: true,
        label: "รายชั่วโมง",
      };
    case "5D":
      return {
        interval: "1d",
        range: "5d",
        intraday: false,
        label: "รายวัน",
      };
    case "1M":
      return {
        interval: "1mo",
        range: "2y",
        intraday: false,
        label: "รายเดือน",
      };
    case "6M":
      return {
        interval: "1d",
        range: "6mo",
        intraday: false,
        label: "รายวัน",
      };
    case "1Y":
      return {
        interval: "1d",
        range: "1y",
        intraday: false,
        label: "รายวัน",
      };
    case "5Y":
      return {
        interval: "1wk",
        range: "5y",
        intraday: false,
        label: "รายสัปดาห์",
      };
    case "MAX":
      return {
        interval: "1mo",
        range: "max",
        intraday: false,
        label: "รายเดือน",
      };
  }
}
