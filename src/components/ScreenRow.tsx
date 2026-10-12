"use client";
import type { ReactNode } from "react";
import StockLogo from "./StockLogo";

/** แถวหุ้นแบบเดียวกับหน้า Watchlist — แตะเพื่อเปิดรายละเอียด */
export default function ScreenRow({ symbol, market, name, price, changePercent, line2, open, onToggle, children, loading, error }: {
  symbol: string; market: "TH" | "US"; name?: string | null; price?: number | null; changePercent?: number | null;
  line2?: ReactNode; open: boolean; onToggle: () => void; children?: ReactNode; loading?: boolean; error?: string | null;
}) {
  const up = (changePercent ?? 0) >= 0;
  const cur = market === "TH" ? "฿" : "$";
  return (
    <li className={`wl-row scr-row${open ? " open" : ""}`}>
      <button type="button" className="wl-main" onClick={onToggle} aria-expanded={open}>
        <span className="wl-logo">
          <span className="wl-logo-text">{symbol.slice(0, 4)}</span>
          <StockLogo symbol={market === "TH" ? `${symbol}.BK` : symbol} size={40} className="wl-logo-img" />
        </span>
        <span className="wl-name">
          <span className="wl-line1"><b>{symbol}</b><small>{name ?? (market === "TH" ? "SET" : "US")}</small></span>
          {line2 && <span className="wl-line2">{line2}</span>}
        </span>
        <span className="wl-price"><b>{price != null ? `${cur}${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : error ? "—" : loading ? "…" : "—"}</b>
          {error && <small className="scr-err">{error}</small>}</span>
        <span className={`wl-chg ${changePercent != null ? (up ? "up" : "down") : ""}`}>
          {changePercent != null ? `${up ? "+" : ""}${changePercent.toFixed(2)}%` : "—"}
        </span>
      </button>
      {open && children && <div className="scr-detail">{children}</div>}
    </li>
  );
}
