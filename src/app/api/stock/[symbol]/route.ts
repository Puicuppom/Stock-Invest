import { NextRequest, NextResponse } from "next/server";
import { getStockData } from "@/lib/stock-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const market = request.nextUrl.searchParams.get("market") as "TH" | "US" | null;

  try {
    const data = await getStockData(
      decodeURIComponent(symbol),
      market ?? "US",
      { screening: request.nextUrl.searchParams.get("mode") === "screen", deep: !request.nextUrl.searchParams.get("mode") }
    );
    // คัดหุ้นส่งราคาแค่ 1 ปี · Watchlist (lite) ~1.5 ปี พอสำหรับเส้น 200 วัน · ETF ส่งครบเพื่อดูประวัติการลงลึก/ฟื้นตัว
    const mode = request.nextUrl.searchParams.get("mode");
    const keep = mode === "screen" ? 252 : mode === "lite" ? 400 : 0;
    return NextResponse.json(keep && data.assetKind === "stock" ? { ...data, candles: data.candles.slice(-keep) } : data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch stock data";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
