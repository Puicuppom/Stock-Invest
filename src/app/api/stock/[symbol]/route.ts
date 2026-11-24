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
    // ให้ CDN เก็บไว้: รายการ Watchlist/คัดหุ้น 2 นาที · หน้าวิเคราะห์เต็ม 1 นาที (ราคาสดมาจาก /api/quotes อยู่แล้ว)
    const cacheControl = mode ? "public, s-maxage=120, stale-while-revalidate=600" : "public, s-maxage=60, stale-while-revalidate=300";
    // ปัดทศนิยมราคา (Yahoo ส่งมา 15 หลัก) → ข้อมูลเล็กลงเกือบครึ่ง โหลดเร็วขึ้น ค่าไม่เปลี่ยน
    const r = (v: number) => (Number.isFinite(v) ? (Math.abs(v) >= 1 ? Math.round(v * 1e4) / 1e4 : Math.round(v * 1e6) / 1e6) : v);
    const candles = (keep && data.assetKind === "stock" ? data.candles.slice(-keep) : data.candles)
      .map(c => ({ ...c, open: r(c.open), high: r(c.high), low: r(c.low), close: r(c.close), volume: Math.round(c.volume) }));
    return NextResponse.json({ ...data, candles }, { headers: { "Cache-Control": cacheControl } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch stock data";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
