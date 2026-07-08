import { fetchDailyCandles } from "./chart-service";
import { calculateFairValue, fetchFundamentals } from "./fair-value";
import { calculatePivot } from "./pivot";
import { detectMarket, resolveSymbol } from "./symbol";
import { clusterZones, findSwingPoints, topZones } from "./swing";
import type { Candle, FairValueData, StockData } from "./types";

export const revalidate = 900;

/** ~6 months of trading days for swing S/R */
export const SWING_LOOKBACK_BARS = 126;

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
    fetchDailyCandles(resolvedSymbol),
    fetchFundamentals(resolvedSymbol),
  ]);

  if (candles.length < 10) {
    throw new Error("Stock not found");
  }

  return buildStockData(input, resolvedSymbol, candles, fundamentals);
}
