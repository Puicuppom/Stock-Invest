"use client";
import { useEffect, useRef, useState } from "react";

/** โลโก้หุ้นจาก Financial Modeling Prep — ถ้าโหลดไม่ได้จะไม่แสดงอะไร */
export default function StockLogo({ symbol, size = 28, className = "" }: { symbol: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  // รูปที่ error ก่อน React ผูก onError (ตอน hydrate) จะไม่ยิง event → เช็กเองหลัง mount
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete) { if (img.naturalWidth === 0) setFailed(true); else setLoaded(true); }
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
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  );
}
