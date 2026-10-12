"use client";
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import StockLogo from "./StockLogo";
import { displaySymbol, normalizeInput } from "@/lib/symbol";
import { watchlistId } from "@/lib/watchlist-id";
import type { WatchlistQuotes, WatchlistSignals, WatchlistSrTags } from "@/hooks/useSrWatchlistTags";
import type { WatchlistItem } from "@/lib/types";

const fmtPrice = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DIP_ICON: Record<string, string> = { good: "🏷️", trap: "⚠️", watch: "👀" };

/** รายการหุ้นแบบ Dime: โลโก้ · ชื่อ · ราคา · % — แตะเพื่อเปิดหน้าวิเคราะห์ */
export default function WatchlistList({ items, signals, quotes, onRefresh, refreshing, updatedAt, srTags, onOpen, onRemove, onReorder, syncStatus }: {
  items: WatchlistItem[];
  signals: WatchlistSignals;
  quotes: WatchlistQuotes;
  onRefresh: () => void;
  refreshing: boolean;
  updatedAt: number | null;
  srTags: WatchlistSrTags;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  /** ปุ่มเพิ่มอยู่มุมขวาล่างแล้ว */
  onAdd?: () => void;
  syncStatus?: string;
}) {
  // ปัดซ้าย = โชว์ปุ่มลบ · กดค้าง = ลากจัดเรียง
  const [swiped, setSwiped] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const g = useRef<{ id: string; el: HTMLElement; x: number; y: number; mode: "idle" | "swipe" | "drag" | "scroll"; dx: number; timer: number | null; moved: boolean; base: number } | null>(null);
  const suppressClick = useRef(false);
  const SWIPE_W = 84;
  // เรียง: manual = ลำดับที่จัดเอง · up/down = % เปลี่ยนแปลงวันนี้
  const [sort, setSort] = useState<"manual" | "up" | "down">("manual");
  useEffect(() => { try { const v = localStorage.getItem("wlSort"); if (v === "up" || v === "down") setSort(v); } catch { /* ignore */ } }, []);
  const changeSort = (v: "manual" | "up" | "down") => { setSort(v); try { localStorage.setItem("wlSort", v); } catch { /* ignore */ } };
  const chg = (it: WatchlistItem) => quotes[watchlistId(it)]?.changePercent ?? signals[watchlistId(it)]?.changePercent;
  const shown = sort === "manual" ? items : [...items].sort((a, b) => {
    const x = chg(a), y = chg(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return sort === "up" ? y - x : x - y;
  });
  const blockScroll = (e: TouchEvent) => e.preventDefault();
  const swipeEl = (li: HTMLElement) => li.querySelector<HTMLElement>(".wl-swipe");
  const setX = (li: HTMLElement, x: number, anim: boolean) => {
    const s = swipeEl(li);
    if (!s) return;
    s.style.transition = anim ? "transform .18s ease" : "none";
    s.style.transform = x ? `translateX(${x}px)` : "";
  };
  const closeSwiped = () => {
    if (!swiped) return;
    const li = listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(swiped)}"]`);
    if (li) setX(li, 0, true);
    setSwiped(null);
  };
  const endDrag = (st: NonNullable<typeof g.current>) => {
    st.el.classList.remove("dragging");
    st.el.style.transform = "";
    document.removeEventListener("touchmove", blockScroll);
  };
  const onDown = (e: RPointerEvent<HTMLLIElement>, id: string) => {
    if (e.button !== 0) return;
    if (swiped && swiped !== id) closeSwiped();
    const el = e.currentTarget;
    const st = { id, el, x: e.clientX, y: e.clientY, mode: "idle" as const, dx: 0, timer: null as number | null, moved: false, base: swiped === id ? -SWIPE_W : 0 };
    g.current = st;
    suppressClick.current = false;
    const pid = e.pointerId;
    if (sort === "manual" && items.length > 1) {
      st.timer = window.setTimeout(() => {
        const cur = g.current;
        if (!cur || cur.id !== id || cur.mode !== "idle") return;
        cur.mode = "drag";
        suppressClick.current = true;
        setX(el, 0, true);
        if (swiped) setSwiped(null);
        el.classList.add("dragging");
        document.addEventListener("touchmove", blockScroll, { passive: false });
        try { el.setPointerCapture(pid); } catch { /* ignore */ }
        navigator.vibrate?.(12);
      }, 380);
    }
  };
  const onMove = (e: RPointerEvent<HTMLLIElement>) => {
    const st = g.current;
    if (!st || st.el !== e.currentTarget) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (st.mode === "idle") {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        st.mode = "swipe";
        suppressClick.current = true;
        try { st.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      } else if (Math.abs(dy) > 10) st.mode = "scroll";
      if (st.mode !== "idle" && st.timer) { clearTimeout(st.timer); st.timer = null; }
    }
    if (st.mode === "swipe") {
      st.dx = Math.max(-SWIPE_W - 20, Math.min(0, st.base + dx));
      setX(st.el, st.dx, false);
    } else if (st.mode === "drag") {
      e.preventDefault();
      let off = e.clientY - st.y;
      const prev = st.el.previousElementSibling as HTMLElement | null;
      const next = st.el.nextElementSibling as HTMLElement | null;
      if (next && off > next.offsetHeight / 2 && next.dataset.id) {
        onReorder(st.id, next.dataset.id);
        st.y += next.offsetHeight; off -= next.offsetHeight;
      } else if (prev && off < -prev.offsetHeight / 2 && prev.dataset.id) {
        onReorder(st.id, prev.dataset.id);
        st.y -= prev.offsetHeight; off += prev.offsetHeight;
      }
      st.el.style.transform = `translateY(${off}px)`;
    }
  };
  const onUp = () => {
    const st = g.current;
    g.current = null;
    if (!st) return;
    if (st.timer) clearTimeout(st.timer);
    if (st.mode === "swipe") {
      const open = st.dx < -SWIPE_W / 2;
      setX(st.el, open ? -SWIPE_W : 0, true);
      setSwiped(open ? st.id : null);
    } else if (st.mode === "drag") endDrag(st);
  };
  const onCancel = () => {
    onUp();
  };
  const tap = (id: string) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (swiped) { closeSwiped(); return; }
    onOpen(id);
  };

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
          <button type="button" className={`wl-refresh${refreshing ? " spin" : ""}`} onClick={onRefresh} disabled={refreshing} aria-label="อัปเดตราคา" title="อัปเดตราคา">↻</button>
        </div>
      </div>
      {(syncStatus || updatedAt) && <p className="wl-sync">{updatedAt ? `ราคา ณ ${new Date(updatedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · อัปเดตเองทุก 30 วิ` : ""}{syncStatus && updatedAt ? " · " : ""}{syncStatus}</p>}
      {items.length > 1 && <p className="wl-hint">{sort === "manual" ? "กดค้างแล้วลากเพื่อจัดเรียง · ปัดซ้ายเพื่อลบ" : "ปัดซ้ายเพื่อลบ · เลือก “จัดเอง” เพื่อลากจัดเรียง"}</p>}
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
            <li key={id} data-id={id} className="wl-row" onPointerDown={e => onDown(e, id)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onContextMenu={e => e.preventDefault()}>
              <button type="button" className="wl-del" tabIndex={swiped === id ? 0 : -1} aria-hidden={swiped !== id} onClick={() => { setSwiped(null); onRemove(id); }}>ลบ</button>
              <div className="wl-swipe">
              <button type="button" className="wl-main" onClick={() => tap(id)}>
                <span className="wl-logo">
                  <span className="wl-logo-text">{sym.slice(0, 4)}</span>
                  <StockLogo symbol={item.market === "TH" ? `${item.symbol}.BK` : item.symbol} size={40} className="wl-logo-img" />
                </span>
                <span className="wl-name">
                  <span className="wl-line1"><b>{sym}</b><small>{sig?.name ?? (item.market === "TH" ? "SET" : "US")}</small></span>
                  {(nearSup || nearRes || (sig?.dipKind && DIP_ICON[sig.dipKind]) || sig?.event) && (
                    <span className="wl-line2">
                      {nearSup && <em className="wl-tag sup">ใกล้รับ</em>}
                      {nearRes && <em className="wl-tag res">ใกล้ต้าน</em>}
                      {sig?.dipKind && DIP_ICON[sig.dipKind] && <i title={sig.dipLabel ?? ""}>{DIP_ICON[sig.dipKind]} {sig.dipKind === "good" ? "ดีลดราคา" : sig.dipKind === "trap" ? "ระวังกับดัก" : "น่าจับตา"}</i>}
                      {sig?.event && <i title={sig.event.title}>{sig.event.kind === "earnings" ? "📅" : "💰"} {sig.event.text}</i>}
                    </span>
                  )}
                </span>
                <span className="wl-price">
                  <b>{hasPrice ? `${currency}${fmtPrice(price)}` : "…"}</b>
                  {ext && <small className={`wl-ext ${ext.changePercent >= 0 ? "up" : "down"}`}><span>{ext.session === "pre" ? "ก่อนเปิด" : "หลังปิด"}</span><span>{fmtPrice(ext.price)} {ext.changePercent >= 0 ? "+" : ""}{ext.changePercent.toFixed(2)}%</span></small>}
                </span>
                <span className={`wl-chg ${hasPrice ? (up ? "up" : "down") : ""}`}>
                  {hasPrice ? `${up ? "+" : ""}${change.toFixed(2)}%` : "—"}
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
