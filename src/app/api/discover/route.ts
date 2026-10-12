import { NextRequest, NextResponse } from "next/server";
import { getYahooAuth, USER_AGENT } from "@/lib/yahoo-auth";
import { DISCOVERY_SECTORS, DISCOVERY_CAPS, aboveAvg50, capLimits, deepEnough, dividendInRange, eligibleQuote, nearHigh, profitable, type DiscoveryQuote } from "@/lib/discovery";
import { DIP_DEEP_PERCENT } from "@/lib/dip";
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
