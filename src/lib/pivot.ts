import type { Candle, PivotLevels } from "./types";

export function calculatePivot(candle: Pick<Candle, "high" | "low" | "close">): PivotLevels {
  const { high: h, low: l, close: c } = candle;
  const pivot = (h + l + c) / 3;

  return {
    pivot,
    r1: 2 * pivot - l,
    r2: pivot + (h - l),
    r3: h + 2 * (pivot - l),
    s1: 2 * pivot - h,
    s2: pivot - (h - l),
    s3: l - 2 * (h - pivot),
  };
}

export function formatPrice(value: number, market: "TH" | "US"): string {
  const decimals = market === "TH" ? 2 : 2;
  return value.toFixed(decimals);
}
