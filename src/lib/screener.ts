import type { Candle, StockData } from "./types";
import { drawdownFromHigh, DIP_DEEP_PERCENT } from "./dip";
import { techSnapshot, type MarketContext } from "./momentum";
import { analyzeTrend } from "./trend";
export type ScreeningStyle = "long" | "dip" | "momentum" | "smallcap" | "dividend" | "short";
/** ปุ่มที่แสดงในหน้าคัดหุ้น (long/short ยังเก็บโค้ดไว้แต่ไม่แสดง) */
export const VISIBLE_STYLES: ScreeningStyle[] = ["dip", "momentum", "smallcap", "dividend"];
/** เกณฑ์หุ้นจิ๋ว (Market Cap สกุลเงินตลาด) */
export const SMALL_CAP_MAX = { US: 2e9, TH: 10e9 } as const;
export const screeningStyles = {
  long: { label: "ถือยาว", tagline: "พื้นฐานดี ราคาต่ำกว่ามูลค่า", description: "คัดจากกำไร เงินสด มูลค่า และคุณภาพธุรกิจ (ROE รายได้ หนี้) ตัดหุ้นที่ราคายุติธรรมมีสัญญาณข้อมูลผิดปกติ ยังไม่ยืนยันการเติบโตหลายปี" },
  dip: { label: "หุ้นดีลดราคา", tagline: "ลงลึก แต่พื้นฐานยังดี", description: `ราคาลงจากจุดสูงสุด 52 สัปดาห์ ≥ ${DIP_DEEP_PERCENT}% แต่พื้นฐานยังดี (ROE รายได้ หนี้) และไม่เข้าข่ายกับดัก: กำไรคาดการณ์ไม่ลดลงเกิน 10% และราคาถูกกว่า P/E ในอดีตหรือ Fair Value` },
  momentum: { label: "หุ้นแกร่งไปต่อ", tagline: "พื้นฐานเยี่ยม ขาขึ้น ยังไม่ร้อนเกิน", description: "พื้นฐานดีมาก (ROE ≥ 15% อัตรากำไร ≥ 15% รายได้โต ≥ 10% กำไรคาดการณ์โต หนี้ต่ำ) อยู่ในขาขึ้น วิ่งแรงกว่าตลาด 6 เดือน ห่างจุดสูงสุดไม่เกิน 15% และยังไม่วิ่งเกินตัว (ห่างเส้น 50 วัน ≤ 15% · RSI ≤ 75 · PEG ≤ 2)" },
  smallcap: { label: "หุ้นจิ๋วเตรียมพุ่ง", tagline: "บริษัทเล็ก โตเร็ว เริ่มมีแรงซื้อ", description: "บริษัทเล็ก (US < 2 พันล้าน USD · ไทย < 1 หมื่นล้านบาท) มีกำไรแล้ว รายได้โต ≥ 15% กำไรคาดการณ์โต ≥ 10% หนี้ไม่เยอะ และเริ่มมีแรงซื้อ: ราคาเหนือเส้น 50 วัน ใกล้จุดสูงสุด 3 เดือน Volume 5 วันล่าสุด ≥ 1.3 เท่า มีสภาพคล่องพอซื้อขาย · หุ้นเล็กผันผวนสูง ควรใช้เงินส่วนน้อย" },
  dividend: { label: "ปันผลงาม", tagline: "ปันผลดี จ่ายไหว", description: "คัดจากปันผล เงินสด และความสามารถจ่ายปันผล (ไม่จ่ายเกินกำไร/เงินสดอิสระ) ยังไม่ยืนยันความต่อเนื่องของปันผลหลายปี" },
  short: { label: "เทรดสั้น", tagline: "แนวโน้มและปริมาณซื้อขาย", description: "คัดจากแนวโน้ม ปริมาณซื้อขาย และสภาพคล่อง ใช้เฉพาะวันที่ตลาดปิดแล้ว ไม่นับวันที่ยังซื้อขายอยู่" },
};
export interface ScreeningCheck { label: string; value: string; passed: boolean | null; reason?: string }

