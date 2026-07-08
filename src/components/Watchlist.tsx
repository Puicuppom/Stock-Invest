"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { displaySymbol, normalizeInput } from "@/lib/symbol";
import { marketLabel, watchlistId } from "@/lib/watchlist-id";
import type { WatchlistSrTags } from "@/hooks/useSrWatchlistTags";
import type { WatchlistItem } from "@/lib/types";

interface WatchlistProps {
  items: WatchlistItem[];
  selected: string;
  srTags?: WatchlistSrTags;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  onAddClick: () => void;
}

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 12;

export default function Watchlist({
  items,
  selected,
  srTags = {},
  onSelect,
  onRemove,
  onReorder,
  onAddClick,
}: WatchlistProps) {
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
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });

  const draggingItem = items.find((item) => watchlistId(item) === draggingId);

  useEffect(() => {
    const chip = chipRefs.current.get(selected);
    if (!draggingId) {
      chip?.scrollIntoView({
        behavior: "smooth",
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

  const findTargetId = useCallback((clientX: number, clientY: number) => {
    const elements = document.elementsFromPoint(clientX, clientY);
    for (const element of elements) {
      const chip = element.closest("[data-watchlist-id]");
      const id = chip?.getAttribute("data-watchlist-id");
      if (id && id !== draggingIdRef.current) return id;
    }
    return null;
  }, []);

  const updateDragPosition = useCallback(
    (clientX: number, clientY: number) => {
      setGhostPos({ x: clientX, y: clientY });
      const targetId = findTargetId(clientX, clientY);
      if (targetId) {
        dragOverIdRef.current = targetId;
        setDragOverId(targetId);
      }
    },
    [findTargetId]
  );

  const startDrag = useCallback((id: string) => {
    draggingIdRef.current = id;
    dragOverIdRef.current = id;
    setDraggingId(id);
    setDragOverId(id);
    setPressingId(null);
    setGhostPos({ x: startPosRef.current.x, y: startPosRef.current.y });
    suppressClickRef.current = true;
    document.body.classList.add("watchlist-dragging");
    navigator.vibrate?.([20, 30, 20]);
  }, []);

  const finishDrag = useCallback(() => {
    clearLongPress();

    const fromId = draggingIdRef.current;
    const toId = dragOverIdRef.current;
    if (fromId && toId && fromId !== toId) {
      onReorder(fromId, toId);
      suppressClickRef.current = true;
      navigator.vibrate?.(10);
    }

    draggingIdRef.current = null;
    dragOverIdRef.current = null;
    setDraggingId(null);
    setDragOverId(null);
    document.body.classList.remove("watchlist-dragging");
  }, [clearLongPress, onReorder]);

  useEffect(() => {
    const handleMove = (clientX: number, clientY: number, preventDefault?: () => void) => {
      if (draggingIdRef.current) {
        preventDefault?.();
        updateDragPosition(clientX, clientY);
        return;
      }

      if (!pendingIdRef.current) return;

      const dx = clientX - startPosRef.current.x;
      const dy = clientY - startPosRef.current.y;
      if (Math.hypot(dx, dy) > MOVE_THRESHOLD) {
        clearLongPress();
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      handleMove(touch.clientX, touch.clientY, () => event.preventDefault());
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      handleMove(event.clientX, event.clientY);
    };

    const onTouchEnd = () => finishDrag();
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      finishDrag();
    };

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);

    return () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
      document.body.classList.remove("watchlist-dragging");
    };
  }, [clearLongPress, finishDrag, updateDragPosition]);

  const beginPress = (id: string, clientX: number, clientY: number) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    pendingIdRef.current = id;
    startPosRef.current = { x: clientX, y: clientY };
    setPressingId(id);

    longPressTimerRef.current = setTimeout(() => {
      if (pendingIdRef.current === id) {
        startDrag(id);
      }
    }, LONG_PRESS_MS);
  };

  const isRemoveTarget = (target: EventTarget) =>
    (target as HTMLElement).closest(".chip-remove");

  const handleTouchStart = (id: string, event: React.TouchEvent) => {
    if (isRemoveTarget(event.target)) return;
    const touch = event.touches[0];
    if (!touch) return;
    beginPress(id, touch.clientX, touch.clientY);
  };

  const handlePointerDown = (id: string, event: React.PointerEvent) => {
    if (event.pointerType === "touch") return;
    if (isRemoveTarget(event.target)) return;
    beginPress(id, event.clientX, event.clientY);
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

      {draggingId ? (
        <p className="watchlist-drag-banner">ลากไปวางตำแหน่งใหม่ แล้วปล่อยนิ้ว</p>
      ) : (
        <p className="watchlist-hint">กดค้าง chip จนเห็นกรอบฟ้า แล้วลาก</p>
      )}

      <div className={`watchlist-grid ${draggingId ? "is-dragging" : ""}`}>
        {items.map((item) => {
          const id = watchlistId(item);
          const active = id === selected;
          const isDragging = draggingId === id;
          const isDropTarget = dragOverId === id && draggingId !== id;
          const isPressing = pressingId === id && !draggingId;
          const hits = srTags[id] ?? [];
          const nearResistance = hits.some((hit) => hit.kind === "resistance");
          const nearSupport = hits.some((hit) => hit.kind === "support");

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
              onTouchStart={(event) => handleTouchStart(id, event)}
              onPointerDown={(event) => handlePointerDown(id, event)}
              onContextMenu={(event) => event.preventDefault()}
              onClick={() => handleChipClick(id)}
            >
              {isDragging && <span className="chip-placeholder">ว่าง</span>}
              <span
                className="chip-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  suppressClickRef.current = false;
                  clearLongPress();
                  onRemove(id);
                }}
                onTouchStart={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label={`ลบ ${item.symbol} ${marketLabel(item.market)}`}
              >
                ×
              </span>
              <span className="chip-symbol">
                {displaySymbol(normalizeInput(item.symbol))}
              </span>
              <span className="chip-market">{marketLabel(item.market)}</span>
              <span
                className="chip-sr-tags"
                aria-hidden={!nearResistance && !nearSupport}
              >
                {nearResistance && (
                  <span className="chip-sr-tag chip-sr-tag-res">ต้าน</span>
                )}
                {nearSupport && (
                  <span className="chip-sr-tag chip-sr-tag-sup">รับ</span>
                )}
              </span>
              {isDropTarget && <span className="chip-drop-label">วาง</span>}
            </button>
          );
        })}
      </div>

      {draggingItem && draggingId && (
        <div
          className="watchlist-drag-ghost"
          style={{
            left: ghostPos.x,
            top: ghostPos.y,
          }}
          aria-hidden
        >
          <span className="chip-symbol">
            {displaySymbol(normalizeInput(draggingItem.symbol))}
          </span>
          <span className="chip-market">{marketLabel(draggingItem.market)}</span>
        </div>
      )}
    </div>
  );
}
