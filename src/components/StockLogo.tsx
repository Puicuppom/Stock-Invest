"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/* จำว่าโลโก้ตัวไหนเคยโหลดสำเร็จแล้ว (แชร์กับหน้าปรับพอร์ต) → ครั้งต่อไปโชว์ทันที ไม่ต้องเฟด */
const KEY = "logoSeen";
let seen: Set<string> | null = null;
function getSeen(): Set<string> {
  if (!seen) {
    try { seen = new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { seen = new Set(); }
  }
  return seen;
}
function markSeen(sym: string) {
  const s = getSeen();
  if (s.has(sym)) return;
  s.add(sym);
  try { localStorage.setItem(KEY, JSON.stringify([...s].slice(-400))); } catch { /* ignore */ }
}
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** โลโก้หุ้นจาก Financial Modeling Prep — ถ้าโหลดไม่ได้จะไม่แสดงอะไร */
export default function StockLogo({ symbol, size = 28, className = "" }: { symbol: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  // เคยโหลดแล้ว (อยู่ในแคชเบราว์เซอร์) → แสดงก่อนวาดจอ ไม่เห็นวงส้มแวบ
  useIsoLayoutEffect(() => { if (getSeen().has(sym)) setLoaded(true); }, [sym]);
  // รูปที่ error ก่อน React ผูก onError (ตอน hydrate) จะไม่ยิง event → เช็กเองหลัง mount
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete) { if (img.naturalWidth === 0) setFailed(true); else { setLoaded(true); markSeen(sym); } }
  }, [sym]);
  if (!sym || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      className={`stock-logo ${className}${loaded ? " is-loaded" : ""}`}
      src={`https://financialmodelingprep.com/image-stock/${encodeURIComponent(sym)}.png`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onLoad={() => { setLoaded(true); markSeen(sym); }}
      onError={() => setFailed(true)}
    />
  );
}
