import type { StockData } from "./types";
import type { ScreeningStyle } from "./screener";
const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
export const RANKING_DESCRIPTION: Record<ScreeningStyle, string> = {
  long: "Upside 50 คะแนน (เต็มที่ 40%) + FCF Yield 35 (เต็มที่ 8%) + จำนวนโมเดล 15 (เต็มที่ 5 โมเดล)",
  dividend: "Yield ใกล้ 4% 40 คะแนน (ลดตามระยะห่าง เต็มช่วง ±4 จุดเปอร์เซ็นต์) + FCF Yield 40 (เต็มที่ 8%) + P/E 20 (เต็มเมื่อ ≤15 และลดจนเป็นศูนย์ที่ 30)",
  short: "ปริมาณซื้อขายเทียบ 20 วันก่อน 40 คะแนน (เต็มที่ 3 เท่า) + SMA20 เหนือ SMA50 30 (เต็มที่ 10%) + ราคาไม่ห่าง SMA20 30 (ลดจนเป็นศูนย์เมื่อห่าง 10%)",
};
export function interestScore(data: StockData, style: ScreeningStyle): number {
  const f=data.fairValue;
  let score=0;
  if (style === "long") score=50*clamp((f.upsidePercent ?? 0)/40)+35*clamp((f.fcfYieldPercent ?? 0)/8)+15*clamp(f.modelCount/5);
  else if (style === "dividend") score=40*clamp(1-Math.abs((f.dividendYieldPercent ?? 0)-4)/4)+40*clamp((f.fcfYieldPercent ?? 0)/8)+20*(f.trailingPE != null && f.trailingPE>0 ? clamp((30-f.trailingPE)/15):0);
  else {
    const c=data.candles;
    if(c.length<50)return 0;
    const sma20=c.slice(-20).reduce((s,x)=>s+x.close,0)/20;
    const sma50=c.slice(-50).reduce((s,x)=>s+x.close,0)/50;
    const vol=c.slice(-21,-1).reduce((s,x)=>s+x.volume,0)/20;
    score=40*clamp(vol>0?c[c.length-1].volume/vol/3:0)+30*clamp(sma50>0?(sma20/sma50-1)/0.1:0)+30*clamp(sma20>0?1-Math.abs(data.lastClose/sma20-1)/0.1:0);
  }
  return Math.round(score);
}
