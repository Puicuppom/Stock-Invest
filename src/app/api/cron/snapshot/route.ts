import { NextResponse } from "next/server";
import { takeSnapshot } from "@/lib/history";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** เรียกวันละครั้งหลังตลาด US ปิด (GitHub Actions) · เรียกซ้ำในวันเดียวกัน = เขียนทับแถววันนั้น */
export async function GET() {
  try {
    return NextResponse.json(await takeSnapshot(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "snapshot failed" }, { status: 502 });
  }
}
