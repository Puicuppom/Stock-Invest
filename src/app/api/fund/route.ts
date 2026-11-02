import { NextRequest, NextResponse } from "next/server";
import { fundNav, searchFunds } from "@/lib/fund";

export const dynamic = "force-dynamic";

/**
 * GET /api/fund?q=K-USA        → ค้นหากองทุน (รหัส/ชื่อ)
 * GET /api/fund?codes=A,B      → NAV ล่าสุดของแต่ละกอง (บาท/หน่วย)
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  try {
    const q = sp.get("q");
    if (q != null) return NextResponse.json({ funds: await searchFunds(q.slice(0, 40)) });
    const codes = [...new Set((sp.get("codes") ?? "").split(",").map(s => s.trim()).filter(Boolean))].slice(0, 40);
    const rows = await Promise.all(codes.map(c => fundNav(c).catch(() => null)));
    const navs: Record<string, unknown> = {};
    codes.forEach((c, i) => { if (rows[i]) navs[c] = rows[i]; });
    return NextResponse.json({ navs, at: Date.now() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "fund failed" }, { status: 502 });
  }
}
