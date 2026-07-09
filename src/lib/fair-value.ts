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
      summaryDetail?: {
        trailingPE?: YahooRaw;
        forwardPE?: YahooRaw;
        fiftyTwoWeekHigh?: YahooRaw;
        fiftyTwoWeekLow?: YahooRaw;
        marketCap?: YahooRaw;
        dividendYield?: YahooRaw;
        dividendRate?: YahooRaw;
      };
      financialData?: {
        targetMeanPrice?: YahooRaw;
        targetLowPrice?: YahooRaw;
        targetHighPrice?: YahooRaw;
        freeCashflow?: YahooRaw;
        operatingCashflow?: YahooRaw;
        ebitda?: YahooRaw;
        revenuePerShare?: YahooRaw;
        earningsGrowth?: YahooRaw;
        revenueGrowth?: YahooRaw;
      };
      defaultKeyStatistics?: {
        trailingEps?: YahooRaw;
        forwardEps?: YahooRaw;
        bookValue?: YahooRaw;
        priceToBook?: YahooRaw;
        enterpriseValue?: YahooRaw;
        sharesOutstanding?: YahooRaw;
      };
    }>;
    error?: { description?: string };
  };
}

function num(value?: YahooRaw): number | null {
  if (value?.raw == null || Number.isNaN(value.raw)) return null;
  return value.raw;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
      freeCashflow: num(row.financialData?.freeCashflow),
      operatingCashflow: num(row.financialData?.operatingCashflow),
      ebitda: num(row.financialData?.ebitda),
      revenuePerShare: num(row.financialData?.revenuePerShare),
      earningsGrowth: num(row.financialData?.earningsGrowth),
      revenueGrowth: num(row.financialData?.revenueGrowth),
      bookValue: num(row.defaultKeyStatistics?.bookValue),
      priceToBook: num(row.defaultKeyStatistics?.priceToBook),
      enterpriseValue: num(row.defaultKeyStatistics?.enterpriseValue),
      sharesOutstanding: num(row.defaultKeyStatistics?.sharesOutstanding),
      marketCap: num(row.summaryDetail?.marketCap),
      dividendYield: num(row.summaryDetail?.dividendYield),
      dividendRate: num(row.summaryDetail?.dividendRate),
    };
  } catch {
    return null;
  }
}

const BASE_PE: Record<"TH" | "US", number> = {
  US: 18,
  TH: 14,
};

const BASE_PS: Record<"TH" | "US", number> = {
  US: 5,
  TH: 3.5,
};

/** P/E Multiples — Forward EPS × blended fair P/E (Investing.com style) */
function modelPEMultiples(
  market: "TH" | "US",
  data: FairValueData
): number | null {
  const eps = data.forwardEps ?? data.trailingEps;
  if (eps == null || eps <= 0) return null;

  const trailingPE = data.trailingPE;
  const base = BASE_PE[market];
  const fairPE =
    trailingPE != null && trailingPE > 0
      ? clamp((base + trailingPE * 0.65) / 2, 8, 45)
      : base;

  return eps * fairPE;
}

function modelPETrailing(
  market: "TH" | "US",
  data: FairValueData
): number | null {
  if (data.trailingEps == null || data.trailingEps <= 0) return null;
  const base = BASE_PE[market];
  const ref = data.forwardPE ?? data.trailingPE ?? base;
  const fairPE = clamp((base + ref * 0.75) / 2, 8, 35);
  return data.trailingEps * fairPE;
}

function modelPSMultiples(
  market: "TH" | "US",
  currentPrice: number,
  data: FairValueData
): number | null {
  if (data.revenuePerShare == null || data.revenuePerShare <= 0) return null;
  const currentPS = currentPrice / data.revenuePerShare;
  const base = BASE_PS[market];
  // High P/S names: partial reversion toward fair multiple (avoids extreme low values)
  if (currentPS > 10) {
    const fairPS = clamp((base + currentPS * 0.72) / 2, 4, 18);
    const ratio = clamp(fairPS / currentPS, 0.55, 1.05);
    return currentPrice * ratio;
  }
  const fairPS = clamp((base + currentPS * 0.55) / 2, 2.5, 12);
  return data.revenuePerShare * fairPS;
}

