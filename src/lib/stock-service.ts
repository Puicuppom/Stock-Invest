import { calculatePivot } from "./pivot";
import { detectMarket, resolveSymbol } from "./symbol";
import { clusterZones, findSwingPoints, topZones } from "./swing";
import type { Candle, StockData } from "./types";

export const revalidate = 900;

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
  url.searchParams.set("range", "6mo");

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

export async function getStockData(
  input: string,
  market: "TH" | "US" | "auto" = "auto"
): Promise<StockData> {
  const candidates = resolveSymbol(input, market);
  let lastError: unknown;

  for (const resolvedSymbol of candidates) {
    try {
      const candles = await fetchHistorical(resolvedSymbol);
      if (candles.length < 10) {
        throw new Error("Not enough data");
      }

      const prev = candles[candles.length - 2];
      const last = candles[candles.length - 1];
      const pivot = calculatePivot(prev);
      const swings = findSwingPoints(candles, 5);
      const zones = topZones(clusterZones(swings), last.close, 4);
      const detectedMarket = detectMarket(resolvedSymbol);
      const change = last.close - prev.close;
      const changePercent = (change / prev.close) * 100;

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
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Stock not found");
}
