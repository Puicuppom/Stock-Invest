/**
 * Compare app fair value vs Investing.com Pro targets (mirrors fair-value.ts).
 */
const ua =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const INVESTING = [
  { sym: "MU", fv: 933, pct: -1.7 },
  { sym: "MSFT", fv: 466.14, pct: 19.88 },
  { sym: "FN", fv: 408.33, pct: -14.94 },
  { sym: "AVGO", fv: 444.51, pct: 15.1 },
  { sym: "CEG", fv: 233.13, pct: -3.63 },
  { sym: "ASTS", fv: 69.44, pct: -6.43 },
  { sym: "KO", fv: 77.54, pct: -7.75 },
  { sym: "TSM", fv: 423.23, pct: -3.15 },
];

const BASE_PE = { US: 18, TH: 14 };
const BASE_PS = { US: 5, TH: 3.5 };

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function hasPositiveEarnings(data) {
  return data.forwardEps > 0 || data.trailingEps > 0;
}

function isQualityCompounder(data) {
  if (!hasPositiveEarnings(data)) return false;
  if (data.trailingPE == null || data.trailingPE > 30) return false;
  if (data.forwardPE == null || data.forwardPE > 32) return false;
  if (!data.marketCap || data.marketCap < 200_000_000_000) return false;
  const earnG = clamp(data.earningsGrowth ?? 0, 0, 0.5);
  const revG = clamp(data.revenueGrowth ?? 0, 0, 0.5);
  return earnG >= 0.12 || revG >= 0.1;
}

function modelPEQualityGrowth(data) {
  const eps = data.forwardEps ?? data.trailingEps;
  if (eps == null || eps <= 0 || !data.forwardPE) return null;
  const trailing = data.trailingPE ?? data.forwardPE;
  const avgPE = (data.forwardPE + trailing) / 2;
  const fairPE = clamp(avgPE * 1.13, 16, 30);
  return eps * fairPE;
}

function isCyclicalEarningsRamp(data) {
  if (!hasPositiveEarnings(data)) return false;
  if (!data.forwardPE || data.forwardPE <= 0 || data.forwardPE > 15) return false;
  if (!data.forwardEps || !data.trailingEps || data.trailingEps <= 0) return false;
  return data.forwardEps >= data.trailingEps * 1.8;
}

function modelCyclicalForwardAnchor(data) {
  if (!isCyclicalEarningsRamp(data)) return null;
  if (!data.forwardEps || !data.forwardPE) return null;
  return data.forwardEps * data.forwardPE * 0.985;
}

function modelPEMultiples(market, data) {
  const eps = data.forwardEps ?? data.trailingEps;
  if (eps == null || eps <= 0) return null;
  const base = BASE_PE[market];
  const fairPE =
    data.trailingPE != null && data.trailingPE > 0
      ? clamp((base + data.trailingPE * 0.65) / 2, 8, 45)
      : base;
  return eps * fairPE;
}

function modelPETrailing(market, data) {
  if (data.trailingEps == null || data.trailingEps <= 0) return null;
  const base = BASE_PE[market];
  const ref = data.forwardPE ?? data.trailingPE ?? base;
  const fairPE = clamp((base + ref * 0.75) / 2, 8, 35);
  return data.trailingEps * fairPE;
}

function modelPSMultiples(market, price, data) {
  if (data.revenuePerShare == null || data.revenuePerShare <= 0) return null;
  const currentPS = price / data.revenuePerShare;
  const base = BASE_PS[market];
  if (currentPS > 10) {
    const fairPS = clamp((base + currentPS * 0.72) / 2, 4, 18);
    const ratio = clamp(fairPS / currentPS, 0.55, 1.05);
    return price * ratio;
  }
  const fairPS = clamp((base + currentPS * 0.55) / 2, 2.5, 12);
  return data.revenuePerShare * fairPS;
}

function modelPBMultiples(market, data) {
  if (data.bookValue == null || data.bookValue <= 0) return null;
  if (data.priceToBook != null && (data.priceToBook < 0.5 || data.priceToBook > 15))
    return null;
  const base = market === "US" ? 2.5 : 1.5;
  const ptb = data.priceToBook ?? base;
  const fairPB = clamp((base + Math.min(ptb, 8) * 0.45) / 2, 1, 6);
  return data.bookValue * fairPB;
}

function modelEvEbitdaReversion(price, data) {
  if (!data.enterpriseValue || !data.ebitda || data.ebitda <= 0) return null;
  const evEbitda = data.enterpriseValue / data.ebitda;
  if (evEbitda < 8 || evEbitda > 40) return null;
  const fairEvEbitda = clamp((14 + evEbitda * 0.45) / 2, 8, 22);
  const ratio = clamp(fairEvEbitda / evEbitda, 0.65, 1.45);
  return price * ratio;
}

function dcf(f0, years, growth, discount, terminal) {
  let pv = 0;
  let f = f0;
  for (let i = 1; i <= years; i++) {
    f *= 1 + growth;
    pv += f / Math.pow(1 + discount, i);
  }
  pv += (f * (1 + terminal)) / (discount - terminal) / Math.pow(1 + discount, years);
  return pv;
}

