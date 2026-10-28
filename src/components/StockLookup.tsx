"use client";
import { useEffect, useState } from "react";
import StockLogo from "./StockLogo";
import { StarIcon } from "./Icons";

type Mkt = "TH" | "US";
export type Found = { key: string; state: "loading" | "found" | "none"; symbol: string; market: Mkt; name?: string | null; price?: number; changePercent?: number };

/** ค้นหาสด: พิมพ์แล้วหยุด 0.35 วิ → เช็กว่ามีหุ้นตัวนี้ไหม พร้อมชื่อ/ราคา/% วันนี้ */
export function useStockLookup(input: string, market: Mkt): Found | null {
  const q = input.trim().toUpperCase();
  const sym = q.replace(/\.BK$/, "");
  const mkt: Mkt = q.endsWith(".BK") ? "TH" : market;
  const key = sym ? `${sym}::${mkt}` : "";
  const [found, setFound] = useState<Found | null>(null);
  useEffect(() => {
    if (!key || !/^[A-Z0-9.\-^=&/]{1,15}$/.test(sym)) { setFound(null); return; }
    setFound({ key, state: "loading", symbol: sym, market: mkt });
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/quotes?items=${encodeURIComponent(sym)}:${mkt}`, { signal: ctrl.signal, cache: "no-store" });
        const j = res.ok ? await res.json() : null;
        const hit = j?.quotes?.[key];
        setFound(hit && hit.price > 0
          ? { key, state: "found", symbol: sym, market: mkt, name: hit.name, price: hit.price, changePercent: hit.changePercent }
          : { key, state: "none", symbol: sym, market: mkt });
      } catch { if (!ctrl.signal.aborted) setFound({ key, state: "none", symbol: sym, market: mkt }); }
    }, 350);
    return () => { ctrl.abort(); window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return found && found.key === key ? found : null;
}

/** การ์ดผลค้นหา: แตะ = เปิดหน้าข้อมูล · ดาว = เพิ่ม/เอาออกจาก Watchlist */
export function StockFoundCard({ found, saved, onOpen, onToggle, onSwitchMarket }: {
  found: Found;
  saved: boolean;
  onOpen: (symbol: string, market: Mkt) => void;
  onToggle?: (symbol: string, market: Mkt) => void;
  onSwitchMarket?: (market: Mkt) => void;
}) {
  if (found.state === "loading") return <p className="wl-found-msg">กำลังค้นหา {found.symbol}…</p>;
  if (found.state === "none") {
    const other: Mkt = found.market === "US" ? "TH" : "US";
    return (
      <p className="wl-found-msg">ไม่พบ <b>{found.symbol}</b> ในตลาด{found.market === "US" ? "สหรัฐ" : "ไทย"}
        {onSwitchMarket && <button type="button" onClick={() => onSwitchMarket(other)}>ลองหาใน{other === "TH" ? "ตลาดไทย" : "ตลาด US"}</button>}
      </p>
    );
  }
  const up = (found.changePercent ?? 0) >= 0;
  return (
    <ul className="wl-list wl-found-list">
      <li className="wl-row">
        <div className="wl-swipe">
          <button type="button" className="wl-main" onClick={() => onOpen(found.symbol, found.market)} aria-label={`เปิด ${found.symbol}`}>
            <span className="wl-logo">
              <span className="wl-logo-text">{found.symbol.slice(0, 4)}</span>
              <StockLogo symbol={found.market === "TH" ? `${found.symbol}.BK` : found.symbol} size={40} className="wl-logo-img" />
            </span>
            <span className="wl-name">
              <span className="wl-line1"><b>{found.symbol}</b><small>{found.name ?? (found.market === "TH" ? "SET" : "US")}</small></span>
            </span>
            <span className="wl-price"><b>{found.market === "TH" ? "฿" : "$"}{found.price!.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></span>
            <span className={`wl-chg ${up ? "up" : "down"}`}>{up ? "+" : ""}{(found.changePercent ?? 0).toFixed(2)}%</span>
          </button>
          {onToggle && (
            <button type="button" className={`star-btn${saved ? " on" : ""}`}
              aria-label={saved ? `เอา ${found.symbol} ออกจาก Watchlist` : `เพิ่ม ${found.symbol} ใน Watchlist`}
              title={saved ? "อยู่ใน Watchlist · กดเพื่อเอาออก" : "เพิ่มใน Watchlist"}
              aria-pressed={saved}
              onClick={() => onToggle(found.symbol, found.market)}><StarIcon filled={saved} /></button>
          )}
        </div>
      </li>
    </ul>
  );
}
