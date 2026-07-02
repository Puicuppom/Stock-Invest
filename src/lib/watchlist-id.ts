import { displaySymbol, resolveSymbol } from "@/lib/symbol";
import type { StockData, WatchlistItem } from "@/lib/types";

export function watchlistId(item: { symbol: string; market: "TH" | "US" }): string {
  return `${item.symbol}::${item.market}`;
}

export function marketLabel(market: "TH" | "US"): string {
  return market === "TH" ? "BKK" : "US";
}

export function stockDataMatchesItem(
  data: StockData,
  item: WatchlistItem
): boolean {
  if (data.market !== item.market) return false;

  const itemResolved = resolveSymbol(item.symbol, item.market);
  const dataResolved = data.resolvedSymbol.toUpperCase();
  const dataSymbol = data.symbol.toUpperCase();
  const itemSymbol = item.symbol.toUpperCase();

  return (
    dataResolved === itemResolved ||
    dataSymbol === itemSymbol ||
    displaySymbol(dataResolved) === displaySymbol(itemSymbol)
  );
}