function modelDcfFcf(years, price, data) {
  const shares = data.sharesOutstanding;
  if (!shares || !data.freeCashflow) return null;
  const fcfPs = data.freeCashflow / shares;
  const fcfYield = fcfPs / price;
  if (fcfYield <= 0.005 || fcfYield > 0.12) return null;
  const revG = clamp(data.revenueGrowth ?? 0.08, 0, 0.35);
  const growth =
    years === 5
      ? clamp(revG * 0.4 + 0.05, 0.04, 0.12)
      : clamp(revG * 0.35 + 0.04, 0.03, 0.1);
  return dcf(fcfPs, years, growth, years === 5 ? 0.095 : 0.09, 0.03);
}

function modelDcfOcf(price, data) {
  const shares = data.sharesOutstanding;
  if (!shares || !data.operatingCashflow) return null;
  const ocfPs = data.operatingCashflow / shares;
  const ocfYield = ocfPs / price;
  if (ocfYield <= 0.02 || ocfYield > 0.15) return null;
  const revG = clamp(data.revenueGrowth ?? 0.08, 0, 0.35);
  const growth = clamp(revG * 0.35 + 0.04, 0.03, 0.11);
  return dcf(ocfPs * 0.85, 5, growth, 0.095, 0.03);
}

function modelDDM(data) {
  if (!data.dividendRate || data.dividendRate <= 0) return null;
  const revGrowth = clamp(data.revenueGrowth ?? 0.03, 0, 0.08);
  const growth = clamp(revGrowth * 0.5 + 0.025, 0.025, 0.055);
  const r = 0.082;
  if (r <= growth) return null;
  const v = (data.dividendRate * (1 + growth)) / (r - growth);
  return v > 0 && v < 5000 ? v : null;
}

function modelDivYieldRev(price, data) {
  if (!data.dividendRate || data.dividendRate <= 0 || price <= 0) return null;
  const y = data.dividendRate / price;
  if (y < 0.012 || y > 0.07) return null;
  const fairY = clamp(y * 0.92 + 0.028 * 0.08, 0.026, 0.042);
  return data.dividendRate / fairY;
}

function modelEarningsGrowth(price, data) {
  const eps = data.forwardEps ?? data.trailingEps;
  if (!eps || eps <= 0 || !data.forwardPE) return null;
  const g = clamp(data.earningsGrowth ?? 0.1, 0, 0.35);
  return eps * data.forwardPE * (1 + g * 0.22);
}

function modelRevenueGrowth(price, data) {
  const g = clamp(data.revenueGrowth ?? 0.08, 0, 0.35);
  return price * (1 + g * 0.28);
}

function modelUnprofitable(price, data) {
  if (hasPositiveEarnings(data)) return null;
  const revG = clamp(data.revenueGrowth ?? 0.12, 0, 1);
  const haircut = clamp(0.05 + revG * 0.025, 0.05, 0.09);
  return price * (1 - haircut);
}

