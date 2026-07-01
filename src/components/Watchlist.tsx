"use client";

import { useEffect, useRef } from "react";
import { displaySymbol } from "@/lib/symbol";
import { marketLabel, watchlistId } from "@/lib/watchlist-id";
import type { WatchlistItem } from "@/lib/types";

interface WatchlistProps {
  items: WatchlistItem[];
  selected: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAddClick: () => void;
}

export default function Watchlist({
  items,
  selected,
  onSelect,
  onRemove,
  onAddClick,
}: WatchlistProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    const chip = chipRefs.current.get(selected);
    chip?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selected, items]);

  if (items.length === 0) {
    return (
      <div className="watchlist-panel">
        <div className="watchlist-toolbar">
          <span className="watchlist-label">รายการหุ้น</span>
          <button type="button" className="watchlist-add-btn" onClick={onAddClick}>
            + เพิ่มหุ้น
          </button>
        </div>
        <div className="watchlist-empty">
          <p>ยังไม่มีหุ้นในรายการ</p>
          <p className="hint-text">กด &quot;+ เพิ่มหุ้น&quot; เพื่อเริ่มต้น</p>
        </div>
      </div>
    );
  }

  return (
    <div className="watchlist-panel">
      <div className="watchlist-toolbar">
        <span className="watchlist-label">
          รายการหุ้น <span className="watchlist-count">{items.length}</span>
        </span>
        <button type="button" className="watchlist-add-btn" onClick={onAddClick}>
          + เพิ่ม
        </button>
      </div>

      <div ref={scrollRef} className="watchlist-scroll">
        {items.map((item) => {
          const id = watchlistId(item);
          const active = id === selected;
          return (
            <button
              key={id}
              ref={(el) => {
                if (el) chipRefs.current.set(id, el);
                else chipRefs.current.delete(id);
              }}
              type="button"
              className={`watchlist-chip ${active ? "active" : ""}`}
              onClick={() => onSelect(id)}
            >
              <span className="chip-symbol">{displaySymbol(item.symbol)}</span>
              <span className="chip-market">{marketLabel(item.market)}</span>
              <span
                role="button"
                tabIndex={0}
                className="chip-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    onRemove(id);
                  }
                }}
                aria-label={`ลบ ${item.symbol} ${marketLabel(item.market)}`}
              >
                ×
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
