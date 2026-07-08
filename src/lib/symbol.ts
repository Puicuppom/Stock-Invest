/** Common US tickers where Yahoo uses class suffix with hyphen (e.g. BRK-B). */
const US_SYMBOL_ALIASES: Record<string, string> = {
  BRKB: "BRK-B",
  BRKA: "BRK-A",
  /** Yahoo spot proxy — COMEX gold futures track XAU/USD closely */
  XAUUSD: "GC=F",
};

export const GOLD_SPOT_YAHOO = "GC=F";

export function normalizeInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "").replace(/\//g, "");
}

export function isGoldSpotSymbol(symbol: string): boolean {
  const key = normalizeInput(symbol);
  return key === "XAUUSD" || symbol.toUpperCase() === GOLD_SPOT_YAHOO;
}

export function resolveSymbol(input: string, market: "TH" | "US"): string {
  const symbol = normalizeInput(input);
  if (!symbol) return "";

  if (market === "TH") {
    if (symbol.includes(".")) return symbol;
    return `${symbol}.BK`;
  }

  const aliased = US_SYMBOL_ALIASES[symbol];
  if (aliased) return aliased;

  if (symbol.includes(".")) {
    const [base, suffix] = symbol.split(".");
    if (suffix?.length === 1 && /^[A-Z]+$/.test(base)) {
      return `${base}-${suffix}`;
    }
    return symbol;
  }

  return symbol;
}

export function detectMarket(resolvedSymbol: string): "TH" | "US" {
  return resolvedSymbol.endsWith(".BK") ? "TH" : "US";
}

export function displaySymbol(resolvedSymbol: string): string {
  if (isGoldSpotSymbol(resolvedSymbol)) {
    return "XAU/USD";
  }

  if (resolvedSymbol.endsWith(".BK")) {
    return resolvedSymbol.replace(/\.BK$/, "");
  }

  const classShare = resolvedSymbol.match(/^([A-Z]+)-([AB])$/);
  if (classShare) {
    return `${classShare[1]}${classShare[2]}`;
  }

  return resolvedSymbol;
}
