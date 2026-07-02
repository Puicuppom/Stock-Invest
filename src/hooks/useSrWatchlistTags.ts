import { useEffect, useState } from "react";
import { findSrHits, type SrHit } from "@/lib/sr-levels";
import type { SrMode, StockData, WatchlistItem } from "@/lib/types";
import { watchlistId } from "@/lib/watchlist-id";

const POLL_MS = 3 * 60 * 1000;

export type WatchlistSrTags = Record<string, SrHit[]>;

interface UseSrWatchlistTagsOptions {
  items: WatchlistItem[];
  loaded: boolean;
  tolerancePercent: number;
  srMode: SrMode;
}

async function fetchStock(item: WatchlistItem): Promise<StockData | null> {
  const params = new URLSearchParams({ market: item.market });
  const res = await fetch(
    `/api/stock/${encodeURIComponent(item.symbol)}?${params}`
  );
  if (!res.ok) return null;
  return (await res.json()) as StockData;
}

export function useSrWatchlistTags({
  items,
  loaded,
  tolerancePercent,
  srMode,
}: UseSrWatchlistTagsOptions) {
  const [tags, setTags] = useState<WatchlistSrTags>({});

  useEffect(() => {
    if (!loaded || items.length === 0) {
      setTags({});
      return;
    }

    const runCheck = async () => {
      if (document.visibilityState !== "visible") return;

      const next: WatchlistSrTags = {};

      for (const item of items) {
        const data = await fetchStock(item);
        if (!data) continue;

        const hits = findSrHits(
          data.pivot,
          data.zones,
          data.lastClose,
          srMode,
          tolerancePercent
        );

        if (hits.length > 0) {
          next[watchlistId(item)] = hits;
        }
      }

      setTags(next);
    };

    runCheck();
    const timer = window.setInterval(runCheck, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        runCheck();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [items, loaded, tolerancePercent, srMode]);

  return tags;
}
