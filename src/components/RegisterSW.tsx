"use client";
import { useEffect } from "react";

const PREFS_DEFAULT = { earnings: true, xd: true, sr: true, move: true, plan: true };

/** เคยเปิดแจ้งเตือนไว้ แต่เซิร์ฟเวอร์ไม่มีเครื่องนี้แล้ว (หมดอายุ/ถูกล้าง) → สมัครใหม่ให้เองเงียบ ๆ ทุกครั้งที่เปิดแอป */
async function keepPushAlive() {
  if (!("PushManager" in window) || Notification.permission !== "granted") return;
  let wanted: string | null = null;
  try { wanted = localStorage.getItem("pushWanted"); } catch { /* ignore */ }
  if (wanted === "0") return;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    if (wanted !== "1") return;
    const { publicKey } = await (await fetch("/api/push/key")).json();
    if (!publicKey) return;
    const b = atob((publicKey + "=".repeat((4 - publicKey.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(b, c => c.charCodeAt(0)) });
  }
  const check = await fetch("/api/push/subscribe?check=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
  if (check.ok && (await check.json()).subscribed) return;
  let prefs = PREFS_DEFAULT;
  try { prefs = { ...PREFS_DEFAULT, ...JSON.parse(localStorage.getItem("pushPrefs") || "{}") }; } catch { /* ignore */ }
  await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), prefs }) });
  try { localStorage.setItem("pushWanted", "1"); } catch { /* ignore */ }
}

/** ลงทะเบียน service worker (รับแจ้งเตือน + ติดตั้งเป็นแอป) */
export default function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    const t = window.setTimeout(() => { keepPushAlive().catch(() => {}); }, 4000);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
