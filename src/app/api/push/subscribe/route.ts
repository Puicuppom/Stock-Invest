import { NextResponse } from "next/server";
import { DEFAULT_PREFS, loadPushState, savePushState, type AlertPrefs } from "@/lib/push";

export const dynamic = "force-dynamic";

const validSub = (s: unknown): s is { endpoint: string; keys: { p256dh: string; auth: string } } => {
  const x = s as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  return typeof x?.endpoint === "string" && /^https:\/\//.test(x.endpoint) && x.endpoint.length < 1000
    && typeof x.keys?.p256dh === "string" && typeof x.keys?.auth === "string";
};
const cleanPrefs = (p: Partial<AlertPrefs> | undefined): AlertPrefs => ({
  earnings: p?.earnings !== false, xd: p?.xd !== false, sr: p?.sr !== false, move: p?.move !== false,
});

/** ดูสถานะของเครื่องนี้: POST {endpoint} ?check=1 · สมัคร/อัปเดต: POST {subscription, prefs} · ยกเลิก: DELETE {endpoint} */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const state = await loadPushState();
    if (new URL(request.url).searchParams.get("check")) {
      const hit = state.subs.find(s => s.endpoint === body?.endpoint);
      return NextResponse.json({ subscribed: !!hit, prefs: hit?.prefs ?? DEFAULT_PREFS, devices: state.subs.length });
    }
    if (!validSub(body?.subscription)) return NextResponse.json({ error: "ข้อมูลการสมัครไม่ถูกต้อง" }, { status: 400 });
    const sub = body.subscription;
    state.subs = state.subs.filter(s => s.endpoint !== sub.endpoint);
    state.subs.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, prefs: cleanPrefs(body.prefs), ua: String(request.headers.get("user-agent") ?? "").slice(0, 120), at: Date.now() });
    await savePushState(state);
    return NextResponse.json({ subscribed: true, devices: state.subs.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "สมัครไม่สำเร็จ" }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { endpoint } = await request.json();
    const state = await loadPushState();
    state.subs = state.subs.filter(s => s.endpoint !== endpoint);
    await savePushState(state);
    return NextResponse.json({ subscribed: false });
  } catch {
    return NextResponse.json({ error: "ยกเลิกไม่สำเร็จ" }, { status: 502 });
  }
}
