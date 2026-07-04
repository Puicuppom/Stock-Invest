import { calculateFairValue, fetchFundamentals } from "./fair-value";
import { calculatePivot } from "./pivot";
import { detectMarket, resolveSymbol } from "./symbol";
import { clusterZones, findSwingPoints, topZones } from "./swing";
import type { Candle, FairValueData, StockData } from "./types";

export const revalidate = 900;

/** Yahoo chart range — enough bars for EMA 200 */
export const CHART_HISTORY_RANGE = "2y";

/** ~6 months of trading days for swing S/R */
export const SWING_LOOKBACK_BARS = 126;

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
    error?: { description?: string };
  };
}

async function fetchHistorical(resolvedSymbol: string): Promise<Candle[]> {
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(resolvedSymbol)}`
  );
  url.searchParams.set("interval", "1d");
  url.searchParams.set("range", CHART_HISTORY_RANGE);

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    next: { revalidate },
  });

  if (!res.ok) {
    throw new Error(`Yahoo API error: ${res.status}`);
  }

  const json = (await res.json()) as YahooChartResponse;
  const result = json.chart?.result?.[0];

  if (!result?.timestamp?.length) {
    throw new Error(json.chart?.error?.description ?? "No chart data");
  }

  const quote = result.indicators?.quote?.[0];
  if (!quote) {
    throw new Error("Missing quote indicators");
  }

  const candles: Candle[] = [];

  for (let i = 0; i < result.timestamp.length; i++) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];

    if (open == null || high == null || low == null || close == null) {
      continue;
    }

    candles.push({
      date: new Date(result.timestamp[i] * 1000).toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: quote.volume?.[i] ?? 0,
    });
  }

  return candles.sort((a, b) => a.date.localeCompare(b.date));
}

function buildStockData(
  input: string,
  resolvedSymbol: string,
  candles: Candle[],
  fundamentals: FairValueData | null
): StockData {
  const prev = candles[candles.length - 2];
  const last = candles[candles.length - 1];
  const pivot = calculatePivot(prev);
  const swingCandles = candles.slice(-SWING_LOOKBACK_BARS);
  const swings = findSwingPoints(swingCandles, 5);
  const zones = topZones(clusterZones(swings), last.close, 4);
  const detectedMarket = detectMarket(resolvedSymbol);
  const change = last.close - prev.close;
  const changePercent = (change / prev.close) * 100;

  const fairValueCalc = calculateFairValue(
    detectedMarket,
    last.close,
    fundamentals
  );

  return {
    symbol: input.toUpperCase(),
    resolvedSymbol,
    market: detectedMarket,
    candles,
    pivot,
    swings,
    zones,
    lastClose: last.close,
    change,
    changePercent,
    fairValue: {
      ...fairValueCalc,
      trailingPE: fundamentals?.trailingPE ?? null,
      forwardPE: fundamentals?.forwardPE ?? null,
    },
  };
}

export async function getStockData(
  input: string,
  market: "TH" | "US" = "US"
): Promise<StockData> {
  const resolvedSymbol = resolveSymbol(input, market);
  if (!resolvedSymbol) {
    throw new Error("Stock not found");
  }

  const [candles, fundamentals] = await Promise.all([
    fetchHistorical(resolvedSymbol),
    fetchFundamentals(resolvedSymbol),
  ]);

  if (candles.length < 10) {
    throw new Error("Stock not found");
  }

  return buildStockData(input, resolvedSymbol, candles, fundamentals);
}
