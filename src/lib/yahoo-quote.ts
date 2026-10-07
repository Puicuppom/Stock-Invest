import { getYahooAuth, USER_AGENT } from "./yahoo-auth";

export const revalidate = 900;

interface V7QuoteRow {
  dividendYield?: number;
  trailingAnnualDividendRate?: number;
  trailingAnnualDividendYield?: number;
  regularMarketPrice?: number;
}

interface V7QuoteResponse {
  quoteResponse?: {
    result?: V7QuoteRow[];
  };
}

export interface YahooDividendFields {
  dividendYield: number | null;
  dividendRate: number | null;
}

/** v7 quote — Yahoo fills ETF distributions here when quoteSummary is empty */
export async function fetchYahooQuoteDividends(
  resolvedSymbol: string
): Promise<YahooDividendFields | null> {
  try {
    const { cookie, crumb } = await getYahooAuth();
    const url = new URL("https://query1.finance.yahoo.com/v7/finance/quote");
    url.searchParams.set("symbols", resolvedSymbol);
    url.searchParams.set("crumb", crumb);

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: cookie,
      },
      next: { revalidate },
    });

    if (!res.ok) return null;

    const json = (await res.json()) as V7QuoteResponse;
    const row = json.quoteResponse?.result?.[0];
    if (!row) return null;

    return normalizeV7Dividends(row);
  } catch {
    return null;
  }
}

function normalizeV7Dividends(row: V7QuoteRow): YahooDividendFields | null {
  const price = row.regularMarketPrice ?? 0;
  let dividendYield: number | null = null;

  if (
    row.trailingAnnualDividendYield != null &&
    row.trailingAnnualDividendYield > 0
  ) {
    dividendYield = row.trailingAnnualDividendYield;
  } else if (row.dividendYield != null && row.dividendYield > 0) {
    // v7 returns percent (e.g. 2.52); quoteSummary uses decimal (0.0252)
    dividendYield =
      row.dividendYield >= 0.2 ? row.dividendYield / 100 : row.dividendYield;
  }

  let dividendRate: number | null = null;
  if (
    row.trailingAnnualDividendRate != null &&
    row.trailingAnnualDividendRate > 0
  ) {
    dividendRate = row.trailingAnnualDividendRate;
  } else if (dividendYield != null && price > 0) {
    dividendRate = price * dividendYield;
  }

  if (dividendYield == null && dividendRate == null) return null;

  return { dividendYield, dividendRate };
}

/** ราคานอกเวลาทำการ (หุ้นสหรัฐ) — เทียบกับราคาปิดของช่วงปกติล่าสุด */
export interface ExtendedQuote {
  session: "pre" | "post";
  price: number;
  changePercent: number;
  /** unix วินาที */
  time: number;
}

interface V7ExtRow {
  marketState?: string;
  regularMarketPrice?: number;
  regularMarketTime?: number;
  preMarketPrice?: number;
  preMarketTime?: number;
  postMarketPrice?: number;
  postMarketTime?: number;
}

export async function fetchExtendedQuote(resolvedSymbol: string): Promise<ExtendedQuote | null> {
  try {
    const { cookie, crumb } = await getYahooAuth();
    const url = new URL("https://query1.finance.yahoo.com/v7/finance/quote");
    url.searchParams.set("symbols", resolvedSymbol);
    url.searchParams.set("crumb", crumb);
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT, Cookie: cookie },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const row = ((await res.json()) as { quoteResponse?: { result?: V7ExtRow[] } }).quoteResponse?.result?.[0];
    return row ? pickExtended(row) : null;
  } catch {
    return null;
  }
}

export function pickExtended(row: V7ExtRow, nowSec = Date.now() / 1000): ExtendedQuote | null {
  const base = row.regularMarketPrice, baseTime = row.regularMarketTime ?? 0;
  if (!base || base <= 0) return null;
  const state = row.marketState ?? "";
  if (state === "REGULAR") return null;
  const make = (session: "pre" | "post", price?: number, time?: number): ExtendedQuote | null =>
    price != null && price > 0 && time != null && time > baseTime && nowSec - time < 16 * 3600
      ? { session, price, changePercent: (price / base - 1) * 100, time }
      : null;
  if (state.startsWith("PRE")) return make("pre", row.preMarketPrice, row.preMarketTime) ?? make("post", row.postMarketPrice, row.postMarketTime);
  return make("post", row.postMarketPrice, row.postMarketTime);
}
