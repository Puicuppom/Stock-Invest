import type { Candle, FairValueData } from "./types";
import type { AnnualEps } from "./historical-valuation";
import { historicalPE } from "./historical-valuation";
import { buildStockData } from "./stock-service";
import { analyzeReversal } from "./reversal";
import { analyzeTrend, trendLean } from "./trend";
import { analyzeVolume } from "./volume";
import { computeTradePlan } from "./trade-plan";
import { evaluateValuation } from "./valuation-engine";

import { emptyAgg, type BacktestResult } from "./backtest-merge";
export { mergeResults, type BacktestResult } from "./backtest-merge";

const empty = emptyAgg;

function add(res: BacktestResult, section: string, bucket: string, f: { r20: number; r60: number; dd20: number }) {
  const s = (res[section] ??= {});
  const a = (s[bucket] ??= empty());
  a.n++; a.r20 += f.r20; a.r60 += f.r60; a.dd20 += f.dd20;
  if (f.r20 > 0) a.w20++;
  if (f.r60 > 0) a.w60++;
}

const bucketOf = (v: number, edges: number[], labels: string[]) => {
  for (let i = 0; i < edges.length; i++) if (v < edges[i]) return labels[i];
  return labels[edges.length];
};

/**
 * ทดสอบสัญญาณย้อนหลัง: ทุก ๆ `step` วัน คำนวณสัญญาณจากข้อมูลถึงวันนั้น (ไม่ดูอนาคต)
 * แล้ววัดผลตอบแทน 20/60 วันทำการถัดไป และการร่วงสูงสุดใน 20 วัน
 */
export function backtestSignals(symbol: string, candles: Candle[], step = 3): BacktestResult {
  const res: BacktestResult = {};
  const n = candles.length;
  const seenBreakout = new Set<string>();
  for (let t = 260; t < n - 60; t += step) {
    const slice = candles.slice(Math.max(0, t - 299), t + 1);
    const close = candles[t].close;
    if (!(close > 0)) continue;
    const r20 = (candles[t + 20].close / close - 1) * 100;
    const r60 = (candles[t + 60].close / close - 1) * 100;
    const dd20 = (Math.min(...candles.slice(t + 1, t + 21).map(c => c.low || c.close)) / close - 1) * 100;
    const f = { r20, r60, dd20 };
    const data = buildStockData(symbol, symbol, slice, null, null, "stock");

    add(res, "ภาพรวม (ทุกวัน)", "ทั้งหมด", f);

    const trend = analyzeTrend(data);
    if (trend) add(res, "แนวโน้ม", trendLean(trend.kind, trend.label), f);

    const rev = analyzeReversal(data);
    if (rev) {
      add(res, "สัญญาณกลับตัว", rev.verdictKind, f);
      add(res, "RSI", bucketOf(rev.rsi, [30, 40, 60, 70], ["<30", "30–40", "40–60", "60–70", ">70"]), f);
      if (trend) add(res, "กลับตัว × แนวโน้ม", `${rev.verdictKind} · ${trendLean(trend.kind, trend.label)}`, f);
    }

    const vol = analyzeVolume(data);
    if (vol) {
      add(res, "Volume วันล่าสุด", vol.label, f);
      add(res, "Volume 2 สัปดาห์", vol.balanceLabel, f);
      const b = vol.breakout;
      if (b) {
        const key = `${b.dir}:${b.level.toFixed(4)}:${t - b.daysAgo}`;
        if (!seenBreakout.has(key)) {
          seenBreakout.add(key);
          add(res, "ทะลุแนว (Swing)", `${b.dir === "up" ? "ทะลุต้าน" : "หลุดรับ"} · ${b.strong ? "Vol หนุน" : "Vol เบา"}`, f);
        }
      }
    }

    const high52 = Math.max(...candles.slice(Math.max(0, t - 251), t + 1).map(c => c.high || c.close));
    const dd = (close / high52 - 1) * 100;
    add(res, "ห่างจุดสูงสุด 52 สัปดาห์", bucketOf(-dd, [10, 20, 30, 40], ["0–10%", "10–20%", "20–30%", "30–40%", ">40%"]), f);
    if (trend) add(res, "ลงลึก × แนวโน้ม", `${bucketOf(-dd, [20, 30], ["<20%", "20–30%", ">30%"])} · ${trend.kind}`, f);

    // แผนซื้อที่แนวรับ: ราคาอยู่ห่างจุดซื้อไม่เกิน 1.5% → จำลองว่าเจอเป้าขายหรือ Stop ก่อน (60 วัน)
    for (const mode of ["swing", "pivot"] as const) {
      const plan = computeTradePlan(data.pivot, data.zones, close, mode, 2, null, false);
      if (plan.buyPrice == null || plan.sellPrice == null || plan.stopLoss == null) continue;
      if (close < plan.buyPrice || close > plan.buyPrice * 1.015) continue;
      let outcome = "หมดเวลา 60 วัน", ret = (candles[t + 60].close / close - 1) * 100;
      for (let i = t + 1; i <= t + 60; i++) {
        const c = candles[i];
        if ((c.low || c.close) <= plan.stopLoss) { outcome = "โดน Stop ก่อน"; ret = (plan.stopLoss / close - 1) * 100; break; }
        if ((c.high || c.close) >= plan.sellPrice) { outcome = "ถึงเป้าขายก่อน"; ret = (plan.sellPrice / close - 1) * 100; break; }
      }
      add(res, `แผนซื้อที่แนวรับ (${mode === "swing" ? "ถือยาว" : "เทรดสั้น"})`, outcome, { r20: ret, r60: ret, dd20: 0 });
    }
  }
  return res;
}

