"use client";
import { useEffect, useState } from "react";
import type { priceHistoryExtremes } from "@/lib/price-history";
type History = ReturnType<typeof priceHistoryExtremes>;

export default function PriceHistoryCard({symbol, market}: {symbol: string; market: "TH" | "US"}) {
  const [data,setData] = useState<History | null>(null);
  const [error,setError] = useState(false);
  const [retry,setRetry] = useState(0);
  useEffect(()=>{
    const abort = new AbortController();
    setData(null);setError(false);
    fetch(`/api/stock/${encodeURIComponent(symbol)}/history?market=${market}`, {signal: abort.signal})
      .then(async response=>{if(!response.ok)throw new Error();return response.json();})
      .then(value=>{if(!abort.signal.aborted)setData(value);})
      .catch(()=>{if(!abort.signal.aborted)setError(true);});
    return ()=>abort.abort();
  },[symbol,market,retry]);
  const format = (value: number) => value.toLocaleString("en-US", {maximumFractionDigits: 4});
  return <section className="screen-panel" aria-label="ราคาต่ำสุดสูงสุดย้อนหลัง">
    <h2>ต่ำสุด / สูงสุดตลอดข้อมูลที่มี</h2>
    {!data && !error && <p role="status">กำลังค้นหาประวัติราคาทั้งหมด…</p>}
    {error && <p>โหลดประวัติราคาไม่ได้ <button onClick={()=>setRetry(n=>n+1)}>ลองใหม่</button></p>}
    {data && <>
      <div className="dash-metrics-cols">
        <div className="dash-metric"><p className="dash-metric-label">ต่ำสุด</p><p className="dash-metric-value">{format(data.low)} {market === "TH" ? "THB" : "USD"}</p><p className="dash-metric-sub">{data.lowDate}</p></div>
        <div className="dash-metric"><p className="dash-metric-label">สูงสุด</p><p className="dash-metric-value">{format(data.high)} {market === "TH" ? "THB" : "USD"}</p><p className="dash-metric-sub">{data.highDate}</p></div>
      </div>
      <p className="dash-metric-sub">ช่วง {data.from} – {data.to} · ใช้ High/Low รายวันจาก Yahoo ไม่ใช่เฉพาะราคาปิด อาจไม่ครอบคลุมตั้งแต่เข้าตลาด และราคาในอดีตอาจปรับตามการแตกหุ้น</p>
    </>}
  </section>;
}
