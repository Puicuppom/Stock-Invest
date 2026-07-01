"use client";

import { useCallback, useEffect, useState } from "react";
import type { WatchlistItem } from "@/lib/types";
import { WATCHLIST_KEY } from "@/lib/types";

const DEFAULT_WATCHLIST: WatchlistItem[] = [
  { symbol: "PTT", market: "TH" },
  { symbol: "AAPL", market: "US" },
];

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>(DEFAULT_WATCHLIST);
  const [selected, setSelected] = useState<string>(DEFAULT_WATCHLIST[0].symbol);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WATCHLIST_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as WatchlistItem[];
        if (parsed.length > 0) {
          setItems(parsed);
          setSelected(parsed[0].symbol);
        }
      }
    } catch {
      // ignore corrupt storage
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items));
  }, [items, loaded]);

  const addStock = useCallback(
    (symbol: string, market: "TH" | "US" | "auto" = "auto") => {
      const normalized = symbol.trim().toUpperCase();
      if (!normalized) return false;
      if (items.some((i) => i.symbol === normalized)) return false;

      setItems((prev) => [...prev, { symbol: normalized, market }]);
      setSelected(normalized);
      return true;
    },
    [items]
  );

  const removeStock = useCallback(
    (symbol: string) => {
      setItems((prev) => {
        const next = prev.filter((i) => i.symbol !== symbol);
        if (selected === symbol && next.length > 0) {
          setSelected(next[0].symbol);
        }
        return next;
      });
    },
    [selected]
  );

  const selectedItem = items.find((i) => i.symbol === selected) ?? items[0];

  return {
    items,
    selected,
    selectedItem,
    setSelected,
    addStock,
    removeStock,
    loaded,
  };
}
