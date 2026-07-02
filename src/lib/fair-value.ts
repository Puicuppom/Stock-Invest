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
        forwardEps?: YahooRaw;
        bookValue?: YahooRaw;
        priceToBook?: YahooRaw;
      };
      summaryDetail?: {
        trailingPE?: YahooRaw;
        forwardPE?: YahooRaw;
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
    const forwardEps = num(row.defaultKeyStatistics?.forwardEps);
    const bookValue = num(row.defaultKeyStatistics?.bookValue);
    const priceToBook = num(row.defaultKeyStatistics?.priceToBook);
    const trailingPE = num(row.summaryDetail?.trailingPE);
    const forwardPE = num(row.summaryDetail?.forwardPE);
    const currentPrice =
      num(row.financialData?.currentPrice) ??
      num(row.summaryDetail?.previousClose);
    const fiftyTwoWeekHigh = num(row.summaryDetail?.fiftyTwoWeekHigh);
    const fiftyTwoWeekLow = num(row.summaryDetail?.fiftyTwoWeekLow);

    return {
      currentPrice,
      analyst,
      trailingEps,
      forwardEps,
      bookValue,
      trailingPE,
      forwardPE,
      priceToBook,
      fiftyTwoWeekHigh,
      fiftyTwoWeekLow,
    };
  } catch {
    return null;
  }
}

const BASE_PE: Record<"TH" | "US", number> = {
  US: 18,
  TH: 14,
};

const BASE_PB: Record<"TH" | "US", number> = {
  US: 2.5,
  TH: 1.5,
};

/** Blend market baseline with the stock's own multiple (closer to peer-style valuation). */
function fairPE(market: "TH" | "US", trailingPE: number | null): number {
  const base = BASE_PE[market];
  if (trailingPE == null || trailingPE <= 0) return base;
  const blended = (base + trailingPE * 0.65) / 2;
  return Math.min(45, Math.max(8, blended));
}

function fairPB(market: "TH" | "US", priceToBook: number | null): number {
  const base = BASE_PB[market];
  if (priceToBook == null || priceToBook <= 0) return base;
  const blended = (base + priceToBook * 0.5) / 2;
  return Math.min(6, Math.max(0.8, blended));
}

function shouldUsePB(priceToBook: number | null): boolean {
  if (priceToBook == null || priceToBook <= 0) return false;
  // Skip P/B when book value is a poor fit (asset-light tech, deep discount to book).
  return priceToBook >= 0.5 && priceToBook <= 5;
}

interface WeightedValue {
  value: number;
  weight: number;
}

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

  const weighted: WeightedValue[] = [];

  if (data.analyst != null && data.analyst > 0) {
    models.analyst = data.analyst;
    weighted.push({ value: data.analyst, weight: 3 });
  }

  const eps = data.forwardEps ?? data.trailingEps;
  if (eps != null && eps > 0) {
    models.pe = eps * fairPE(market, data.trailingPE);
    weighted.push({ value: models.pe, weight: 2 });
  }

  if (
    data.bookValue != null &&
    data.bookValue > 0 &&
    shouldUsePB(data.priceToBook)
  ) {
    models.pb = data.bookValue * fairPB(market, data.priceToBook);
    weighted.push({ value: models.pb, weight: 1 });
  }

  const fairValue =
    weighted.length > 0
      ? weighted.reduce((sum, item) => sum + item.value * item.weight, 0) /
        weighted.reduce((sum, item) => sum + item.weight, 0)
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