export function hasValuationSupport(f: StockData["fairValue"]): boolean {
  return f.modelCount >= 2 || (f.modelCount >= 1 && f.analystWeight === 0.5 && f.analystTarget != null && Number.isFinite(f.analystTarget) && f.analystTarget > 0);
}

/* ── วันที่ตลาดปิดแล้ว ── ข้อมูลรายวันจาก Yahoo มีแท่งของวันที่ยังซื้อขายอยู่ (ปริมาณยังไม่ครบวัน) */
const MARKET_SESSION = {
  US: { timeZone: "America/New_York", closeMinutes: 16 * 60 + 15 },
  TH: { timeZone: "Asia/Bangkok", closeMinutes: 16 * 60 + 45 },
} as const;

function marketNow(market: "US" | "TH", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MARKET_SESSION[market].timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** false = แท่งสุดท้ายเป็นวันนี้และตลาดยังไม่ปิด (ราคา/ปริมาณยังไม่ใช่ของทั้งวัน) */
export function isLastCandleComplete(data: StockData, now = new Date()): boolean {
  const last = data.candles.at(-1);
  if (!last) return true;
  const { date, minutes } = marketNow(data.market, now);
  return last.date !== date || minutes >= MARKET_SESSION[data.market].closeMinutes;
}

export function completedCandles(data: StockData, now = new Date()): Candle[] {
  return isLastCandleComplete(data, now) ? data.candles : data.candles.slice(0, -1);
}

/* ── สัญญาณข้อมูลผิดปกติจากตัวคำนวณราคายุติธรรม ── */
// hard = ข้อมูลน่าจะผิดจริง (ตัดออกจากถือยาว) · soft = แค่เตือน + หักคะแนน
// "โมเดลต่างกันมาก" เกิดบ่อยกับหุ้นปันผลที่ปกติดี (P/E กับโมเดลปันผลให้ค่าต่างกันโดยธรรมชาติ) จึงเป็น soft
const RISK_PATTERNS: [string, string, "hard" | "soft"][] = [
  ["EPS คาดการณ์ต่างจาก TTM มาก", "กำไรคาดการณ์ต่างจากกำไรปีล่าสุดมาก (อาจมีรายการพิเศษ)", "hard"],
  ["ยังไม่ยืนยันหน่วยหุ้น/อัตราส่วน ADR", "หุ้นจดทะเบียนต่างประเทศ ยืนยันหน่วยหุ้นไม่ได้", "hard"],
  ["แปลงสกุลเงินไม่สำเร็จ", "แปลงสกุลเงินงบการเงินไม่สำเร็จ", "hard"],
  ["โมเดลให้ค่าต่างกันมาก", "โมเดลประเมินให้ราคาต่างกันมาก", "soft"],
  ["P/E ย้อนหลังกระจายกว้าง", "P/E ย้อนหลังผันผวนสูง", "soft"],
];
export function valuationRiskFlags(f: StockData["fairValue"], level?: "hard" | "soft"): string[] {
  const warnings = f.warnings ?? [];
  return RISK_PATTERNS.filter(([needle, , sev]) => (!level || sev === level) && warnings.some(w => w.includes(needle))).map(([, label]) => label);
}

const fmt = (n: number, d = 2) => n.toFixed(d);

export function screenStock(data: StockData, style: ScreeningStyle, ctx?: MarketContext | null): ScreeningCheck[] {
  const f = data.fairValue;
  const q = f.quality ?? null;
  const unit = data.market === "TH" ? "THB" : "USD";
  const check = (label: string, value: number | null | undefined, predicate: (n: number) => boolean, suffix = "", reason?: (v: string) => string): ScreeningCheck => {
    const ok = value != null && Number.isFinite(value);
    const text = ok ? `${fmt(value)}${suffix}` : "ไม่มีข้อมูล";
    return { label, value: text, passed: ok ? predicate(value) : null, reason: ok && reason ? reason(text) : undefined };
  };
  if (data.assetKind !== "stock") return [{label: "รองรับหุ้นสามัญเท่านั้น", value: "ไม่ใช้กับ ETF/ทอง/ค่าเงิน", passed: null}];

  if (style === "long") {
    const earningsYield = f.forwardEps != null && data.lastClose > 0 ? f.forwardEps / data.lastClose * 100 : null;
    const financial = q?.sector === "Financial Services";
    const debt: ScreeningCheck = financial
      ? { label: "หนี้สุทธิ ≤ 3 เท่าของ EBITDA", value: "ไม่ใช้กับกลุ่มการเงิน", passed: true }
      : q?.netDebtToEbitda != null && Number.isFinite(q.netDebtToEbitda)
        ? q.netDebtToEbitda <= 0
          ? { label: "หนี้สุทธิ ≤ 3 เท่าของ EBITDA", value: "เงินสดมากกว่าหนี้", passed: true, reason: "เงินสดมากกว่าหนี้สิน (ไม่มีหนี้สุทธิ)" }
          : check("หนี้สุทธิ ≤ 3 เท่าของ EBITDA", q.netDebtToEbitda, n => n <= 3, " เท่า", v => `หนี้สุทธิ ${v}ของ EBITDA`)
        : { label: "หนี้สุทธิ ≤ 3 เท่าของ EBITDA", value: "ไม่มีข้อมูล", passed: null };
    const flags = valuationRiskFlags(f, "hard");
    return [
      check("Forward EPS > 0", f.forwardEps, n => n > 0, "", v => `คาดการณ์กำไร ${v} ${unit} ต่อหุ้น${earningsYield != null ? ` (${earningsYield.toFixed(2)}% ของราคา)` : ""}`),
      check("FCF Yield > 0%", f.fcfYieldPercent, n => n > 0, "%", v => `กระแสเงินสดอิสระ FCF Yield ${v}`),
      check("Upside ถึง Fair Value ≥ 10%", f.upsidePercent, n => n >= 10, "%", v => `ต่ำกว่าราคายุติธรรม ${v}`),
      {label: "มี 2 โมเดล หรือ 1 โมเดล + เป้านักวิเคราะห์", value: f.modelCount + " โมเดล" + (f.analystWeight === 0.5 ? " + นักวิเคราะห์" : ""), passed: hasValuationSupport(f)},
      check("ROE ≥ 10%", q?.roePercent, n => n >= 10, "%", v => `ผลตอบแทนต่อส่วนผู้ถือหุ้น (ROE) ${v}`),
      check("รายได้ล่าสุดไม่หดตัว (YoY ≥ 0%)", q?.revenueGrowthPercent, n => n >= 0, "%", v => `รายได้ล่าสุดโต ${v} เทียบปีก่อน`),
      debt,
      {label: "ข้อมูลกำไร/หน่วยหุ้นไม่ผิดปกติ", value: flags.length ? flags.join(" · ") : "ไม่มี", passed: flags.length === 0},
    ];
  }

  if (style === "dip") {
    const { percent: dd } = drawdownFromHigh(data);
    const financial = q?.sector === "Financial Services";
    const ttm = f.trailingEps, fwd = f.forwardEps;
    const epsRatio = ttm != null && Number.isFinite(ttm) && ttm > 0 && fwd != null && Number.isFinite(fwd) ? fwd / ttm : null;
    const hist = f.historicalPE, pe = f.trailingPE;
    const cheapVsHistory = hist && pe != null && Number.isFinite(pe) && pe > 0 ? pe <= hist.median : null;
    const cheapVsFair = f.upsidePercent != null && Number.isFinite(f.upsidePercent) ? f.upsidePercent >= 15 : null;
    const cheap: ScreeningCheck = cheapVsHistory === true || cheapVsFair === true
      ? { label: "ถูกกว่า P/E ในอดีต หรือต่ำกว่า Fair Value ≥ 15%", value: "ผ่าน", passed: true,
          reason: cheapVsHistory ? `P/E ${pe!.toFixed(1)} ต่ำกว่าค่ากลาง ${hist!.years} ปี (${hist!.median.toFixed(1)})` : `ต่ำกว่าราคายุติธรรม ${f.upsidePercent!.toFixed(1)}%` }
      : { label: "ถูกกว่า P/E ในอดีต หรือต่ำกว่า Fair Value ≥ 15%", value: cheapVsHistory === null && cheapVsFair === null ? "ไม่มีข้อมูล" : "ยังไม่ถูก", passed: cheapVsHistory === null && cheapVsFair === null ? null : false };
    const flags = valuationRiskFlags(f, "hard");
    return [
      check(`ลงจากจุดสูงสุด 52 สัปดาห์ ≥ ${DIP_DEEP_PERCENT}%`, dd, n => n <= -DIP_DEEP_PERCENT, "%", v => `ราคาต่ำกว่าจุดสูงสุด 52 สัปดาห์ ${v}`),
      check("Forward EPS > 0", f.forwardEps, n => n > 0, "", v => `คาดการณ์กำไร ${v} ${unit} ต่อหุ้น`),
      check("กำไรคาดการณ์ไม่ลดลงเกิน 10%", epsRatio != null ? (epsRatio - 1) * 100 : null, n => n >= -10, "%", v => `กำไรคาดการณ์เทียบ 12 เดือนล่าสุด ${v} (ราคาลงแต่กำไรไม่ลงตาม)`),
      cheap,
      check("ROE ≥ 10%", q?.roePercent, n => n >= 10, "%", v => `ผลตอบแทนต่อส่วนผู้ถือหุ้น (ROE) ${v}`),
      check("รายได้ล่าสุดไม่หดตัว (YoY ≥ 0%)", q?.revenueGrowthPercent, n => n >= 0, "%", v => `รายได้ล่าสุดโต ${v} เทียบปีก่อน`),
      financial ? { label: "หนี้สุทธิ ≤ 3 เท่าของ EBITDA", value: "ไม่ใช้กับกลุ่มการเงิน", passed: true }
        : q?.netDebtToEbitda != null && Number.isFinite(q.netDebtToEbitda) && q.netDebtToEbitda <= 0
          ? { label: "หนี้สุทธิ ≤ 3 เท่าของ EBITDA", value: "เงินสดมากกว่าหนี้", passed: true, reason: "เงินสดมากกว่าหนี้สิน" }
          : check("หนี้สุทธิ ≤ 3 เท่าของ EBITDA", q?.netDebtToEbitda, n => n <= 3, " เท่า", v => `หนี้สุทธิ ${v}ของ EBITDA`),
      {label: "ข้อมูลกำไร/หน่วยหุ้นไม่ผิดปกติ", value: flags.length ? flags.join(" · ") : "ไม่มี", passed: flags.length === 0},
    ];
  }

  if (style === "momentum" || style === "smallcap") {
    const t = techSnapshot(data);
    const financial = q?.sector === "Financial Services";
    const debtCheck = (max: number): ScreeningCheck => financial ? { label: `หนี้สุทธิ ≤ ${max} เท่าของ EBITDA`, value: "ไม่ใช้กับกลุ่มการเงิน", passed: true }
      : q?.netDebtToEbitda != null && Number.isFinite(q.netDebtToEbitda) && q.netDebtToEbitda <= 0
        ? { label: `หนี้สุทธิ ≤ ${max} เท่าของ EBITDA`, value: "เงินสดมากกว่าหนี้", passed: true, reason: "เงินสดมากกว่าหนี้สิน" }
        : check(`หนี้สุทธิ ≤ ${max} เท่าของ EBITDA`, q?.netDebtToEbitda, n => n <= max, " เท่า", v => `หนี้สุทธิ ${v}ของ EBITDA`);
    if (style === "momentum") {
      const trend = analyzeTrend(data);
      const idx = ctx?.index6mPercent;
      const rel = t?.ret6m != null && idx != null ? t.ret6m - idx : null;
      const extendedSma = t?.sma50 != null ? (t.close / t.sma50 - 1) * 100 : null;
      return [
        check("ROE ≥ 15%", q?.roePercent, n => n >= 15, "%", v => `ROE ${v}`),
        financial ? { label: "อัตรากำไรจากการดำเนินงาน ≥ 15%", value: "ไม่ใช้กับกลุ่มการเงิน", passed: true }
          : check("อัตรากำไรจากการดำเนินงาน ≥ 15%", q?.operatingMarginPercent, n => n >= 15, "%", v => `อัตรากำไรจากการดำเนินงาน ${v}`),
        check("รายได้โต ≥ 10%", q?.revenueGrowthPercent, n => n >= 10, "%", v => `รายได้โต ${v} เทียบปีก่อน`),
        check("กำไรคาดการณ์โตต่อ", t?.epsGrowthPercent, n => n > 0, "%", v => `กำไรคาดการณ์โต ${v} จาก 12 เดือนล่าสุด`),
        debtCheck(2),
        { label: "แนวโน้มขาขึ้น", value: trend?.label ?? "ข้อมูลไม่พอ", passed: trend ? trend.kind === "up" : null, reason: trend?.kind === "up" ? `แนวโน้ม${trend.label}` : undefined },
        check(`6 เดือนแรงกว่า${ctx?.indexName ?? "ตลาด"}`, rel, n => n > 0, " จุด%", v => `6 เดือน ${t!.ret6m! >= 0 ? "+" : ""}${t!.ret6m!.toFixed(1)}% แรงกว่า${ctx?.indexName ?? "ตลาด"} ${v}`),
        check("ห่างจุดสูงสุด 52 สัปดาห์ ≤ 15%", t?.fromHigh52, n => n >= -15, "%", v => `ห่างจุดสูงสุด ${v}`),
        check("ไม่แพงเกินการเติบโต (PEG ≤ 2)", t?.peg, n => n <= 2, "", v => `PEG ${v} (P/E ÷ การเติบโตของกำไร)`),
        { label: "ยังไม่วิ่งเกินตัว (ห่างเส้น 50 วัน ≤ 15% · RSI ≤ 75)", value: extendedSma == null || t?.rsi == null ? "ข้อมูลไม่พอ" : `ห่างเส้น 50 วัน ${extendedSma.toFixed(1)}% · RSI ${t.rsi.toFixed(0)}`,
          passed: extendedSma == null || t?.rsi == null ? null : extendedSma <= 15 && t.rsi <= 75,
          reason: extendedSma != null && t?.rsi != null ? `ราคาห่างเส้น 50 วัน ${extendedSma.toFixed(1)}% · RSI ${t.rsi.toFixed(0)} ยังไม่ร้อนเกิน` : undefined },
      ];
    }
    const cap = f.marketCap;
    const capMax = SMALL_CAP_MAX[data.market];
    const minValue = data.market === "TH" ? 5e6 : 1e6;
    const aboveSma50 = t?.sma50 != null ? (t.close / t.sma50 - 1) * 100 : null;
    return [
      check(`บริษัทเล็ก (Market Cap < ${data.market === "TH" ? "1 หมื่นล้านบาท" : "2 พันล้าน USD"})`, cap != null ? cap / 1e9 : null, n => n * 1e9 < capMax, ` พันล้าน ${unit}`, v => `มูลค่าบริษัท ${v}`),
      check("มีกำไรแล้ว (EPS > 0)", f.trailingEps, n => n > 0, "", v => `กำไรต่อหุ้น 12 เดือน ${v} ${unit}`),
      check("รายได้โต ≥ 15%", q?.revenueGrowthPercent, n => n >= 15, "%", v => `รายได้โต ${v} เทียบปีก่อน`),
      check("กำไรคาดการณ์โต ≥ 10%", t?.epsGrowthPercent, n => n >= 10, "%", v => `กำไรคาดการณ์โต ${v}`),
      debtCheck(2.5),
      check("ราคาเหนือเส้น 50 วัน", aboveSma50, n => n > 0, "%", v => `ราคาเหนือเส้น 50 วัน ${v}`),
      check("ใกล้จุดสูงสุด 3 เดือน (≤ 10%)", t?.fromHigh3m, n => n >= -10, "%", v => `ห่างจุดสูงสุด 3 เดือน ${v} ใกล้ทะลุกรอบ`),
      check("แรงซื้อเข้า (Volume 5 วัน ≥ 1.3 เท่า)", t?.volRatio5v50, n => n >= 1.3, " เท่า", v => `Volume 5 วันล่าสุด ${v}ของ 50 วันก่อนหน้า`),
      check(`สภาพคล่อง ≥ ${data.market === "TH" ? "5 ล้านบาท" : "1 ล้าน USD"}/วัน`, t?.tradedValue20 != null ? t.tradedValue20 / 1e6 : null, n => n * 1e6 >= minValue, ` ล้าน ${unit}`, v => `มูลค่าซื้อขายเฉลี่ย ${v}/วัน`),
    ];
  }

  if (style === "dividend") {
    return [
      check("Dividend Yield 2–8%", f.dividendYieldPercent, n => n >= 2 && n <= 8, "%", v => `อัตราปันผล ${v} อยู่ในช่วง 2–8%`),
      check("เงินปันผลต่อหุ้น > 0", f.dividendRate, n => n > 0, "", v => `เงินปันผลต่อหุ้น ${v} ${unit}`),
      check("FCF Yield > 0%", f.fcfYieldPercent, n => n > 0, "%", v => `กระแสเงินสดอิสระ FCF Yield ${v}`),
      check("P/E ย้อนหลัง > 0", f.trailingPE, n => n > 0, "", () => "กำไรย้อนหลังเป็นบวก"),
      check("จ่ายปันผล ≤ 80% ของกำไร", q?.payoutPercent, n => n <= 80, "%", v => `จ่ายปันผล ${v} ของกำไร (ไม่จ่ายเกินตัว)`),
      check("เงินสดอิสระ ≥ 1 เท่าของปันผล", q?.fcfDividendCoverage, n => n >= 1, " เท่า", v => `เงินสดอิสระครอบคลุมปันผล ${v}`),
    ];
  }

  const candles = completedCandles(data);
  const close = candles.at(-1)?.close ?? null;
  const average = (n: number) => candles.length >= n ? candles.slice(-n).reduce((sum,c) => sum+c.close,0)/n : null;
  const sma20 = average(20), sma50 = average(50);
  const prior = candles.slice(-21,-1);
  const volume = prior.length === 20 ? prior.reduce((sum,c)=>sum+c.volume,0)/20 : 0;
  const recent = candles.slice(-20);
  const tradedValue = recent.length === 20 ? recent.reduce((sum,c)=>sum+c.close*c.volume,0)/20 : null;
  const minValue = data.market === "TH" ? 20e6 : 5e6;
  const millions = tradedValue != null ? tradedValue / 1e6 : null;
  return [
    check("ราคาเหนือ SMA20", sma20 && close ? (close/sma20-1)*100 : null, n=>n>0, "%", v => `ราคาเหนือค่าเฉลี่ย 20 วัน ${v}`),
    check("SMA20 เหนือ SMA50", sma20 && sma50 ? (sma20/sma50-1)*100 : null,n=>n>0,"%", () => "ค่าเฉลี่ย 20 วันสูงกว่า 50 วัน"),
    check("Volume ≥ 1.2 เท่าของ 20 วันก่อน", volume > 0 && candles.length ? candles[candles.length-1].volume/volume : null,n=>n>=1.2," เท่า", v => `ปริมาณซื้อขายเป็น ${v}ของค่าเฉลี่ย 20 วันก่อน`),
    check("ราคาเหนือ Pivot", data.pivot.pivot > 0 ? (data.lastClose/data.pivot.pivot-1)*100 : null,n=>n>0,"%", () => "ราคาเหนือ Pivot"),
    check(`มูลค่าซื้อขายเฉลี่ย ≥ ${data.market === "TH" ? "20 ล้าน THB" : "5 ล้าน USD"}/วัน`, millions, n => n * 1e6 >= minValue, ` ล้าน ${unit}`, v => `สภาพคล่องเฉลี่ย ${v}/วัน`),
  ];
}
