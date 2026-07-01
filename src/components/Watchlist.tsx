"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { displaySymbol } from "@/lib/symbol";
import { marketLabel, watchlistId } from "@/lib/watchlist-id";
import type { WatchlistItem } from "@/lib/types";

interface WatchlistProps {
  items: WatchlistItem[];
  selected: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  onAddClick: () => void;
}

export default function Watchlist({
  items,
  selected,
  onSelect,
  onRemove,
  onReorder,
  onAddClick,
}: WatchlistProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const draggingIdRef = useRef<string | null>(null);
  const dragOverIdRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    const chip = chipRefs.current.get(selected);
    if (!draggingId) {
      chip?.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, [selected, items, draggingId]);

  const finishDrag = useCallback(() => {
    const fromId = draggingIdRef.current;
    const toId = dragOverIdRef.current;
    if (fromId && toId && fromId !== toId) {
      onReorder(fromId, toId);
    }
    draggingIdRef.current = null;
    dragOverIdRef.current = null;
    setDraggingId(null);
    setDragOverId(null);
  }, [onReorder]);

  useEffect(() => {
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [finishDrag]);

  const findTargetId = (clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY);
    const chip = element?.closest("[data-watchlist-id]");
    return chip?.getAttribute("data-watchlist-id") ?? null;
  };

  const handleDragStart = (id: string, event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    draggingIdRef.current = id;
    dragOverIdRef.current = id;
    setDraggingId(id);
    setDragOverId(id);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragMove = (event: React.PointerEvent) => {
    if (!draggingIdRef.current) return;
    event.preventDefault();
    const targetId = findTargetId(event.clientX, event.clientY);
    if (targetId) {
      dragOverIdRef.current = targetId;
      setDragOverId(targetId);
    }
  };

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

      <p className="watchlist-hint">กดค้าง ☰ แล้วลากเพื่อเรียงลำดับ</p>

      <div
        ref={scrollRef}
        className={`watchlist-scroll ${draggingId ? "is-dragging" : ""}`}
        onPointerMove={handleDragMove}
      >
        {items.map((item) => {
          const id = watchlistId(item);
          const active = id === selected;
          const isDragging = draggingId === id;
          const isDropTarget = dragOverId === id && draggingId !== id;

          return (
            <div
              key={id}
              data-watchlist-id={id}
              ref={(el) => {
                if (el) chipRefs.current.set(id, el);
                else chipRefs.current.delete(id);
              }}
              className={`watchlist-chip-wrap ${isDragging ? "dragging" : ""} ${isDropTarget ? "drop-target" : ""}`}
            >
              <span
                className="chip-drag"
                aria-label={`ลากเพื่อเรียง ${item.symbol}`}
                onPointerDown={(event) => handleDragStart(id, event)}
              >
                ☰
              </span>
              <button
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
