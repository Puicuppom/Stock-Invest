"use client";
import { useEffect, useState } from "react";
import StockLogo from "./StockLogo";
import { displaySymbol, normalizeInput } from "@/lib/symbol";
import { watchlistId } from "@/lib/watchlist-id";
import type { WatchlistSignals, WatchlistSrTags } from "@/hooks/useSrWatchlistTags";
import type { WatchlistItem } from "@/lib/types";

const DIP_ICON: Record<string, string> = { good: "🏷️", trap: "⚠️", watch: "👀" };

/** รายการหุ้นแบบ Dime: โลโก้ · ชื่อ · ราคา · % — แตะเพื่อเปิดหน้าวิเคราะห์ */
export default function WatchlistList({ items, signals, srTags, onOpen, onRemove, onReorder, onAdd, syncStatus }: {
  items: WatchlistItem[];
  signals: WatchlistSignals;
  srTags: WatchlistSrTags;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  onAdd: () => void;
  syncStatus?: string;
}) {
  const [edit, setEdit] = useState(false);
  // เรียง: manual = ลำดับที่จัดเอง · up/down = % เปลี่ยนแปลงวันนี้
  const [sort, setSort] = useState<"manual" | "up" | "down">("manual");
  useEffect(() => { try { const v = localStorage.getItem("wlSort"); if (v === "up" || v === "down") setSort(v); } catch { /* ignore */ } }, []);
  const changeSort = (v: "manual" | "up" | "down") => { setSort(v); if (v !== "manual") setEdit(false); try { localStorage.setItem("wlSort", v); } catch { /* ignore */ } };
  const chg = (it: WatchlistItem) => signals[watchlistId(it)]?.changePercent;
  const shown = sort === "manual" ? items : [...items].sort((a, b) => {
    const x = chg(a), y = chg(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return sort === "up" ? y - x : x - y;
  });
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
          <button type="button" className={`wl-edit${edit ? " on" : ""}`} onClick={() => { if (!edit) changeSort("manual"); setEdit(!edit); }}>{edit ? "เสร็จ" : "จัดเรียง/ลบ"}</button>
          <button type="button" className="wl-add" onClick={onAdd}>+ เพิ่ม</button>
        </div>
      </div>
      {syncStatus && <p className="wl-sync">{syncStatus}</p>}
      <ul className="wl-list">
        {shown.map((item, i) => {
          const id = watchlistId(item);
          const sym = displaySymbol(normalizeInput(item.symbol));
          const sig = signals[id];
          const hits = srTags[id] ?? [];
          const nearSup = hits.some(h => h.kind === "support"), nearRes = hits.some(h => h.kind === "resistance");
          const up = (sig?.changePercent ?? 0) >= 0;
          const currency = item.market === "TH" ? "฿" : "$";
          return (
            <li key={id} className="wl-row">
              <button type="button" className="wl-main" onClick={() => !edit && onOpen(id)} disabled={edit}>
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
                  <b>{sig ? `${currency}${sig.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "…"}</b>
                  {sig?.extSession && <small>{sig.extSession === "pre" ? "ก่อนเปิด" : "หลังปิด"}</small>}
                </span>
                <span className={`wl-chg ${sig ? (up ? "up" : "down") : ""}`}>
                  {sig ? `${up ? "+" : ""}${sig.changePercent.toFixed(2)}%` : "—"}
                </span>
              </button>
              {edit && (
                <span className="wl-edit-btns">
                  <button type="button" aria-label={`เลื่อน ${sym} ขึ้น`} disabled={i === 0} onClick={() => onReorder(id, watchlistId(shown[i - 1]))}>▲</button>
                  <button type="button" aria-label={`เลื่อน ${sym} ลง`} disabled={i === shown.length - 1} onClick={() => onReorder(id, watchlistId(shown[i + 1]))}>▼</button>
                  <button type="button" className="del" aria-label={`ลบ ${sym}`} onClick={() => { if (confirm(`ลบ ${sym} ออกจาก Watchlist?`)) onRemove(id); }}>✕</button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {!items.length && <p className="wl-empty">ยังไม่มีหุ้น กด + เพิ่ม</p>}
    </section>
  );
}