/**
 * ทดสอบราคายุติธรรมย้อนหลัง (เฉพาะส่วน P/E ซึ่งมีข้อมูลย้อนหลังได้):
 * ทุกเดือน ใช้ EPS ปีล่าสุดที่ประกาศแล้ว (หน่วง 120 วัน) + P/E ย้อนหลังถึงวันนั้น → โมเดลเดียวกับแอป
 * แล้วดูผลตอบแทน 6/12 เดือนถัดไป แยกตามส่วนต่างถึงราคายุติธรรม
 * r20/r60 ในผลลัพธ์ = ผลตอบแทน 6 เดือน / 12 เดือน
 */
export function backtestFairValue(candles: Candle[], eps: AnnualEps[], market: "TH" | "US", sector: string | null, currency: string): BacktestResult {
  const res: BacktestResult = {};
  const n = candles.length;
  const DAY = 86400000;
  for (let t = 260; t < n - 252; t += 21) {
    const date = Date.parse(candles[t].date);
    const close = candles[t].close;
    const avail = eps.filter(e => e.currency === currency && Date.parse(e.date) + 120 * DAY <= date).sort((a, b) => a.date.localeCompare(b.date));
    const e = avail.at(-1);
    if (!e || !(e.eps > 0) || date - Date.parse(e.date) > 550 * DAY) continue;
    const hist = historicalPE(candles.slice(0, t + 1), avail, currency);
    const data: FairValueData = {
      analyst: null, analystLow: null, analystHigh: null, trailingEps: e.eps, forwardEps: null, trailingPE: close / e.eps, forwardPE: null,
      fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null, freeCashflow: null, operatingCashflow: null, ebitda: null, revenuePerShare: null,
      earningsGrowth: null, revenueGrowth: null, bookValue: null, priceToBook: null, enterpriseValue: null, sharesOutstanding: null,
      marketCap: null, dividendYield: null, dividendRate: null, sector, financialCurrency: currency, quoteCurrency: currency, historicalPE: hist,
    };
    const fv = evaluateValuation(market, data).fairValue;
    const r6 = (candles[t + 126].close / close - 1) * 100;
    const r12 = (candles[t + 252].close / close - 1) * 100;
    const dd = (Math.min(...candles.slice(t + 1, t + 127).map(c => c.low || c.close)) / close - 1) * 100;
    if (fv != null && fv > 0) {
      const up = (fv / close - 1) * 100;
      add(res, "ราคายุติธรรม (P/E ของแอป)", bucketOf(up, [-20, 0, 20, 40], ["แพงกว่า >20%", "แพงกว่า 0–20%", "ถูกกว่า 0–20%", "ถูกกว่า 20–40%", "ถูกกว่า >40%"]), { r20: r6, r60: r12, dd20: dd });
      const reached = candles.slice(t + 1, t + 253).some(c => (c.high || c.close) >= fv);
      if (up > 0) add(res, "ราคาถึง FV ภายใน 1 ปี (เฉพาะตอนถูกกว่า)", reached ? "ถึง" : "ไม่ถึง", { r20: r6, r60: r12, dd20: dd });
    }
    if (hist) {
      const vsHist = (close / e.eps / hist.median - 1) * 100;
      add(res, "P/E เทียบค่ากลางในอดีตของหุ้นเอง", bucketOf(vsHist, [-30, -10, 10, 30], ["ต่ำกว่า >30%", "ต่ำกว่า 10–30%", "ใกล้ค่ากลาง ±10%", "สูงกว่า 10–30%", "สูงกว่า >30%"]), { r20: r6, r60: r12, dd20: dd });
    }
    add(res, "ภาพรวม (ทุกเดือน)", "ทั้งหมด", { r20: r6, r60: r12, dd20: dd });
  }
  return res;
}

