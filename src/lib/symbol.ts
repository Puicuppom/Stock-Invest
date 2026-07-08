/** Common US tickers where Yahoo uses class suffix with hyphen (e.g. BRK-B). */
const US_SYMBOL_ALIASES: Record<string, string> = {
  BRKB: "BRK-B",
  BRKA: "BRK-A",
};

export function normalizeInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
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
  if (resolvedSymbol.endsWith(".BK")) {
    return resolvedSymbol.replace(/\.BK$/, "");
  }

  const classShare = resolvedSymbol.match(/^([A-Z]+)-([AB])$/);
  if (classShare) {
    return `${classShare[1]}${classShare[2]}`;
  }

  return resolvedSymbol;
}
