import { useEffect, useRef } from "react";
import {
  pushBrowserNotification,
  srAlertCooldownKey,
} from "@/hooks/useSrAlerts";
import { findSrHits } from "@/lib/sr-levels";
import { displaySymbol } from "@/lib/symbol";
import type { SrMode, StockData, WatchlistItem } from "@/lib/types";
import { watchlistId } from "@/lib/watchlist-id";

const POLL_MS = 3 * 60 * 1000;

interface UseSrAlertMonitorOptions {
  items: WatchlistItem[];
  loaded: boolean;
  enabled: boolean;
  tolerancePercent: number;
  srMode: SrMode;
  shouldNotify: (key: string) => boolean;
  onAlert: (message: string) => void;
}

async function fetchStock(item: WatchlistItem): Promise<StockData | null> {
  const params = new URLSearchParams({ market: item.market });
  const res = await fetch(
    `/api/stock/${encodeURIComponent(item.symbol)}?${params}`
  );
  if (!res.ok) return null;
  return (await res.json()) as StockData;
}

function formatHitMessage(data: StockData, hit: ReturnType<typeof findSrHits>[0]) {
  const sym = displaySymbol(data.resolvedSymbol);
  const kind = hit.kind === "support" ? "แนวรับ" : "แนวต้าน";
  return `${sym} ใกล้${kind} ${hit.level.label} (${hit.level.price.toFixed(2)}) · ราคา ${hit.price.toFixed(2)}`;
}

export function useSrAlertMonitor({
  items,
  loaded,
  enabled,
  tolerancePercent,
  srMode,
  shouldNotify,
  onAlert,
}: UseSrAlertMonitorOptions) {
  const runningRef = useRef(false);

  useEffect(() => {
    if (!loaded || !enabled || items.length === 0) return;

    const runCheck = async () => {
      if (document.visibilityState !== "visible") return;
      if (runningRef.current) return;
      runningRef.current = true;

      try {
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

          for (const hit of hits) {
            const id = watchlistId(item);
            const key = srAlertCooldownKey(id, hit.kind, hit.level.price);
            if (!shouldNotify(key)) continue;

            const message = formatHitMessage(data, hit);
            onAlert(message);
            pushBrowserNotification("Stock S/R Alert", message);
          }
        }
      } finally {
        runningRef.current = false;
      }
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
  }, [
    items,
    loaded,
    enabled,
    tolerancePercent,
    srMode,
    shouldNotify,
    onAlert,
  ]);
}
