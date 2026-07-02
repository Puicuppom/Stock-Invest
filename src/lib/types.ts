export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PivotLevels {
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

export interface SwingPoint {
  date: string;
  price: number;
  type: "high" | "low";
}

export interface PriceZone {
  price: number;
  type: "resistance" | "support";
  strength: number;
}

export interface FairValueData {
  analyst: number | null;
  analystLow: number | null;
  analystHigh: number | null;
  trailingEps: number | null;
  forwardEps: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
}

export interface FairValueResult {
  /** Primary: Yahoo analyst consensus mean (≈ Investing.com) */
  fairValue: number | null;
  fairValueLow: number | null;
  fairValueHigh: number | null;
  /** Supplementary P/E reference — not blended into fair value */
  peReference: number | null;
  upsidePercent: number | null;
  upsideLowPercent: number | null;
  upsideHighPercent: number | null;
  verdict: "undervalued" | "fair" | "overvalued" | "unknown";
  analystRange: { low: number; high: number } | null;
  range52w: { low: number; high: number } | null;
  trailingPE: number | null;
  forwardPE: number | null;
  forwardEps: number | null;
  source: "analyst" | "pe-fallback" | "unknown";
}

export interface StockData {
  symbol: string;
  resolvedSymbol: string;
  market: "TH" | "US";
  candles: Candle[];
  pivot: PivotLevels;
  swings: SwingPoint[];
  zones: PriceZone[];
  lastClose: number;
  change: number;
  changePercent: number;
  fairValue: FairValueResult;
}

export interface WatchlistItem {
  symbol: string;
  market: "TH" | "US";
}

export const WATCHLIST_KEY = "stock-sr-watchlist";

/** swing = ถือยาว (6 เดือน), pivot = เทรดสั้น (วันถัดไป) */
export type SrMode = "swing" | "pivot";
