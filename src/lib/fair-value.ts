import { PRIMARY_LISTINGS, convertPrimaryFundamentals, fetchFx } from "./valuation-currency";
import { evaluateValuation } from "./valuation-engine";
import { getYahooAuth, USER_AGENT } from "./yahoo-auth";
import { fetchYahooQuoteDividends } from "./yahoo-quote";
import type { FairValueData } from "./types";

export const revalidate = 900;

interface YahooRaw {
  raw?: number;
  fmt?: string;
}

interface QuoteSummaryResponse {
  quoteSummary?: {
    result?: Array<{
      assetProfile?: { sector?: string; industry?: string };
      price?: { currency?: string };
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
        operatingMargins?: YahooRaw;
        returnOnEquity?: YahooRaw;
        financialCurrency?: string;
        totalDebt?: YahooRaw;
        totalCash?: YahooRaw;
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
  if (value?.raw == null || !Number.isFinite(value.raw)) return null;
  return value.raw;
}


async function fetchRawFundamentals(
  resolvedSymbol: string
): Promise<FairValueData | null> {
  try {
    const { cookie, crumb } = await getYahooAuth();
    const url = new URL(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(resolvedSymbol)}`
    );
    url.searchParams.set(
      "modules",
      "financialData,defaultKeyStatistics,summaryDetail,assetProfile,price"
    );
    url.searchParams.set("crumb", crumb);

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: cookie,
      },
      next: { revalidate },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return null;
    }

    const json = (await res.json()) as QuoteSummaryResponse;
    const row = json.quoteSummary?.result?.[0];
    if (!row) return null;

    const base: FairValueData = {
      industry: row.assetProfile?.industry ?? null,
      operatingMargins: num(row.financialData?.operatingMargins),
      returnOnEquity: num(row.financialData?.returnOnEquity),
      sector: row.assetProfile?.sector ?? null,
      financialCurrency: row.financialData?.financialCurrency ?? null,
      quoteCurrency: row.price?.currency ?? null,
      totalDebt: num(row.financialData?.totalDebt),
      totalCash: num(row.financialData?.totalCash),
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

    if (base.dividendYield == null || base.dividendRate == null) {
      const quoteDiv = await fetchYahooQuoteDividends(resolvedSymbol);
      if (quoteDiv) {
        return {
          ...base,
          dividendYield: base.dividendYield ?? quoteDiv.dividendYield,
          dividendRate: base.dividendRate ?? quoteDiv.dividendRate,
        };
      }
    }

    return base;
  } catch {
    return null;
  }
}

export async function fetchFundamentals(resolvedSymbol: string): Promise<FairValueData | null> {
  const listed = await fetchRawFundamentals(resolvedSymbol);
  if (!listed || listed.financialCurrency === listed.quoteCurrency) return listed;
  const mapping = PRIMARY_LISTINGS[resolvedSymbol.toUpperCase()];
  if (!mapping || listed.financialCurrency !== mapping.currency || listed.quoteCurrency !== mapping.quote) {
    const fx = listed.financialCurrency && listed.quoteCurrency ? await fetchFx(listed.financialCurrency, listed.quoteCurrency) : null;
    return { ...listed,
      freeCashflow: fx && listed.freeCashflow != null ? listed.freeCashflow * fx.rate : listed.freeCashflow,
      cashflowCurrency: fx ? listed.quoteCurrency : listed.financialCurrency,
      normalizationNotes: ["ยังไม่ยืนยันหน่วยหุ้น/อัตราส่วน ADR สำหรับการแปลงสกุลเงินของหุ้นนี้", ...(fx ? ["แปลงเฉพาะ FCF รวม " + listed.financialCurrency + " → " + listed.quoteCurrency + " อัตรา " + fx.rate.toFixed(6) + " วันที่ " + new Date(fx.timestamp*1000).toISOString().slice(0,10) + " จาก Yahoo; ยังไม่ประเมินมูลค่าต่อหุ้น"] : ["ไม่มีอัตราแลกเปลี่ยนล่าสุดที่ยืนยันได้"])],
    };
  }
  const [primary, fx] = await Promise.all([fetchRawFundamentals(mapping.symbol), fetchFx(mapping.currency, mapping.quote)]);
  const normalized = primary && fx ? convertPrimaryFundamentals(primary, listed, fx, Date.now(), mapping) : null;
  return normalized ?? { ...listed, normalizationNotes: ["แปลงสกุลเงินไม่สำเร็จ: ข้อมูลงบต้นทาง อัตราแลกเปลี่ยนล่าสุด หรือจำนวนหุ้นยังยืนยันไม่ได้"] };
}

function fcfYieldPercent(data: FairValueData): number | null {
  const { freeCashflow, marketCap } = data;
  if (!(data.cashflowCurrency ?? data.financialCurrency) || (data.cashflowCurrency ?? data.financialCurrency) !== data.quoteCurrency) return null;
  if (freeCashflow == null || marketCap == null || marketCap <= 0) return null;
  return (freeCashflow / marketCap) * 100;
}

function dividendYieldPercent(
  data: FairValueData,
  currentPrice: number
): number | null {
  if (data.dividendYield != null) return data.dividendYield * 100;
  if (data.dividendRate != null && data.dividendRate > 0 && currentPrice > 0) {
    return (data.dividendRate / currentPrice) * 100;
  }
  return null;
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
  modelFairValue?: number | null;
  analystWeight?: number;
  confidence?: "low" | "medium" | "unavailable";
  warnings?: string[];
  models?: import("./valuation-engine").ValuationModel[];
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
  trailingEps?: number | null;
  forwardEps: number | null;
  peReferenceUpsidePercent: number | null;
  analystUpsidePercent: number | null;
  fcfYieldPercent: number | null;
  dividendYieldPercent: number | null;
  dividendRate: number | null;
  source: "multi-model" | "pe-fallback" | "single-model" | "unknown";
} {
  if (!data || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return {
      confidence: "unavailable",
      warnings: ["ข้อมูลพื้นฐานไม่พอหรือโหลดไม่สำเร็จ ลองรีเฟรชอีกครั้ง"],
      models: [],
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

  const blended = evaluateValuation(market, data);
  const { fairValue: modelFairValue, fairValueLow: modelLow, fairValueHigh: modelHigh, modelCount, peReference } =
    blended;

  const analystTarget =
    data.analyst != null && Number.isFinite(data.analyst) && data.analyst > 0 ? data.analyst : null;

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

  const analystWeight = modelFairValue != null && analystTarget != null && data.quoteCurrency === (market === "TH" ? "THB" : "USD") ? 0.5 : 0;
  const fairValue = modelFairValue != null ? modelFairValue*(1-analystWeight)+(analystTarget ?? 0)*analystWeight : null;
  // Hold the analyst mean fixed in scenario bounds; analyst dispersion is shown separately.
  const fairValueLow = modelLow != null ? modelLow*(1-analystWeight)+(analystTarget ?? 0)*analystWeight : null;
  const fairValueHigh = modelHigh != null ? modelHigh*(1-analystWeight)+(analystTarget ?? 0)*analystWeight : null;
  blended.warnings.push(analystWeight ? "ราคาที่แสดง = โมเดล 50% + เป้านักวิเคราะห์เฉลี่ย 50%; น้ำหนักสมมติ ยังไม่ผ่าน backtest และเป้านักวิเคราะห์อาจมีกรอบเวลาแตกต่างจากมูลค่าปัจจุบัน" : "ไม่มีข้อมูลสองด้านที่ยืนยันสกุลเงินได้ครบ จึงไม่ถ่วงน้ำหนักนักวิเคราะห์; ไม่ใช้เป้านักวิเคราะห์แทนโมเดลที่ไม่มีข้อมูล");

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
        ? "single-model"
        : "unknown";

  return {
    modelFairValue,
    analystWeight,
    confidence: blended.confidence,
    warnings: blended.warnings,
    models: blended.models,
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
    trailingEps: data.trailingEps,
    forwardEps: data.forwardEps,
    peReferenceUpsidePercent: upsidePercent(peReference, currentPrice),
    analystUpsidePercent: upsidePercent(analystTarget, currentPrice),
    fcfYieldPercent: fcfYieldPercent(data),
    dividendYieldPercent: dividendYieldPercent(data, currentPrice),
    dividendRate: data.dividendRate,
    source,
  };
}
