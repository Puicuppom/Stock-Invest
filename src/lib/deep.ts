import { getYahooAuth, USER_AGENT } from "./yahoo-auth";
import type { CompanyInfo } from "./financials";
import type { HistoricalPE } from "./historical-valuation";
import type { Candle } from "./types";

/** ข้อมูลเชิงลึกในแท็บพื้นฐาน: ช่วง P/E ย้อนหลัง · งบ 4 ไตรมาส · ประวัติปันผล · P/S */
export interface EarningsQuarter { quarter: string; actual: number | null; estimate: number | null; surprisePercent: number | null }
export interface DividendYear { year: string; total: number; partial?: boolean }
export interface DeepInfo {
  pe: { series: { date: string; pe: number }[]; low: number; median: number; high: number; years: number; current: number | null } | null;
  earnings: EarningsQuarter[];
  dividends: { years: DividendYear[]; growthStreak: number; cagr5: number | null; currency: string | null } | null;
  ps: { current: number | null; history: { year: string; ps: number }[]; median: number | null; revenueGrowthPercent: number | null } | null;
}

type Raw = { raw?: number } | number | null | undefined;
const val = (v: Raw) => { const n = typeof v === "number" ? v : v?.raw; return n != null && Number.isFinite(n) ? n : null; };
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export async function fetchEarningsHistory(symbol: string): Promise<EarningsQuarter[]> {
  try {
    const { cookie, crumb } = await getYahooAuth();
    const url = new URL(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`);
    url.searchParams.set("modules", "earningsHistory");
    url.searchParams.set("crumb", crumb);
    const res = await fetch(url.toString(), { headers: { "User-Agent": USER_AGENT, Cookie: cookie }, next: { revalidate: 21600 }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const rows = (await res.json()).quoteSummary?.result?.[0]?.earningsHistory?.history ?? [];
    return (rows as { quarter?: Raw; epsActual?: Raw; epsEstimate?: Raw; surprisePercent?: Raw }[])
      .map(r => {
        const q = val(r.quarter);
        const actual = val(r.epsActual), estimate = val(r.epsEstimate), sp = val(r.surprisePercent);
        return { quarter: q ? new Date(q * 1000).toISOString().slice(0, 10) : "", actual, estimate,
          surprisePercent: sp != null ? sp * 100 : actual != null && estimate ? ((actual - estimate) / Math.abs(estimate)) * 100 : null };
      })
      .filter(r => r.quarter && r.actual != null)
      .sort((a, b) => a.quarter.localeCompare(b.quarter))
      .slice(-4);
  } catch { return []; }
}

export async function fetchDividendHistory(symbol: string): Promise<{ date: string; amount: number }[]> {
  try {
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    url.searchParams.set("range", "10y"); url.searchParams.set("interval", "1mo"); url.searchParams.set("events", "div");
    const res = await fetch(url.toString(), { headers: { "User-Agent": USER_AGENT }, next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const divs = (await res.json()).chart?.result?.[0]?.events?.dividends ?? {};
    return Object.values(divs as Record<string, { amount?: number; date?: number }>)
      .filter(d => d.amount && d.date).map(d => ({ date: new Date(d.date! * 1000).toISOString().slice(0, 10), amount: d.amount! }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch { return []; }
}

export function summarizeDividends(rows: { date: string; amount: number }[], currency: string | null, today = new Date()): DeepInfo["dividends"] {
  if (!rows.length) return null;
  const byYear = new Map<string, number>();
  for (const r of rows) byYear.set(r.date.slice(0, 4), (byYear.get(r.date.slice(0, 4)) ?? 0) + r.amount);
  const thisYear = String(today.getUTCFullYear());
  const years: DividendYear[] = [...byYear.entries()].sort().map(([year, total]) => ({ year, total, ...(year === thisYear ? { partial: true } : {}) }));
  const full = years.filter(y => !y.partial);
  // ปีติดกันที่ปันผลรวมไม่ลดลง (นับย้อนจากปีล่าสุดที่ครบปี)
  let streak = 0;
  for (let i = full.length - 1; i > 0 && full[i].total >= full[i - 1].total * 0.995; i--) streak++;
  const last = full.at(-1), base = full.at(-6);
  const cagr5 = last && base && base.total > 0 && full.length >= 6 ? (Math.pow(last.total / base.total, 1 / 5) - 1) * 100 : null;
  return { years: years.slice(-10), growthStreak: streak, cagr5, currency };
}

/** P/S โดยประมาณย้อนหลัง: ราคาปิดสิ้นปีงบ × จำนวนหุ้นปัจจุบัน ÷ รายได้ปีนั้น */
export function priceToSales(candles: Candle[], company: CompanyInfo | null | undefined, shares: number | null, revenuePerShare: number | null, price: number, revenueGrowth: number | null): DeepInfo["ps"] {
  const current = revenuePerShare && revenuePerShare > 0 ? price / revenuePerShare : null;
  const history: { year: string; ps: number }[] = [];
  if (company?.revenue.length && shares && shares > 0) {
    for (const r of company.revenue) {
      if (!(r.value > 0)) continue;
      const y = r.year.slice(0, 4);
      const close = [...candles].reverse().find(c => c.date.slice(0, 4) === y)?.close;
      if (close) history.push({ year: y, ps: (close * shares) / r.value });
    }
  }
  if (current == null && !history.length) return null;
  return { current, history, median: median(history.map(h => h.ps)), revenueGrowthPercent: revenueGrowth != null ? revenueGrowth * 100 : null };
}

export function peHistory(h: HistoricalPE | null | undefined, current: number | null): DeepInfo["pe"] {
  if (!h || !h.series?.length) return null;
  return { series: h.series, low: h.low, median: h.median, high: h.high, years: h.years, current: current != null && current > 0 ? current : null };
}
