import { getYahooAuth, USER_AGENT } from "./yahoo-auth";

/** วันสำคัญของหุ้น (วันที่ตามเวลาตลาดนั้น รูปแบบ YYYY-MM-DD) */
export interface StockEvents {
  earningsDate: string | null;
  /** Yahoo ให้ช่วงวันที่ (ยังไม่ยืนยัน) */
  earningsEstimate: boolean;
  exDividendDate: string | null;
}

interface YahooRaw { raw?: number }
interface CalendarResponse {
  quoteSummary?: {
    result?: Array<{
      calendarEvents?: {
        earnings?: { earningsDate?: YahooRaw[]; isEarningsDateEstimate?: boolean };
        exDividendDate?: YahooRaw;
      };
    }>;
  };
}

const tzOf = (market: "TH" | "US") => (market === "TH" ? "Asia/Bangkok" : "America/New_York");

/** แปลงเวลา (วินาที) เป็นวันที่ตามเวลาตลาด */
export function marketDate(unixSec: number, market: "TH" | "US"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tzOf(market), year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(unixSec * 1000));
}

export async function fetchCalendarEvents(symbol: string, market: "TH" | "US"): Promise<StockEvents | null> {
  try {
    const { cookie, crumb } = await getYahooAuth();
    const url = new URL(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`);
    url.searchParams.set("modules", "calendarEvents");
    url.searchParams.set("crumb", crumb);
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT, Cookie: cookie },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as CalendarResponse;
    const cal = json.quoteSummary?.result?.[0]?.calendarEvents;
    if (!cal) return null;
    const dates = (cal.earnings?.earningsDate ?? []).map(d => d.raw).filter((v): v is number => v != null && Number.isFinite(v)).sort((a, b) => a - b);
    const xd = cal.exDividendDate?.raw;
    return {
      earningsDate: dates.length ? marketDate(dates[0], market) : null,
      earningsEstimate: cal.earnings?.isEarningsDateEstimate === true || dates.length > 1,
      exDividendDate: xd != null && Number.isFinite(xd) && xd > 0 ? marketDate(xd, market) : null,
    };
  } catch {
    return null;
  }
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export const thaiShortDate = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${TH_MONTHS[m - 1]}`;
};

/** จำนวนวันจากวันนี้ (ตามเวลาตลาด) ถึงวันที่ iso — ติดลบ = ผ่านมาแล้ว */
export function daysUntil(iso: string, market: "TH" | "US", now = new Date()): number {
  const today = marketDate(now.getTime() / 1000, market);
  return Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000);
}

export interface EventBadge { kind: "earnings" | "xd"; text: string; tone: "warn" | "info" | "dim"; title: string; days: number }

/** ป้ายสั้นสำหรับหัวหน้า/Watchlist — แสดงเฉพาะที่ใกล้ถึง */
export function eventBadges(events: StockEvents | null | undefined, market: "TH" | "US", now = new Date()): EventBadge[] {
  if (!events) return [];
  const out: EventBadge[] = [];
  if (events.earningsDate) {
    const d = daysUntil(events.earningsDate, market, now);
    const when = `${thaiShortDate(events.earningsDate)}${events.earningsEstimate ? " (คาดการณ์)" : ""}`;
    const title = `ประกาศงบ ${when} · ช่วงก่อน-หลังงบราคามักเหวี่ยงแรง แนวรับ/แนวต้านอาจใช้ไม่ได้`;
    if (d === 0) out.push({ kind: "earnings", text: "งบออกวันนี้", tone: "warn", title, days: d });
    else if (d > 0 && d <= 14) out.push({ kind: "earnings", text: `งบอีก ${d} วัน`, tone: d <= 7 ? "warn" : "info", title, days: d });
    else if (d > 14 && d <= 45) out.push({ kind: "earnings", text: `งบ ${thaiShortDate(events.earningsDate)}`, tone: "dim", title, days: d });
    else if (d < 0 && d >= -2) out.push({ kind: "earnings", text: "เพิ่งออกงบ", tone: "info", title: `ประกาศงบเมื่อ ${when} · ราคาอาจยังผันผวน`, days: d });
  }
  if (events.exDividendDate) {
    const d = daysUntil(events.exDividendDate, market, now);
    const title = `วันขึ้น XD ${thaiShortDate(events.exDividendDate)} · ต้องถือหุ้นก่อนวันนี้จึงได้ปันผล และวัน XD ราคามักลดลงประมาณเท่าปันผล`;
    if (d === 0) out.push({ kind: "xd", text: "XD วันนี้", tone: "warn", title, days: d });
    else if (d > 0 && d <= 14) out.push({ kind: "xd", text: `XD อีก ${d} วัน`, tone: d <= 7 ? "warn" : "info", title, days: d });
  }
  return out;
}
