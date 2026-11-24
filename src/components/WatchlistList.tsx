"use client";
import { useEffect, useRef, useState } from "react";
import { attachRowGestures } from "@/lib/row-gestures";
import StockLogo from "./StockLogo";
import { StockFoundCard, useStockLookupAll } from "./StockLookup";
import RevIcon from "./RevIcon";
import { displaySymbol, normalizeInput } from "@/lib/symbol";
import { watchlistId } from "@/lib/watchlist-id";
import { trendLean, LEAN_GLYPH, LEAN_SHORT } from "@/lib/trend";
import type { WatchlistQuotes, WatchlistSignals, WatchlistSrTags } from "@/hooks/useSrWatchlistTags";
import type { WatchlistItem } from "@/lib/types";

const fmtPrice = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** กราฟเส้นจิ๋ว 1 เดือน (เขียว = ขึ้น · แดง = ลง) */
function Spark({ values }: { values?: number[] }) {
  if (!values || values.length < 2) return <span className="wl-spark" aria-hidden="true" />;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 56},${22 - ((v - min) / span) * 20}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg className={`wl-spark ${up ? "up" : "down"}`} viewBox="0 0 56 24" aria-hidden="true">
      <polyline points={pts} fill="none" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
const DIP_ICON: Record<string, string> = { good: "🏷️", trap: "⚠️", watch: "👀" };

