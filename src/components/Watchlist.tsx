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

const LONG_PRESS_MS = 420;
const MOVE_THRESHOLD = 10;

export default function Watchlist({
  items,
  selected,
  onSelect,
  onRemove,
  onReorder,
  onAddClick,
}: WatchlistProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const draggingIdRef = useRef<string | null>(null);
  const dragOverIdRef = useRef<string | null>(null);
  const pendingIdRef = useRef<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const suppressClickRef = useRef(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [pressingId, setPressingId] = useState<string | null>(null);

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

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pendingIdRef.current = null;
    setPressingId(null);
  }, []);

  const startDrag = useCallback((id: string) => {
    draggingIdRef.current = id;
    dragOverIdRef.current = id;
    setDraggingId(id);
    setDragOverId(id);
    setPressingId(null);
    suppressClickRef.current = true;
    if (navigator.vibrate) {
      navigator.vibrate(12);
    }
  }, []);

  const finishDrag = useCallback(() => {
    clearLongPress();

    const fromId = draggingIdRef.current;
    const toId = dragOverIdRef.current;
    if (fromId && toId && fromId !== toId) {
      onReorder(fromId, toId);
      suppressClickRef.current = true;
    }

    draggingIdRef.current = null;
    dragOverIdRef.current = null;
    setDraggingId(null);
    setDragOverId(null);
  }, [clearLongPress, onReorder]);

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

  const handlePointerDown = (id: string, event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest(".chip-remove")) {
      return;
    }

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    pendingIdRef.current = id;
    startPosRef.current = { x: event.clientX, y: event.clientY };
    setPressingId(id);

    longPressTimerRef.current = setTimeout(() => {
      if (pendingIdRef.current === id) {
        startDrag(id);
      }
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (draggingIdRef.current) {
      event.preventDefault();
      const targetId = findTargetId(event.clientX, event.clientY);
      if (targetId) {
        dragOverIdRef.current = targetId;
        setDragOverId(targetId);
      }
      return;
    }

    if (!pendingIdRef.current) return;

    const dx = event.clientX - startPosRef.current.x;
    const dy = event.clientY - startPosRef.current.y;
    if (Math.hypot(dx, dy) > MOVE_THRESHOLD) {
      clearLongPress();
    }
  };

  const handleChipClick = (id: string) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onSelect(id);
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

      <p className="watchlist-hint">กดค้างแล้วลากเพื่อเรียงลำดับ</p>

      <div
        ref={scrollRef}
        className={`watchlist-scroll ${draggingId ? "is-dragging" : ""}`}
        onPointerMove={handlePointerMove}
      >
        {items.map((item) => {
          const id = watchlistId(item);
          const active = id === selected;
          const isDragging = draggingId === id;
          const isDropTarget = dragOverId === id && draggingId !== id;
          const isPressing = pressingId === id && !draggingId;

          return (
            <button
              key={id}
              type="button"
              data-watchlist-id={id}
              ref={(el) => {
                if (el) chipRefs.current.set(id, el);
                else chipRefs.current.delete(id);
              }}
              className={`watchlist-chip ${active ? "active" : ""} ${isDragging ? "dragging" : ""} ${isDropTarget ? "drop-target" : ""} ${isPressing ? "pressing" : ""}`}
              onPointerDown={(event) => handlePointerDown(id, event)}
              onClick={() => handleChipClick(id)}
            >
              <span className="chip-symbol">{displaySymbol(item.symbol)}</span>
              <span className="chip-market">{marketLabel(item.market)}</span>
              <span
                role="button"
                tabIndex={0}
                className="chip-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  suppressClickRef.current = false;
                  onRemove(id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
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