function inBand(v, p) {
  return v > 0 && v >= p * 0.35 && v <= p * 2.2;
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function robustAverage(values) {
  if (values.length === 1) return values[0];
  if (values.length === 2) return (values[0] + values[1]) / 2;
  const med = median(values);
  const pool = values.filter((v) => v >= med * 0.62 && v <= med * 1.38);
  const sorted = [...(pool.length >= 2 ? pool : values)].sort((a, b) => a - b);
  const trim =
    sorted.length >= 6 ? Math.floor(sorted.length * 0.15) : sorted.length >= 4 ? 1 : 0;
  const trimmed = sorted.slice(trim, sorted.length - trim || sorted.length);
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

function collectCandidates(market, price, data) {
  const profitable = hasPositiveEarnings(data);
  const highTrail = data.trailingPE != null && data.trailingPE > 30;
  const psRatio =
    data.revenuePerShare > 0 ? price / data.revenuePerShare : null;
  const skipPS = !profitable && psRatio != null && psRatio > 15;

  return [
    modelPEMultiples(market, data),
    modelPETrailing(market, data),
    skipPS ? null : modelPSMultiples(market, price, data),
    modelPBMultiples(market, data),
    modelEvEbitdaReversion(price, data),
    modelDcfFcf(5, price, data),
    modelDcfFcf(10, price, data),
    modelDcfOcf(price, data),
    modelDDM(data),
    modelDivYieldRev(price, data),
    profitable && !highTrail ? modelEarningsGrowth(price, data) : null,
    profitable && !highTrail ? modelRevenueGrowth(price, data) : null,
    profitable ? null : modelUnprofitable(price, data),
  ].filter((v) => v != null && inBand(v, price));
}

function blendFairValue(market, candidates, price, data, peRef) {
  const divY = data.dividendRate > 0 ? data.dividendRate / price : 0;
  const divModel = modelDivYieldRev(price, data);

  if (divY >= 0.018 && divModel != null) {
    const others = candidates.filter(
      (v) => v >= divModel * 0.72 && Math.abs(v - divModel) / divModel > 0.04
    );
    const otherAvg = others.length ? robustAverage(others) : divModel;
    return 0.52 * divModel + 0.48 * otherAvg;
  }

  if (!hasPositiveEarnings(data) && candidates.length === 1) {
    return candidates[0];
  }

  const cyclical = modelCyclicalForwardAnchor(data);
  if (cyclical != null && inBand(cyclical, price)) {
    const dcfO = modelDcfOcf(price, data);
    const ps = modelPSMultiples(market, price, data);
    const support = [dcfO, ps].filter((v) => v != null && inBand(v, price));
    if (support.length === 0) return cyclical;
    return 0.92 * cyclical + 0.08 * robustAverage(support);
  }

  if (isQualityCompounder(data)) {
    const peQuality = modelPEQualityGrowth(data);
    if (peQuality != null && inBand(peQuality, price)) {
      const dcfO = modelDcfOcf(price, data);
      const earnG = modelEarningsGrowth(price, data);
      const revG = modelRevenueGrowth(price, data);
      const support = [dcfO, earnG, revG].filter((v) => v != null && inBand(v, price));
      if (support.length === 0) return peQuality;
      return 0.88 * peQuality + 0.12 * robustAverage(support);
    }
  }

  if (data.trailingPE > 28 && peRef != null) {
    const ps = modelPSMultiples(market, price, data);
    if (ps != null && inBand(ps, price)) {
      return 0.74 * peRef + 0.26 * ps;
    }
  }

  return robustAverage(candidates);
}

function calculate(market, price, data) {
  const peRef = modelPEMultiples(market, data);
  const candidates = collectCandidates(market, price, data);
  const fv =
    candidates.length > 0
      ? blendFairValue(market, candidates, price, data, peRef)
      : peRef;
  const upside = fv != null ? ((fv - price) / price) * 100 : null;
  return { fv, upside };
}

async function yahoo(sym) {
  const cr = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": ua },
    redirect: "manual",
  });
  const cookie =
    cr.headers.getSetCookie?.()?.map((c) => c.split(";")[0]).join("; ") || "";
  const crumb = await (
    await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": ua, Cookie: cookie },
    })
  ).text();
  const url =
    "https://query2.finance.yahoo.com/v10/finance/quoteSummary/" +
    encodeURIComponent(sym) +
    "?modules=financialData,defaultKeyStatistics,summaryDetail,price&crumb=" +
    encodeURIComponent(crumb);
  const j = await (
    await fetch(url, { headers: { "User-Agent": ua, Cookie: cookie } })
  ).json();
  const r = j.quoteSummary?.result?.[0];
  if (!r) return null;
  const n = (x) => x?.raw ?? null;
  const fd = r.financialData || {};
  const ks = r.defaultKeyStatistics || {};
  const sd = r.summaryDetail || {};
  return {
    price: n(r.price?.regularMarketPrice),
    trailingEps: n(ks.trailingEps),
    forwardEps: n(ks.forwardEps),
    trailingPE: n(sd.trailingPE),
    forwardPE: n(sd.forwardPE),
    revenuePerShare: n(fd.revenuePerShare),
    ebitda: n(fd.ebitda),
    sharesOutstanding: n(ks.sharesOutstanding),
    enterpriseValue: n(ks.enterpriseValue),
    freeCashflow: n(fd.freeCashflow),
    operatingCashflow: n(fd.operatingCashflow),
    bookValue: n(ks.bookValue),
    priceToBook: n(ks.priceToBook),
    dividendRate: n(sd.dividendRate),
    earningsGrowth: n(fd.earningsGrowth),
    revenueGrowth: n(fd.revenueGrowth),
    marketCap: n(sd.marketCap),
  };
}

console.log("| Symbol | Investing | App | Diff | Inv% | App% | Dir |");
console.log("|--------|-----------|-----|------|------|------|-----|");

let dirOk = 0;
let absErr = 0;
for (const row of INVESTING) {
  const data = await yahoo(row.sym);
  const price = data?.price ?? 0;
  const r = calculate("US", price, data);
  const diffPct = ((r.fv - row.fv) / row.fv) * 100;
  absErr += Math.abs(diffPct);
  const invDir = row.pct > 2 ? "↑" : row.pct < -2 ? "↓" : "≈";
  const appDir =
    r.upside != null ? (r.upside > 2 ? "↑" : r.upside < -2 ? "↓" : "≈") : "?";
  if (invDir === appDir) dirOk++;
  console.log(
    `| ${row.sym} | ${row.fv.toFixed(2)} | ${r.fv?.toFixed(2)} | ${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(1)}% | ${row.pct >= 0 ? "+" : ""}${row.pct.toFixed(1)}% | ${r.upside >= 0 ? "+" : ""}${r.upside.toFixed(1)}% | ${invDir}${invDir === appDir ? "✓" : "✗"} |`
  );
}
console.log(`\nDirection: ${dirOk}/${INVESTING.length} | Avg |diff|: ${(absErr / INVESTING.length).toFixed(1)}%`);
