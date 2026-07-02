import { getYahooAuth, USER_AGENT } from "./yahoo-auth";
import type { FairValueData, FairValueModels } from "./types";

export const revalidate = 900;

interface YahooRaw {
  raw?: number;
  fmt?: string;
}

interface QuoteSummaryResponse {
  quoteSummary?: {
    result?: Array<{
      financialData?: {
        targetMeanPrice?: YahooRaw;
        currentPrice?: YahooRaw;
      };
      defaultKeyStatistics?: {
        trailingEps?: YahooRaw;
        bookValue?: YahooRaw;
      };
      summaryDetail?: {
        trailingPE?: YahooRaw;
        previousClose?: YahooRaw;
        fiftyTwoWeekHigh?: YahooRaw;
        fiftyTwoWeekLow?: YahooRaw;
      };
    }>;
    error?: { description?: string };
  };
}

function num(value?: YahooRaw): number | null {
  if (value?.raw == null || Number.isNaN(value.raw)) return null;
  return value.raw;
}

export async function fetchFundamentals(
  resolvedSymbol: string
): Promise<FairValueData | null> {
  try {
    const { cookie, crumb } = await getYahooAuth();
    const url = new URL(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(resolvedSymbol)}`
    );
    url.searchParams.set(
      "modules",
      "financialData,defaultKeyStatistics,summaryDetail"
    );
    url.searchParams.set("crumb", crumb);

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: cookie,
      },
      next: { revalidate },
    });

    if (!res.ok) {
      return null;
    }

    const json = (await res.json()) as QuoteSummaryResponse;
    const row = json.quoteSummary?.result?.[0];
    if (!row) return null;

    const analyst = num(row.financialData?.targetMeanPrice);
    const trailingEps = num(row.defaultKeyStatistics?.trailingEps);
    const bookValue = num(row.defaultKeyStatistics?.bookValue);
    const trailingPE = num(row.summaryDetail?.trailingPE);
    const currentPrice =
      num(row.financialData?.currentPrice) ??
      num(row.summaryDetail?.previousClose);
    const fiftyTwoWeekHigh = num(row.summaryDetail?.fiftyTwoWeekHigh);
    const fiftyTwoWeekLow = num(row.summaryDetail?.fiftyTwoWeekLow);

    return {
      currentPrice,
      analyst,
      trailingEps,
      bookValue,
      trailingPE,
      fiftyTwoWeekHigh,
      fiftyTwoWeekLow,
    };
  } catch {
    return null;
  }
}

const FAIR_PE: Record<"TH" | "US", number> = {
  US: 16,
  TH: 14,
};

const FAIR_PB: Record<"TH" | "US", number> = {
  US: 2.0,
  TH: 1.5,
};

export function calculateFairValue(
  market: "TH" | "US",
  currentPrice: number,
  data: FairValueData | null
): {
  fairValue: number | null;
  upsidePercent: number | null;
  verdict: "undervalued" | "fair" | "overvalued" | "unknown";
  models: FairValueModels;
  range52w: { low: number; high: number } | null;
} {
  const models: FairValueModels = {
    analyst: null,
    pe: null,
    pb: null,
  };

  if (!data) {
    return {
      fairValue: null,
      upsidePercent: null,
      verdict: "unknown",
      models,
      range52w: null,
    };
  }

  if (data.analyst != null && data.analyst > 0) {
    models.analyst = data.analyst;
  }

  if (data.trailingEps != null && data.trailingEps > 0) {
    models.pe = data.trailingEps * FAIR_PE[market];
  }

  if (data.bookValue != null && data.bookValue > 0) {
    models.pb = data.bookValue * FAIR_PB[market];
  }

  const values = [models.analyst, models.pe, models.pb].filter(
    (value): value is number => value != null && value > 0
  );

  const fairValue =
    values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;

  const upsidePercent =
    fairValue != null && currentPrice > 0
      ? ((fairValue - currentPrice) / currentPrice) * 100
      : null;

  let verdict: "undervalued" | "fair" | "overvalued" | "unknown" = "unknown";
  if (upsidePercent != null) {
    if (upsidePercent > 10) verdict = "undervalued";
    else if (upsidePercent < -10) verdict = "overvalued";
    else verdict = "fair";
  }

  const range52w =
    data.fiftyTwoWeekLow != null && data.fiftyTwoWeekHigh != null
      ? { low: data.fiftyTwoWeekLow, high: data.fiftyTwoWeekHigh }
      : null;

  return {
    fairValue,
    upsidePercent,
    verdict,
    models,
    range52w,
  };
}