/** รายการหุ้นแบบ Dime: โลโก้ · ชื่อ · ราคา · % — แตะเพื่อเปิดหน้าวิเคราะห์ */
export default function WatchlistList({ items, signals, quotes, onRefresh, refreshing, updatedAt, srTags, onOpen, onSearch, onRemove, onReorder, onToggleStock, syncStatus, held = [] }: {
  items: WatchlistItem[];
  signals: WatchlistSignals;
  quotes: WatchlistQuotes;
  onRefresh: () => void;
  refreshing: boolean;
  updatedAt: number | null;
  srTags: WatchlistSrTags;
  onOpen: (id: string) => void;
  /** เปิดหุ้นที่พิมพ์ค้นหา (ไม่ต้องอยู่ใน Watchlist) */
  onSearch: (symbol: string, market: "TH" | "US") => void;
  onRemove: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  /** ปุ่มเพิ่มอยู่มุมขวาล่างแล้ว */
  onAdd?: () => void;
  /** ดาวในผลค้นหา: เพิ่ม/เอาออกจาก Watchlist */
  onToggleStock?: (symbol: string, market: "TH" | "US") => void;
  syncStatus?: string;
  /** หุ้นที่ถืออยู่ในพอร์ต (id) → อยู่บนสุดเสมอ */
  held?: string[];
}) {
  // ค้นหา: พิมพ์เพื่อกรองรายการ · Enter เพื่อเปิดหุ้นตัวไหนก็ได้
  const [query, setQuery] = useState("");
  const q = query.trim().toUpperCase();
  // ผลค้นหาสด: หาทั้งหุ้น US และหุ้นไทยพร้อมกัน ไม่ต้องเลือกตลาด
  const results = useStockLookupAll(query);
  const submitSearch = () => {
    if (!q) return;
    const first = results?.find(f => f.state === "found");
    onSearch(q.replace(/\.BK$/, ""), first ? first.market : q.endsWith(".BK") ? "TH" : "US");
    setQuery("");
  };
  const inList = (sym: string, m: "TH" | "US") => items.some(it => watchlistId(it) === watchlistId({ symbol: sym, market: m }));

  // เรียง: manual = ลำดับที่จัดเอง · up/down = % เปลี่ยนแปลงวันนี้
  const [sort, setSort] = useState<"manual" | "up" | "down">("manual");
  useEffect(() => { try { const v = localStorage.getItem("wlSort"); if (v === "up" || v === "down") setSort(v); } catch { /* ignore */ } }, []);
  const changeSort = (v: "manual" | "up" | "down") => { setSort(v); try { localStorage.setItem("wlSort", v); } catch { /* ignore */ } };
  // ปัดซ้าย = โชว์ปุ่มลบ · กดค้าง = ลากจัดเรียง (ดู row-gestures.ts)
  const listRef = useRef<HTMLUListElement>(null);
  const live = useRef({ sort, onReorder, count: items.length });
  live.current = { sort, onReorder, count: items.length };
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    return attachRowGestures(el, {
      row: ".wl-row",
      swipeEl: r => r.querySelector<HTMLElement>(".wl-swipe"),
      actionsWidth: () => 84,
      canDrag: () => live.current.sort === "manual" && live.current.count > 1,
      onCross: (r, n) => { if (r.dataset.id && n.dataset.id) live.current.onReorder(r.dataset.id, n.dataset.id); },
    });
  }, []);
  const chg = (it: WatchlistItem) => quotes[watchlistId(it)]?.changePercent ?? signals[watchlistId(it)]?.changePercent;
  const sorted = sort === "manual" ? [...items] : [...items].sort((a, b) => {
    const x = chg(a), y = chg(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return sort === "up" ? y - x : x - y;
  });
  // หุ้นในพอร์ตขึ้นก่อนเสมอ (ในกลุ่มยังเรียงตามที่เลือก)
  const heldSet = new Set(held);
  if (heldSet.size) sorted.sort((a, b) => Number(heldSet.has(watchlistId(b))) - Number(heldSet.has(watchlistId(a))));
  const shown = q ? sorted.filter(it => it.symbol.toUpperCase().includes(q) || (signals[watchlistId(it)]?.name ?? "").toUpperCase().includes(q)) : sorted;
  return (
    <section className="wl">
      <div className="wl-head">
        <h1>Watchlist <small>{items.length}</small></h1>
        <div className="wl-actions">
          <select className="wl-sort" value={sort} onChange={e => changeSort(e.target.value as "manual" | "up" | "down")} aria-label="เรียงตาม">
            <option value="manual">จัดเอง</option>
            <option value="up">บวกมากสุด</option>
            <option value="down">ลบมากสุด</option>
          </select>
          <button type="button" className={`wl-refresh${refreshing ? " spin" : ""}`} onClick={onRefresh} disabled={refreshing} aria-label="อัปเดตราคา" title="อัปเดตราคา"><svg className="rf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v5h-5" /></svg></button>
        </div>
      </div>
      {/* เวลาอัปเดตแจ้งเป็นป๊อปอัปตอนดึงรีเฟรชแทน · ค้างบนหน้าเฉพาะตอนซิงค์มีปัญหา */}
      {syncStatus && /ไม่สำเร็จ|ผิดพลาด|ออฟไลน์|error/i.test(syncStatus) && <p className="wl-sync">{syncStatus}</p>}
      <form className="wl-search" role="search" onSubmit={e => { e.preventDefault(); submitSearch(); }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" className="search-ico"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></svg>
        <input type="search" inputMode="search" autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="ค้นหาหุ้น เช่น NVDA, PTT" value={query} onChange={e => setQuery(e.target.value)} aria-label="ค้นหาหุ้น" />
      </form>
      {q && results && (
        <div className="wl-found" aria-live="polite">
          {results.map(f => (
            <StockFoundCard key={f.key + f.state} found={f} saved={inList(f.symbol, f.market)}
              onOpen={(sym, m) => { onSearch(sym, m); setQuery(""); }}
              onToggle={onToggleStock} />
          ))}
        </div>
      )}
      {items.length > 1 && !q && <p className="wl-hint">{sort === "manual" ? "กดค้างแล้วลากเพื่อจัดเรียง · ปัดซ้ายเพื่อลบ" : "ปัดซ้ายเพื่อลบ · เลือก “จัดเอง” เพื่อลากจัดเรียง"}</p>}
      <ul className="wl-list" ref={listRef}>
        {shown.map(item => {
          const id = watchlistId(item);
          const sym = displaySymbol(normalizeInput(item.symbol));
          const sig = signals[id];
          const q = quotes[id];
          // ราคาช่วงปกติ + % วันนี้ · ราคาก่อนเปิด/หลังปิดแสดงแยกบรรทัด
          const price = q?.price ?? sig?.price;
          const change = q?.changePercent ?? sig?.changePercent;
          const ext = q ? q.ext : sig?.extSession ? { session: sig.extSession, price: sig.price, changePercent: sig.changePercent } : null;
          const hasPrice = price != null && change != null;
          const hits = srTags[id] ?? [];
          const nearSup = hits.some(h => h.kind === "support"), nearRes = hits.some(h => h.kind === "resistance");
          const up = (change ?? 0) >= 0;
          const currency = item.market === "TH" ? "฿" : "$";
          return (
            <li key={id} data-id={id} className="wl-row">
              <span className="row-actions"><button type="button" className="wl-del" onClick={() => onRemove(id)}>ลบ</button></span>
              <div className="wl-swipe">
              <button type="button" className="wl-main has-spark" onClick={() => onOpen(id)}>
                <span className="wl-logo">
                  <span className="wl-logo-text">{sym.slice(0, 4)}</span>
                  <StockLogo symbol={item.market === "TH" ? `${item.symbol}.BK` : item.symbol} size={40} className="wl-logo-img" />
                  {heldSet.has(id) && <i className="wl-star" title="มีในพอร์ต" aria-label="มีในพอร์ต"><svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path fill="currentColor" d="M6 2h4a1 1 0 0 1 1 1v1h2.5A1.5 1.5 0 0 1 15 5.5v7A1.5 1.5 0 0 1 13.5 14h-11A1.5 1.5 0 0 1 1 12.5v-7A1.5 1.5 0 0 1 2.5 4H5V3a1 1 0 0 1 1-1zm0 2h4V3H6v1z"/></svg></i>}
                </span>
                <span className="wl-name">
                  <span className="wl-line1"><b>{sym}</b><small>{sig?.name ?? (item.market === "TH" ? "SET" : "US")}</small></span>
                  {/* แสดงบรรทัดที่ 2 เสมอ (ว่างได้) ให้ทุกแถวสูงเท่ากัน */}
                  {(
                    <span className="wl-line2">
                      {/* ไอคอนอย่างเดียว · ความหมายเต็มอยู่ใน title / หน้าวิเคราะห์ */}
                      {sig?.trend && (() => { const lean = trendLean(sig.trend, sig.trendLabel); return <em className={`wl-ico lean lean-${lean}`} title={sig.trendLabel ?? LEAN_SHORT[lean]} aria-label={LEAN_SHORT[lean]}>{LEAN_GLYPH[lean]}</em>; })()}
                      {sig?.rev && <em className={`wl-ico rev-${sig.rev.dir}${sig.rev.kind === "confirmed" ? " rev-confirmed" : ""}`} title={sig.rev.verdict} aria-label={sig.rev.verdict}><RevIcon dir={sig.rev.dir} /></em>}
                      {nearSup && <em className="wl-ico sup" title="ใกล้แนวรับ" aria-label="ใกล้แนวรับ">🛡️</em>}
                      {nearRes && <em className="wl-ico res" title="ใกล้แนวต้าน" aria-label="ใกล้แนวต้าน">🧱</em>}
                      {sig?.dipKind && DIP_ICON[sig.dipKind] && <em className={`wl-ico dip-${sig.dipKind}`} title={sig.dipLabel ?? sig.dipShort ?? ""} aria-label={sig.dipShort ?? sig.dipLabel ?? ""}>{DIP_ICON[sig.dipKind]}</em>}
                      {sig?.event && <em className={`wl-ico ev${sig.event.tone === "dim" ? " far" : ""}`} title={`${sig.event.text} · ${sig.event.title}`} aria-label={sig.event.title}>{sig.event.kind === "earnings" ? "📅" : "💰"}</em>}
                    </span>
                  )}
                </span>
                <Spark values={sig?.spark} />
                <span className="wl-price">
                  <b>{hasPrice ? `${currency}${fmtPrice(price)}` : <i className="sk sk-price" />}</b>
                  {ext && <small className={`wl-ext ${ext.changePercent >= 0 ? "up" : "down"}`}><span>{ext.session === "pre" ? "ก่อนเปิด" : "หลังปิด"}</span><span>{fmtPrice(ext.price)} {ext.changePercent >= 0 ? "+" : ""}{ext.changePercent.toFixed(2)}%</span></small>}
                </span>
                <span className={`wl-chg ${hasPrice ? (up ? "up" : "down") : ""}`}>
                  {hasPrice ? `${up ? "+" : ""}${change.toFixed(2)}%` : <i className="sk sk-chg" />}
                </span>
              </button>
              </div>
            </li>
          );
        })}
      </ul>
      {!items.length && <p className="wl-empty">ยังไม่มีหุ้น กด + เพิ่ม</p>}
    </section>
  );
}
