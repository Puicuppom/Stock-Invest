import type { AssetKind } from "./instrument";

export type { AssetKind };

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
  peerForward?: { low:number; median:number; high:number; peers:{symbol:string; pe:number}[]; asOf:string } | null;
  industry?: string | null;
  operatingMargins?: number | null;
  returnOnEquity?: number | null;
  cashflowCurrency?: string | null;
  historicalPE?: import("./historical-valuation").HistoricalPE | null;
  normalizationNotes?: string[];
  sector?: string | null;
  financialCurrency?: string | null;
  quoteCurrency?: string | null;
  totalDebt?: number | null;
  totalCash?: number | null;
  analyst: number | null;
  analystLow: number | null;
  analystHigh: number | null;
  trailingEps: number | null;
  forwardEps: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  freeCashflow: number | null;
  operatingCashflow: number | null;
  ebitda: number | null;
  revenuePerShare: number | null;
  earningsGrowth: number | null;
  revenueGrowth: number | null;
  bookValue: number | null;
  priceToBook: number | null;
  enterpriseValue: number | null;
  sharesOutstanding: number | null;
  marketCap: number | null;
  /** Yahoo decimal e.g. 0.025 = 2.5% */
  dividendYield: number | null;
  dividendRate: number | null;
}

export interface FairValueResult {
  modelFairValue?: number | null;
  analystWeight?: number;
  trailingEps?: number | null;
  confidence?: "low" | "medium" | "unavailable";
  warnings?: string[];
  models?: import("./valuation-engine").ValuationModel[];
  /** Primary: median of available independent valuation approaches */
  fairValue: number | null;
  fairValueLow: number | null;
  fairValueHigh: number | null;
  /** P/E multiples model (one of the blended models) */
  peReference: number | null;
  upsidePercent: number | null;
  upsideLowPercent: number | null;
  upsideHighPercent: number | null;
  verdict: "undervalued" | "fair" | "overvalued" | "unknown";
  analystTarget: number | null;
  analystRange: { low: number; high: number } | null;
  modelRange: { low: number; high: number } | null;
  modelCount: number;
  range52w: { low: number; high: number } | null;
  trailingPE: number | null;
  forwardPE: number | null;
  forwardEps: number | null;
  peReferenceUpsidePercent: number | null;
  analystUpsidePercent: number | null;
  fcfYieldPercent: number | null;
  dividendYieldPercent: number | null;
  dividendRate: number | null;
  source: "multi-model" | "pe-fallback" | "single-model" | "unknown";
}

export interface StockData {
  symbol: string;
  resolvedSymbol: string;
  longName: string | null;
  assetKind: AssetKind;
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
