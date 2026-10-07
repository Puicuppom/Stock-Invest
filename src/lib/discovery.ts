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
export interface DiscoveryQuote {symbol?: string; shortName?: string; longName?: string; quoteType?: string; currency?: string; marketCap?: number; regularMarketPrice?: number; fiftyTwoWeekHigh?: number}
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
export function eligibleQuote(q: DiscoveryQuote, market: "TH"|"US") {
  if (!q.symbol || q.quoteType !== "EQUITY" || !/^[A-Z0-9.^=-]{1,40}$/.test(q.symbol)) return false;
  if (market === "TH") return q.symbol.endsWith(".BK") && !/-(?:R|F|W\d*)\.BK$/.test(q.symbol) && q.currency === "THB" && !/(?:_DR\b|\bDR\b|WARRANT)/i.test(q.shortName || "");
  return q.currency === "USD" && !q.symbol.endsWith(".BK");
}
