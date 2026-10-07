import { useEffect, useState } from "react";
import { findSrHits, type SrHit } from "@/lib/sr-levels";
import type { SrMode, StockData, WatchlistItem } from "@/lib/types";
import { watchlistId } from "@/lib/watchlist-id";
import { analyzeTrend, type TrendKind } from "@/lib/trend";
import { eventBadges, type EventBadge } from "@/lib/events";
import { analyzeDip, type DipKind } from "@/lib/dip";

const POLL_MS = 3 * 60 * 1000;

export type WatchlistSrTags = Record<string, SrHit[]>;

/** สัญญาณย่อสำหรับชิปใน Watchlist */
export interface ChipSignal {
  trend: TrendKind | null;
  trendLabel: string | null;
  changePercent: number;
  /** งบ/XD ที่ใกล้ที่สุดภายใน 14 วัน */
  event: EventBadge | null;
  /** คำตัดสินหุ้นดีลดราคา (แสดงไอคอนเฉพาะ good / trap / watch) */
  dipKind: DipKind | null;
  dipLabel: string | null;
  /** % นี้มาจากราคาก่อนเปิด/หลังปิด */
  extSession: "pre" | "post" | null;
}
export type WatchlistSignals = Record<string, ChipSignal>;

export function chipSignalOf(data: StockData): ChipSignal {
  const trend = analyzeTrend(data);
  const event = eventBadges(data.events, data.market)
    .filter(b => b.tone !== "dim" && b.days >= 0)
    .sort((a, b) => a.days - b.days)[0] ?? null;
  const dip = analyzeDip(data);
  const dipLabel = dip && dip.drawdownPercent != null && dip.kind !== "na" && dip.kind !== "notdeep" ? `${dip.verdict} (${dip.drawdownPercent.toFixed(0)}% จากจุดสูงสุด)` : null;
  return { trend: trend?.kind ?? null, trendLabel: trend?.label ?? null, changePercent: data.extended?.changePercent ?? data.changePercent, extSession: data.extended?.session ?? null, event, dipKind: dip?.kind ?? null, dipLabel };
}

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
  const [signals, setSignals] = useState<WatchlistSignals>({});

  useEffect(() => {
    if (!loaded || items.length === 0) {
      setTags({});
      setSignals({});
      return;
    }

    const runCheck = async () => {
      if (document.visibilityState !== "visible") return;

      const next: WatchlistSrTags = {};
      const nextSignals: WatchlistSignals = {};

      for (const item of items) {
        const data = await fetchStock(item);
        if (!data) continue;
        nextSignals[watchlistId(item)] = chipSignalOf(data);

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
      setSignals(nextSignals);
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

  return { tags, signals };
}
