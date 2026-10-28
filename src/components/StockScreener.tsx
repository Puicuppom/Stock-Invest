"use client";
import { useEffect, useRef, useState } from "react";
import AppNavigation from "./AppNavigation";
import ScreeningEntryCard from "./ScreeningEntryCard";
import WatchlistReview from "./WatchlistReview";
import ScreenRow from "./ScreenRow";
import PortfolioPlanner from "./PortfolioPlanner";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useWatchlist } from "@/hooks/useWatchlist";
import { screeningStyles, screenStock, valuationRiskFlags, VISIBLE_STYLES, type ScreeningStyle } from "@/lib/screener";
import { returnPercent, type MarketContext } from "@/lib/momentum";
import { interestScore, RANKING_DESCRIPTION } from "@/lib/screener-ranking";
import { analyzeTrend, LEAN_GLYPH, LEAN_SHORT, trendLean } from "@/lib/trend";
import { DISCOVERY_SECTORS } from "@/lib/discovery";
import type { StockData } from "@/lib/types";
type Row = { symbol: string; data?: StockData; error?: string };
const CONCURRENCY = 8;
const STYLE_ICON: Record<string, string> = { dip: "🏷️", momentum: "🚀", smallcap: "💎", dividend: "💰", etf: "📦" };
const STYLE_SHORT: Record<string, string> = { dip: "ลดราคา", momentum: "ไปต่อ", smallcap: "หุ้นจิ๋ว", dividend: "ปันผล", etf: "ETF" };
type Snapshot = {
  style: ScreeningStyle; market: "US" | "TH"; source: "discover" | "watchlist";
  sector: string; cap: string; nextOffset: number | null; discoveryNote: string;
  total: number; rows: Row[]; message: string; scannedMarket: "US" | "TH";
  pending: string[]; cursor: number | null; seen: string[]; ctx: MarketContext | null;
};
// Retain the current search across client-side navigation without refetching.
let savedSearch: Snapshot | null = null;
export default function StockScreener() {
  const [view,setView] = useState<"watchlist" | "plan" | "market">("watchlist");
  const autoScan = useRef(false);
  const [openRow,setOpenRow] = useState<string | null>(null);
  const [style,setStyle] = useState<ScreeningStyle>("dip");
  const [ctx,setCtx] = useState<MarketContext | null>(null);
  const [market,setMarket] = useState<"US"|"TH">("US");
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
      setStyle(VISIBLE_STYLES.includes(s.style) ? s.style : "dip");setCtx(s.ctx);setMarket(s.market);setSector(s.sector);setCap(s.cap);
      setNextOffset(s.nextOffset);setDiscoveryNote(s.discoveryNote);setTotal(s.total);
      setRows(s.rows);setMessage(s.message);setScannedMarket(s.scannedMarket);
      pending.current=[...s.pending];cursor.current=s.cursor;seen.current=new Set(s.seen);
    }
    setRestored(true);
    return ()=>controller.current?.abort();
  },[]);
  useEffect(()=>{
    if (!restored) return;
    savedSearch={style,market,source:"discover",sector,cap,nextOffset,discoveryNote,total,rows,
      message:busy ? "เก็บผลค้นหาไว้แล้ว · กดค้นหาต่อได้" : message,scannedMarket,
      pending:[...pending.current],cursor:cursor.current,seen:[...seen.current],ctx};
    return ()=>{
      // Include candidates currently loading so leaving the page never skips them.
      if (savedSearch) {
        savedSearch.pending=[...pending.current];savedSearch.cursor=cursor.current;
        savedSearch.seen=[...seen.current];
        savedSearch.nextOffset=pending.current.length ? cursor.current ?? 0 : cursor.current;
      }
    };
  },[restored,style,market,sector,cap,nextOffset,discoveryNote,total,rows,message,scannedMarket,busy,ctx]);
  // มาจากปุ่ม "คัดเพิ่ม" ของผู้ช่วยจัดพอร์ต → ค้นหาทันทีด้วยกลุ่มที่เลือก
  useEffect(()=>{
    if (view==="market" && autoScan.current && restored) { autoScan.current=false; scan(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[view,style,market,restored]);
  async function loadRow(symbol: string, signal: AbortSignal): Promise<Row> {
    try {
      const response=await fetch("/api/stock/"+encodeURIComponent(symbol)+"?market="+market+"&mode=screen",{signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
      const data=await response.json();
      if (!response.ok) throw new Error();
      return {symbol,data};
    } catch {return {symbol,error:"โหลดข้อมูลไม่สำเร็จ"};}
  }
  async function scan(append = false) {
    controller.current?.abort();
    const abort = new AbortController(); controller.current=abort;
    if (!append) {
      pending.current=[];cursor.current=0;seen.current.clear();
      setRows([]);setNextOffset(null);setDiscoveryNote("");
    }
    setBusy(true);setMessage("");setScannedMarket(market);setTotal(0);
    let scanCtx=ctx;
    if (style === "momentum" && (!append || !scanCtx)) {
      // ดัชนีอ้างอิงสำหรับเทียบความแรง 6 เดือน
      const indexName=market==="US"?"S&P 500":"SET";
      try {
        const r=await fetch("/api/stock/"+encodeURIComponent(market==="US"?"^GSPC":"^SET.BK")+"?market="+market+"&mode=screen",{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)])});
        const d=await r.json();
        const closes:number[]=r.ok && Array.isArray(d.candles) ? d.candles.map((c:{close:number})=>c.close) : [];
        scanCtx={index6mPercent:returnPercent(closes,126),indexName};
      } catch { scanCtx={index6mPercent:null,indexName}; }
      setCtx(scanCtx);
    }
    let passedInBatch=0;
    const updateContinuation=()=>setNextOffset(pending.current.length ? cursor.current ?? 0 : cursor.current);
    try {
      while (!abort.signal.aborted && passedInBatch < 30) {
        if (!pending.current.length) {
          if (cursor.current === null) break;
          const offset=cursor.current;
          const params=new URLSearchParams({market,sector,cap:style==="smallcap"?"small":cap,offset:String(offset),style,size:"100"});
          const response=await fetch("/api/discover?"+params,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(25000)])});
          const result=await response.json();
          if (!response.ok) throw new Error(result.error || "ค้นหารายชื่อไม่สำเร็จ");
          if (abort.signal.aborted) return;
          if (!Array.isArray(result.symbols) || (result.nextOffset !== null && result.nextOffset <= offset)) throw new Error("ข้อมูลหน้าถัดไปไม่ถูกต้อง");
          cursor.current=result.nextOffset;
          pending.current=result.symbols.filter((symbol: string)=>!seen.current.has(symbol));
          setDiscoveryNote(String(result.total));
          updateContinuation();
          if (!pending.current.length) continue;
        }
        // โหลดพร้อมกัน 8 ตัวแบบต่อเนื่อง (ตัวไหนเสร็จก็หยิบตัวถัดไปทันที ไม่รอทั้งชุด)
        // ตัวที่กำลังโหลดยังอยู่ใน pending จนเสร็จ → ออกจากหน้าแล้วกลับมาค้นหาต่อจะไม่ข้าม
        await new Promise<void>(resolve=>{
          const inflight=new Set<string>();
          const pump=()=>{
            if (abort.signal.aborted || passedInBatch>=30) { if (!inflight.size) resolve(); return; }
            const next=pending.current.filter(sym=>!inflight.has(sym));
            if (!next.length) { if (!inflight.size) resolve(); return; }
            for (const symbol of next.slice(0,CONCURRENCY-inflight.size)) {
              inflight.add(symbol);
              loadRow(symbol,abort.signal).then(row=>{
                inflight.delete(symbol);
                if (abort.signal.aborted) { pump(); return; }
                pending.current=pending.current.filter(sym=>sym!==symbol);
                if (!seen.current.has(row.symbol)) {
                  seen.current.add(row.symbol);
                  const checks=row.data ? screenStock(row.data,style,scanCtx) : [];
                  if (checks.length && checks.every(check=>check.passed===true)) passedInBatch++;
                  setRows(previous=>[...previous,row]);
                  setTotal(passedInBatch);
                }
                pump();
              });
            }
          };
          pump();
        });
        if (abort.signal.aborted) return;
        updateContinuation();
      }
      if (!abort.signal.aborted) setMessage(passedInBatch>=30 ? "ครบ 30 ตัว" : "ตรวจครบทุกตัวแล้ว");
    } catch(error) {
      if (!abort.signal.aborted) setMessage((error instanceof Error ? error.message : "ค้นหาไม่สำเร็จ") + " · กดหาเพิ่มเพื่อทำต่อ");
    } finally {
      if (controller.current===abort) {updateContinuation();setBusy(false);}
    }
  }
  const evaluated=rows.map(row=>{
    const checks=row.data ? screenStock(row.data,style,ctx):[];
    const count=checks.filter(c=>c.passed===true).length;
    const passed=checks.length>0 && checks.every(c=>c.passed===true);
    const incomplete=checks.some(c=>c.passed===null);
    const failed=checks.filter(c=>c.passed!==true);
    // เกือบผ่าน = ขาดเกณฑ์เดียว (ไม่ผ่าน หรือไม่มีข้อมูล)
    const nearMiss=!row.error && checks.length>1 && failed.length===1;
    const flags=row.data ? valuationRiskFlags(row.data.fairValue) : [];
    const trend=row.data ? analyzeTrend(row.data) : null;
    return {...row,checks,count,passed,incomplete,failed,nearMiss,flags,trend,score:row.data ? interestScore(row.data,style,ctx) : 0};
  }).sort((a,b)=>Number(b.passed)-Number(a.passed)||b.score-a.score||a.symbol.localeCompare(b.symbol));
  // ราคาสด + ก่อนเปิด/หลังปิด ของตัวที่ผ่าน/เกือบผ่าน (ดึงหลังค้นหาเสร็จ · ทุก 30 วิ)
  const liveItems=busy ? [] : evaluated.filter(r=>r.passed||r.nearMiss).map(r=>({symbol:r.symbol,market:scannedMarket}));
  const live=useLiveQuotes(liveItems, view==="market");
  const lq=(sym:string)=>live[`${sym}::${scannedMarket}`];
  // แตะการ์ดสรุป → เลื่อนไปยังกลุ่มนั้น (กลุ่มที่พับไว้จะกางออก)
  const goTo=(id:string)=>{
    const el=document.getElementById(id);
    if (!el) return;
    if (el instanceof HTMLDetailsElement) el.open=true;
    el.scrollIntoView({behavior:"smooth",block:"start"});
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  };
  return <main className="app-shell screener">
    <AppNavigation active="screener" />
    <p className="dash-metric-sub" role="status">{syncStatus}</p>
    <header><h1>คัดหุ้น</h1></header>
    <div className="screen-styles screen-view" role="group" aria-label="มุมมอง">
      <button aria-pressed={view==="watchlist"} onClick={()=>setView("watchlist")}>⭐ Watchlist</button>
      <button aria-pressed={view!=="watchlist"} onClick={()=>setView("plan")}>🧭 จัดพอร์ต</button>
    </div>
    {view==="watchlist" ? <WatchlistReview items={items} loaded={loaded} />
    : view==="plan" ? <PortfolioPlanner items={items} loaded={loaded}
        onAdd={(symbol,m)=>{const ok=addStock(symbol,m); if(ok) setMessage(`เพิ่ม ${symbol} ใน Watchlist แล้ว`); return ok;}}
        onScreen={(st,m)=>{controller.current?.abort();setStyle(st);setMarket(m);setSector("");setCap("all");clearResults();autoScan.current=true;setView("market");window.scrollTo({top:0});}} />
    : <>
    <button type="button" className="pl-back" onClick={()=>setView("plan")}>← กลับไปจัดพอร์ต</button>
    <div className="scr-styles" role="group" aria-label="แนวทางคัดหุ้น">
      {VISIBLE_STYLES.map(key=><button key={key} type="button" aria-pressed={style===key} disabled={busy} title={screeningStyles[key].tagline} onClick={()=>{if (key !== style) {setStyle(key);clearResults();}}}>
        <span className="scr-ico">{STYLE_ICON[key]}</span><span>{STYLE_SHORT[key]}</span>
      </button>)}
    </div>
    <details className="screen-desc"><summary>{screeningStyles[style].tagline}</summary><p>{screeningStyles[style].description}</p></details>
    <div className="scr-filters">
      <span className="scr-seg" role="group" aria-label="ตลาด">
        {(["US","TH"] as const).map(m=><button key={m} type="button" aria-pressed={market===m} disabled={busy} onClick={()=>{if (m!==market) {setMarket(m);clearResults();}}}>{m==="US"?"US":"ไทย"}</button>)}
      </span>
      {style !== "etf" && <label className="scr-pick" title="กลุ่มธุรกิจ"><span aria-hidden="true">🏢</span>
        <select aria-label="กลุ่มธุรกิจ" value={sector} disabled={busy} onChange={e=>{setSector(e.target.value);clearResults();}}>{DISCOVERY_SECTORS.map(([value,label])=><option key={value} value={value}>{value ? label : "ทุกกลุ่ม"}</option>)}</select>
      </label>}
      {style !== "smallcap" && style !== "etf" && <label className="scr-pick" title="ขนาดบริษัท"><span aria-hidden="true">📏</span>
        <select aria-label="ขนาดบริษัท" value={cap} disabled={busy} onChange={e=>{setCap(e.target.value);clearResults();}}><option value="all">ทุกขนาด</option><option value="large">ใหญ่</option><option value="mid">กลาง</option><option value="small">เล็ก</option></select>
      </label>}
    </div>
    <div className="scr-go">
      {busy ? <>
        <div className="scr-progress" aria-live="polite">
          <i style={{width:`${Math.min(100,total/30*100)}%`}} />
          <span>🔍 ตรวจ {rows.length} · ✓ {total}/30</span>
        </div>
        <button type="button" className="scr-stop" onClick={()=>{controller.current?.abort();setMessage("หยุดแล้ว");}} aria-label="หยุดค้นหา">■</button>
      </> : <>
        <button type="button" className="scr-run" disabled={!restored} onClick={()=>scan()}>🔍 {rows.length ? "ค้นหาใหม่" : "ค้นหา"}</button>
        {nextOffset !== null && rows.length>0 && <button type="button" className="scr-more" onClick={()=>scan(true)}>＋ หาเพิ่ม</button>}
      </>}
    </div>
    {rows.length>0 && (()=>{
      const passN=evaluated.filter(r=>r.passed).length, nearN=evaluated.filter(r=>r.nearMiss).length, errN=rows.filter(r=>r.error).length;
      return <>
        <nav className="scr-cards" aria-label="สรุปผลค้นหา">
          <div className="scr-card all"><i aria-hidden="true">🔍</i><b>{rows.length}</b><small>ตรวจแล้ว</small></div>
          <button type="button" className="scr-card pass" disabled={!passN} onClick={()=>goTo("scr-pass")}><i aria-hidden="true">✓</i><b>{passN}</b><small>ผ่าน</small></button>
          <button type="button" className="scr-card near" disabled={!nearN} onClick={()=>goTo("scr-near")}><i aria-hidden="true">≈</i><b>{nearN}</b><small>เกือบผ่าน</small></button>
          <button type="button" className="scr-card err" disabled={!errN} onClick={()=>goTo("scr-err")}><i aria-hidden="true">⚠</i><b>{errN}</b><small>โหลดไม่ได้</small></button>
        </nav>
        {message && <p className="scr-msg" role="status">{message}</p>}
      </>;
    })()}
    {!busy && rows.length>0 && !evaluated.some(r=>r.passed) && <p className="scr-empty">ยังไม่พบตัวที่ผ่านครบ · ลอง ＋ หาเพิ่ม หรือดูกลุ่มเกือบผ่าน</p>}
    {evaluated.some(row=>row.passed) && <div className="wl" id="scr-pass"><ul className="wl-list scr-list">{evaluated.filter(row=>row.passed).map((row,index)=>{
      const lean=row.trend?trendLean(row.trend.kind,row.trend.label):null;
      const inList=items.some(item=>item.symbol===row.symbol && item.market===scannedMarket);
      return <ScreenRow key={row.symbol} symbol={row.symbol} market={scannedMarket} name={row.data?.longName} price={lq(row.symbol)?.price ?? row.data?.lastClose} changePercent={lq(row.symbol)?.changePercent ?? row.data?.changePercent} ext={lq(row.symbol)?.ext}
        open={openRow===row.symbol} onToggle={()=>setOpenRow(openRow===row.symbol?null:row.symbol)} error={row.error?"โหลดไม่ได้":null}
        line2={<>
          <em className="scr-chip rank">#{index+1}</em>
          {row.data && <em className="scr-chip score" title={`คะแนน · ${RANKING_DESCRIPTION[style]}`}>★ {row.score}</em>}
          {lean && <em className={`scr-chip ico lean lean-${lean}`} title={`${LEAN_SHORT[lean]} · ${row.trend!.label}`} aria-label={LEAN_SHORT[lean]}>{LEAN_GLYPH[lean]}</em>}
          {row.flags.length>0 && <em className="scr-chip warn" title={row.flags.join(" · ")}>⚠</em>}
          {style==="etf" && row.data?.etf?.expenseRatio!=null && <em className="scr-chip" title="ค่าธรรมเนียมต่อปี">💸 {row.data.etf.expenseRatio.toFixed(2)}%</em>}
          {style==="etf" && row.data && <em className="scr-chip fail" title="ห่างจุดสูงสุด 52 สัปดาห์">▼ {Math.abs((row.data.lastClose/Math.max(...row.data.candles.slice(-252).map(c=>c.high||c.close))-1)*100).toFixed(0)}%</em>}
        </>}>
        {row.flags.length>0 && <p className="screen-flags" role="note">⚠ {row.flags.join(" · ")}</p>}
        {row.data && <ScreeningEntryCard data={row.data} style={style} ctx={ctx} />}
        {row.data && <div className="scr-actions">
          <button disabled={!loaded||inList} onClick={()=>{if(addStock(row.symbol,scannedMarket))setMessage(`เพิ่ม ${row.symbol} ใน Watchlist แล้ว`);}}>{inList?"อยู่ใน Watchlist แล้ว":"+ เพิ่ม Watchlist"}</button>
        </div>}
      </ScreenRow>;
    })}</ul></div>}
    {evaluated.some(row=>row.nearMiss) && <details className="screen-near wl" id="scr-near">
      <summary>≈ เกือบผ่าน · ขาด 1 ข้อ ({evaluated.filter(row=>row.nearMiss).length})</summary>
      <ul className="wl-list scr-list">
      {[...evaluated].filter(row=>row.nearMiss).sort((a,b)=>b.score-a.score||a.symbol.localeCompare(b.symbol)).map(row=>{
        const inList=items.some(item=>item.symbol===row.symbol && item.market===scannedMarket);
        return <ScreenRow key={row.symbol} symbol={row.symbol} market={scannedMarket} name={row.data?.longName} price={lq(row.symbol)?.price ?? row.data?.lastClose} changePercent={lq(row.symbol)?.changePercent ?? row.data?.changePercent} ext={lq(row.symbol)?.ext}
          open={openRow===`n:${row.symbol}`} onToggle={()=>setOpenRow(openRow===`n:${row.symbol}`?null:`n:${row.symbol}`)}
          line2={<>{row.data && <em className="scr-chip score" title="คะแนน">★ {row.score}</em>}{row.failed.map(c=><em key={c.label} className="scr-chip fail">✗ {c.label}</em>)}</>}>
          {row.failed.map(c=><p key={c.label} className="screen-near-fail">✗ {c.label} <span>({c.value})</span></p>)}
          {row.data && <div className="scr-actions"><button disabled={!loaded||inList} onClick={()=>{if(addStock(row.symbol,scannedMarket))setMessage(`เพิ่ม ${row.symbol} ใน Watchlist แล้ว`);}}>{inList?"อยู่ใน Watchlist แล้ว":"+ เพิ่ม Watchlist"}</button></div>}
        </ScreenRow>;
      })}
      </ul>
    </details>}
    {rows.some(r=>r.error) && <details className="screen-near wl scr-errs" id="scr-err">
      <summary>⚠ โหลดไม่ได้ ({rows.filter(r=>r.error).length})</summary>
      <p className="scr-err-list">{rows.filter(r=>r.error).map(r=><span key={r.symbol} title={r.error ?? ""}>{r.symbol}</span>)}</p>
      <p className="scr-err-note">ข้อมูลไม่พอหรือแหล่งข้อมูลไม่ตอบ · ไม่นับเป็นผ่าน</p>
    </details>}
    </>}
    <footer className="app-footer">เกณฑ์เริ่มต้นสำหรับคัดไปศึกษาต่อ ไม่ใช่คะแนนรับรองคุณภาพหรือคำสั่งซื้อ ข้อมูลที่ขาดจะไม่นับว่าผ่าน</footer>
  </main>;
}
