import { fetchFundamentals } from "./fair-value";
import type { FairValueData } from "./types";

// Candidate pools, not automatic claims of comparable economic value.
const pools = [
  ["NVDA","AMD","AVGO","QCOM","MRVL","MPWR","ADI","TXN"],
  ["AMAT","LRCX","KLAC","ASML","TER"],
  ["MSFT","ORCL","CRM","ADBE","NOW","PLTR","INTU"],
];
const cache=new Map<string,{until:number;value:Promise<FairValueData|null>}>();
function read(symbol:string) {
  const previous=cache.get(symbol);
  if(previous && previous.until>Date.now()) return previous.value;
  const value=fetchFundamentals(symbol).catch(()=>null);
  cache.set(symbol,{until:Date.now()+900000,value});
  return value;
}
export function comparePeers(symbol:string,target:FairValueData,rows:{symbol:string;data:FairValueData|null}[]):FairValueData["peerForward"] {
  if(!target.industry || target.quoteCurrency!=="USD" || !Number.isFinite(target.revenueGrowth) || !Number.isFinite(target.operatingMargins))return null;
  const seen=new Set<string>();
  const peers=rows.filter(row=>{
    const d=row.data;
    if(row.symbol===symbol || seen.has(row.symbol))return false;
    seen.add(row.symbol);
    return d && d.industry===target.industry && d.quoteCurrency==="USD" && d.forwardPE!=null && Number.isFinite(d.forwardPE) && d.forwardPE>=3 && d.forwardPE<=100 && d.forwardEps!=null && d.forwardEps>0 && d.operatingMargins!=null && d.operatingMargins>0 && target.operatingMargins!>0 && d.revenueGrowth!=null && Number.isFinite(d.revenueGrowth) && Math.abs(d.revenueGrowth-target.revenueGrowth!)<=.3 && Math.abs(d.operatingMargins-target.operatingMargins!)<=.2;
  }).map(row=>({symbol:row.symbol,pe:row.data!.forwardPE!}));
  if(peers.length<3)return null;
  const values=peers.map(p=>p.pe).sort((a,b)=>a-b);
  const q=(p:number)=>{const i=(values.length-1)*p;return values[Math.floor(i)]+(values[Math.ceil(i)]-values[Math.floor(i)])*(i-Math.floor(i));};
  return {low:q(.25),median:q(.5),high:q(.75),peers,asOf:new Date().toISOString()};
}
export async function fetchPeerValuation(symbol:string,target:FairValueData) {
  const pool=pools.find(p=>p.includes(symbol));
  if(!pool)return null;
  const rows=await Promise.all(pool.filter(s=>s!==symbol).map(async s=>({symbol:s,data:await read(s)})));
  return comparePeers(symbol,target,rows);
}
