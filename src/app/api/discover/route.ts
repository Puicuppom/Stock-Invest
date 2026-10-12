import { NextRequest, NextResponse } from "next/server";
import { getYahooAuth, USER_AGENT } from "@/lib/yahoo-auth";
import { DISCOVERY_SECTORS, DISCOVERY_CAPS, ETF_UNIVERSE, aboveAvg50, capLimits, deepEnough, dividendInRange, eligibleQuote, nearHigh, profitable, type DiscoveryQuote } from "@/lib/discovery";
import { DIP_DEEP_PERCENT } from "@/lib/dip";
import { isLeveragedName } from "@/lib/etf";
export async function GET(request: NextRequest) {
  const p=request.nextUrl.searchParams;
  const market=p.get("market") || "US", sector=p.get("sector") || "", cap=p.get("cap") || "all";
  const offset=Number(p.get("offset") || 0);
  const style=p.get("style") || "";
  const dip=p.get("dip")==="1" || style==="dip";
  const near=p.get("near")==="1" || style==="momentum";
  // ขอทีละ 100 ตัว (เดิม 30) ลดจำนวนรอบเรียก Yahoo
  const size=Math.min(250,Math.max(30,Number(p.get("size") || 100) || 100));
  if (!["US","TH"].includes(market) || !DISCOVERY_SECTORS.some(s=>s[0]===sector) || !DISCOVERY_CAPS.some(c=>c===cap) || !Number.isInteger(offset) || offset<0 || offset>10000)
    return NextResponse.json({error:"ตัวกรองไม่ถูกต้อง"},{status:400});
  if (style==="etf") return discoverEtfs(market as "US"|"TH", offset, size);
  try {
    const selectedMarket=market as "US"|"TH";
    const [minimum,maximum]=capLimits(selectedMarket,cap);
    const operands: {operator:string;operands:(string|number)[]}[]=[{operator:"eq",operands:["region",market.toLowerCase()]}];
    if (sector) operands.push({operator:"eq",operands:["sector",sector]});
    if (minimum>0) operands.push({operator:"gte",operands:["intradaymarketcap",minimum]});
    if (maximum!==null) operands.push({operator:"lt",operands:["intradaymarketcap",maximum]});
    const auth=await getYahooAuth();
    const response=await fetch(`https://query1.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(auth.crumb)}`,{
      method:"POST",headers:{"Content-Type":"application/json","User-Agent":USER_AGENT,Cookie:auth.cookie},
      body:JSON.stringify({offset,size,sortField:"intradaymarketcap",sortType:"DESC",quoteType:"EQUITY",query:{operator:"and",operands},userId:"",userIdType:"guid"}),
      signal:AbortSignal.timeout(15000),cache:"no-store",
    });
    if (!response.ok) throw new Error();
    const json=await response.json();
    const result=json.finance?.result?.[0];
    if (!result || !Array.isArray(result.quotes) || !Number.isFinite(result.total)) throw new Error();
    const raw:DiscoveryQuote[]=result.quotes;
    const quotes=raw.filter(q=>eligibleQuote(q,selectedMarket) && (!dip || deepEnough(q,DIP_DEEP_PERCENT)) && (!near || (nearHigh(q,15) && aboveAvg50(q)))
      && (style!=="smallcap" || (profitable(q) && aboveAvg50(q))) && (style!=="dividend" || dividendInRange(q)));
    const symbols=[...new Set(quotes.map(q=>market==="TH"?q.symbol!.replace(/\.BK$/,""):q.symbol!))];
    const next=offset+raw.length;
    return NextResponse.json({symbols,total:result.total,excluded:raw.length-quotes.length,offset,nextOffset:raw.length>0 && next<result.total && next<=10000?next:null,source:"Yahoo Finance",asOf:new Date().toISOString()});
  } catch {return NextResponse.json({error:"ค้นหารายชื่อจาก Yahoo ไม่สำเร็จ กรุณาลองใหม่ภายหลัง"},{status:502});}
}

/** ETF: ค้นจาก Yahoo (เรียงตามขนาดกอง) · ไม่สำเร็จใช้รายชื่อ ETF ยอดนิยม */
async function discoverEtfs(market: "US"|"TH", offset: number, size: number) {
  const strip=(s:string)=>market==="TH"?s.replace(/\.BK$/,""):s;
  try {
    const auth=await getYahooAuth();
    const response=await fetch(`https://query1.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(auth.crumb)}`,{
      method:"POST",headers:{"Content-Type":"application/json","User-Agent":USER_AGENT,Cookie:auth.cookie},
      body:JSON.stringify({offset,size,sortField:"fundnetassets",sortType:"DESC",quoteType:"ETF",query:{operator:"and",operands:[{operator:"eq",operands:["region",market.toLowerCase()]}]},userId:"",userIdType:"guid"}),
      signal:AbortSignal.timeout(15000),cache:"no-store",
    });
    if (!response.ok) throw new Error();
    const result=(await response.json()).finance?.result?.[0];
    if (!result || !Array.isArray(result.quotes) || !result.quotes.length || !Number.isFinite(result.total)) throw new Error();
    const raw:DiscoveryQuote[]=result.quotes;
    const quotes=raw.filter(q=>eligibleQuote(q,market,true) && !isLeveragedName(q.longName || q.shortName) && deepEnough(q,7));
    const next=offset+raw.length;
    return NextResponse.json({symbols:[...new Set(quotes.map(q=>strip(q.symbol!)))],total:result.total,excluded:raw.length-quotes.length,offset,nextOffset:next<result.total && next<=2000?next:null,source:"Yahoo Finance",asOf:new Date().toISOString()});
  } catch {
    const list=ETF_UNIVERSE[market];
    const page=list.slice(offset,offset+size);
    const next=offset+page.length;
    return NextResponse.json({symbols:page,total:list.length,excluded:0,offset,nextOffset:next<list.length?next:null,source:"รายชื่อ ETF ยอดนิยม",asOf:new Date().toISOString()});
  }
}
