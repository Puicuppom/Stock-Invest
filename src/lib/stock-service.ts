import { fetchAnnualEps, historicalPE } from "./historical-valuation";
import { fetchFx, PRIMARY_LISTINGS } from "./valuation-currency";
import { fetchDailyCandles } from "./chart-service";
import { calculateFairValue, fetchFundamentals } from "./fair-value";
import { classifyInstrument } from "./instrument";
import { calculatePivot } from "./pivot";
import { detectMarket, resolveSymbol } from "./symbol";
import { fetchCalendarEvents, type StockEvents } from "./events";
import { fetchCompanyInfo } from "./financials";
import { fetchExtendedQuote } from "./yahoo-quote";
import { fetchEtfInfo } from "./etf";
import { fetchDividendHistory, fetchEarningsHistory, peHistory, priceToSales, summarizeDividends } from "./deep";
import { clusterZones, findSwingPoints, topZones } from "./swing";
import type { Candle, FairValueData, StockData } from "./types";

export const revalidate = 900;

/** ~6 months of trading days for swing S/R */
export const SWING_LOOKBACK_BARS = 126;

import type { AssetKind } from "./instrument";

export function buildStockData(
  input: string,
  resolvedSymbol: string,
  candles: Candle[],
  fundamentals: FairValueData | null,
  longName: string | null,
  assetKind: AssetKind
): StockData {
  const prev = candles[candles.length - 2];
  const last = candles[candles.length - 1];
  const pivot = calculatePivot(prev);
  const swingCandles = candles.slice(-SWING_LOOKBACK_BARS);
  const swings = findSwingPoints(swingCandles, 5);
  const zones = topZones(clusterZones(swings), last.close, 4);
  const detectedMarket = detectMarket(resolvedSymbol);
  const change = last.close - prev.close;
  const changePercent = (change / prev.close) * 100;

  const fairValueCalc = calculateFairValue(
    detectedMarket,
    last.close,
    fundamentals
  );

  return {
    symbol: input.toUpperCase(),
    resolvedSymbol,
    longName,
    assetKind,
    market: detectedMarket,
    candles,
    pivot,
    swings,
    zones,
    lastClose: last.close,
    change,
    changePercent,
    fairValue: {
      ...fairValueCalc,
      trailingPE: fundamentals?.trailingPE ?? null,
      forwardPE: fundamentals?.forwardPE ?? null,
    },
  };
}

