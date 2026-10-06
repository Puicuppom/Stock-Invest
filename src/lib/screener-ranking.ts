import type { StockData } from "./types";
import { completedCandles, valuationRiskFlags, type ScreeningStyle } from "./screener";
const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const num = (value: number | null | undefined) => value != null && Number.isFinite(value) ? value : 0;
export const RANKING_DESCRIPTION: Record<ScreeningStyle, string> = {
  long: "Upside 35 คะแนน (เต็มที่ 40%) + FCF Yield 20 (เต็มที่ 8%) + คุณภาพธุรกิจ 30 (ROE 15 เต็มที่ 25% · อัตรากำไรจากการดำเนินงาน 10 เต็มที่ 30% · รายได้โต 5 เต็มที่ 15%) + จำนวนโมเดล 15 (เต็มที่ 2 โมเดล) · หัก 10 คะแนนต่อคำเตือนข้อมูล (⚠ บนการ์ด)",
  dividend: "Yield ใกล้ 4% 30 คะแนน (ลดตามระยะห่าง เต็มช่วง ±4 จุดเปอร์เซ็นต์) + FCF Yield 25 (เต็มที่ 8%) + ความปลอดภัยปันผล 30 (จ่ายจากกำไร 20 เต็มเมื่อ ≤60% เป็นศูนย์ที่ 100% · เงินสดอิสระครอบคลุม 10 เต็มที่ 2 เท่า) + P/E 15 (เต็มเมื่อ ≤15 ลดจนเป็นศูนย์ที่ 30)",
  short: "ปริมาณซื้อขายเทียบ 20 วันก่อน 40 คะแนน (เต็มที่ 3 เท่า) + SMA20 เหนือ SMA50 30 (เต็มที่ 10%) + ราคาไม่ห่าง SMA20 30 (ลดจนเป็นศูนย์เมื่อห่าง 10%) · ใช้เฉพาะวันที่ตลาดปิดแล้ว",
};
export function interestScore(data: StockData, style: ScreeningStyle): number {
  const f=data.fairValue;
  const q=f.quality ?? null;
  let score=0;
  if (style === "long") {
    score=35*clamp(num(f.upsidePercent)/40)+20*clamp(num(f.fcfYieldPercent)/8)
      +15*clamp(num(q?.roePercent)/25)+10*clamp(num(q?.operatingMarginPercent)/30)+5*clamp(num(q?.revenueGrowthPercent)/15)
      +15*clamp(f.modelCount/2);
    score-=10*valuationRiskFlags(f).length;
  }
  else if (style === "dividend") {
    const payout=q?.payoutPercent;
    score=30*clamp(1-Math.abs(num(f.dividendYieldPercent)-4)/4)+25*clamp(num(f.fcfYieldPercent)/8)
      +20*(payout != null && Number.isFinite(payout) ? clamp((100-payout)/40) : 0)
      +10*clamp(num(q?.fcfDividendCoverage)/2)
      +15*(f.trailingPE != null && f.trailingPE>0 ? clamp((30-f.trailingPE)/15):0);
  }
  else {
    const c=completedCandles(data);
    if(c.length<50)return 0;
    const close=c[c.length-1].close;
    const sma20=c.slice(-20).reduce((s,x)=>s+x.close,0)/20;
    const sma50=c.slice(-50).reduce((s,x)=>s+x.close,0)/50;
    const vol=c.slice(-21,-1).reduce((s,x)=>s+x.volume,0)/20;
    score=40*clamp(vol>0?c[c.length-1].volume/vol/3:0)+30*clamp(sma50>0?(sma20/sma50-1)/0.1:0)+30*clamp(sma20>0?1-Math.abs(close/sma20-1)/0.1:0);
  }
  return Math.max(0, Math.round(score));
}
