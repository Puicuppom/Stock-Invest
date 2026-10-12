import { NextRequest, NextResponse } from "next/server";
import { getStockData } from "@/lib/stock-service";
import { buildSrLevels, nearestSrLevels, type SrLevel } from "@/lib/sr-levels";
import type { PivotLevels, PriceZone, SrMode } from "@/lib/types";

function pickLevel(level: SrLevel | null) {
  return level ? { price: level.price, label: level.label } : null;
}

// แนวรับ/แนวต้านที่ใกล้ราคาปัจจุบันที่สุด ทั้งโหมดถือยาว (swing) และเทรดสั้น (pivot)
function nearestLevels(pivot: PivotLevels, zones: PriceZone[], price: number) {
  const out: Record<SrMode, { support: ReturnType<typeof pickLevel>; resistance: ReturnType<typeof pickLevel> }> = {
    swing: { support: null, resistance: null },
    pivot: { support: null, resistance: null },
  };
  for (const mode of ["swing", "pivot"] as const) {
    const { nearestSupport, nearestResistance } = nearestSrLevels(
      buildSrLevels(pivot, zones, mode),
      price
    );
    out[mode] = { support: pickLevel(nearestSupport), resistance: pickLevel(nearestResistance) };
  }
  return out;
}

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
      srLevels: nearestLevels(data.pivot, data.zones, data.lastClose),
    });
  } catch {
    return NextResponse.json({ error: "โหลดราคาไม่สำเร็จ" }, { status: 502 });
  }
}