function modelPBMultiples(
  market: "TH" | "US",
  data: FairValueData
): number | null {
  if (data.bookValue == null || data.bookValue <= 0) return null;
  if (
    data.priceToBook != null &&
    (data.priceToBook < 0.5 || data.priceToBook > 15)
  ) {
    return null;
  }
  const base = market === "US" ? 2.5 : 1.5;
  const ptb = data.priceToBook ?? base;
  const fairPB = clamp((base + Math.min(ptb, 8) * 0.45) / 2, 1, 6);
  return data.bookValue * fairPB;
}

function modelEvEbitdaReversion(
  currentPrice: number,
  data: FairValueData
): number | null {
  if (
    data.enterpriseValue == null ||
    data.ebitda == null ||
    data.ebitda <= 0
  ) {
    return null;
  }
  const evEbitda = data.enterpriseValue / data.ebitda;
  if (evEbitda < 8 || evEbitda > 40) return null;
  const fairEvEbitda = clamp((14 + evEbitda * 0.45) / 2, 8, 22);
  const ratio = clamp(fairEvEbitda / evEbitda, 0.65, 1.45);
  return currentPrice * ratio;
}

function modelDcfFcf(
  years: 5 | 10,
  currentPrice: number,
  data: FairValueData
): number | null {
  const shares = data.sharesOutstanding;
  if (shares == null || shares <= 0 || data.freeCashflow == null) return null;
  const fcfPerShare = data.freeCashflow / shares;
  const fcfYield = fcfPerShare / currentPrice;
  if (fcfYield <= 0.005 || fcfYield > 0.12) return null;

  const revGrowth = clamp(data.revenueGrowth ?? 0.08, 0, 0.35);
  const growth =
    years === 5
      ? clamp(revGrowth * 0.4 + 0.05, 0.04, 0.12)
      : clamp(revGrowth * 0.35 + 0.04, 0.03, 0.1);
  const discount = years === 5 ? 0.095 : 0.09;
  const terminal = 0.03;

  let pv = 0;
  let fcf = fcfPerShare;
  for (let year = 1; year <= years; year++) {
    fcf *= 1 + growth;
    pv += fcf / Math.pow(1 + discount, year);
  }
  const terminalValue = (fcf * (1 + terminal)) / (discount - terminal);
  pv += terminalValue / Math.pow(1 + discount, years);
  return pv > 0 ? pv : null;
}

function modelDcfOcf(
  currentPrice: number,
  data: FairValueData
): number | null {
  const shares = data.sharesOutstanding;
  if (shares == null || shares <= 0 || data.operatingCashflow == null) {
    return null;
  }
  const ocfPerShare = data.operatingCashflow / shares;
  const ocfYield = ocfPerShare / currentPrice;
  if (ocfYield <= 0.02 || ocfYield > 0.15) return null;

  const revGrowth = clamp(data.revenueGrowth ?? 0.08, 0, 0.35);
  const growth = clamp(revGrowth * 0.35 + 0.04, 0.03, 0.11);
  const discount = 0.095;
  const terminal = 0.03;
  const years = 5;

  let pv = 0;
  let cash = ocfPerShare * 0.85;
  for (let year = 1; year <= years; year++) {
    cash *= 1 + growth;
    pv += cash / Math.pow(1 + discount, year);
  }
  const terminalValue = (cash * (1 + terminal)) / (discount - terminal);
  pv += terminalValue / Math.pow(1 + discount, years);
  return pv > 0 ? pv : null;
}

function modelDividendStableGrowth(data: FairValueData): number | null {
  if (data.dividendRate == null || data.dividendRate <= 0) return null;
  const revGrowth = clamp(data.revenueGrowth ?? 0.03, 0, 0.08);
  const growth = clamp(revGrowth * 0.5 + 0.025, 0.025, 0.055);
  const requiredReturn = 0.082;
  if (requiredReturn <= growth) return null;
  const value = (data.dividendRate * (1 + growth)) / (requiredReturn - growth);
  return value > 0 && value < 5000 ? value : null;
}

