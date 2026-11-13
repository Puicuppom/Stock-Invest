import type { Candle } from "./types";

export interface AnnualEps { date: string; eps: number; currency: string }
export interface HistoricalPE {
  low: number; median: number; high: number;
  months: number; years: number; start: string; end: string;
  annual: AnnualEps[];
  /** P/E รายเดือนย้อนหลัง (ใช้วาดกราฟช่วง P/E) */
  series: { date: string; pe: number }[];
}
const DAY = 86400000;
/**
 * P/E รายเดือนย้อนหลัง โดยใช้กำไรต่อหุ้น 12 เดือนล่าสุด (TTM) โดยประมาณ:
 * ไล่ค่าระหว่างกำไรรายปีแต่ละปีแบบเส้นตรง (เดือนที่ 6 หลังปิดงบ = ครึ่งทางระหว่างปีนั้นกับปีถัดไป)
 * ช่วงหลังปีงบล่าสุดใช้ EPS TTM ปัจจุบัน (ถ้ามี) เป็นปลายทาง
 * แบบนี้ไม่ทำให้ P/E ในอดีตของหุ้นที่กำไรโตเร็วสูงเกินจริง (ถ้าใช้กำไรรายปีเก่าค้างไว้ทั้งปี P/E จะพองมาก)
 * ราคาและ EPS จาก Yahoo ปรับตามการแตกพาร์แล้ว
 */
export function historicalPE(candles: Candle[], earnings: AnnualEps[], currency: string, currentTtmEps?: number | null): HistoricalPE | null {
  const sorted = [...candles].filter(c => Number.isFinite(c.close) && c.close > 0).sort((a,b)=>a.date.localeCompare(b.date));
  if (!sorted.length) return null;
  const end = Date.parse(sorted[sorted.length-1].date);
  const rows = [...earnings].filter(e=>e.currency===currency && Number.isFinite(e.eps) && Number.isFinite(Date.parse(e.date))).sort((a,b)=>a.date.localeCompare(b.date));
  // จุดอ้างอิงกำไร TTM: วันปิดปีงบ → EPS ปีนั้น · วันนี้ → EPS TTM ปัจจุบัน
  const anchors: { t: number; eps: number; year: string }[] = rows.map(e => ({ t: Date.parse(e.date), eps: e.eps, year: e.date }));
  const lastFy = anchors[anchors.length - 1];
  if (currentTtmEps != null && Number.isFinite(currentTtmEps) && lastFy && end > lastFy.t + 30 * DAY)
    anchors.push({ t: end, eps: currentTtmEps, year: lastFy.year });
  const ttmAt = (t: number) => {
    for (let i = anchors.length - 1; i >= 0; i--) {
      if (anchors[i].t > t) continue;
      const a = anchors[i], b = anchors[i + 1];
      if (!b) return t - a.t <= 400 * DAY ? { eps: a.eps, year: a.year } : null;
      const w = (t - a.t) / (b.t - a.t);
      return { eps: a.eps + (b.eps - a.eps) * w, year: a.year };
    }
    return null;
  };
  const months = new Map<string,Candle>();
  for (const c of sorted) if (Date.parse(c.date)>=end-5*365.25*DAY) months.set(c.date.slice(0,7),c);
  const samples: {date:string; pe:number; year:string}[]=[];
  for (const c of months.values()) {
    const e = ttmAt(Date.parse(c.date));
    // ช่วงขาดทุน/กำไรใกล้ศูนย์ P/E ไม่มีความหมาย
    if (!e || e.eps <= 0) continue;
    const pe=c.close/e.eps;
    if(Number.isFinite(pe) && pe>0 && pe<1000) samples.push({date:c.date,pe,year:e.year});
  }
  const years=new Set(samples.map(s=>s.year)).size;
  if(samples.length<24 || years<3) return null;
  const values=samples.map(s=>s.pe).sort((a,b)=>a-b);
  const quantile=(p:number)=>{const i=(values.length-1)*p; const n=Math.floor(i);return values[n]+(values[Math.ceil(i)]-values[n])*(i-n);};
  return {low:quantile(.25),median:quantile(.5),high:quantile(.75),months:samples.length,years,start:samples[0].date,end:samples[samples.length-1].date,annual:rows.filter(e=>samples.some(s=>s.year===e.date)),series:samples.map(s=>({date:s.date,pe:Math.round(s.pe*100)/100}))};
}

export async function fetchAnnualEps(symbol:string):Promise<AnnualEps[]> {
  try {
    const query=new URLSearchParams({type:"annualDilutedEPS",period1:String(Math.floor(Date.now()/1000)-7*366*86400),period2:String(Math.floor(Date.now()/1000))});
    const res=await fetch("https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/"+encodeURIComponent(symbol)+"?"+query,{next:{revalidate:86400},signal:AbortSignal.timeout(10000)});
    if(!res.ok)return [];
    const json=await res.json();
    const rows=json.timeseries?.result?.find((r:{meta?:{type?:string[]}})=>r.meta?.type?.includes("annualDilutedEPS"))?.annualDilutedEPS ?? [];
    return rows.filter((r:{periodType?:string})=>r.periodType==="12M").map((r:{asOfDate:string;currencyCode:string;reportedValue?:{raw:number}})=>({date:r.asOfDate,currency:r.currencyCode,eps:r.reportedValue?.raw}));
  }catch{return [];}
}
