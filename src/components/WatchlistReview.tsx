"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ScreenRow from "./ScreenRow";
import PlanSuggest from "./PlanSuggest";
import { getCachedStock } from "@/hooks/useSrWatchlistTags";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { screenStock, screeningStyles, valuationRiskFlags, type ScreeningStyle } from "@/lib/screener";
import { analyzeDip } from "@/lib/dip";
import { analyzeMomentum, returnPercent, type MarketContext } from "@/lib/momentum";
import { analyzeTrend, LEAN_GLYPH, LEAN_SHORT, trendLean } from "@/lib/trend";
import { watchlistId } from "@/lib/watchlist-id";
import type { StockData, WatchlistItem } from "@/lib/types";

const SHORT: Partial<Record<ScreeningStyle, string>> = { dip: "ลดราคา", momentum: "ไปต่อ", smallcap: "หุ้นจิ๋ว", dividend: "ปันผล", etf: "ETF" };
const STYLES: { key: ScreeningStyle; icon: string }[] = [
  { key: "dip", icon: "🏷️" }, { key: "momentum", icon: "🚀" }, { key: "smallcap", icon: "💎" }, { key: "dividend", icon: "💰" }, { key: "etf", icon: "📦" },
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
  // แตะไอคอนแนวทางเพื่อกรองเฉพาะตัวที่ผ่าน/เกือบผ่านแนวทางนั้น
  const [filter, setFilter] = useState<ScreeningStyle | null>(null);
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
        // หน้าวิเคราะห์โหลดไว้แล้ว → ใช้เลย ไม่ต้องดึงซ้ำ
        const cached = getCachedStock(watchlistId(item));
        if (cached) return { item, data: cached };
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

  // ราคาสด + ก่อนเปิด/หลังปิด
  const live = useLiveQuotes(items, loaded);

  const computed = rows.map(({ item, data, error }) => {
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
    const lean = trend ? trendLean(trend.kind, trend.label) : null;
    const hits = results.filter(r => r.pass || r.near);
    return { item, data, error, id, results, dip, mom, trend, flags, lean, hits };
  });
  const count = (k: ScreeningStyle, kind: "pass" | "near") => computed.filter(r => r.results.some(x => x.key === k && x[kind])).length;
  const shown = filter ? computed.filter(r => r.hits.some(h => h.key === filter)) : computed;

  return (
    <section className="wr wl">
      <div className="screen-actions">
        <span>{busy ? `กำลังวิเคราะห์ ${rows.filter(r => r.data || r.error).length}/${items.length}` : `${items.length} ตัว`}</span>
        <button type="button" disabled={busy || !items.length} onClick={run}>↻ วิเคราะห์ใหม่</button>
      </div>
      {rows.length > 0 && <PlanSuggest rows={computed} ctx={ctx} />}
      <div className="scr-styles wr-styles" role="group" aria-label="กรองตามแนวทาง">
        {STYLES.map(st => {
          const p = count(st.key, "pass"), n = count(st.key, "near");
          return (
            <button key={st.key} type="button" aria-pressed={filter === st.key} title={screeningStyles[st.key].label} onClick={() => setFilter(filter === st.key ? null : st.key)}>
              <span className="scr-ico">{st.icon}</span><span>{SHORT[st.key]}</span>
              {(p > 0 || n > 0) && <span className="wr-count">{p > 0 && <b>✓{p}</b>}{n > 0 && <i>●{n}</i>}</span>}
            </button>
          );
        })}
      </div>
      <p className="wr-legend"><b className="up">✓</b> ผ่านครบ · <i className="near">●</i> เกือบผ่าน (ขาด 1 ข้อ){filter ? <> · <button type="button" className="wr-clear" onClick={() => setFilter(null)}>แสดงทั้งหมด ✕</button></> : " · แตะไอคอนเพื่อกรอง"}</p>
      <ul className="wl-list scr-list">
      {shown.map(({ item, data, error, id, results, dip, mom, flags, trend, lean, hits }) => (
          <ScreenRow key={id} symbol={item.symbol} market={item.market} name={data?.longName} price={live[id]?.price ?? data?.lastClose}
            changePercent={live[id]?.changePercent ?? data?.changePercent} ext={live[id]?.ext} loading={!data && !error} error={error ? "โหลดไม่ได้" : null}
            open={open === id} onToggle={() => setOpen(open === id ? null : id)}
            line2={data && <>
              {lean && <em className={`scr-chip ico lean lean-${lean}`} title={`${LEAN_SHORT[lean]} · ${trend!.label}`} aria-label={LEAN_SHORT[lean]}>{LEAN_GLYPH[lean]}</em>}
              {hits.map(r => <em key={r.key} className={`scr-chip ico ${r.pass ? "pass" : "near"}`} title={`${screeningStyles[r.key].label}${r.pass ? "" : " · ขาด 1 ข้อ"}`} aria-label={screeningStyles[r.key].label}>{r.icon}{r.pass ? "" : <sup>●</sup>}</em>)}
            </>}>
            {data && (
              <div className="wr-detail">
                {dip && dip.kind !== "na" && <p>ลดราคา: <b>{dip.verdict}</b>{dip.drawdownPercent != null && ` (${dip.drawdownPercent.toFixed(0)}% จากจุดสูงสุด)`}</p>}
                {mom && mom.kind !== "na" && <p>ไปต่อ: <b>{mom.verdict}</b></p>}
                {flags.length > 0 && <p className="screen-flags">⚠ {flags.join(" · ")}</p>}
                {results.map(r => (
                  <p key={r.key} className="wr-why">{r.icon} {screeningStyles[r.key].label}: {r.pass ? <b className="up">ผ่านครบ</b>
                    : <>ไม่ผ่าน {r.failed.slice(0, 3).map(f => f.label).join(" · ")}{r.failed.length > 3 ? ` +${r.failed.length - 3}` : ""}</>}</p>
                ))}
                <Link className="wr-open" href={`/?s=${encodeURIComponent(id)}`}>เปิดหน้าวิเคราะห์ →</Link>
              </div>
            )}
          </ScreenRow>
      ))}
      </ul>
      {loaded && !items.length && <p>ยังไม่มีหุ้นใน Watchlist</p>}
    </section>
  );
}