/** Dividend yield reversion — mature dividend payers (KO-style) */
function modelDividendYieldReversion(
  currentPrice: number,
  data: FairValueData
): number | null {
  if (data.dividendRate == null || data.dividendRate <= 0 || currentPrice <= 0) {
    return null;
  }
  const currentYield = data.dividendRate / currentPrice;
  if (currentYield < 0.012 || currentYield > 0.07) return null;
  const fairYield = clamp(currentYield * 0.92 + 0.028 * 0.08, 0.026, 0.042);
  return data.dividendRate / fairYield;
}

function modelEarningsGrowthValue(
  currentPrice: number,
  data: FairValueData
): number | null {
  const eps = data.forwardEps ?? data.trailingEps;
  if (eps == null || eps <= 0 || data.forwardPE == null || data.forwardPE <= 0) {
    return null;
  }
  const earnGrowth = clamp(data.earningsGrowth ?? 0.1, 0, 0.35);
  return eps * data.forwardPE * (1 + earnGrowth * 0.22);
}

function modelRevenueGrowthValue(
  currentPrice: number,
  data: FairValueData
): number | null {
  const revGrowth = clamp(data.revenueGrowth ?? 0.08, 0, 0.35);
  return currentPrice * (1 + revGrowth * 0.28);
}

function hasPositiveEarnings(data: FairValueData): boolean {
  return (
    (data.forwardEps != null && data.forwardEps > 0) ||
    (data.trailingEps != null && data.trailingEps > 0)
  );
}

/** Mega-cap / quality compounder — forward P/E near consensus growth premium */
function isQualityCompounder(data: FairValueData): boolean {
  if (!hasPositiveEarnings(data)) return false;
  if (data.trailingPE == null || data.trailingPE > 30) return false;
  if (data.forwardPE == null || data.forwardPE > 32) return false;
  if (data.marketCap == null || data.marketCap < 200_000_000_000) return false;
  const earnG = clamp(data.earningsGrowth ?? 0, 0, 0.5);
  const revG = clamp(data.revenueGrowth ?? 0, 0, 0.5);
  return earnG >= 0.12 || revG >= 0.1;
}

function modelPEQualityGrowth(data: FairValueData): number | null {
  const eps = data.forwardEps ?? data.trailingEps;
  if (eps == null || eps <= 0 || data.forwardPE == null || data.forwardPE <= 0) {
    return null;
  }
  const trailing = data.trailingPE ?? data.forwardPE;
  const avgPE = (data.forwardPE + trailing) / 2;
  const fairPE = clamp(avgPE * 1.13, 16, 30);
  return eps * fairPE;
}

/** Cyclical ramp — forward EPS surge, low forward P/E (memory semis e.g. MU) */
function isCyclicalEarningsRamp(data: FairValueData): boolean {
  if (!hasPositiveEarnings(data)) return false;
  if (data.forwardPE == null || data.forwardPE <= 0 || data.forwardPE > 15) {
    return false;
  }
  if (
    data.forwardEps == null ||
    data.trailingEps == null ||
    data.trailingEps <= 0
  ) {
    return false;
  }
  return data.forwardEps >= data.trailingEps * 1.8;
}

function modelCyclicalForwardAnchor(data: FairValueData): number | null {
  if (!isCyclicalEarningsRamp(data)) return null;
  if (data.forwardEps == null || data.forwardPE == null) return null;
  return data.forwardEps * data.forwardPE * 0.985;
}

/** Pre-revenue / loss-making — conservative haircut from price */
function modelUnprofitableFairValue(
  currentPrice: number,
  data: FairValueData
): number | null {
  if (hasPositiveEarnings(data)) return null;
  const revGrowth = clamp(data.revenueGrowth ?? 0.12, 0, 1);
  const haircut = clamp(0.05 + revGrowth * 0.025, 0.05, 0.09);
  return currentPrice * (1 - haircut);
}

