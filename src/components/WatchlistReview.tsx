"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { screenStock, screeningStyles, valuationRiskFlags, type ScreeningStyle } from "@/lib/screener";
import { analyzeDip } from "@/lib/dip";
import { analyzeMomentum, returnPercent, type MarketContext } from "@/lib/momentum";
import { analyzeTrend, trendIcon } from "@/lib/trend";
import { watchlistId } from "@/lib/watchlist-id";
import type { StockData, WatchlistItem } from "@/lib/types";

const STYLES: { key: ScreeningStyle; icon: string }[] = [
  { key: "dip", icon: "🏷️" }, { key: "momentum", icon: "🚀" }, { key: "smallcap", icon: "💎" }, { key: "dividend", icon: "💰" },
];
type Row = { item: WatchlistItem; data?: StockData; error?: boolean };

async function load(path: string, signal: AbortSignal) {
  const r = await fetch(path, { signal });
  if (!r.ok) throw new Error();
  return r.json();
}

/** วิเคราะห์หุ้นทุกตัวใน Watchlist ตาม 4 แนวทางในครั้งเดียว */
export default function WatchlistReview({ items, loaded }: { items: WatchlistItem[]; loaded: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [ctx, setCtx] = useState<Record<string, MarketContext>>({});
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  async function run() {
    ctrl.current?.abort();
    const abort = new AbortController(); ctrl.current = abort;
    setBusy(true); setRows(items.map(item => ({ item })));
    const markets = [...new Set(items.map(i => i.market))];
    const nextCtx: Record<string, MarketContext> = {};
    await Promise.all(markets.map(async m => {
      const indexName = m === "US" ? "S&P 500" : "SET";
      try {
        const d = await load(`/api/stock/${encodeURIComponent(m === "US" ? "^GSPC" : "^SET.BK")}?market=${m}&mode=screen`, abort.signal);
        nextCtx[m] = { index6mPercent: returnPercent(d.candles.map((c: { close: number }) => c.close), 126), indexName };
      } catch { nextCtx[m] = { index6mPercent: null, indexName }; }
    }));
    if (abort.signal.aborted) return;
    setCtx(nextCtx);
    for (let i = 0; i < items.length; i += 4) {
      const batch = items.slice(i, i + 4);
      const res = await Promise.all(batch.map(async item => {
        try { return { item, data: await load(`/api/stock/${encodeURIComponent(item.symbol)}?market=${item.market}&mode=screen`, abort.signal) as StockData }; }
        catch { return { item, error: true }; }
      }));
      if (abort.signal.aborted) return;
      setRows(prev => prev.map(r => res.find(x => watchlistId(x.item) === watchlistId(r.item)) ?? r));
    }
    setBusy(false);
  }

  useEffect(() => { if (loaded && items.length) run(); return () => ctrl.current?.abort(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, items.length]);

  return (
    <section className="wr">
      <div className="screen-actions">
        <span>{busy ? `กำลังวิเคราะห์ ${rows.filter(r => r.data || r.error).length}/${items.length}` : `${items.length} ตัว`}</span>
        <button type="button" disabled={busy || !items.length} onClick={run}>↻ วิเคราะห์ใหม่</button>
      </div>
      <p className="wr-legend">{STYLES.map(s => `${s.icon} ${screeningStyles[s.key].label}`).join(" · ")} · ✓ ผ่าน ● ขาด 1 ข้อ</p>
      {rows.map(({ item, data, error }) => {
        const id = watchlistId(item);
        const c = ctx[item.market] ?? null;
        const results = data ? STYLES.map(s => {
          const checks = screenStock(data, s.key, c);
          const failed = checks.filter(x => x.passed !== true);
          return { ...s, checks, failed, pass: checks.length > 0 && failed.length === 0, near: failed.length === 1 && checks.length > 1 };
        }) : [];
        const dip = data ? analyzeDip(data) : null;
        const mom = data ? analyzeMomentum(data, c) : null;
        const trend = data ? analyzeTrend(data) : null;
        const flags = data ? valuationRiskFlags(data.fairValue, "hard") : [];
        const detail = open === id ? results : [];
        return (
          <article key={id} className="wr-row">
            <button type="button" className="wr-head" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id}>
              <span className="wr-sym"><b>{item.symbol}</b><small>{item.market === "TH" ? "BKK" : "US"}</small></span>
              {data ? <>
                <span className="wr-price">{data.lastClose.toFixed(2)} <em className={data.changePercent >= 0 ? "up" : "down"}>{data.changePercent >= 0 ? "+" : ""}{data.changePercent.toFixed(1)}%</em>
                  {trend && <i className={`chip-trend t-${trend.kind}`} title={trend.label}> {trendIcon(trend.kind)}</i>}</span>
                <span className="wr-styles">
                  {results.map(r => (
                    <span key={r.key} className={`wr-st${r.pass ? " pass" : r.near ? " near" : ""}`} title={screeningStyles[r.key].label}>
                      {r.icon}<small>{r.pass ? "✓" : r.near ? "●" : "–"}</small>
                    </span>
                  ))}
                </span>
              </> : <span className="wr-price">{error ? "โหลดไม่ได้" : "…"}</span>}
            </button>
            {detail.length > 0 && data && (
              <div className="wr-detail">
                {dip && dip.kind !== "na" && <p>ลดราคา: <b>{dip.verdict}</b>{dip.drawdownPercent != null && ` (${dip.drawdownPercent.toFixed(0)}% จากจุดสูงสุด)`}</p>}
                {mom && mom.kind !== "na" && <p>ไปต่อ: <b>{mom.verdict}</b></p>}
                {flags.length > 0 && <p className="screen-flags">⚠ {flags.join(" · ")}</p>}
                {detail.map(r => (
                  <p key={r.key} className="wr-why">{r.icon} {screeningStyles[r.key].label}: {r.pass ? <b className="up">ผ่านครบ</b>
                    : <>ไม่ผ่าน {r.failed.slice(0, 3).map(f => f.label).join(" · ")}{r.failed.length > 3 ? ` +${r.failed.length - 3}` : ""}</>}</p>
                ))}
                <Link className="wr-open" href={`/?s=${encodeURIComponent(id)}`}>เปิดหน้าวิเคราะห์ →</Link>
              </div>
            )}
          </article>
        );
      })}
      {loaded && !items.length && <p>ยังไม่มีหุ้นใน Watchlist</p>}
    </section>
  );
}
