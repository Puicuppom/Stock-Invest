export function watchlistId(item: { symbol: string; market: "TH" | "US" }): string {
  return `${item.symbol}::${item.market}`;
}

export function marketLabel(market: "TH" | "US"): string {
  return market === "TH" ? "BKK" : "US";
}
