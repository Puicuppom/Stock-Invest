import { computeSummary } from "./portfolio-summary";
import { fetchLiveQuotes } from "./yahoo-quote";
import { readRow, rowKey, writeRow } from "./cloud-store";

/** บันทึกยอดพอร์ตวันละ 1 แถว (เวลาไทย) + ดัชนีเทียบ (S&P 500 = SPY, SET = ^SET.BK) */
export type DayPf = { v: number; c: number; cash: number; cur: "USD" | "THB" };
export type DayRow = { d: string; usdThb: number | null; pf: Record<string, DayPf>; names?: Record<string, string>; spy: number | null; set: number | null };
export type History = { days: DayRow[] };

export const HISTORY_ROW = () => rowKey("history");
const bkkDate = (t = Date.now()) => new Date(t + 7 * 3600_000).toISOString().slice(0, 10);

export async function loadHistory(): Promise<History> {
  const h = await readRow<History>(HISTORY_ROW());
  return { days: Array.isArray(h?.days) ? h!.days : [] };
}

export async function takeSnapshot() {
  const [summary, idx] = await Promise.all([computeSummary(), fetchLiveQuotes(["SPY", "^SET.BK"]).catch(() => [])]);
  const px = (s: string) => idx.find(q => q.symbol.toUpperCase() === s)?.price ?? null;
  const row: DayRow = {
    d: bkkDate(),
    usdThb: summary.usdThb,
    pf: Object.fromEntries(summary.portfolios.map(p => [p.id, { v: round(p.invested), c: round(p.cost), cash: round(p.cash), cur: p.cur }])),
    names: Object.fromEntries(summary.portfolios.map(p => [p.id, p.name])),
    spy: px("SPY"),
    set: px("^SET.BK"),
  };
  const h = await loadHistory();
  const days = h.days.filter(x => x.d !== row.d);
  days.push(row);
  days.sort((a, b) => a.d.localeCompare(b.d));
  await writeRow(HISTORY_ROW(), { days: days.slice(-3650) });
  return { saved: row.d, rows: days.length, total: summary.total };
}
const round = (n: number) => Math.round(n * 100) / 100;
