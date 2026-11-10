import { NextResponse } from "next/server";
import { computeSummary } from "@/lib/portfolio-summary";

export const dynamic = "force-dynamic";

/**
 * GET /api/portfolio-summary → มูลค่ารวมของทุกพอร์ตในหน้าปรับพอร์ต (ราคาสด) เป็นบาท
 * ให้แอปอื่น (เช่น ลงทุนแมน) ดึงไปอัปเดตอัตโนมัติ · ส่งเฉพาะยอดรวม ไม่ส่งรายการหุ้น
 */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Cache-Control": "no-store" };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET() {
  try {
    const { holdings: _h, ...summary } = await computeSummary();
    void _h;
    return NextResponse.json(summary, { headers: CORS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "summary failed";
    return NextResponse.json({ error: msg }, { status: /ตั้งค่า/.test(msg) ? 503 : 502, headers: CORS });
  }
}
