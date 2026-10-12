/**
 * ท่าทางบนรายการแบบแอปมือถือ (ใช้ทั้ง Watchlist และหน้าปรับพอร์ต)
 * - ปัดซ้าย = เผยปุ่มด้านหลัง (เช่น ตั้งค่า / ลบ)
 * - กดค้าง ~0.4 วิ แล้วลาก = จัดเรียง
 * ใช้ touch event โดยตรง (ลงทะเบียน non-passive ตั้งแต่แรก) เพื่อให้กันการเลื่อนหน้าได้จริงบน iOS/Android
 */
export interface RowGestureOptions {
  /** selector ของแต่ละแถว (ลูกโดยตรงของ list) */
  row: string;
  /** ส่วนที่เลื่อนไปทางซ้ายเมื่อปัด */
  swipeEl: (row: HTMLElement) => HTMLElement | null;
  /** ความกว้างปุ่มด้านหลัง (px) */
  actionsWidth: (row: HTMLElement) => number;
  canDrag: () => boolean;
  /** ลากข้ามแถวข้างเคียง — ให้ผู้เรียกสลับตำแหน่ง (จะทำทันทีหรือรอ re-render ก็ได้) */
  onCross: (row: HTMLElement, neighbor: HTMLElement, dir: "up" | "down") => void;
  onDrop?: (row: HTMLElement) => void;
}

const PRESS_MS = 380;
const SLOP = 10;

