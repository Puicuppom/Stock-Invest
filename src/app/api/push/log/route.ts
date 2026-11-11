import { NextResponse } from "next/server";
import { loadPushState, savePushState, sendToAll } from "@/lib/push";

export const dynamic = "force-dynamic";

/** GET: ประวัติแจ้งเตือน 7 วัน (ใหม่สุดก่อน) */
export async function GET() {
  try {
    const s = await loadPushState();
    return NextResponse.json({ log: [...s.log].reverse() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "log failed" }, { status: 502 });
  }
}

/** POST {t}: ส่งแจ้งเตือนเรื่องนั้นซ้ำ · ไม่มี t = ส่งซ้ำทุกเรื่องใน 24 ชม. ล่าสุด (รวมเป็นแจ้งเตือนเดียวถ้าเกิน 3) */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const s = await loadPushState();
    if (Date.now() - (s.sent.__resend ?? 0) < 20_000) return NextResponse.json({ error: "เพิ่งส่งซ้ำไป รอสักครู่" }, { status: 429 });
    s.sent.__resend = Date.now();
    const items = body?.t ? s.log.filter(x => x.t === Number(body.t)) : s.log.filter(x => x.t > Date.now() - 86400_000);
    if (!items.length) return NextResponse.json({ sent: 0, error: "ไม่มีแจ้งเตือนให้ส่งซ้ำ" }, { status: 404 });
    let sent = 0;
    if (items.length <= 3) for (const x of items) sent += await sendToAll(s, { title: x.title, body: x.body, url: x.url, tag: `re-${x.t}` });
    else sent += await sendToAll(s, { title: `🔔 แจ้งเตือน 24 ชม. ล่าสุด (${items.length})`, body: items.map(x => x.title.replace(/^\S+\s/, "")).join(" · ").slice(0, 180), url: "/rebalance", tag: "re-all" });
    await savePushState(s);
    return NextResponse.json({ sent });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "resend failed" }, { status: 502 });
  }
}
