import { useCallback, useEffect, useState } from "react";
import type { LiveQuote } from "@/lib/yahoo-quote";
import { findSrHits, type SrHit } from "@/lib/sr-levels";
import type { SrMode, StockData, WatchlistItem } from "@/lib/types";
import { watchlistId } from "@/lib/watchlist-id";
import { analyzeTrend, type TrendKind } from "@/lib/trend";
import { eventBadges, type EventBadge } from "@/lib/events";
import { analyzeDip, type DipKind } from "@/lib/dip";
import { analyzeEtfDip } from "@/lib/etf";

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
  /** ราคาล่าสุด (รวมก่อนเปิด/หลังปิด) และชื่อบริษัท สำหรับรายการแบบ Dime */
  price: number;
  name: string | null;
  dipLabel: string | null;
  /** ข้อความสั้นบนชิป (ETF ใช้คำต่างจากหุ้น) */
  dipShort?: string | null;
  /** ราคาปิด ~1 เดือนล่าสุด สำหรับกราฟเส้นจิ๋ว */
  spark?: number[];
  /** % นี้มาจากราคาก่อนเปิด/หลังปิด */
  extSession: "pre" | "post" | null;
}
export type WatchlistSignals = Record<string, ChipSignal>;

export function chipSignalOf(data: StockData): ChipSignal {
  const trend = analyzeTrend(data);
  const event = eventBadges(data.events, data.market)
    .filter(b => b.tone !== "dim" && b.days >= 0)
    .sort((a, b) => a.days - b.days)[0] ?? null;
  const isEtf = data.assetKind === "etf" || data.assetKind === "gold-etf";
  const etfDip = isEtf ? analyzeEtfDip(data.candles) : null;
  const dip = isEtf ? (etfDip && (etfDip.kind === "good" || etfDip.kind === "watch") ? { kind: etfDip.kind as DipKind, verdict: etfDip.verdict, drawdownPercent: etfDip.drawdownPercent } : null) : analyzeDip(data);
  const dipLabel = dip && dip.drawdownPercent != null && dip.kind !== "na" && dip.kind !== "notdeep" ? `${dip.verdict} (${dip.drawdownPercent.toFixed(0)}% จากจุดสูงสุด)` : null;
  return { trend: trend?.kind ?? null, trendLabel: trend?.label ?? null, changePercent: data.extended?.changePercent ?? data.changePercent, extSession: data.extended?.session ?? null, event, dipKind: dip?.kind ?? null, dipLabel, dipShort: isEtf && dip ? (dip.kind === "good" ? "ETF ลดราคา" : "ETF ย่อตัว") : null, price: data.extended?.price ?? data.lastClose, name: data.longName, spark: data.candles.slice(-22).map(c => c.close) };
}

interface UseSrWatchlistTagsOptions {
  items: WatchlistItem[];
  loaded: boolean;
  tolerancePercent: number;
  srMode: SrMode;
}

/** ข้อมูลหุ้นล่าสุดที่โหลดไว้ (ใช้เปิดหน้าวิเคราะห์ได้ทันทีก่อนโหลดชุดเต็ม) */
const stockCache = new Map<string, StockData>();
export const getCachedStock = (id: string) => stockCache.get(id) ?? null;
export const putCachedStock = (id: string, data: StockData) => { stockCache.set(id, data); };

async function fetchStock(item: WatchlistItem): Promise<StockData | null> {
  // lite = ราคาย้อนหลัง ~1.5 ปี (พอสำหรับสัญญาณ) โหลดเร็วกว่าชุดเต็ม 10 ปี
  const params = new URLSearchParams({ market: item.market, mode: "lite" });
  const res = await fetch(
    `/api/stock/${encodeURIComponent(item.symbol)}?${params}`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as StockData;
  stockCache.set(watchlistId(item), data);
  return data;
}

export type WatchlistQuotes = Record<string, LiveQuote>;

const QUOTE_POLL_MS = 30 * 1000;
const CONCURRENCY = 4;

async function fetchQuotes(items: WatchlistItem[]): Promise<WatchlistQuotes | null> {
  const q = items.map(it => `${encodeURIComponent(it.symbol)}:${it.market}`).join(",");
  try {
    const res = await fetch(`/api/quotes?items=${q}`, { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { quotes?: WatchlistQuotes }).quotes ?? null;
  } catch {
    return null;
  }
}

/**
 * ราคา: ดึงทุกตัวในคำขอเดียว ทุก 30 วินาที (เร็ว)
 * สัญญาณ (แนวโน้ม/แนวรับ/ลดราคา): วิเคราะห์เต็มทีละ 4 ตัวพร้อมกัน ทุก 3 นาที แสดงทีละตัวเมื่อเสร็จ
 */
export function useSrWatchlistTags({
  items,
  loaded,
  tolerancePercent,
  srMode,
}: UseSrWatchlistTagsOptions) {
  const [tags, setTags] = useState<WatchlistSrTags>({});
  const [signals, setSignals] = useState<WatchlistSignals>({});
  const [quotes, setQuotes] = useState<WatchlistQuotes>({});
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  // ราคาเร็ว
  useEffect(() => {
    if (!loaded || items.length === 0) { setQuotes({}); return; }
    let alive = true;
    const run = async () => {
      if (document.visibilityState !== "visible") return;
      setRefreshing(true);
      const q = await fetchQuotes(items);
      if (!alive) return;
      setRefreshing(false);
      if (q) { setQuotes(prev => ({ ...prev, ...q })); setUpdatedAt(Date.now()); }
    };
    run();
    const timer = window.setInterval(run, QUOTE_POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [items, loaded, tick]);

  // สัญญาณจากการวิเคราะห์เต็ม
  useEffect(() => {
    if (!loaded || items.length === 0) {
      setTags({});
      setSignals({});
      return;
    }
    let alive = true;

    const runCheck = async () => {
      if (document.visibilityState !== "visible") return;
      const queue = [...items];
      const worker = async () => {
        for (let item = queue.shift(); item; item = queue.shift()) {
          const data = await fetchStock(item).catch(() => null);
          if (!alive || !data) continue;
          const id = watchlistId(item);
          const hits = findSrHits(data.pivot, data.zones, data.lastClose, srMode, tolerancePercent);
          setSignals(prev => ({ ...prev, [id]: chipSignalOf(data) }));
          setTags(prev => {
            const next = { ...prev };
            if (hits.length > 0) next[id] = hits; else delete next[id];
            return next;
          });
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
    };

    runCheck();
    const timer = window.setInterval(runCheck, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") runCheck();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [items, loaded, tolerancePercent, srMode, tick]);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  return { tags, signals, quotes, refresh, refreshing, updatedAt };
}
