"use client";
import { useEffect, useRef, useState } from "react";
import AppNavigation from "./AppNavigation";
import ScreeningEntryCard from "./ScreeningEntryCard";
import { useWatchlist } from "@/hooks/useWatchlist";
import { screeningStyles, screenStock, type ScreeningStyle } from "@/lib/screener";
import { interestScore, RANKING_DESCRIPTION } from "@/lib/screener-ranking";
import { DISCOVERY_SECTORS } from "@/lib/discovery";
import type { StockData } from "@/lib/types";
type Row = { symbol: string; data?: StockData; error?: string };
type Snapshot = {
  style: ScreeningStyle; market: "US" | "TH"; source: "discover" | "watchlist";
  sector: string; cap: string; nextOffset: number | null; discoveryNote: string;
  total: number; rows: Row[]; message: string; scannedMarket: "US" | "TH";
  pending: string[]; cursor: number | null; seen: string[];
};
// Retain the current search across client-side navigation without refetching.
let savedSearch: Snapshot | null = null;
export default function StockScreener() {
  const [style,setStyle] = useState<ScreeningStyle>("long");
  const [market,setMarket] = useState<"US"|"TH">("US");
  const [source,setSource] = useState<"discover" | "watchlist">("discover");
  const [sector,setSector] = useState("");
  const [cap,setCap] = useState("all");
  const [nextOffset,setNextOffset] = useState<number | null>(null);
  const [discoveryNote,setDiscoveryNote] = useState("");
  const pending = useRef<string[]>([]);
  const cursor = useRef<number | null>(0);
  const seen = useRef(new Set<string>());
  function clearResults() { pending.current=[];cursor.current=0;seen.current.clear(); setRows([]);setTotal(0);setNextOffset(null);setDiscoveryNote("");setMessage(""); }
  const [total,setTotal] = useState(0);
  const [rows,setRows] = useState<Row[]>([]);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [scannedMarket,setScannedMarket] = useState<"US"|"TH">("US");
  const controller = useRef<AbortController | null>(null);
  const {items,addStock,loaded,syncStatus} = useWatchlist();
  const [restored,setRestored] = useState(false);
  useEffect(()=>{
    if (savedSearch) {
      const s=savedSearch;
      setStyle(s.style);setMarket(s.market);setSource(s.source);setSector(s.sector);setCap(s.cap);
      setNextOffset(s.nextOffset);setDiscoveryNote(s.discoveryNote);setTotal(s.total);
      setRows(s.rows);setMessage(s.message);setScannedMarket(s.scannedMarket);
      pending.current=[...s.pending];cursor.current=s.cursor;seen.current=new Set(s.seen);
    }
    setRestored(true);
    return ()=>controller.current?.abort();
  },[]);
  useEffect(()=>{
    if (!restored) return;
    savedSearch={style,market,source,sector,cap,nextOffset,discoveryNote,total,rows,
      message:busy ? "เก็บผลค้นหาไว้แล้ว · กดค้นหาต่อได้" : message,scannedMarket,
      pending:[...pending.current],cursor:cursor.current,seen:[...seen.current]};
    return ()=>{
      // Include candidates currently loading so leaving the page never skips them.
      if (savedSearch) {
        savedSearch.pending=[...pending.current];savedSearch.cursor=cursor.current;
        savedSearch.seen=[...seen.current];
        savedSearch.nextOffset=pending.current.length ? cursor.current ?? 0 : cursor.current;
      }
    };
  },[restored,style,market,source,sector,cap,nextOffset,discoveryNote,total,rows,message,scannedMarket,busy]);
  async function scan(append = false) {
    controller.current?.abort();
    const abort = new AbortController(); controller.current=abort;
    if (!append) {
      pending.current=[];cursor.current=source === "discover" ? 0 : null;seen.current.clear();
      setRows([]);setNextOffset(null);setDiscoveryNote("");
      if (source === "watchlist") pending.current=[...new Set(items.filter(item=>item.market===market).map(item=>item.symbol))];
    }
    setBusy(true);setMessage("");setScannedMarket(market);setTotal(0);
    let passedInBatch=0;
    const updateContinuation=()=>setNextOffset(pending.current.length ? cursor.current ?? 0 : cursor.current);
    try {
      while (!abort.signal.aborted && passedInBatch < 30) {
        if (!pending.current.length) {
          if (cursor.current === null) break;
          const offset=cursor.current;
          const params=new URLSearchParams({market,sector,cap,offset:String(offset)});
          const response=await fetch("/api/discover?"+params,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(25000)])});
          const result=await response.json();
          if (!response.ok) throw new Error(result.error || "ค้นหารายชื่อไม่สำเร็จ");
          if (abort.signal.aborted) return;
          if (!Array.isArray(result.symbols) || (result.nextOffset !== null && result.nextOffset <= offset)) throw new Error("ข้อมูลหน้าถัดไปไม่ถูกต้อง");
          cursor.current=result.nextOffset;
          pending.current=result.symbols.filter((symbol: string)=>!seen.current.has(symbol));
          setDiscoveryNote("Yahoo พบ " + result.total.toLocaleString() + " รายการก่อนกรองชนิดสินทรัพย์ · ตรวจรายชื่อถึงลำดับ " + (result.nextOffset ?? result.total));
          updateContinuation();
          if (!pending.current.length) continue;
        }
        const batch=pending.current.slice(0,Math.min(5,30-passedInBatch));
        const results=await Promise.all(batch.map(async(symbol):Promise<Row>=>{
          try {
            const response=await fetch("/api/stock/"+encodeURIComponent(symbol)+"?market="+market+"&mode=screen",{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30000)])});
            const data=await response.json();
            if (!response.ok) throw new Error();
            return {symbol,data};
          } catch {return {symbol,error:"โหลดข้อมูลไม่สำเร็จ ลองค้นหาใหม่เพื่อทดสอบอีกครั้ง"};}
        }));
        if (abort.signal.aborted) return;
        pending.current.splice(0,batch.length);
        for (const row of results) {
          if (seen.current.has(row.symbol)) continue;
          seen.current.add(row.symbol);
          const checks=row.data ? screenStock(row.data,style) : [];
          if (checks.length && checks.every(check=>check.passed===true)) passedInBatch++;
          setRows(previous=>[...previous,row]);
        }
        setTotal(passedInBatch);
        updateContinuation();
      }
      if (!abort.signal.aborted) setMessage(passedInBatch===30 ? "พบหุ้นผ่านครบเพิ่ม 30 ตัวแล้ว" : "ตรวจครบขอบเขตที่แหล่งข้อมูลส่งให้แล้ว · ชุดนี้ผ่าน " + passedInBatch + " ตัว (หุ้นที่โหลดไม่ได้ยังยืนยันผลไม่ได้)");
    } catch(error) {
      if (!abort.signal.aborted) setMessage((error instanceof Error ? error.message : "ค้นหาไม่สำเร็จ") + " · ผลที่ตรวจแล้วเก็บไว้ กดค้นหาต่อได้");
    } finally {
      if (controller.current===abort) {updateContinuation();setBusy(false);}
    }
  }
  const evaluated=rows.map(row=>{
    const checks=row.data ? screenStock(row.data,style):[];
    const count=checks.filter(c=>c.passed===true).length;
    const passed=checks.length>0 && checks.every(c=>c.passed===true);
    const incomplete=checks.some(c=>c.passed===null);
    return {...row,checks,count,passed,incomplete,score:row.data ? interestScore(row.data,style) : 0};
  }).sort((a,b)=>Number(b.passed)-Number(a.passed)||b.score-a.score||a.symbol.localeCompare(b.symbol));
  return <main className="app-shell screener">
    <AppNavigation active="screener" />
    <p className="dash-metric-sub" role="status">{syncStatus}</p>
    <header><h1>คัดหุ้น</h1><p>เลือกตลาดและแนวทาง แล้วกดค้นหาได้เลย</p></header>
    <div className="screen-styles" role="group" aria-label="แนวทางคัดหุ้น">
      {(Object.keys(screeningStyles) as ScreeningStyle[]).map(key=><button key={key} aria-pressed={style===key} disabled={busy} onClick={()=>{if (key !== style) {setStyle(key);clearResults();}}}>{screeningStyles[key].label}</button>)}
    </div>
    <p>{screeningStyles[style].description}</p>
    <section className="screen-panel">
      <label htmlFor="screen-market">ตลาด</label>
      <select id="screen-market" value={market} disabled={busy} onChange={e=>{setMarket(e.target.value as "TH"|"US");clearResults();}}><option value="US">US</option><option value="TH">ไทย (BKK)</option></select>
      <label htmlFor="screen-source">ค้นหาจาก</label>
      <select id="screen-source" value={source} disabled={busy} onChange={e=>{setSource(e.target.value as "discover"|"watchlist");clearResults();}}>
        <option value="discover">ค้นหาจากตลาด — Yahoo Finance</option>
        <option value="watchlist">Watchlist ของฉัน</option>
      </select>
      {source === "discover" && <>
        <label htmlFor="screen-sector">กลุ่มธุรกิจ</label>
        <select id="screen-sector" value={sector} disabled={busy} onChange={e=>{setSector(e.target.value);clearResults();}}>{DISCOVERY_SECTORS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
        <label htmlFor="screen-cap">ขนาดบริษัท (Market Cap)</label>
        <select id="screen-cap" value={cap} disabled={busy} onChange={e=>{setCap(e.target.value);clearResults();}}><option value="all">ทุกขนาด</option><option value="large">ใหญ่</option><option value="mid">กลาง</option><option value="small">เล็ก</option></select>
        <p>{market === "US" ? "ใหญ่ ≥ 10 พันล้าน USD · กลาง 2–ต่ำกว่า 10 พันล้าน · เล็ก < 2 พันล้าน" : "ใหญ่ ≥ 100 พันล้าน THB · กลาง 10–ต่ำกว่า 100 พันล้าน · เล็ก < 10 พันล้าน"}</p>
        <details><summary>ขอบเขตการค้นหา</summary><p>ค้นหาต่อเนื่องตามตัวกรอง เรียง Market Cap จากมากไปน้อย จนพบหุ้นผ่านครบ 30 ตัวต่อชุด หรือหมดขอบเขตที่แหล่งข้อมูลส่งให้ หุ้นที่ไม่ผ่านหรือข้อมูลไม่ครบไม่นับรวม 30 ตัว ตัดรายการที่ Yahoo ระบุว่าเป็น DR/วอร์แรนต์ไทย รวมถึงรหัส -R/-F ออก กลุ่มธุรกิจใช้การจัดประเภทของ Yahoo และอาจมีข้อมูลขาดหรือคลาดเคลื่อน ขนาดบริษัทเป็นเกณฑ์ของแอปในสกุลเงินตลาด</p></details>
      </>}
      <button disabled={!restored || busy || (source === "watchlist" && !loaded)} onClick={()=>scan()}>{busy ? "กำลังค้นหา… ผ่าน " + total + "/30 · ตรวจ " + rows.length + " ตัว" : rows.length > 0 || nextOffset !== null ? "↻ รีเฟรช · เริ่มค้นหาใหม่" : "ค้นหาหุ้นให้ฉัน"}</button>
      {busy && <button onClick={()=>{controller.current?.abort();setMessage("หยุดค้นหาแล้ว แสดงเฉพาะผลที่ตรวจเสร็จ");}}>หยุดค้นหา</button>}
    </section>
    {discoveryNote && <p>{discoveryNote}</p>}
    <p role="status">{message}</p>
    <div className="screen-actions"><span aria-live="polite">ตรวจแล้ว {rows.length} · ผ่าน {evaluated.filter(r=>r.passed).length} · โหลดไม่ได้ {rows.filter(r=>r.error).length}</span></div>
    {!busy && rows.length===0 && <p>เลือกถือยาว ปันผล หรือเทรดสั้น แล้วกด “ค้นหาหุ้นให้ฉัน” โดยไม่ต้องกรอกชื่อหุ้น</p>}
    {rows.length>0 && !evaluated.some(r=>r.passed) && <p>ยังไม่มีหุ้นผ่านครบทุกเกณฑ์ในรายการที่ตรวจแล้ว</p>}
    <details className="screen-panel"><summary>เรียงความน่าสนใจมากไปน้อย · วิธีคิดคะแนน</summary><p>{RANKING_DESCRIPTION[style]}</p><p>คะแนนตามสูตรของแอป ใช้เปรียบเทียบเฉพาะหุ้นที่ค้นพบและผ่านครบ ยังไม่ใช่อันดับของทั้งตลาดหรือโอกาสทำกำไร หากคะแนนเท่ากันเรียงตามชื่อหุ้น</p></details>
    {evaluated.filter(row=>row.passed).map((row,index)=><article className="screen-panel" key={row.symbol}>
      <div className="screen-actions"><h2>#{index+1} {row.symbol} <small>{scannedMarket==="TH"?"BKK":"US"}</small></h2><strong>{row.error?"โหลดไม่ได้":row.passed?"ผ่านครบ":row.incomplete?`ข้อมูลไม่ครบ · ผ่าน ${row.count}/${row.checks.length}`:`ผ่าน ${row.count}/${row.checks.length}`}</strong></div>
      {row.data && <p>{row.data.longName} · ราคาปิด {row.data.lastClose.toFixed(2)} {row.data.market==="TH"?"THB":"USD"} · {row.data.candles.at(-1)?.date}</p>}
      {row.data && <p title={RANKING_DESCRIPTION[style]}>คะแนนความน่าสนใจ <strong style={{color: "var(--accent)"}}>{row.score}/100</strong></p>}
      {row.data && <ScreeningEntryCard data={row.data} style={style} />}
      {row.error && <p role="alert">{row.error}</p>}
      {row.data && <button disabled={!loaded||items.some(item=>item.symbol===row.symbol && item.market===scannedMarket)} onClick={()=>{if(addStock(row.symbol,scannedMarket))setMessage(`เพิ่ม ${row.symbol} ใน Watchlist แล้ว`);}}>{items.some(item=>item.symbol===row.symbol && item.market===scannedMarket)?"อยู่ใน Watchlist แล้ว":"+ เพิ่ม Watchlist"}</button>}
    </article>)}
    {nextOffset !== null && <button disabled={busy} onClick={()=>scan(true)}>ค้นหาต่ออีก 30 ตัวที่ผ่านครบ</button>}
    <footer className="app-footer">เกณฑ์เริ่มต้นสำหรับคัดไปศึกษาต่อ ไม่ใช่คะแนนรับรองคุณภาพหรือคำสั่งซื้อ ข้อมูลที่ขาดจะไม่นับว่าผ่าน</footer>
  </main>;
}
