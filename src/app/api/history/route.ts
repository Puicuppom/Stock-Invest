import { NextResponse } from "next/server";
import { loadHistory } from "@/lib/history";

export const dynamic = "force-dynamic";
/** ประวัติยอดพอร์ตรายวัน (ให้หน้าปรับพอร์ตวาดกราฟเทียบดัชนี) */
export async function GET() {
  try {
    return NextResponse.json(await loadHistory(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "history failed" }, { status: 502 });
  }
}
