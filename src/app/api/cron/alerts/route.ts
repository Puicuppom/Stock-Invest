import { NextResponse } from "next/server";
import { runAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** เรียกทุก 15 นาทีจาก GitHub Actions · ?dry=1 = ดูว่าจะเตือนอะไรโดยไม่ส่ง · ส่งซ้ำไม่ได้ (จำว่าส่งแล้ว) */
export async function GET(request: Request) {
  try {
    const dry = new URL(request.url).searchParams.get("dry") === "1";
    return NextResponse.json(await runAlerts({ dryRun: dry }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "alerts failed" }, { status: 502 });
  }
}
