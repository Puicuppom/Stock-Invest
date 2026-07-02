import { getYahooAuth, USER_AGENT } from "./yahoo-auth";
import type { FairValueData } from "./types";

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
        targetLowPrice?: YahooRaw;
        targetHighPrice?: YahooRaw;
      };
      defaultKeyStatistics?: {
        trailingEps?: YahooRaw;
        forwardEps?: YahooRaw;
      };
      summaryDetail?: {
        trailingPE?: YahooRaw;
        forwardPE?: YahooRaw;
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

    return {
      analyst: num(row.financialData?.targetMeanPrice),
      analystLow: num(row.financialData?.targetLowPrice),
      analystHigh: num(row.financialData?.targetHighPrice),
      trailingEps: num(row.defaultKeyStatistics?.trailingEps),
      forwardEps: num(row.defaultKeyStatistics?.forwardEps),
      trailingPE: num(row.summaryDetail?.trailingPE),
      forwardPE: num(row.summaryDetail?.forwardPE),
      fiftyTwoWeekHigh: num(row.summaryDetail?.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: num(row.summaryDetail?.fiftyTwoWeekLow),
    };
  } catch {
    return null;
  }
}

const BASE_PE: Record<"TH" | "US", number> = {
  US: 18,
  TH: 14,
};

/** Supplementary reference only — Forward EPS × blended fair P/E */
function peReference(
  market: "TH" | "US",
  data: FairValueData
): number | null {
  const eps = data.forwardEps ?? data.trailingEps;
  if (eps == null || eps <= 0) return null;

  const trailingPE = data.trailingPE;
  const base = BASE_PE[market];
  const fairPE =
    trailingPE != null && trailingPE > 0
      ? Math.min(45, Math.max(8, (base + trailingPE * 0.65) / 2))
      : base;

  return eps * fairPE;
}

function upsidePercent(
  target: number | null,
  currentPrice: number
): number | null {
  if (target == null || currentPrice <= 0) return null;
  return ((target - currentPrice) / currentPrice) * 100;
}

function verdictFromUpside(
  upside: number | null
): "undervalued" | "fair" | "overvalued" | "unknown" {
  if (upside == null) return "unknown";
  if (upside > 10) return "undervalued";
  if (upside < -10) return "overvalued";
  return "fair";
}

export function calculateFairValue(
  market: "TH" | "US",
  currentPrice: number,
  data: FairValueData | null
): {
  fairValue: number | null;
  fairValueLow: number | null;
  fairValueHigh: number | null;
  peReference: number | null;
  upsidePercent: number | null;
  upsideLowPercent: number | null;
  upsideHighPercent: number | null;
  verdict: "undervalued" | "fair" | "overvalued" | "unknown";
  analystRange: { low: number; high: number } | null;
  range52w: { low: number; high: number } | null;
  forwardEps: number | null;
  source: "analyst" | "pe-fallback" | "unknown";
} {
  if (!data) {
    return {
      fairValue: null,
      fairValueLow: null,
      fairValueHigh: null,
      peReference: null,
      upsidePercent: null,
      upsideLowPercent: null,
      upsideHighPercent: null,
      verdict: "unknown",
      analystRange: null,
      range52w: null,
      forwardEps: null,
      source: "unknown",
    };
  }

  const peRef = peReference(market, data);
  const hasAnalyst = data.analyst != null && data.analyst > 0;

  const fairValue = hasAnalyst ? data.analyst : peRef;
  const fairValueLow =
    data.analystLow != null && data.analystLow > 0
      ? data.analystLow
      : hasAnalyst
        ? data.analyst! * 0.85
        : null;
  const fairValueHigh =
    data.analystHigh != null && data.analystHigh > 0
      ? data.analystHigh
      : hasAnalyst
        ? data.analyst! * 1.15
        : null;

  const analystRange =
    fairValueLow != null &&
    fairValueHigh != null &&
    fairValueLow > 0 &&
    fairValueHigh > 0
      ? {
          low: Math.min(fairValueLow, fairValueHigh),
          high: Math.max(fairValueLow, fairValueHigh),
        }
      : null;

  const upside = upsidePercent(fairValue, currentPrice);
  const range52w =
    data.fiftyTwoWeekLow != null && data.fiftyTwoWeekHigh != null
      ? { low: data.fiftyTwoWeekLow, high: data.fiftyTwoWeekHigh }
      : null;

  return {
    fairValue,
    fairValueLow,
    fairValueHigh,
    peReference: peRef,
    upsidePercent: upside,
    upsideLowPercent: upsidePercent(fairValueLow, currentPrice),
    upsideHighPercent: upsidePercent(fairValueHigh, currentPrice),
    verdict: verdictFromUpside(upside),
    analystRange,
    range52w,
    forwardEps: data.forwardEps,
    source: hasAnalyst ? "analyst" : peRef != null ? "pe-fallback" : "unknown",
  };
}
