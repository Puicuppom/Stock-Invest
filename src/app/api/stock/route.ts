import { NextRequest, NextResponse } from "next/server";
import { getStockData } from "@/lib/stock-service";

// Compatibility endpoint for the imported ReBalance application.
export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim();
  if (!symbol || symbol.length > 40 || !/^[a-zA-Z0-9.^=/_-]+$/.test(symbol)) {
    return NextResponse.json({ error: "กรุณาระบุสัญลักษณ์หุ้นที่ถูกต้อง" }, { status: 400 });
  }

  try {
    const data = await getStockData(symbol, symbol.toUpperCase().endsWith(".BK") ? "TH" : "US");
    return NextResponse.json({
      symbol: data.resolvedSymbol,
      price: data.lastClose,
      fairValue: data.fairValue,
    });
  } catch {
    return NextResponse.json({ error: "โหลดราคาไม่สำเร็จ" }, { status: 502 });
  }
}
