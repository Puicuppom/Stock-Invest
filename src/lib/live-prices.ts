/* ราคาสดชุดเดียวทั้งเว็บ (ฝั่ง React) — โปรโตคอลเดียวกับ /public/live-prices.js ที่หน้าปรับพอร์ตใช้
 * หน้าไหนดึงราคามาก็ publishPrices() → ทุกหน้า (รวม iframe ปรับพอร์ต) ได้ราคาเดียวกันทันที */
import type { ExtendedQuote } from "./yahoo-quote";

export type LivePrice = { price: number; changePercent: number; ext?: ExtendedQuote | null; marketState?: string | null; name?: string | null; at: number };
type Map_ = Record<string, LivePrice>;

const KEY = "livePrices:v1", CH = "investpui-live";
let mem: Map_ | null = null;
let bc: BroadcastChannel | null = null;
let saveT = 0;
const subs = new Set<(changed: Map_) => void>();

export const priceKey = (id: string) => {
  const [s, m] = id.split("::");
  return `${s.toUpperCase().replace(/\.BK$/, "")}::${m || "US"}`;
};
function load(): Map_ {
  if (mem) return mem;
  try { mem = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { mem = {}; }
  return mem!;
}
function save() {
  window.clearTimeout(saveT);
  saveT = window.setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* ignore */ } }, 400);
}
function apply(q: Record<string, Partial<LivePrice>> | null | undefined, broadcast: boolean) {
  if (!q) return;
  const m = load(), changed: Map_ = {};
  for (const [id, v] of Object.entries(q)) {
    if (!v || !(Number(v.price) > 0)) continue;
    const k = priceKey(id), at = v.at ?? Date.now();
    if (m[k] && m[k].at > at) continue;
    m[k] = { ...m[k], ...v, at } as LivePrice;
    changed[k] = m[k];
  }
  if (!Object.keys(changed).length) return;
  save();
  subs.forEach(f => f(changed));
  if (broadcast) chan()?.postMessage({ quotes: changed });
}
function chan() {
  if (!bc && typeof BroadcastChannel !== "undefined") {
    try { bc = new BroadcastChannel(CH); bc.onmessage = e => apply(e.data?.quotes, false); } catch { bc = null; }
  }
  return bc;
}
export function publishPrices(q: Record<string, Partial<LivePrice>> | null | undefined) { chan(); apply(q, true); }
export function getPrices(): Map_ { chan(); return load(); }
export function subscribePrices(fn: (changed: Map_) => void) { chan(); subs.add(fn); return () => { subs.delete(fn); }; }
