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
  currentPrice: number | null;
  analyst: number | null;
  trailingEps: number | null;
  bookValue: number | null;
  trailingPE: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
}

export interface FairValueModels {
  analyst: number | null;
  pe: number | null;
  pb: number | null;
}

export interface FairValueResult {
  fairValue: number | null;
  upsidePercent: number | null;
  verdict: "undervalued" | "fair" | "overvalued" | "unknown";
  models: FairValueModels;
  range52w: { low: number; high: number } | null;
  trailingPE: number | null;
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
