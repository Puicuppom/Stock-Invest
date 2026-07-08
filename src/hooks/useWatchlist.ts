"use client";

import { useCallback, useEffect, useState } from "react";
import { watchlistId } from "@/lib/watchlist-id";
import { normalizeInput } from "@/lib/symbol";
import type { WatchlistItem } from "@/lib/types";
import { WATCHLIST_KEY } from "@/lib/types";

const DEFAULT_WATCHLIST: WatchlistItem[] = [
  { symbol: "PTT", market: "TH" },
  { symbol: "AAPL", market: "US" },
  { symbol: "XAUUSD", market: "US" },
];

function normalizeItem(item: WatchlistItem & { market?: string }): WatchlistItem {
  return {
    symbol: normalizeInput(item.symbol),
    market: item.market === "US" ? "US" : "TH",
  };
}

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>(DEFAULT_WATCHLIST);
  const [selected, setSelected] = useState<string>(
    watchlistId(DEFAULT_WATCHLIST[0])
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WATCHLIST_KEY);
      if (raw) {
        const parsed = (JSON.parse(raw) as WatchlistItem[]).map(normalizeItem);
        if (parsed.length > 0) {
          setItems(parsed);
          setSelected(watchlistId(parsed[0]));
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
    (symbol: string, market: "TH" | "US") => {
      const normalized = normalizeInput(symbol);
      if (!normalized) return false;

      const nextItem = { symbol: normalized, market };
      const nextId = watchlistId(nextItem);
      const existing = items.find((item) => watchlistId(item) === nextId);

      if (existing) {
        setSelected(nextId);
        return true;
      }

      setItems((prev) => [nextItem, ...prev]);
      setSelected(nextId);
      return true;
    },
    [items]
  );

  const removeStock = useCallback(
    (id: string) => {
      setItems((prev) => {
        const next = prev.filter((item) => watchlistId(item) !== id);
        if (selected === id && next.length > 0) {
          setSelected(watchlistId(next[0]));
        }
        return next;
      });
    },
    [selected]
  );

  const reorderStock = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;

    setItems((prev) => {
      const fromIndex = prev.findIndex((item) => watchlistId(item) === fromId);
      const toIndex = prev.findIndex((item) => watchlistId(item) === toId);
      if (fromIndex < 0 || toIndex < 0) return prev;

      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const selectedItem =
    items.find((item) => watchlistId(item) === selected) ?? items[0];

  return {
    items,
    selected,
    selectedItem,
    setSelected,
    addStock,
    removeStock,
    reorderStock,
    loaded,
  };
}
