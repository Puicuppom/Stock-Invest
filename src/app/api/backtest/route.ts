import { NextRequest, NextResponse } from "next/server";
import { fetchDailyCandles } from "@/lib/chart-service";
import { fetchAnnualEps } from "@/lib/historical-valuation";
import { fetchFundamentals } from "@/lib/fair-value";
import { resolveSymbol } from "@/lib/symbol";
import { backtestFairValue, backtestSignals } from "@/lib/backtest";

export const maxDuration = 60;

/** ทดสอบย้อนหลังหุ้นทีละตัว — ใช้ข้อมูลรายวัน 10 ปี + EPS รายปีจาก Yahoo */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const market = p.get("market") === "TH" ? "TH" : "US";
  const symbol = (p.get("symbol") || "").trim();
  if (!/^[A-Za-z0-9.\-^]{1,20}$/.test(symbol)) return NextResponse.json({ error: "symbol ไม่ถูกต้อง" }, { status: 400 });
  try {
    const resolved = resolveSymbol(symbol, market);
    const [daily, eps, fund] = await Promise.all([
      fetchDailyCandles(resolved),
      fetchAnnualEps(resolved).catch(() => []),
      fetchFundamentals(resolved).catch(() => null),
    ]);
    const candles = daily.candles.filter(c => c.close > 0);
    if (candles.length < 400) return NextResponse.json({ error: "ข้อมูลราคาไม่พอ (ต้องมีอย่างน้อย ~1.5 ปี)" }, { status: 422 });
    const currency = fund?.quoteCurrency ?? (market === "TH" ? "THB" : "USD");
    const signals = backtestSignals(resolved, candles, 3);
    const fair = backtestFairValue(candles, eps, market, fund?.sector ?? null, currency);
    return NextResponse.json({ symbol, market, bars: candles.length, from: candles[0].date, to: candles.at(-1)!.date, signals, fair });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ทดสอบไม่สำเร็จ" }, { status: 502 });
  }
}
