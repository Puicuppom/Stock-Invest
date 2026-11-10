import { NextResponse } from "next/server";
import { vapidKeys } from "@/lib/push";

export const dynamic = "force-dynamic";
export function GET() {
  const k = vapidKeys();
  return k ? NextResponse.json({ publicKey: k.publicKey }) : NextResponse.json({ error: "ยังไม่มีคีย์สำหรับแจ้งเตือน" }, { status: 503 });
}
