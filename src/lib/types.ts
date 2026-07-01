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
}

export interface WatchlistItem {
  symbol: string;
  market: "TH" | "US" | "auto";
}

export const WATCHLIST_KEY = "stock-sr-watchlist";
