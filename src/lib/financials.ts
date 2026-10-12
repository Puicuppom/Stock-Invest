import { getYahooAuth, USER_AGENT } from "./yahoo-auth";

/** ข้อมูลธุรกิจ + งบการเงินรายปีแบบย่อ */
export interface YearValue { year: string; value: number }
export interface CompanyInfo {
  summary: string | null;
  sector: string | null;
  industry: string | null;
  employees: number | null;
  website: string | null;
  currency: string | null;
  revenue: YearValue[];
  netIncome: YearValue[];
  fcf: YearValue[];
  cash: number | null;
  debt: number | null;
}

const TYPES = {
  revenue: "annualTotalRevenue",
  netIncome: "annualNetIncome",
  fcf: "annualFreeCashFlow",
  cash: "annualCashCashEquivalentsAndShortTermInvestments",
  debt: "annualTotalDebt",
} as const;

interface TsRow { asOfDate?: string; currencyCode?: string; reportedValue?: { raw?: number } }

async function fetchTimeseries(symbol: string) {
  const now = Math.floor(Date.now() / 1000);
  const query = new URLSearchParams({ type: Object.values(TYPES).join(","), period1: String(now - 6 * 366 * 86400), period2: String(now) });
  const res = await fetch(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?${query}`,
    { next: { revalidate: 86400 }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  const json = await res.json();
  const results: Array<Record<string, unknown> & { meta?: { type?: string[] } }> = json.timeseries?.result ?? [];
  const pick = (type: string) => {
    const r = results.find(x => x.meta?.type?.includes(type));
    const rows = ((r?.[type] as TsRow[] | undefined) ?? []).filter(x => x && x.asOfDate && Number.isFinite(x.reportedValue?.raw));
    return rows.map(x => ({ year: x.asOfDate!.slice(0, 4), value: x.reportedValue!.raw!, currency: x.currencyCode ?? null }))
      .sort((a, b) => a.year.localeCompare(b.year)).slice(-4);
  };
  return { revenue: pick(TYPES.revenue), netIncome: pick(TYPES.netIncome), fcf: pick(TYPES.fcf), cash: pick(TYPES.cash), debt: pick(TYPES.debt) };
}

async function fetchProfile(symbol: string) {
  try {
    const { cookie, crumb } = await getYahooAuth();
    const url = new URL(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`);
    url.searchParams.set("modules", "assetProfile");
    url.searchParams.set("crumb", crumb);
    const res = await fetch(url.toString(), { headers: { "User-Agent": USER_AGENT, Cookie: cookie }, next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const p = (await res.json()).quoteSummary?.result?.[0]?.assetProfile;
    return p ?? null;
  } catch { return null; }
}

export async function fetchCompanyInfo(symbol: string): Promise<CompanyInfo | null> {
  try {
    const [ts, p] = await Promise.all([fetchTimeseries(symbol).catch(() => null), fetchProfile(symbol)]);
    if (!ts && !p) return null;
    const strip = (rows: { year: string; value: number }[] | undefined) => (rows ?? []).map(({ year, value }) => ({ year, value }));
    const currency = ts?.revenue.at(-1)?.currency ?? ts?.netIncome.at(-1)?.currency ?? null;
    return {
      summary: typeof p?.longBusinessSummary === "string" ? p.longBusinessSummary : null,
      sector: p?.sector ?? null,
      industry: p?.industry ?? null,
      employees: Number.isFinite(p?.fullTimeEmployees) ? p.fullTimeEmployees : null,
      website: typeof p?.website === "string" && /^https?:\/\//.test(p.website) ? p.website : null,
      currency,
      revenue: strip(ts?.revenue), netIncome: strip(ts?.netIncome), fcf: strip(ts?.fcf),
      cash: ts?.cash.at(-1)?.value ?? null,
      debt: ts?.debt.at(-1)?.value ?? null,
    };
  } catch { return null; }
}

export type CheckState = "yes" | "partial" | "no" | "na";
export interface FinCheck { label: string; state: CheckState; detail: string }

const pct = (a: number, b: number) => (b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null);

/** สรุปงบเป็นคำง่าย ๆ */
export function financialChecks(c: CompanyInfo): FinCheck[] {
  const out: FinCheck[] = [];
  const r = c.revenue, n = c.netIncome, f = c.fcf;
  if (r.length >= 2) {
    const ups = r.slice(1).filter((x, i) => x.value > r[i].value).length;
    const g = pct(r.at(-1)!.value, r[0].value);
    out.push({ label: "รายได้โต", state: ups === r.length - 1 ? "yes" : ups >= (r.length - 1) / 2 ? "partial" : "no",
      detail: `รายได้เพิ่ม ${ups} จาก ${r.length - 1} ปี${g != null ? ` · ${r[0].year}→${r.at(-1)!.year} ${g >= 0 ? "+" : ""}${g.toFixed(0)}%` : ""}` });
  } else out.push({ label: "รายได้โต", state: "na", detail: "ไม่มีข้อมูลรายได้หลายปี" });
  if (n.length >= 2) {
    const last = n.at(-1)!.value, prev = n.at(-2)!.value;
    out.push({ label: "กำไรเพิ่ม", state: last <= 0 ? "no" : last > prev ? "yes" : last > prev * 0.9 ? "partial" : "no",
      detail: last <= 0 ? "ปีล่าสุดขาดทุน" : `กำไรปีล่าสุด ${last > prev ? "เพิ่ม" : "ลด"} ${Math.abs(pct(last, prev) ?? 0).toFixed(0)}% จากปีก่อน` });
  } else out.push({ label: "กำไรเพิ่ม", state: "na", detail: "ไม่มีข้อมูลกำไรหลายปี" });
  const margin = (i: number) => {
    const rev = r.find(x => x.year === n[i]?.year);
    return rev && rev.value > 0 ? (n[i].value / rev.value) * 100 : null;
  };
  const m1 = n.length ? margin(n.length - 1) : null, m0 = n.length >= 2 ? margin(n.length - 2) : null;
  out.push(m1 != null && m0 != null
    ? { label: "อัตรากำไรดีขึ้น", state: m1 >= m0 ? "yes" : m1 >= m0 - 2 ? "partial" : "no", detail: `อัตรากำไรสุทธิ ${m0.toFixed(1)}% → ${m1.toFixed(1)}%` }
    : { label: "อัตรากำไรดีขึ้น", state: "na", detail: "ข้อมูลไม่พอ" });
  const fl = f.at(-1), nl = n.at(-1);
  out.push(fl && nl && nl.value > 0
    ? { label: "กำไรเป็นเงินสด", state: fl.value >= nl.value * 0.8 ? "yes" : fl.value > 0 ? "partial" : "no",
        detail: `เงินสดอิสระ ${(fl.value / nl.value * 100).toFixed(0)}% ของกำไร${fl.value < nl.value * 0.8 ? " · กำไรยังไม่กลายเป็นเงินสดเต็มที่" : ""}` }
    : { label: "กำไรเป็นเงินสด", state: "na", detail: "ข้อมูลไม่พอ" });
  out.push(c.cash != null && c.debt != null
    ? { label: "เงินสด > หนี้", state: c.cash >= c.debt ? "yes" : c.cash >= c.debt * 0.5 ? "partial" : "no", detail: c.debt <= 0 ? "ไม่มีหนี้" : `เงินสด ${(c.cash / c.debt).toFixed(1)} เท่าของหนี้` }
    : { label: "เงินสด > หนี้", state: "na", detail: "ไม่มีข้อมูลเงินสด/หนี้" });
  return out;
}
