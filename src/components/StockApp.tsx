"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AddStockFab from "@/components/AddStockFab";
import FairValueCard from "@/components/FairValueCard";
import SupportResistanceCard from "@/components/SupportResistanceCard";
import StockChart from "@/components/StockChart";
import Watchlist from "@/components/Watchlist";
import { useSrTagSettings } from "@/hooks/useSrTagSettings";
import { useSrWatchlistTags } from "@/hooks/useSrWatchlistTags";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useSrMode } from "@/hooks/useSrMode";
import { findSrHits } from "@/lib/sr-levels";
import { displaySymbol } from "@/lib/symbol";
import { marketLabel, watchlistId } from "@/lib/watchlist-id";
import type { StockData } from "@/lib/types";

export default function StockApp() {
  const {
    items,
    selected,
    selectedItem,
    setSelected,
    addStock,
    removeStock,
    reorderStock,
    loaded,
  } = useWatchlist();

  const { mode: srMode, setMode: setSrMode } = useSrMode();
  const {
    settings: tagSettings,
    loaded: tagSettingsLoaded,
    setTolerance: setTagTolerance,
    toleranceOptions,
  } = useSrTagSettings();

  const watchlistTags = useSrWatchlistTags({
    items,
    loaded: loaded && tagSettingsLoaded,
    tolerancePercent: tagSettings.tolerancePercent,
    srMode,
  });

  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState("");

  const currentHits = useMemo(() => {
    if (!data) return [];
    return findSrHits(
      data.pivot,
      data.zones,
      data.lastClose,
      srMode,
      tagSettings.tolerancePercent
    );
  }, [data, srMode, tagSettings.tolerancePercent]);

  const mergedWatchlistTags = useMemo(() => {
    if (!selectedItem) return watchlistTags;
    const id = watchlistId(selectedItem);
    if (!data) return watchlistTags;
    if (currentHits.length === 0) {
      const next = { ...watchlistTags };
      delete next[id];
      return next;
    }
    return { ...watchlistTags, [id]: currentHits };
  }, [watchlistTags, selectedItem, data, currentHits]);

  const handleAddStock = useCallback(
    (symbol: string, market: "TH" | "US") => {
      const normalized = symbol.trim().toUpperCase();
      if (!normalized) return false;

      const exists = items.some(
        (item) => watchlistId(item) === watchlistId({ symbol: normalized, market })
      );
      const ok = addStock(symbol, market);
      if (!ok) return false;

      window.scrollTo({ top: 0, behavior: "smooth" });
      setToast(
        exists
          ? `เลือก ${normalized} (${marketLabel(market)}) แล้ว`
          : `เพิ่ม ${normalized} (${marketLabel(market)}) แล้ว`
      );
      return true;
    },
    [addStock, items]
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const fetchStock = useCallback(async () => {
    if (!selectedItem) return;

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        market: selectedItem.market,
      });
      const res = await fetch(
        `/api/stock/${encodeURIComponent(selectedItem.symbol)}?${params}`
      );
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error ?? "ไม่พบข้อมูลหุ้น");
      }

      setData(json as StockData);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [selectedItem]);

  useEffect(() => {
    if (loaded && selectedItem) {
      fetchStock();
    }
  }, [loaded, selectedItem, fetchStock]);

  const changePositive = (data?.change ?? 0) >= 0;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Stock S/R Analyzer</p>
          <h1 className="app-title">
            {data ? displaySymbol(data.resolvedSymbol) : selected || "—"}
          </h1>
          {data && (
            <div className="price-row">
              <span className="last-price">{data.lastClose.toFixed(2)}</span>
              <span className={changePositive ? "change-up" : "change-down"}>
                {changePositive ? "+" : ""}
                {data.change.toFixed(2)} ({data.changePercent.toFixed(2)}%)
              </span>
              <span className="market-badge">
                {data.market === "TH" ? "BKK" : "US"}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="refresh-btn"
          onClick={fetchStock}
          disabled={loading}
          aria-label="รีเฟรช"
        >
          ↻
        </button>
      </header>

      <section className="watchlist-section">
        <Watchlist
          items={items}
          selected={selected}
          srTags={mergedWatchlistTags}
          onSelect={setSelected}
          onRemove={removeStock}
          onReorder={reorderStock}
          onAddClick={() => setAddOpen(true)}
        />
      </section>

      {toast && <div className="toast-banner">{toast}</div>}

      <section className="chart-section">
        {loading && <div className="state-banner">กำลังโหลด...</div>}
        {error && !loading && <div className="state-banner error">{error}</div>}
        {data && !loading && (
          <StockChart
            candles={data.candles}
            pivot={data.pivot}
            zones={data.zones}
            mode={srMode}
          />
        )}
      </section>

      {data && (
        <>
          <FairValueCard
            fairValue={data.fairValue}
            currentPrice={data.lastClose}
            market={data.market}
          />

          <SupportResistanceCard
            pivot={data.pivot}
            zones={data.zones}
            currentPrice={data.lastClose}
            mode={srMode}
            hits={currentHits}
            tolerancePercent={tagSettings.tolerancePercent}
            toleranceOptions={toleranceOptions}
            onModeChange={setSrMode}
            onToleranceChange={setTagTolerance}
          />
        </>
      )}

      <AddStockFab
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdd={handleAddStock}
      />

      <footer className="app-footer">
        <p>เครื่องมือวิเคราะห์ — ไม่ใช่คำแนะนำการลงทุน</p>
      </footer>
    </div>
  );
}
