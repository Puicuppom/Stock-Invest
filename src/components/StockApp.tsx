"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AddStockFab from "@/components/AddStockFab";
import FairValueCard from "@/components/FairValueCard";
import TradePlanCard from "@/components/TradePlanCard";
import SupportResistanceCard from "@/components/SupportResistanceCard";
import StockChart from "@/components/StockChart";
import Watchlist from "@/components/Watchlist";
import { useSrTagSettings } from "@/hooks/useSrTagSettings";
import { useSrWatchlistTags, type WatchlistSrTags } from "@/hooks/useSrWatchlistTags";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useSrMode } from "@/hooks/useSrMode";
import { findSrHits } from "@/lib/sr-levels";
import { computeTradePlan } from "@/lib/trade-plan";
import { displaySymbol, normalizeInput } from "@/lib/symbol";
import { assetKindLabel } from "@/lib/instrument";
import { marketLabel, stockDataMatchesItem, watchlistId } from "@/lib/watchlist-id";
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
  const [liveTagCache, setLiveTagCache] = useState<WatchlistSrTags>({});

  const selectedData =
    selectedItem && data && stockDataMatchesItem(data, selectedItem) ? data : null;

  const currentHits = useMemo(() => {
    if (!selectedData) return [];
    return findSrHits(
      selectedData.pivot,
      selectedData.zones,
      selectedData.lastClose,
      srMode,
      tagSettings.tolerancePercent
    );
  }, [selectedData, srMode, tagSettings.tolerancePercent]);

  const nearResistance = currentHits.some((hit) => hit.kind === "resistance");
  const nearSupport = currentHits.some((hit) => hit.kind === "support");

  const tradePlan = useMemo(() => {
    if (!selectedData) return null;
    const kind = selectedData.assetKind;
    return computeTradePlan(
      selectedData.pivot,
      selectedData.zones,
      selectedData.lastClose,
      srMode,
      tagSettings.tolerancePercent,
      selectedData.fairValue,
      kind === "stock" || kind === "etf"
    );
  }, [selectedData, srMode, tagSettings.tolerancePercent]);

  useEffect(() => {
    setLiveTagCache({});
  }, [srMode, tagSettings.tolerancePercent]);

  useEffect(() => {
    if (!selectedItem || !selectedData) return;

    const id = watchlistId(selectedItem);
    const hits = findSrHits(
      selectedData.pivot,
      selectedData.zones,
      selectedData.lastClose,
      srMode,
      tagSettings.tolerancePercent
    );

    setLiveTagCache((prev) => {
      const prevHits = prev[id];
      const same =
        prevHits?.length === hits.length &&
        hits.every(
          (hit, index) =>
            prevHits[index]?.kind === hit.kind &&
            prevHits[index]?.level.price === hit.level.price
        );

      if (same) return prev;
      if (hits.length === 0) {
        if (!(id in prev)) return prev;
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: hits };
    });
  }, [selectedItem, selectedData, srMode, tagSettings.tolerancePercent]);

  const mergedWatchlistTags = useMemo(() => {
    const merged = { ...watchlistTags };
    for (const [id, hits] of Object.entries(liveTagCache)) {
      if (hits.length === 0) delete merged[id];
      else merged[id] = hits;
    }
    return merged;
  }, [watchlistTags, liveTagCache]);

  const handleAddStock = useCallback(
    (symbol: string, market: "TH" | "US") => {
      const normalized = normalizeInput(symbol);
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
            {selectedData
              ? displaySymbol(selectedData.resolvedSymbol)
              : selected || "—"}
          </h1>
          {selectedData?.longName && (
            <p className="app-company-name">{selectedData.longName}</p>
          )}
          {selectedData && (
            <div className="price-row">
              <div className="price-quote">
                <span className="last-price">{selectedData.lastClose.toFixed(2)}</span>
                <span className={changePositive ? "change-up" : "change-down"}>
                  {changePositive ? "+" : ""}
                  {selectedData.change.toFixed(2)} ({selectedData.changePercent.toFixed(2)}%)
                </span>
              </div>
              <div className="price-meta">
                <span className="market-badge">
                  {selectedData.market === "TH" ? "BKK" : "US"}
                </span>
                {assetKindLabel(selectedData.assetKind) && (
                  <span className="market-badge asset-badge">
                    {assetKindLabel(selectedData.assetKind)}
                  </span>
                )}
                {(nearSupport || nearResistance) && (
                  <div className="header-sr-tags">
                    {nearSupport && (
                      <span className="header-sr-tag header-sr-tag-sup">รับ</span>
                    )}
                    {nearResistance && (
                      <span className="header-sr-tag header-sr-tag-res">ต้าน</span>
                    )}
                  </div>
                )}
              </div>
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
        {data && selectedData && selectedItem && !loading && (
          <StockChart
            symbol={selectedItem.symbol}
            market={selectedItem.market}
            pivot={selectedData.pivot}
            zones={selectedData.zones}
            mode={srMode}
          />
        )}
      </section>

      {data && selectedData && (
        <>
          <FairValueCard
            fairValue={selectedData.fairValue}
            currentPrice={selectedData.lastClose}
            market={selectedData.market}
            assetKind={selectedData.assetKind}
          />

          {tradePlan && (
            <TradePlanCard
              plan={tradePlan}
              currentPrice={selectedData.lastClose}
              market={selectedData.market}
              assetKind={selectedData.assetKind}
              srMode={srMode}
            />
          )}

          <SupportResistanceCard
            pivot={selectedData.pivot}
            zones={selectedData.zones}
            currentPrice={selectedData.lastClose}
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