export async function getStockData(
  input: string,
  market: "TH" | "US" = "US",
  options: { screening?: boolean; deep?: boolean } = {}
): Promise<StockData> {
  const resolvedSymbol = resolveSymbol(input, market);
  if (!resolvedSymbol) {
    throw new Error("Stock not found");
  }

  const primary = PRIMARY_LISTINGS[resolvedSymbol];
  const eventMarket = detectMarket(resolvedSymbol);
  const deep = options.deep && !options.screening;
  const [daily, fundamentals, earnings, primaryDaily, listedEvents, listedCompany, extended, quartersRaw, dividendRows] = await Promise.all([
    fetchDailyCandles(resolvedSymbol),
    fetchFundamentals(resolvedSymbol),
    fetchAnnualEps(primary?.symbol ?? resolvedSymbol),
    primary ? fetchDailyCandles(primary.symbol).catch(() => null) : Promise.resolve(null),
    options.screening ? Promise.resolve(null) : fetchCalendarEvents(resolvedSymbol, eventMarket),
    options.screening ? Promise.resolve(null) : fetchCompanyInfo(resolvedSymbol),
    options.screening || eventMarket !== "US" ? Promise.resolve(null) : fetchExtendedQuote(resolvedSymbol),
    deep ? fetchEarningsHistory(primary?.symbol ?? resolvedSymbol) : Promise.resolve([]),
    deep ? fetchDividendHistory(resolvedSymbol) : Promise.resolve([]),
  ]);
  let company = listedCompany;
  let quarters = quartersRaw;
  if (!options.screening && primary && !company?.revenue.length) {
    const primaryCompany = await fetchCompanyInfo(primary.symbol);
    if (primaryCompany) company = { ...primaryCompany, summary: company?.summary ?? primaryCompany.summary, website: company?.website ?? primaryCompany.website };
  }
  // ADR ที่เพิ่งเข้าตลาด Yahoo อาจยังไม่มีวันประกาศงบ → ใช้ของหุ้นต้นทาง (บริษัทเดียวกัน)
  let events: StockEvents | null = listedEvents;
  if (!options.screening && primary && !events?.earningsDate) {
    const primaryEvents = await fetchCalendarEvents(primary.symbol, eventMarket);
    if (primaryEvents?.earningsDate) events = { earningsDate: primaryEvents.earningsDate, earningsEstimate: primaryEvents.earningsEstimate, exDividendDate: events?.exDividendDate ?? null };
  }

  // งบ/ภาพรวม แสดงเป็นสกุลเงินของหุ้นที่ซื้อขาย (US = USD) — ยอดรวมแปลงด้วยอัตราแลกเปลี่ยนล่าสุด
  const quoteCurrency = fundamentals?.quoteCurrency ?? (eventMarket === "TH" ? "THB" : "USD");
  if (company?.currency && company.currency !== quoteCurrency) {
    const fx = await fetchFx(company.currency, quoteCurrency).catch(() => null);
    if (fx) {
      const m = (rows: { year: string; value: number }[]) => rows.map(r => ({ ...r, value: r.value * fx.rate }));
      company = { ...company, currency: quoteCurrency, revenue: m(company.revenue), netIncome: m(company.netIncome), fcf: m(company.fcf),
        cash: company.cash != null ? company.cash * fx.rate : null, debt: company.debt != null ? company.debt * fx.rate : null };
    }
  }
  // EPS รายไตรมาส: แปลงเป็นต่อหุ้นที่ซื้อขาย · ไม่รู้ตัวคูณ (ต่างสกุลเงิน) = ไม่แสดง ดีกว่าแสดงผิดหน่วย
  const qFactor = fundamentals?.perShareFactor ?? null;
  const qMismatch = fundamentals?.financialCurrency != null && fundamentals.financialCurrency !== quoteCurrency;
  if (qFactor != null) quarters = quarters.map(q => ({ ...q, actual: q.actual != null ? q.actual * qFactor : null, estimate: q.estimate != null ? q.estimate * qFactor : null }));
  else if (qMismatch || primary) quarters = [];

  if (fundamentals) fundamentals.historicalPE = historicalPE(
    primary ? primaryDaily?.candles ?? [] : daily.candles, earnings,
    primary?.currency ?? fundamentals.quoteCurrency ?? ""
  );


  if (daily.candles.length < 10) {
    throw new Error("Stock not found");
  }

  const longNameRaw = daily.longName ?? daily.shortName;
  const assetKind = classifyInstrument(
    resolvedSymbol,
    longNameRaw,
    daily.instrumentType
  );
  const longName =
    assetKind === "gold-spot"
      ? "ทองคำ spot · USD/oz"
      : longNameRaw;
  const etf = assetKind === "etf" || assetKind === "gold-etf" ? await fetchEtfInfo(resolvedSymbol, longNameRaw) : null;

  const base = buildStockData(input, resolvedSymbol, daily.candles, fundamentals, longName, assetKind);
  // P/S ใช้ได้เมื่องบกับราคาเป็นสกุลเงินเดียวกัน (ADR ข้ามไป)
  const sameCurrency = !fundamentals?.financialCurrency || !fundamentals.quoteCurrency || fundamentals.financialCurrency === fundamentals.quoteCurrency;
  const deepInfo = deep && assetKind === "stock" ? {
    pe: peHistory(fundamentals?.historicalPE, fundamentals?.trailingPE ?? null),
    earnings: quarters,
    dividends: summarizeDividends(dividendRows, fundamentals?.quoteCurrency ?? null),
    ps: sameCurrency ? priceToSales(daily.candles, company, fundamentals?.sharesOutstanding ?? null, fundamentals?.revenuePerShare ?? null, base.lastClose, fundamentals?.revenueGrowth ?? null) : null,
  } : null;

  return {
    ...base,
    events,
    company,
    extended,
    etf,
    deep: deepInfo,
  };
}
