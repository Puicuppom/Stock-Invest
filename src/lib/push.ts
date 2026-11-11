import { createECDH, createHmac } from "node:crypto";
import webpush from "web-push";
import { readRow, rowKey, writeRow } from "./cloud-store";

/**
 * คีย์ VAPID (ระบุตัวเว็บกับบริการ push ของเบราว์เซอร์)
 * ใช้ VAPID_PRIVATE_KEY ถ้าตั้งไว้ · ไม่งั้นสร้างคงที่จากคีย์ลับที่มีอยู่แล้วบนเซิร์ฟเวอร์ (SEC_API_KEY) — ไม่ต้องตั้งค่าเพิ่ม
 */
function b64url(buf: Buffer) { return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
let keys: { publicKey: string; privateKey: string } | null = null;
export function vapidKeys() {
  if (keys) return keys;
  const explicit = process.env.VAPID_PRIVATE_KEY?.trim();
  const seed = explicit || process.env.SEC_API_KEY?.trim();
  if (!seed) return null;
  const priv = explicit ? Buffer.from(explicit.replace(/-/g, "+").replace(/_/g, "/"), "base64") : createHmac("sha256", seed).update("investpui-vapid-v1").digest();
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(priv);
  keys = { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(priv) };
  return keys;
}

export type AlertPrefs = { earnings: boolean; xd: boolean; sr: boolean; move: boolean };
export const DEFAULT_PREFS: AlertPrefs = { earnings: true, xd: true, sr: true, move: true };
export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string }; prefs: AlertPrefs; ua?: string; at: number };
export type LogItem = { t: number; title: string; body: string; url?: string; kind?: string };
export type PushState = { subs: PushSub[]; sent: Record<string, number>; log: LogItem[] };

export const PUSH_ROW = () => rowKey("push");
export async function loadPushState(): Promise<PushState> {
  const s = await readRow<PushState>(PUSH_ROW());
  return { subs: Array.isArray(s?.subs) ? s!.subs : [], sent: s?.sent && typeof s.sent === "object" ? s.sent : {}, log: Array.isArray(s?.log) ? s!.log : [] };
}
export async function savePushState(s: PushState) {
  // เก็บประวัติส่งแค่ 14 วัน
  const cut = Date.now() - 14 * 86400_000;
  const sent = Object.fromEntries(Object.entries(s.sent).filter(([, t]) => t > cut));
  // ประวัติแจ้งเตือน: 7 วัน ไม่เกิน 60 รายการ (ไว้ดูย้อนหลัง/ส่งซ้ำ)
  const log = s.log.filter(x => x.t > Date.now() - 7 * 86400_000).slice(-60);
  await writeRow(PUSH_ROW(), { subs: s.subs.slice(-10), sent, log });
}

export type Note = { title: string; body: string; url?: string; tag?: string };
/** จดลงประวัติ (แจ้งเตือนจริง ไม่รวมส่งทดสอบ/ส่งซ้ำ) */
export function logNote(state: PushState, note: Note, kind?: string) {
  state.log.push({ t: Date.now(), title: note.title, body: note.body, url: note.url, kind });
}
/** ส่งให้ทุกเครื่องที่สมัครไว้ · ลบเครื่องที่หมดอายุ (404/410) ออก · คืนจำนวนที่ส่งสำเร็จ */
export async function sendToAll(state: PushState, note: Note, kind?: keyof AlertPrefs): Promise<number> {
  const k = vapidKeys();
  if (!k) throw new Error("ยังไม่มีคีย์สำหรับแจ้งเตือน");
  webpush.setVapidDetails("https://stock-invest-eight.vercel.app", k.publicKey, k.privateKey);
  let ok = 0;
  const dead = new Set<string>();
  await Promise.all(state.subs.filter(s => !kind || s.prefs?.[kind] !== false).map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(note), { TTL: 6 * 3600, urgency: "normal" });
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.add(s.endpoint);
    }
  }));
  if (dead.size) state.subs = state.subs.filter(s => !dead.has(s.endpoint));
  return ok;
}
