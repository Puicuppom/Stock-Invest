import type { Candle } from "./types";

export interface AnnualEps { date: string; eps: number; currency: string }
export interface HistoricalPE {
  low: number; median: number; high: number;
  months: number; years: number; start: string; end: string;
  annual: AnnualEps[];
}
const DAY = 86400000;
export function historicalPE(candles: Candle[], earnings: AnnualEps[], currency: string): HistoricalPE | null {
  const sorted = [...candles].filter(c => Number.isFinite(c.close) && c.close > 0).sort((a,b)=>a.date.localeCompare(b.date));
  if (!sorted.length) return null;
  const end = Date.parse(sorted[sorted.length-1].date);
  // A reporting delay proxy, NOT verified announcement dates or point-in-time data.
  const rows = [...earnings].filter(e=>e.currency===currency && Number.isFinite(e.eps) && Number.isFinite(Date.parse(e.date))).sort((a,b)=>a.date.localeCompare(b.date));
  const months = new Map<string,Candle>();
  for (const c of sorted) if (Date.parse(c.date)>=end-5*365.25*DAY) months.set(c.date.slice(0,7),c);
  const samples: {date:string; pe:number; year:string}[]=[];
  for (const c of months.values()) {
    const available = rows.filter(e=>Date.parse(e.date)+120*DAY<=Date.parse(c.date));
    const e=available[available.length-1];
    // Do not reach past a loss year to reuse an older profitable year.
    if (!e || e.eps<=0 || Date.parse(c.date)-Date.parse(e.date)>550*DAY) continue;
    const pe=c.close/e.eps;
    if(Number.isFinite(pe) && pe>0) samples.push({date:c.date,pe,year:e.date});
  }
  const years=new Set(samples.map(s=>s.year)).size;
  if(samples.length<24 || years<3) return null;
  const values=samples.map(s=>s.pe).sort((a,b)=>a-b);
  const quantile=(p:number)=>{const i=(values.length-1)*p; const n=Math.floor(i);return values[n]+(values[Math.ceil(i)]-values[n])*(i-n);};
  return {low:quantile(.25),median:quantile(.5),high:quantile(.75),months:samples.length,years,start:samples[0].date,end:samples[samples.length-1].date,annual:rows.filter(e=>samples.some(s=>s.year===e.date))};
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
