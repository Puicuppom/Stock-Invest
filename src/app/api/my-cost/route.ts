import { NextRequest, NextResponse } from "next/server";
import { isCash, loadPortfolios } from "@/lib/portfolio-summary";

export const dynamic = "force-dynamic";

/** ต้นทุนเฉลี่ยของหุ้นตัวนี้ในพอร์ตหน้าปรับพอร์ต (รวมทุกพอร์ตสกุลเดียวกัน) */
export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9.^=-]{1,40}$/.test(symbol)) return NextResponse.json({ error: "symbol" }, { status: 400 });
  try {
    const { pfs } = await loadPortfolios();
    let shares = 0, cost = 0;
    for (const p of pfs) for (const a of p.assets) {
      if (isCash(a)) continue;
      const name = String(a.name ?? "").toUpperCase();
      if (name !== symbol && name !== `${symbol}.BK` && name.replace(/\.BK$/, "") !== symbol) continue;
      const s = Number(a.shares) || 0, c = Number(a.avgCost) || 0;
      if (s > 0 && c > 0) { shares += s; cost += s * c; }
    }
    return NextResponse.json(shares > 0 ? { shares, avgCost: cost / shares } : { shares: 0, avgCost: null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ shares: 0, avgCost: null }, { headers: { "Cache-Control": "no-store" } });
  }
}
