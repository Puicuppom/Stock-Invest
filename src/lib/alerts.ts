import { getStockData } from "./stock-service";
import { fetchCalendarEvents, daysUntil, thaiShortDate } from "./events";
import { findSrHits } from "./sr-levels";
import { computeTradePlan } from "./trade-plan";
import { atrSeries } from "./indicators";
import { completedCandles } from "./screener";
import { cloudConfig } from "./cloud-store";
import { loadPortfolios, isCash } from "./portfolio-summary";
import { loadPushState, logNote, savePushState, sendToAll, type AlertPrefs, type Note } from "./push";

type Item = { symbol: string; market: "US" | "TH" };
type Alert = Note & { key: string; kind: keyof AlertPrefs; held: boolean };

const MOVE_PCT = 5;          // ขึ้น/ลงแรง ≥ 5% ในวัน
const SR_TOL = 1.5;          // ใกล้แนวรับภายใน 1.5%
const MAX_SINGLE = 5;        // ส่งแยกไม่เกิน 5 อัน ที่เหลือรวมเป็นสรุป

async function watchlistItems(): Promise<Item[]> {
  const c = cloudConfig();
  if (!c) return [];
  const res = await fetch(`${c.url}/rest/v1/watchlists?sync_key=eq.${encodeURIComponent(c.sync)}&select=items&limit=1`, { headers: { ...c.headers, "x-watchlist-key": c.sync }, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!res.ok) return [];
  const rows = await res.json();
  const items = rows?.[0]?.items;
  return Array.isArray(items) ? items.filter((i: Item) => i?.symbol && (i.market === "US" || i.market === "TH")) : [];
}

async function pool<T, R>(list: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) { const k = i++; out[k] = await fn(list[k]); }
  }));
  return out;
}

