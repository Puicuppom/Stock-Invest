import { NextResponse } from "next/server";
import { loadPushState, savePushState, sendToAll } from "@/lib/push";

export const dynamic = "force-dynamic";
/** ส่งแจ้งเตือนทดสอบไปทุกเครื่องที่สมัครไว้ */
export async function POST() {
  try {
    const state = await loadPushState();
    // กันกดรัว: ทดสอบได้นาทีละครั้ง
    if (Date.now() - (state.sent.__test ?? 0) < 60_000) return NextResponse.json({ error: "เพิ่งส่งทดสอบไป รอสักครู่" }, { status: 429 });
    state.sent.__test = Date.now();
    const n = await sendToAll(state, { title: "InvestPui ✓", body: "แจ้งเตือนทำงานแล้ว จะเตือนเมื่อใกล้ประกาศงบ วัน XD ราคาถึงแนวรับ หรือขึ้นลงแรง", url: "/", tag: "test" });
    await savePushState(state);
    return NextResponse.json({ sent: n });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ส่งไม่สำเร็จ" }, { status: 502 });
  }
}
