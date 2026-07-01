"use client";

import { displaySymbol } from "@/lib/symbol";
import type { WatchlistItem } from "@/lib/types";

interface WatchlistProps {
  items: WatchlistItem[];
  selected: string;
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
}

export default function Watchlist({
  items,
  selected,
  onSelect,
  onRemove,
}: WatchlistProps) {
  if (items.length === 0) {
    return (
      <div className="watchlist-empty">
        <p>ยังไม่มีหุ้นในรายการ</p>
        <p className="hint-text">กดปุ่ม + เพื่อเพิ่มหุ้น</p>
      </div>
    );
  }

  return (
    <div className="watchlist-scroll">
      {items.map((item) => {
        const active = item.symbol === selected;
        return (
          <button
            key={item.symbol}
            type="button"
            className={`watchlist-chip ${active ? "active" : ""}`}
            onClick={() => onSelect(item.symbol)}
          >
            <span className="chip-symbol">{displaySymbol(item.symbol)}</span>
            <span className="chip-market">{item.market === "auto" ? "AUTO" : item.market}</span>
            <span
              role="button"
              tabIndex={0}
              className="chip-remove"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.symbol);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onRemove(item.symbol);
                }
              }}
              aria-label={`ลบ ${item.symbol}`}
            >
              ×
            </span>
          </button>
        );
      })}
    </div>
  );
}
