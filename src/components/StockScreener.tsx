"use client";
import { useEffect, useRef, useState } from "react";
import AppNavigation from "./AppNavigation";
import ScreeningEntryCard from "./ScreeningEntryCard";
import { useWatchlist } from "@/hooks/useWatchlist";
import { screeningStyles, screenStock, type ScreeningStyle } from "@/lib/screener";
import { discoveryUniverse } from "@/lib/discovery-universe";
import type { StockData } from "@/lib/types";
type Row = { symbol: string; data?: StockData; error?: string };
export default function StockScreener() {
  const [style,setStyle] = useState<ScreeningStyle>("long");
  const [market,setMarket] = useState<"US"|"TH">("US");
  const [source,setSource] = useState<"discover" | "watchlist">("discover");
  const [total,setTotal] = useState(0);
  const [rows,setRows] = useState<Row[]>([]);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [onlyPassed,setOnlyPassed] = useState(false);
  const [scannedMarket,setScannedMarket] = useState<"US"|"TH">("US");
  const controller = useRef<AbortController | null>(null);
  const {items,addStock,loaded,syncStatus} = useWatchlist();
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function scan() {
    const list = [...new Set(source === "discover" ? discoveryUniverse[market] : items.filter(item => item.market === market).map(item => item.symbol))];
    if (!list.length || list.length > 30 || list.some(s=>! /^[A-Z0-9.^=/-]{1,30}$/.test(s))) {
      setMessage("Watchlist ตลาดนี้ต้องมีหุ้น 1–30 ตัว หรือเลือกค้นหาหุ้นอัตโนมัติ"); return;
    }
    controller.current?.abort();
    const abort = new AbortController(); controller.current=abort;
    setTotal(list.length);setRows([]);setBusy(true);setMessage("");setScannedMarket(market);
    let next=0;
    const worker = async()=>{
      while(next<list.length && !abort.signal.aborted){
        const symbol=list[next++]; let row: Row;
        try {
          const response=await fetch(`/api/stock/${encodeURIComponent(symbol)}?market=${market}`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30000)])});
          const data=await response.json();
          if(!response.ok)throw new Error(data.error || "โหลดไม่ได้");
          row={symbol,data};
        } catch {
          if(abort.signal.aborted)return;
          row={symbol,error:"โหลดข้อมูลไม่สำเร็จ ลองคัดใหม่"};
        }
        if(!abort.signal.aborted)setRows(previous=>[...previous,row]);
      }
    };
    await Promise.all([worker(),worker(),worker()]);
    if(!abort.signal.aborted)setBusy(false);
  }
  const evaluated=rows.map(row=>{
    const checks=row.data ? screenStock(row.data,style):[];
    const count=checks.filter(c=>c.passed===true).length;
    const passed=checks.length>0 && checks.every(c=>c.passed===true);
    const incomplete=checks.some(c=>c.passed===null);
    return {...row,checks,count,passed,incomplete};
  }).sort((a,b)=>Number(b.passed)-Number(a.passed)||b.count-a.count||a.symbol.localeCompare(b.symbol));
  return <main className="app-shell screener">
    <AppNavigation active="screener" />
    <p className="dash-metric-sub" role="status">{syncStatus}</p>
    <header><h1>คัดหุ้น</h1><p>เลือกตลาดและแนวทาง แล้วกดค้นหาได้เลย</p></header>
    <div className="screen-styles" role="group" aria-label="แนวทางคัดหุ้น">
      {(Object.keys(screeningStyles) as ScreeningStyle[]).map(key=><button key={key} aria-pressed={style===key} onClick={()=>setStyle(key)}>{screeningStyles[key].label}</button>)}
    </div>
    <p>{screeningStyles[style].description}</p>
    <section className="screen-panel">
      <label htmlFor="screen-market">ตลาด</label>
      <select id="screen-market" value={market} disabled={busy} onChange={e=>{setMarket(e.target.value as "TH"|"US");setRows([]);setTotal(0);setMessage("");}}><option value="US">US</option><option value="TH">ไทย (BKK)</option></select>
      <label htmlFor="screen-source">ค้นหาจาก</label>
      <select id="screen-source" value={source} disabled={busy} onChange={e=>{setSource(e.target.value as "discover"|"watchlist");setRows([]);setTotal(0);setMessage("");}}>
        <option value="discover">ค้นหาหุ้นอัตโนมัติ — {discoveryUniverse[market].length} บริษัท</option>
        <option value="watchlist">Watchlist ของฉัน</option>
      </select>
      {source === "discover" && <details><summary>ขอบเขตการค้นหา: {discoveryUniverse[market].length} บริษัท</summary><p>ใช้รายชื่อบริษัทที่แอปจัดเตรียมไว้ กระจายหลายธุรกิจ ไม่ใช่การสแกนทั้งตลาดหรือรายชื่อหุ้นแนะนำ ระบบดึงข้อมูลมาคัดใหม่เมื่อกดค้นหา</p><p>{discoveryUniverse[market].join(", ")}</p></details>}
      <button disabled={busy || (source === "watchlist" && !loaded)} onClick={scan}>{busy ? "กำลังค้นหา… " + rows.length + "/" + total + " บริษัท" : "ค้นหาหุ้นให้ฉัน"}</button>
      {busy && <button onClick={()=>{controller.current?.abort();setBusy(false);setMessage("หยุดค้นหาแล้ว แสดงเฉพาะผลที่ตรวจเสร็จ");}}>หยุดค้นหา</button>}
    </section>
    <p role="status">{message}</p>
    <div className="screen-actions"><span aria-live="polite">ตรวจแล้ว {rows.length} · ผ่าน {evaluated.filter(r=>r.passed).length} · โหลดไม่ได้ {rows.filter(r=>r.error).length}</span><label><input type="checkbox" checked={onlyPassed} onChange={e=>setOnlyPassed(e.target.checked)} /> เฉพาะที่ผ่านครบ</label></div>
    {!busy && rows.length===0 && <p>เลือกถือยาว ปันผล หรือเทรดสั้น แล้วกด “ค้นหาหุ้นให้ฉัน” โดยไม่ต้องกรอกชื่อหุ้น</p>}
    {rows.length>0 && onlyPassed && !evaluated.some(r=>r.passed) && <p>ยังไม่มีหุ้นผ่านครบทุกเกณฑ์ ลองปิดตัวกรองเพื่อดูเหตุผล</p>}
    {evaluated.filter(row=>!onlyPassed||row.passed).map(row=><article className="screen-panel" key={row.symbol}>
      <div className="screen-actions"><h2>{row.symbol} <small>{scannedMarket==="TH"?"BKK":"US"}</small></h2><strong>{row.error?"โหลดไม่ได้":row.passed?"ผ่านครบ":row.incomplete?`ข้อมูลไม่ครบ · ผ่าน ${row.count}/${row.checks.length}`:`ผ่าน ${row.count}/${row.checks.length}`}</strong></div>
      {row.data && <p>{row.data.longName} · ราคาปิด {row.data.lastClose.toFixed(2)} {row.data.market==="TH"?"THB":"USD"} · {row.data.candles.at(-1)?.date}</p>}
      {row.data && <ScreeningEntryCard data={row.data} style={style} />}
      {row.error && <p role="alert">{row.error}</p>}
      <ul className="screen-checks">{row.checks.map(check=><li key={check.label}><span>{check.passed===null?"?":check.passed?"✓":"✗"} {check.label}</span><span>{check.value}</span></li>)}</ul>
      {row.data && <button disabled={!loaded||items.some(item=>item.symbol===row.symbol && item.market===scannedMarket)} onClick={()=>{if(addStock(row.symbol,scannedMarket))setMessage(`เพิ่ม ${row.symbol} ใน Watchlist แล้ว`);}}>{items.some(item=>item.symbol===row.symbol && item.market===scannedMarket)?"อยู่ใน Watchlist แล้ว":"+ เพิ่ม Watchlist"}</button>}
    </article>)}
    <footer className="app-footer">เกณฑ์เริ่มต้นสำหรับคัดไปศึกษาต่อ ไม่ใช่คะแนนรับรองคุณภาพหรือคำสั่งซื้อ ข้อมูลที่ขาดจะไม่นับว่าผ่าน</footer>
  </main>;
}
