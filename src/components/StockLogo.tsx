"use client";
import { useState } from "react";

/** โลโก้หุ้นจาก Financial Modeling Prep — ถ้าโหลดไม่ได้จะไม่แสดงอะไร */
export default function StockLogo({ symbol, size = 28, className = "" }: { symbol: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  if (!sym || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`stock-logo ${className}`}
      src={`https://financialmodelingprep.com/image-stock/${encodeURIComponent(sym)}.png`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