export function attachRowGestures(list: HTMLElement, o: RowGestureOptions): () => void {
  type Mode = "idle" | "swipe" | "drag" | "scroll";
  let st: { row: HTMLElement; x: number; y: number; mode: Mode; dx: number; base: number; timer: number | null; pending: { el: HTMLElement; dir: "up" | "down" } | null } | null = null;
  let openRow: HTMLElement | null = null;
  let suppress = false;

  const isRow = (el: Element | null): el is HTMLElement => !!el && el instanceof HTMLElement && el.matches(o.row) && el.parentElement === list;
  const rowOf = (t: EventTarget | null) => {
    const el = (t as Element | null)?.closest?.(o.row) ?? null;
    return isRow(el) ? el : null;
  };
  const setX = (row: HTMLElement, x: number, anim: boolean) => {
    const s = o.swipeEl(row);
    if (!s) return;
    s.style.transition = anim ? "transform .2s ease" : "none";
    s.style.transform = x ? `translateX(${x}px)` : "";
  };
  const close = () => {
    if (!openRow) return;
    setX(openRow, 0, true);
    openRow.classList.remove("swiped");
    openRow = null;
  };

  const start = (target: EventTarget | null, x: number, y: number) => {
    const row = rowOf(target);
    if (!row) return;
    suppress = false;
    // แตะปุ่มด้านหลังที่เปิดอยู่ → ปล่อยให้คลิกทำงานตามปกติ
    if (openRow === row && (target as Element).closest?.(".row-actions")) return;
    if (openRow && openRow !== row) { close(); suppress = true; }
    const s = { row, x, y, mode: "idle" as Mode, dx: 0, base: openRow === row ? -o.actionsWidth(row) : 0, timer: null as number | null, pending: null };
    st = s;
    if (o.canDrag()) {
      s.timer = window.setTimeout(() => {
        if (st !== s || s.mode !== "idle") return;
        s.mode = "drag";
        suppress = true;
        if (openRow) { setX(openRow, 0, true); openRow.classList.remove("swiped"); openRow = null; }
        row.classList.add("dragging");
        navigator.vibrate?.(12);
      }, PRESS_MS);
    }
  };

  /** คืนค่า true ถ้าควรกันการเลื่อนหน้า */
  const move = (x: number, y: number): boolean => {
    const s = st;
    if (!s) return false;
    const dx = x - s.x, dy = y - s.y;
    if (s.mode === "idle") {
      if (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy) * 1.2) { s.mode = "swipe"; suppress = true; }
      else if (Math.abs(dy) > SLOP || Math.abs(dx) > SLOP) s.mode = "scroll";
      if (s.mode !== "idle" && s.timer) { clearTimeout(s.timer); s.timer = null; }
    }
    if (s.mode === "swipe") {
      const w = o.actionsWidth(s.row);
      s.dx = Math.max(-w - 24, Math.min(0, s.base + dx));
      setX(s.row, s.dx, false);
      return true;
    }
    if (s.mode === "drag") {
      const row = s.row;
      if (s.pending) {
        const done = s.pending.dir === "down" ? row.previousElementSibling === s.pending.el : row.nextElementSibling === s.pending.el;
        if (done) s.pending = null;
      }
      let off = y - s.y;
      if (!s.pending) {
        const next = row.nextElementSibling, prev = row.previousElementSibling;
        if (isRow(next) && off > next.offsetHeight / 2) {
          s.y += next.offsetHeight; off -= next.offsetHeight;
          s.pending = { el: next, dir: "down" };
          o.onCross(row, next, "down");
        } else if (isRow(prev) && off < -prev.offsetHeight / 2) {
          s.y -= prev.offsetHeight; off += prev.offsetHeight;
          s.pending = { el: prev, dir: "up" };
          o.onCross(row, prev, "up");
        }
      }
      row.style.transform = `translateY(${off}px)`;
      return true;
    }
    return false;
  };

  const end = () => {
    const s = st;
    st = null;
    if (!s) return;
    if (s.timer) clearTimeout(s.timer);
    if (s.mode === "swipe") {
      const w = o.actionsWidth(s.row);
      const open = s.dx < -w / 2;
      setX(s.row, open ? -w : 0, true);
      if (open) { openRow = s.row; s.row.classList.add("swiped"); }
      else { s.row.classList.remove("swiped"); if (openRow === s.row) openRow = null; }
    } else if (s.mode === "drag") {
      s.row.classList.remove("dragging");
      s.row.style.transform = "";
      o.onDrop?.(s.row);
    }
  };

  const onTouchStart = (e: TouchEvent) => { if (e.touches.length === 1) start(e.target, e.touches[0].clientX, e.touches[0].clientY); };
  const onTouchMove = (e: TouchEvent) => { if (st && e.touches.length === 1 && move(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault(); };
  const onMouseDown = (e: MouseEvent) => { if (e.button === 0) start(e.target, e.clientX, e.clientY); };
  const onMouseMove = (e: MouseEvent) => { if (st && move(e.clientX, e.clientY)) e.preventDefault(); };
  const onClickCapture = (e: MouseEvent) => {
    const row = rowOf(e.target);
    if (suppress) { suppress = false; e.preventDefault(); e.stopPropagation(); return; }
    if (openRow && !(row === openRow && (e.target as Element).closest?.(".row-actions"))) { close(); e.preventDefault(); e.stopPropagation(); }
  };
  const onContext = (e: Event) => { if (rowOf(e.target)) e.preventDefault(); };
  const onDocDown = (e: Event) => { if (openRow && !openRow.contains(e.target as Node)) close(); };

  list.addEventListener("touchstart", onTouchStart, { passive: true });
  list.addEventListener("touchmove", onTouchMove, { passive: false });
  list.addEventListener("touchend", end);
  list.addEventListener("touchcancel", end);
  list.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", end);
  list.addEventListener("click", onClickCapture, true);
  list.addEventListener("contextmenu", onContext);
  document.addEventListener("touchstart", onDocDown, { passive: true });
  document.addEventListener("mousedown", onDocDown);
  return () => {
    list.removeEventListener("touchstart", onTouchStart);
    list.removeEventListener("touchmove", onTouchMove);
    list.removeEventListener("touchend", end);
    list.removeEventListener("touchcancel", end);
    list.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", end);
    list.removeEventListener("click", onClickCapture, true);
    list.removeEventListener("contextmenu", onContext);
    document.removeEventListener("touchstart", onDocDown);
    document.removeEventListener("mousedown", onDocDown);
  };
}