function isReasonableModelValue(value: number, currentPrice: number): boolean {
  return value > 0 && value >= currentPrice * 0.35 && value <= currentPrice * 2.2;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Drop outliers far from median, then trimmed mean (Investing.com-style robust average) */
function robustAverage(values: number[]): number {
  if (values.length === 1) return values[0];
  if (values.length === 2) return (values[0] + values[1]) / 2;

  const med = median(values);
  const withinMedian = values.filter(
    (v) => v >= med * 0.62 && v <= med * 1.38
  );
  const pool = withinMedian.length >= 2 ? withinMedian : values;
  const sorted = [...pool].sort((a, b) => a - b);
  const trim =
    sorted.length >= 6 ? Math.floor(sorted.length * 0.15) : sorted.length >= 4 ? 1 : 0;
  const trimmed = sorted.slice(trim, sorted.length - trim || sorted.length);
  return trimmed.reduce((sum, v) => sum + v, 0) / trimmed.length;
}

function collectModelCandidates(
  market: "TH" | "US",
  currentPrice: number,
  data: FairValueData
): number[] {
  const profitable = hasPositiveEarnings(data);
  const highTrailingPE =
    data.trailingPE != null && data.trailingPE > 30;
  const currentPS =
    data.revenuePerShare != null && data.revenuePerShare > 0
      ? currentPrice / data.revenuePerShare
      : null;
  const skipPS =
    !profitable && currentPS != null && currentPS > 15;

  const raw = [
    modelPEMultiples(market, data),
    modelPETrailing(market, data),
    skipPS ? null : modelPSMultiples(market, currentPrice, data),
    modelPBMultiples(market, data),
    modelEvEbitdaReversion(currentPrice, data),
    modelDcfFcf(5, currentPrice, data),
    modelDcfFcf(10, currentPrice, data),
    modelDcfOcf(currentPrice, data),
    modelDividendStableGrowth(data),
    modelDividendYieldReversion(currentPrice, data),
    profitable && !highTrailingPE
      ? modelEarningsGrowthValue(currentPrice, data)
      : null,
    profitable && !highTrailingPE
      ? modelRevenueGrowthValue(currentPrice, data)
      : null,
    profitable ? null : modelUnprofitableFairValue(currentPrice, data),
  ];

  return raw.filter(
    (value): value is number =>
      value != null && isReasonableModelValue(value, currentPrice)
  );
}

function blendFairValueFromCandidates(
  market: "TH" | "US",
  candidates: number[],
  currentPrice: number,
  data: FairValueData,
  peReference: number | null
): number {
  const divYield =
    data.dividendRate != null && currentPrice > 0
      ? data.dividendRate / currentPrice
      : 0;
  const divModel = modelDividendYieldReversion(currentPrice, data);

  if (divYield >= 0.018 && divModel != null) {
    const others = candidates.filter(
      (v) => v >= divModel * 0.72 && Math.abs(v - divModel) / divModel > 0.04
    );
    const otherAvg =
      others.length > 0 ? robustAverage(others) : divModel;
    return 0.52 * divModel + 0.48 * otherAvg;
  }

  if (
    !hasPositiveEarnings(data) &&
    candidates.length === 1 &&
    candidates[0] != null
  ) {
    return candidates[0];
  }

  const cyclicalAnchor = modelCyclicalForwardAnchor(data);
  if (
    cyclicalAnchor != null &&
    isReasonableModelValue(cyclicalAnchor, currentPrice)
  ) {
    const dcfO = modelDcfOcf(currentPrice, data);
    const psModel = modelPSMultiples(market, currentPrice, data);
    const support = [dcfO, psModel].filter(
      (v): v is number =>
        v != null && isReasonableModelValue(v, currentPrice)
    );
    if (support.length === 0) return cyclicalAnchor;
    return 0.92 * cyclicalAnchor + 0.08 * robustAverage(support);
  }

  if (isQualityCompounder(data)) {
    const peQuality = modelPEQualityGrowth(data);
    if (peQuality != null && isReasonableModelValue(peQuality, currentPrice)) {
      const dcfO = modelDcfOcf(currentPrice, data);
      const earnG = modelEarningsGrowthValue(currentPrice, data);
      const revG = modelRevenueGrowthValue(currentPrice, data);
      const support = [dcfO, earnG, revG].filter(
        (v): v is number =>
          v != null && isReasonableModelValue(v, currentPrice)
      );
      if (support.length === 0) return peQuality;
      return 0.88 * peQuality + 0.12 * robustAverage(support);
    }
  }

  if (
    data.trailingPE != null &&
    data.trailingPE > 28 &&
    peReference != null
  ) {
    const psModel = modelPSMultiples(market, currentPrice, data);
    if (psModel != null && isReasonableModelValue(psModel, currentPrice)) {
      return 0.74 * peReference + 0.26 * psModel;
    }
  }

  return robustAverage(candidates);
}

/** Simple average of valuation models (Investing.com Pro methodology) */
function blendModelFairValue(
  market: "TH" | "US",
  currentPrice: number,
  data: FairValueData
): {
  fairValue: number | null;
  fairValueLow: number | null;
  fairValueHigh: number | null;
  modelCount: number;
  peReference: number | null;
} {
  const candidates = collectModelCandidates(market, currentPrice, data);

  const peReference = modelPEMultiples(market, data);

  if (candidates.length === 0) {
    return {
      fairValue: peReference,
      fairValueLow: peReference != null ? peReference * 0.85 : null,
      fairValueHigh: peReference != null ? peReference * 1.15 : null,
      modelCount: peReference != null ? 1 : 0,
      peReference,
    };
  }

  const fairValue = blendFairValueFromCandidates(
    market,
    candidates,
    currentPrice,
    data,
    peReference
  );
  const fairValueLow = Math.min(...candidates);
  const fairValueHigh = Math.max(...candidates);

  return {
    fairValue,
    fairValueLow,
    fairValueHigh,
    modelCount: candidates.length,
    peReference,
  };
}

function fcfYieldPercent(data: FairValueData): number | null {
  const { freeCashflow, marketCap } = data;
  if (freeCashflow == null || marketCap == null || marketCap <= 0) return null;
  return (freeCashflow / marketCap) * 100;
}

function dividendYieldPercent(data: FairValueData): number | null {
  if (data.dividendYield == null) return null;
  return data.dividendYield * 100;
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
  analystTarget: number | null;
  analystRange: { low: number; high: number } | null;
  modelRange: { low: number; high: number } | null;
  modelCount: number;
  range52w: { low: number; high: number } | null;
  forwardEps: number | null;
  peReferenceUpsidePercent: number | null;
  analystUpsidePercent: number | null;
  fcfYieldPercent: number | null;
  dividendYieldPercent: number | null;
  dividendRate: number | null;
  source: "multi-model" | "pe-fallback" | "unknown";
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
      analystTarget: null,
      analystRange: null,
      modelRange: null,
      modelCount: 0,
      range52w: null,
      forwardEps: null,
      peReferenceUpsidePercent: null,
      analystUpsidePercent: null,
      fcfYieldPercent: null,
      dividendYieldPercent: null,
      dividendRate: null,
      source: "unknown",
    };
  }

  const blended = blendModelFairValue(market, currentPrice, data);
  const { fairValue, fairValueLow, fairValueHigh, modelCount, peReference } =
    blended;

  const analystTarget =
    data.analyst != null && data.analyst > 0 ? data.analyst : null;

  const analystRange =
    data.analystLow != null &&
    data.analystHigh != null &&
    data.analystLow > 0 &&
    data.analystHigh > 0
      ? {
          low: Math.min(data.analystLow, data.analystHigh),
          high: Math.max(data.analystLow, data.analystHigh),
        }
      : null;

  const modelRange =
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

  const source =
    modelCount >= 2
      ? "multi-model"
      : fairValue != null
        ? "pe-fallback"
        : "unknown";

  return {
    fairValue,
    fairValueLow,
    fairValueHigh,
    peReference,
    upsidePercent: upside,
    upsideLowPercent: upsidePercent(fairValueLow, currentPrice),
    upsideHighPercent: upsidePercent(fairValueHigh, currentPrice),
    verdict: verdictFromUpside(upside),
    analystTarget,
    analystRange,
    modelRange,
    modelCount,
    range52w,
    forwardEps: data.forwardEps,
    peReferenceUpsidePercent: upsidePercent(peReference, currentPrice),
    analystUpsidePercent: upsidePercent(analystTarget, currentPrice),
    fcfYieldPercent: fcfYieldPercent(data),
    dividendYieldPercent: dividendYieldPercent(data),
    dividendRate: data.dividendRate,
    source,
  };
}
