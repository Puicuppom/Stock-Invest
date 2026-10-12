import { NextRequest, NextResponse } from "next/server";
import { fetchYahooCandles } from "@/lib/chart-service";
import { priceHistoryExtremes } from "@/lib/price-history";
import { resolveSymbol } from "@/lib/symbol";

export async function GET(request: NextRequest, {params}: {params: Promise<{symbol: string}>}) {
  const {symbol} = await params;
  const market = request.nextUrl.searchParams.get("market") === "TH" ? "TH" : "US";
  try {
    const resolved = resolveSymbol(symbol, market);
    const {candles} = await fetchYahooCandles(resolved, "1d", "full", false);
    return NextResponse.json(priceHistoryExtremes(candles));
  } catch {
    return NextResponse.json({error: "โหลดราคาย้อนหลังไม่สำเร็จ"}, {status: 502});
  }
}
