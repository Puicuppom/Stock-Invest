export function normalizeInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function resolveSymbol(input: string, market: "TH" | "US" | "auto" = "auto"): string[] {
  const symbol = normalizeInput(input);
  if (!symbol) return [];

  if (symbol.includes(".")) {
    return [symbol];
  }

  if (market === "TH") {
    return [`${symbol}.BK`];
  }

  if (market === "US") {
    return [symbol];
  }

  // auto: try Thai first, then US
  return [`${symbol}.BK`, symbol];
}

export function detectMarket(resolvedSymbol: string): "TH" | "US" {
  return resolvedSymbol.endsWith(".BK") ? "TH" : "US";
}

export function displaySymbol(resolvedSymbol: string): string {
  return resolvedSymbol.replace(/\.BK$/, "");
}
