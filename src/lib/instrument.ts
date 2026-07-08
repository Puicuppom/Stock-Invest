import { displaySymbol } from "./symbol";

export type AssetKind = "stock" | "etf" | "gold-etf";

/** US spot-gold ETFs (Yahoo tickers) */
const US_GOLD_ETFS = new Set([
  "GLD",
  "IAU",
  "GLDM",
  "SGOL",
  "OUNZ",
  "BAR",
  "AAAU",
  "IAUM",
]);

/** SET gold ETFs (symbol without .BK) */
const TH_GOLD_ETFS = new Set(["GOLD01", "GOLD03", "GOLDX", "GBSGC"]);

export function classifyInstrument(
  resolvedSymbol: string,
  longName: string | null,
  instrumentType: string | null
): AssetKind {
  const key = displaySymbol(resolvedSymbol).toUpperCase();

  if (US_GOLD_ETFS.has(key) || TH_GOLD_ETFS.has(key)) {
    return "gold-etf";
  }

  const name = (longName ?? "").toLowerCase();
  if (/gold|ทอง/.test(name)) {
    return "gold-etf";
  }

  if (instrumentType === "ETF") {
    return "etf";
  }

  return "stock";
}

export function assetKindLabel(kind: AssetKind): string | null {
  switch (kind) {
    case "gold-etf":
      return "ETF ทองคำ";
    case "etf":
      return "ETF";
    default:
      return null;
  }
}
