import { computeSummary } from "./portfolio-summary";
import { fetchLiveQuotes } from "./yahoo-quote";
import { readRow, rowKey, writeRow } from "./cloud-store";
import { fetchYahooCandles } from "./chart-service";

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

/** ดัชนี/สินทรัพย์ที่ใช้เทียบ (ใช้ ETF ที่ซื้อได้จริงแทนตัวดัชนี) */
export const BENCHMARKS = [
  { k: "spy", sym: "SPY", name: "S&P 500" },
  { k: "qqq", sym: "QQQ", name: "Nasdaq 100" },
  { k: "dia", sym: "DIA", name: "Dow Jones" },
  { k: "set", sym: "^SET.BK", name: "SET" },
  { k: "gold", sym: "GLD", name: "ทองคำ" },
] as const;

/**
 * ประวัติพอร์ต + ราคาปิดของดัชนีทุกตัว ณ วันที่บันทึก
 * ดึงราคาย้อนหลังจาก Yahoo จึงเทียบดัชนีที่เพิ่มทีหลังได้ตั้งแต่วันแรกที่บันทึก
 * ยอดพอร์ตบันทึกตอนเช้า (หลังตลาดสหรัฐปิด) → ใช้ราคาปิดล่าสุด "ก่อน" วันที่บันทึก
 */
export async function loadHistoryWithBenchmarks() {
  const { days } = await loadHistory();
  if (!days.length) return { days, benchmarks: BENCHMARKS.map(({ k, name }) => ({ k, name })) };
  const ageDays = (Date.now() - Date.parse(days[0].d)) / 86400_000;
  const range = ageDays < 330 ? "1y" : ageDays < 700 ? "2y" : "10y";
  const series = await Promise.all(BENCHMARKS.map(b =>
    fetchYahooCandles(b.sym, "1d", range, false).then(r => r.candles.filter(c => c.close > 0)).catch(() => null)));
  const out = days.map(row => {
    const r: Record<string, unknown> = { ...row };
    BENCHMARKS.forEach((b, i) => {
      const cs = series[i];
      let v: number | null = null;
      if (cs) for (let j = cs.length - 1; j >= 0; j--) if (cs[j].date < row.d) { v = cs[j].close; break; }
      r[b.k] = v ?? (row as Record<string, unknown>)[b.k] ?? null;
    });
    return r;
  });
  return { days: out, benchmarks: BENCHMARKS.map(({ k, name }) => ({ k, name })) };
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
