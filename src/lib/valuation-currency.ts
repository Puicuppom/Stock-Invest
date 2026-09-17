import type { FairValueData } from "./types";

export interface FxQuote { rate: number; timestamp: number }

// ASML's Nasdaq and Amsterdam registrations represent the same ordinary share.
// https://www.asml.com/en/investors/shares
// Do not extend this mapping to ADRs without verifying the depositary ratio.
export const PRIMARY_LISTINGS: Record<string, { symbol: string; currency: string; quote: string; ordinaryPerListed?: number }> = {
  // Issuer confirms one ADR represents one B share: https://www.novonordisk.com/investors/stock-information/dividend.html
  // https://investor.tsmc.com/english/faq — one ADS represents five ordinary shares.
  TSM: { symbol: "2330.TW", currency: "TWD", quote: "USD", ordinaryPerListed: 5 },
  NVO: { symbol: "NOVO-B.CO", currency: "DKK", quote: "USD" },
  ASML: { symbol: "ASML.AS", currency: "EUR", quote: "USD" },
};

export function convertPrimaryFundamentals(
  primary: FairValueData,
  listed: FairValueData,
  fx: FxQuote,
  now = Date.now(),
  mapping = PRIMARY_LISTINGS.ASML,
): FairValueData | null {
  if (primary.financialCurrency !== mapping.currency || primary.quoteCurrency !== mapping.currency || listed.quoteCurrency !== mapping.quote) return null;
  if (!Number.isFinite(fx.rate) || fx.rate <= 0 || !Number.isFinite(fx.timestamp) || fx.timestamp * 1000 > now + 300000 || now - fx.timestamp * 1000 > 7 * 86400000) return null;
  // Reject stale/inconsistent share counts instead of silently assuming a ratio.
  const ratio = mapping.ordinaryPerListed ?? 1;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  const a = primary.sharesOutstanding;
  const b = listed.sharesOutstanding;
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0 || Math.min(Math.abs(a / b - 1), Math.abs(a / b / ratio - 1)) > 0.02) return null;
  const converted: FairValueData = { ...primary, financialCurrency: mapping.quote, quoteCurrency: mapping.quote };
  const moneyFields = ["trailingEps", "forwardEps", "totalDebt", "totalCash", "freeCashflow", "operatingCashflow", "ebitda", "revenuePerShare", "bookValue", "enterpriseValue", "marketCap", "dividendRate"] as const;
  for (const key of moneyFields) {
    const value = primary[key];
    converted[key] = value != null && Number.isFinite(value) ? value * fx.rate * (["trailingEps", "forwardEps", "revenuePerShare", "bookValue", "dividendRate"].includes(key) ? ratio : 1) : null;
  }
  converted.bookValueVerified = false; // Cross-listing P/B and BVPS require a separate unit check.
  converted.sharesOutstanding = a / ratio;
  // These are observations/estimates for the actual US listing, already in USD.
  for (const key of ["analyst", "analystLow", "analystHigh", "fiftyTwoWeekHigh", "fiftyTwoWeekLow", "trailingPE", "forwardPE", "priceToBook", "marketCap", "enterpriseValue", "dividendYield"] as const) converted[key] = listed[key];
  converted.normalizationNotes = ["ใช้งบและ EPS จาก " + mapping.symbol + " (1 หน่วยซื้อขาย = " + ratio + " หุ้นต้นทาง) แปลง " + mapping.currency + " → " + mapping.quote + " ที่ " + fx.rate.toFixed(4) + " ณ " + new Date(fx.timestamp * 1000).toISOString().slice(0, 10) + " UTC จาก Yahoo Finance; ใช้ FX ล่าสุด ไม่ใช่อัตราเฉลี่ยของงวดงบ"];
  if (mapping.symbol === "NOVO-B.CO") {
    // Yahoo share counts may cover only B shares; EV must include A and B capital.
    converted.sharesOutstanding = null;
    converted.normalizationNotes.push("NVO งด EV/EBITDA เพราะยังไม่ยืนยันจำนวนหุ้นรวม A+B ใช้ EPS ต่อหุ้นสำหรับ P/E");
  }
  return converted;
}

export async function fetchFx(from = "EUR", to = "USD"): Promise<FxQuote | null> {
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return null;
  if (from === to) return {rate: 1, timestamp: Math.floor(Date.now()/1000)};
  const direct = await fetchPair(from, to);
  if (direct) return direct;
  const inverse = await fetchPair(to, from);
  return inverse ? { rate: 1/inverse.rate, timestamp: inverse.timestamp } : null;
}

async function fetchPair(from:string,to:string):Promise<FxQuote|null> {
  try {
    const symbol = from + to + "=X";
    const res = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) + "?interval=1d&range=5d", { next: { revalidate: 900 }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    const row = json.chart?.result?.[0];
    if (row?.meta?.currency !== to || row?.meta?.symbol !== symbol) return null;
    const rate = row.meta.regularMarketPrice;
    const timestamp = row.meta.regularMarketTime;
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(timestamp) || timestamp*1000 > Date.now()+300000 || Date.now()-timestamp*1000 > 7*86400000) return null;
    return {rate,timestamp};
  } catch { return null; }
}
