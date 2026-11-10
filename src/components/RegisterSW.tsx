"use client";
import { useEffect } from "react";

/** ลงทะเบียน service worker (รับแจ้งเตือน + ติดตั้งเป็นแอป) */
export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
