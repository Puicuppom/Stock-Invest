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
      {screening:request.nextUrl.searchParams.get("mode")==="screen"}
    );
    // โหมดคัดหุ้นส่งราคาแค่ 1 ปีให้เบา · ETF ส่งครบเพื่อดูประวัติการลงลึก/ฟื้นตัว
    return NextResponse.json(request.nextUrl.searchParams.get("mode")==="screen" && data.assetKind === "stock" ? {...data,candles:data.candles.slice(-252)} : data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch stock data";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
