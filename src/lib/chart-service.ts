import { chartFetchConfig, type ChartTimeRange } from "./chart-range";
import type { Candle } from "./types";

export const revalidate = 900;

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        longName?: string;
        shortName?: string;
        instrumentType?: string;
        quoteType?: string;
      };
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

export interface YahooChartData {
  candles: Candle[];
  longName: string | null;
  shortName: string | null;
  instrumentType: string | null;
}

function formatCandleDate(timestamp: number, intraday: boolean): string {
  const date = new Date(timestamp * 1000);
  return intraday ? date.toISOString() : date.toISOString().slice(0, 10);
}

export async function fetchYahooCandles(
  resolvedSymbol: string,
  interval: string,
  range: string,
  intraday: boolean
): Promise<YahooChartData> {
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(resolvedSymbol)}`
  );
  url.searchParams.set("interval", interval);
  url.searchParams.set("range", range);

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
      date: formatCandleDate(result.timestamp[i], intraday),
      open,
      high,
      low,
      close,
      volume: quote.volume?.[i] ?? 0,
    });
  }

  return {
    candles: candles.sort((a, b) => a.date.localeCompare(b.date)),
    longName: result.meta?.longName ?? null,
    shortName: result.meta?.shortName ?? null,
    instrumentType: result.meta?.instrumentType ?? null,
  };
}

export async function fetchDailyCandles(
  resolvedSymbol: string
): Promise<YahooChartData> {
  // Yahoo range=max often caps ~160 bars; 10y daily gives 2000+ for EMA/S/R.
  return fetchYahooCandles(resolvedSymbol, "1d", "10y", false);
}

export async function fetchChartCandles(
  resolvedSymbol: string,
  timeRange: ChartTimeRange
): Promise<Candle[]> {
  const config = chartFetchConfig(timeRange);
  const { candles } = await fetchYahooCandles(
    resolvedSymbol,
    config.interval,
    config.range,
    config.intraday
  );
  return candles;
}
