"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AddStockFab from "@/components/AddStockFab";
import AppNavigation from "@/components/AppNavigation";
import StockDashboard from "@/components/StockDashboard";
import CompanyCard from "./CompanyCard";
import FundamentalMetrics from "./FundamentalMetrics";
import DeepCards from "./DeepCards";
import EtfCard from "./EtfCard";
import SignalSummary from "@/components/SignalSummary";
import StockChart from "@/components/StockChart";
import WatchlistList from "@/components/WatchlistList";
import { useSrTagSettings } from "@/hooks/useSrTagSettings";
import { reversalTag } from "@/lib/reversal";
import { chipSignalOf, getCachedStock, putCachedStock, useSrWatchlistTags, type WatchlistSrTags } from "@/hooks/useSrWatchlistTags";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useSrMode } from "@/hooks/useSrMode";
import { findSrHits } from "@/lib/sr-levels";
import { computeTradePlan } from "@/lib/trade-plan";
import { analyzeTrend } from "@/lib/trend";
import { displaySymbol, normalizeInput } from "@/lib/symbol";
import { marketLabel, stockDataMatchesItem, watchlistId } from "@/lib/watchlist-id";
import type { StockData, WatchlistItem } from "@/lib/types";

export default function StockApp() {
  const {
    items,
    selectedItem,
    setSelected,
    addStock,
    removeStock,
    reorderStock,
    loaded,
    syncStatus,
  } = useWatchlist();

  const { mode: srMode, setMode: setSrMode } = useSrMode();
  const {
    settings: tagSettings,
    loaded: tagSettingsLoaded,
    setTolerance: setTagTolerance,
    toleranceOptions,
  } = useSrTagSettings();

  const { tags: watchlistTags, signals: watchlistSignals, quotes: watchlistQuotes, refresh: refreshWatchlist, refreshing: watchlistRefreshing, updatedAt: watchlistUpdatedAt } = useSrWatchlistTags({
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
  const [toastError, setToastError] = useState(false);
  // แท็บหน้าวิเคราะห์: ภาพรวม (สัญญาณ) · กราฟ · พื้นฐาน
  const [tab, setTab] = useState<"overview" | "chart" | "fund">("overview");
  useEffect(() => { try { const t = localStorage.getItem("detailTab"); if (t === "chart" || t === "fund") setTab(t); } catch { /* ignore */ } }, []);
  const pickTab = useCallback((t: "overview" | "chart" | "fund") => { setTab(t); try { localStorage.setItem("detailTab", t); } catch { /* ignore */ } }, []);
  useEffect(() => {
    const onTab = (e: Event) => pickTab((e as CustomEvent).detail);
    window.addEventListener("investpui:tab", onTab);
    return () => window.removeEventListener("investpui:tab", onTab);
  }, [pickTab]);
  // หน้าแรก = รายการหุ้นแบบ Dime · แตะหุ้น = หน้าวิเคราะห์ (ปุ่มย้อนกลับของเบราว์เซอร์กลับมารายการได้)
  const [view, setView] = useState<"list" | "detail">("list");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("s")) setView("detail");
    const onPop = () => setView(window.history.state?.investpuiDetail ? "detail" : "list");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // ค้นหาหุ้นที่ยังไม่อยู่ใน Watchlist: เปิดดูได้ก่อน ค่อยกดเพิ่ม
  const [previewItem, setPreviewItem] = useState<WatchlistItem | null>(null);
  const activeItem = previewItem ?? selectedItem;
  const openStock = useCallback((id: string) => {
    setPreviewItem(null);
    setSelected(id);
    setView("detail");
    window.history.pushState({ investpuiDetail: true }, "");
    window.scrollTo(0, 0);
  }, [setSelected]);
  const openSearch = useCallback((symbol: string, market: "TH" | "US") => {
    const normalized = normalizeInput(symbol).replace(/\.BK$/, "");
    if (!normalized) return;
    const id = watchlistId({ symbol: normalized, market });
    if (items.some(item => watchlistId(item) === id)) { openStock(id); return; }
    setPreviewItem({ symbol: normalized, market });
    setView("detail");
    window.history.pushState({ investpuiDetail: true }, "");
    window.scrollTo(0, 0);
  }, [items, openStock]);
  const backToList = useCallback(() => {
    if (window.history.state?.investpuiDetail) window.history.back();
    else setView("list");
    window.scrollTo(0, 0);
  }, []);
  const [liveTagCache, setLiveTagCache] = useState<WatchlistSrTags>({});

  const selectedData =
    activeItem && data && stockDataMatchesItem(data, activeItem) ? data : null;

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
    return computeTradePlan(
      selectedData.pivot,
      selectedData.zones,
      selectedData.lastClose,
      srMode,
      tagSettings.tolerancePercent,
      selectedData.fairValue,
      false // ไม่ใช้ราคายุติธรรมเป็นเป้าแล้ว
    );
  }, [selectedData, srMode, tagSettings.tolerancePercent]);

  const trend = useMemo(() => (selectedData ? analyzeTrend(selectedData) : null), [selectedData]);

  useEffect(() => {
    setLiveTagCache({});
  }, [srMode, tagSettings.tolerancePercent]);

  useEffect(() => {
    if (!activeItem || !selectedData) return;

    const id = watchlistId(activeItem);
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
        const rest = { ...prev };
        delete rest[id];
        return rest;
      }
      return { ...prev, [id]: hits };
    });
  }, [activeItem, selectedData, srMode, tagSettings.tolerancePercent]);

  const mergedWatchlistTags = useMemo(() => {
    const merged = { ...watchlistTags };
    for (const [id, hits] of Object.entries(liveTagCache)) {
      if (hits.length === 0) delete merged[id];
      else merged[id] = hits;
    }
    return merged;
  }, [watchlistTags, liveTagCache]);

  // หุ้นที่เปิดดูอยู่ใช้ข้อมูลล่าสุดเสมอ
  const mergedSignals = useMemo(() => {
    if (!activeItem || !selectedData) return watchlistSignals;
    return { ...watchlistSignals, [watchlistId(activeItem)]: chipSignalOf(selectedData) };
  }, [watchlistSignals, activeItem, selectedData]);

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
      setToastError(false);
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
    const timer = window.setTimeout(() => {
      setToast("");
      setToastError(false);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const fetchStock = useCallback(
    async (manual = false) => {
      if (!activeItem) return;

      setLoading(true);
      setError("");
      if (manual) setToastError(false);

      try {
        const params = new URLSearchParams({
          market: activeItem.market,
        });
        const res = await fetch(
          `/api/stock/${encodeURIComponent(activeItem.symbol)}?${params}`
        );
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error ?? "ไม่พบข้อมูลหุ้น");
        }

        setData(json as StockData);
        putCachedStock(watchlistId(activeItem), json as StockData);
        if (manual) {
          const time = new Date().toLocaleTimeString("th-TH", {
            hour: "2-digit",
            minute: "2-digit",
          });
          setToast(`อัปเดต ${normalizeInput(activeItem.symbol)} แล้ว · ${time}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ";
        if (manual) {
          // กดรีเฟรชเองแล้วพลาด: เก็บข้อมูลเดิมไว้ แจ้งเตือนแทนการล้างหน้า
          setToastError(true);
          setToast(`อัปเดตไม่สำเร็จ: ${message}`);
        } else {
          setData(null);
          setError(message);
        }
      } finally {
        setLoading(false);
      }
    },
    [activeItem]
  );

  useEffect(() => {
    if (!loaded || !activeItem) return;
    // แสดงข้อมูลที่ Watchlist โหลดไว้ทันที แล้วโหลดชุดเต็มตามมา
    const cached = getCachedStock(watchlistId(activeItem));
    if (cached) setData(cached);
    fetchStock();
  }, [loaded, activeItem, fetchStock]);

  return (
    <div className="app-shell">
      <AppNavigation active="stocks" />
      {view === "list" && (
        <WatchlistList
          items={items}
          signals={mergedSignals}
          quotes={watchlistQuotes}
          onRefresh={refreshWatchlist}
          refreshing={watchlistRefreshing}
          updatedAt={watchlistUpdatedAt}
          srTags={mergedWatchlistTags}
          onOpen={openStock}
          onSearch={openSearch}
          onRemove={removeStock}
          onReorder={reorderStock}
          onAdd={() => setAddOpen(true)}
          syncStatus={syncStatus}
        />
      )}
      {view === "detail" && (
        <div className="detail-bar">
          <button type="button" className="detail-back" onClick={backToList}>← Watchlist</button>
          {previewItem && (
            <button type="button" className="detail-add" onClick={() => { if (handleAddStock(previewItem.symbol, previewItem.market)) setPreviewItem(null); }}>+ เพิ่ม Watchlist</button>
          )}
        </div>
      )}
      {view === "detail" && <>
      {loading && !selectedData && (
        <div className="sk-detail" aria-busy="true" aria-label="กำลังโหลด">
          <i className="sk" style={{ height: 120 }} />
          <i className="sk" style={{ height: 180 }} />
          <i className="sk" style={{ height: 140 }} />
        </div>
      )}
      {error && !loading && !selectedData && (
        <div className="state-banner error">{error}</div>
      )}

      {selectedData && tradePlan && (
        <StockDashboard
          symbol={displaySymbol(selectedData.resolvedSymbol)}
          companyName={selectedData.longName}
          currentPrice={selectedData.lastClose}
          change={selectedData.change}
          changePercent={selectedData.changePercent}
          market={selectedData.market}
          assetKind={selectedData.assetKind}
          fairValue={selectedData.fairValue}
          tradePlan={tradePlan}
          nearSupport={nearSupport}
          nearResistance={nearResistance}
          loading={loading}
          onRefresh={() => fetchStock(true)}
          trend={trend}
          events={selectedData.events}
          extended={selectedData.extended}
          logoSymbol={selectedData.resolvedSymbol}
          rev={reversalTag(selectedData)}
          dip={(() => { const c = chipSignalOf(selectedData); return c.dipKind ? { kind: c.dipKind, label: c.dipLabel, short: c.dipShort ?? null, drawdown: c.dipDrawdown ?? null } : null; })()}
        />
      )}

      {selectedData && (
        <div className="detail-tabs" role="tablist" aria-label="หัวข้อ">
          {([["overview", "📊 ภาพรวม"], ["chart", "📈 กราฟ"], ["fund", "🏢 พื้นฐาน"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => pickTab(k)}>{label}</button>
          ))}
        </div>
      )}

      {tab === "overview" && selectedData && tradePlan && (
        <SignalSummary
          data={selectedData}
          trend={trend}
          tradePlan={tradePlan}
          srMode={srMode}
          onModeChange={setSrMode}
          hits={currentHits}
          tolerancePercent={tagSettings.tolerancePercent}
          toleranceOptions={toleranceOptions}
          onToleranceChange={setTagTolerance}
        />
      )}

      {tab === "chart" && selectedData && activeItem && (
        <section className="chart-section">
          <StockChart
            symbol={activeItem.symbol}
            market={activeItem.market}
            pivot={selectedData.pivot}
            zones={selectedData.zones}
            mode={srMode}
          />
        </section>
      )}

      {tab === "fund" && selectedData && <>
        {selectedData.assetKind === "stock" && <FundamentalMetrics value={selectedData.fairValue} market={selectedData.market} price={selectedData.lastClose} />}
        {selectedData.assetKind === "stock" && (selectedData.deep === undefined
          ? <i className="sk" style={{ display: "block", height: 160, borderRadius: 14 }} aria-label="กำลังโหลดข้อมูลเชิงลึก" />
          : <DeepCards deep={selectedData.deep} trailingEps={selectedData.fairValue.trailingEps ?? null} />)}
        {(selectedData.assetKind === "etf" || selectedData.assetKind === "gold-etf") && <EtfCard data={selectedData} />}
        {selectedData.company && <CompanyCard company={selectedData.company} />}
        {selectedData.assetKind === "gold-spot" && <p className="state-banner">ทองคำไม่มีข้อมูลพื้นฐานแบบบริษัท</p>}
      </>}

      {toast && (
        <div className={`toast-banner${toastError ? " error" : ""}`} role="status">
          {toast}
        </div>
      )}

      </>}

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