const money = (n: number, m: "US" | "TH") => (m === "US" ? "$" : "฿") + n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/** ตรวจ Watchlist + หุ้นในพอร์ต แล้วส่งแจ้งเตือนที่ยังไม่เคยส่ง */
export async function runAlerts(opts: { dryRun?: boolean } = {}) {
  const state = await loadPushState();
  if (!state.subs.length && !opts.dryRun) return { checked: 0, alerts: [] as string[], sent: 0, note: "ยังไม่มีเครื่องที่สมัครรับแจ้งเตือน" };

  const [wl, pf] = await Promise.all([watchlistItems(), loadPortfolios().catch(() => ({ pfs: [] as Awaited<ReturnType<typeof loadPortfolios>>["pfs"] }))]);
  const held = new Set<string>();
  const items = new Map<string, Item>();
  for (const p of pf.pfs) if (p.cur === "USD") for (const a of p.assets) if (!isCash(a) && a.name) {
    const sym = String(a.name).toUpperCase();
    const it: Item = /\.BK$/.test(sym) ? { symbol: sym.replace(/\.BK$/, ""), market: "TH" } : { symbol: sym, market: "US" };
    items.set(`${it.symbol}:${it.market}`, it);
    held.add(`${it.symbol}:${it.market}`);
  }
  for (const it of wl) items.set(`${it.symbol.toUpperCase()}:${it.market}`, { symbol: it.symbol.toUpperCase(), market: it.market });
  const list = [...items.values()].slice(0, 60);

  const alerts: Alert[] = [];
  await pool(list, 6, async it => {
    const id = `${it.symbol}:${it.market}`;
    const isHeld = held.has(id);
    const [data, ev] = await Promise.all([
      getStockData(it.symbol, it.market, { screening: true }).catch(() => null),
      fetchCalendarEvents(it.market === "TH" ? `${it.symbol}.BK` : it.symbol, it.market).catch(() => null),
    ]);
    const url = `/?s=${encodeURIComponent(`${it.symbol}::${it.market}`)}`;
    if (ev?.earningsDate) {
      const d = daysUntil(ev.earningsDate, it.market);
      if (d >= 0 && d <= 1) alerts.push({ kind: "earnings", held: isHeld, key: `e:${id}:${ev.earningsDate}`, url, tag: `e-${id}`,
        title: `📊 ${it.symbol} ประกาศงบ${d === 0 ? "วันนี้" : "พรุ่งนี้"}`, body: `${thaiShortDate(ev.earningsDate)}${ev.earningsEstimate ? " (วันที่คาดการณ์)" : ""}${isHeld ? " · หุ้นในพอร์ต" : ""} — ราคาอาจผันผวนแรง` });
    }
    if (ev?.exDividendDate) {
      const d = daysUntil(ev.exDividendDate, it.market);
      if (d >= 0 && d <= 1) alerts.push({ kind: "xd", held: isHeld, key: `x:${id}:${ev.exDividendDate}`, url, tag: `x-${id}`,
        title: `💰 ${it.symbol} ขึ้น XD ${d === 0 ? "วันนี้" : "พรุ่งนี้"}`, body: `${thaiShortDate(ev.exDividendDate)} · ต้องถือก่อนวัน XD ถึงจะได้ปันผล` });
    }
    if (!data || !(data.lastClose > 0)) return;
    const day = data.candles?.[data.candles.length - 1]?.date ?? "";
    const pct = data.changePercent;
    if (Number.isFinite(pct) && Math.abs(pct) >= MOVE_PCT) alerts.push({ kind: "move", held: isHeld, key: `m:${id}:${day}:${pct > 0 ? "u" : "d"}`, url, tag: `m-${id}`,
      title: `${pct > 0 ? "🚀" : "⚠️"} ${it.symbol} ${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`, body: `${pct > 0 ? "ขึ้น" : "ลง"}แรงในวันทำการล่าสุด · ราคา ${money(data.lastClose, it.market)}${isHeld ? " · หุ้นในพอร์ต" : ""}` });
    // จุดตัดขาดทุน / จุดขาย ตามแผนที่เห็นในแอปเมื่อวาน (คิดจากราคาปิดก่อนหน้า) → วันนี้ราคาผ่านเส้นนั้นแล้วหรือยัง
    const done = completedCandles(data);
    const prevClose = data.candles?.[data.candles.length - 2]?.close;
    if (prevClose && prevClose > 0 && done.length > 20) {
      const atr = atrSeries(done).at(-1) ?? null;
      const prev = computeTradePlan(data.pivot, data.zones, prevClose, "swing", 1, data.fairValue, false, atr != null && Number.isFinite(atr) ? atr : null);
      const px = data.lastClose;
      if (prev.stopLoss != null && px < prev.stopLoss && prevClose >= prev.stopLoss) alerts.push({ kind: "plan", held: isHeld, key: `b:${id}:${prev.stopLoss.toFixed(2)}:${day}`, url, tag: `b-${id}`,
        title: `⛔ ${it.symbol} หลุดจุดตัดขาดทุน ${money(prev.stopLoss, it.market)}`, body: `ราคา ${money(px, it.market)}${isHeld ? " · หุ้นในพอร์ต · พิจารณาลดความเสี่ยง" : " · แนวรับเดิมไม่อยู่แล้ว รอฐานใหม่"}` });
      if (isHeld && prev.sellPrice != null && px >= prev.sellPrice && prevClose < prev.sellPrice) alerts.push({ kind: "plan", held: isHeld, key: `t:${id}:${prev.sellPrice.toFixed(2)}:${day}`, url, tag: `t-${id}`,
        title: `💸 ${it.symbol} ถึงจุดขาย ${money(prev.sellPrice, it.market)}`, body: `ราคา ${money(px, it.market)} · ชนแนวต้าน · หุ้นในพอร์ต พิจารณาทยอยขายทำกำไร` });
    }
    const hits = findSrHits(data.pivot, data.zones, data.lastClose, "swing", SR_TOL).filter(h => h.kind === "support");
    const h = hits[0];
    if (h) alerts.push({ kind: "sr", held: isHeld, key: `s:${id}:${h.level.price.toFixed(2)}:${day}`, url, tag: `s-${id}`,
      title: `🎯 ${it.symbol} ใกล้แนวรับ ${money(h.level.price, it.market)}`, body: `ราคา ${money(data.lastClose, it.market)} ห่าง ${Math.abs(h.distancePercent).toFixed(1)}% · จุดน่าทยอยซื้อ ดูสัญญาณก่อนตัดสินใจ` });
  });

  const fresh = alerts.filter(a => !state.sent[a.key]).sort((a, b) => Number(b.held) - Number(a.held));
  if (opts.dryRun) return { checked: list.length, alerts: fresh.map(a => `${a.title} — ${a.body}`), sent: 0 };

  let sent = 0;
  for (const a of fresh.slice(0, MAX_SINGLE)) { sent += await sendToAll(state, a, a.kind); state.sent[a.key] = Date.now(); }
  // เก็บทุกเรื่องลงประวัติ (รวมที่ถูกรวมเป็นสรุป) ให้เปิดดูในแอปได้
  for (const a of fresh) logNote(state, a, a.kind);
  const rest = fresh.slice(MAX_SINGLE);
  if (rest.length) {
    sent += await sendToAll(state, { title: `🔔 อีก ${rest.length} รายการ`, body: rest.map(a => a.title.replace(/^\S+\s/, "")).join(" · ").slice(0, 180), url: "/", tag: "more" });
    for (const a of rest) state.sent[a.key] = Date.now();
  }
  if (fresh.length) await savePushState(state);
  return { checked: list.length, alerts: fresh.map(a => a.title), sent };
}
