export const DISCOVERY_SECTORS = [
  ["", "ทุกกลุ่มธุรกิจ"], ["Technology", "เทคโนโลยี"],
  ["Financial Services", "การเงิน"], ["Healthcare", "สุขภาพ"],
  ["Consumer Cyclical", "สินค้าอุปโภคบริโภคตามวัฏจักร"],
  ["Consumer Defensive", "สินค้าอุปโภคบริโภคจำเป็น"],
  ["Communication Services", "การสื่อสาร"], ["Industrials", "อุตสาหกรรม"],
  ["Energy", "พลังงาน"], ["Basic Materials", "วัสดุพื้นฐาน"],
  ["Real Estate", "อสังหาริมทรัพย์"], ["Utilities", "สาธารณูปโภค"],
] as const;
// Explicit local-currency thresholds; these are app categories, not exchange indices.
export const DISCOVERY_CAPS = ["all", "large", "mid", "small"] as const;
export function capLimits(market: "US"|"TH", size: string): [number, number | null] {
  const large = market === "US" ? 10e9 : 100e9;
  const mid = market === "US" ? 2e9 : 10e9;
  return size === "large" ? [large, null] : size === "mid" ? [mid, large] : size === "small" ? [0, mid] : [0, null];
}
export interface DiscoveryQuote {symbol?: string; shortName?: string; longName?: string; quoteType?: string; currency?: string; marketCap?: number; regularMarketPrice?: number; fiftyTwoWeekHigh?: number; fiftyDayAverage?: number; epsTrailingTwelveMonths?: number; trailingAnnualDividendYield?: number; dividendYield?: number}
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** คัดเบื้องต้นจากข้อมูลราคาที่ได้มาพร้อมรายชื่อ (ไม่ต้องโหลดทีละตัว) — ไม่มีข้อมูล = ไม่ตัด */
export function aboveAvg50(q: DiscoveryQuote, tolerancePercent = 3) {
  const p = q.regularMarketPrice, a = q.fiftyDayAverage;
  if (!num(p) || !num(a) || a <= 0) return true;
  return p >= a * (1 - tolerancePercent / 100);
}
export function profitable(q: DiscoveryQuote) {
  return !num(q.epsTrailingTwelveMonths) || q.epsTrailingTwelveMonths > 0;
}
export function dividendInRange(q: DiscoveryQuote) {
  const t = q.trailingAnnualDividendYield, d = q.dividendYield;
  const pct = num(t) && t > 0 ? t * 100 : num(d) && d > 0 ? (d < 0.2 ? d * 100 : d) : null;
  if (pct == null) return !(num(t) && t === 0 && !(num(d) && d > 0));
  return pct >= 1.5 && pct <= 10;
}
/** คัดเบื้องต้นสำหรับ "หุ้นดีลดราคา" — ตัดตัวที่ยังห่างจุดสูงสุดไม่ถึงเกณฑ์ (ไม่มีข้อมูล = ไม่ตัด ให้ตรวจละเอียดต่อ) */
/** คัดเบื้องต้นสำหรับ "หุ้นแกร่งไปต่อ" — ใกล้จุดสูงสุด 52 สัปดาห์ (ไม่มีข้อมูล = ไม่ตัด) */
export function nearHigh(q: DiscoveryQuote, maxDropPercent: number) {
  const p = q.regularMarketPrice, h = q.fiftyTwoWeekHigh;
  if (p == null || h == null || !Number.isFinite(p) || !Number.isFinite(h) || h <= 0) return true;
  return (p / h - 1) * 100 >= -(maxDropPercent + 3);
}
export function deepEnough(q: DiscoveryQuote, minDropPercent: number) {
  const p = q.regularMarketPrice, h = q.fiftyTwoWeekHigh;
  if (p == null || h == null || !Number.isFinite(p) || !Number.isFinite(h) || h <= 0) return true;
  return (p / h - 1) * 100 <= -minDropPercent + 3;
}
/** ETF ยอดนิยม — ใช้เมื่อค้นจาก Yahoo ไม่ได้ (รายชื่อสำหรับตั้งต้น ไม่ใช่คำแนะนำ) */
export const ETF_UNIVERSE: Record<"US" | "TH", string[]> = {
  US: ["VOO", "SPY", "IVV", "VTI", "QQQ", "QQQM", "SCHD", "VYM", "VIG", "DGRO", "SCHG", "VUG", "VTV", "RSP", "DIA", "IWM", "IJR", "MDY",
    "VGT", "XLK", "SMH", "SOXX", "XLF", "XLV", "XLE", "XLI", "XLY", "XLP", "XLU", "XLRE", "XLB", "XLC", "VNQ", "IBB", "XBI", "ITA",
    "VEA", "VWO", "IEFA", "IEMG", "EFA", "EEM", "VXUS", "ACWI", "VT", "EWJ", "INDA", "KWEB", "FXI", "EWZ",
    "JEPI", "JEPQ", "COWZ", "AVUV", "MGK", "TLT", "IEF", "BND", "AGG", "LQD", "HYG", "GLD", "IAU"],
  TH: ["TDEX", "1DIV", "BMSCG", "ENGY", "GLD"],
};
export function eligibleQuote(q: DiscoveryQuote, market: "TH"|"US", etf = false) {
  if (!q.symbol || q.quoteType !== (etf ? "ETF" : "EQUITY") || !/^[A-Z0-9.^=-]{1,40}$/.test(q.symbol)) return false;
  if (market === "TH") return q.symbol.endsWith(".BK") && !/-(?:R|F|W\d*)\.BK$/.test(q.symbol) && q.currency === "THB" && (etf || !/(?:_DR\b|\bDR\b|WARRANT)/i.test(q.shortName || ""));
  return q.currency === "USD" && !q.symbol.endsWith(".BK");
}
