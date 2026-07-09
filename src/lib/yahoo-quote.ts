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
