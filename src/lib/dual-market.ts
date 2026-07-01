export const DUAL_MARKET_SYMBOLS = new Set([
  "META",
  "B",
  "C",
  "F",
  "G",
  "M",
  "S",
  "T",
  "W",
]);

export function isDualMarketSymbol(symbol: string): boolean {
  return DUAL_MARKET_SYMBOLS.has(symbol.trim().toUpperCase());
}
