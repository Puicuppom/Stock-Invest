import type { StockData } from "./types";
import { valuationRiskFlags, type ScreeningStyle } from "./screener";
import { analyzeDip } from "./dip";
import { analyzeEtfDip } from "./etf";
import { analyzeMomentum, techSnapshot, type MarketContext } from "./momentum";
const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const num = (value: number | null | undefined) => value != null && Number.isFinite(value) ? value : 0;
export const RANKING_DESCRIPTION: Record<ScreeningStyle, string> = {
  dip: "ความลึก 30 คะแนน (เต็มที่ลง 40%) + พื้นฐาน 35 (ROE อัตรากำไร รายได้ หนี้ ข้อละ 8.75) + ถูกจริง 35 (กำไรคาดการณ์ไม่ลด 15 · P/E ต่ำกว่าอดีต 10 · ต่ำกว่าเป้านักวิเคราะห์ 10) · ผ่านครึ่งได้ครึ่ง ไม่มีข้อมูลได้หนึ่งในสาม · หัก 10 คะแนนต่อคำเตือนข้อมูล",
  momentum: "พื้นฐาน 40 คะแนน (ROE อัตรากำไร รายได้ กำไรคาดการณ์ หนี้ ข้อละ 8) + แรงกว่าตลาด 6 เดือน 15 (เต็มที่ +30 จุด%) + ใกล้จุดสูงสุด 15 + ขาขึ้น 15 + ยังไม่วิ่งเกินตัว 15",
  smallcap: "รายได้โต 25 คะแนน (เต็มที่ 40%) + กำไรคาดการณ์โต 20 (เต็มที่ 40%) + แรงซื้อ Volume 25 (เต็มที่ 2.5 เท่า) + ใกล้จุดสูงสุด 3 เดือน 15 + ROE 15 (เต็มที่ 20%) · หัก 10 คะแนนต่อคำเตือนข้อมูล",
  dividend: "Yield ใกล้ 4% 30 คะแนน (ลดตามระยะห่าง เต็มช่วง ±4 จุดเปอร์เซ็นต์) + FCF Yield 25 (เต็มที่ 8%) + ความปลอดภัยปันผล 30 (จ่ายจากกำไร 20 เต็มเมื่อ ≤60% เป็นศูนย์ที่ 100% · เงินสดอิสระครอบคลุม 10 เต็มที่ 2 เท่า) + P/E 15 (เต็มเมื่อ ≤15 ลดจนเป็นศูนย์ที่ 30)",
  etf: "ความลึกเทียบประวัติของกอง 50 คะแนน (ลงลึก + นาน ๆ ครั้งจะลงลึกขนาดนี้) + ค่าธรรมเนียมต่ำ 30 (เต็มเมื่อ ≤ 0.05% เป็นศูนย์ที่ 0.6%) + ขนาดกอง 20 (เต็มที่ 100 พันล้าน)",
};
export function interestScore(data: StockData, style: ScreeningStyle, ctx?: MarketContext | null): number {
  const f=data.fairValue;
  const q=f.quality ?? null;
  let score=0;
  if (style === "etf") {
    const e=data.etf;
    const fee=e?.expenseRatio;
    score=0.5*(analyzeEtfDip(data.candles)?.score ?? 0)
      +30*(fee != null && Number.isFinite(fee) ? clamp((0.6-fee)/0.55) : 0)
      +20*(e?.totalAssets ? clamp(Math.log10(e.totalAssets/1e9)/2) : 0);
  }
  else if (style === "dip") {
    score=(analyzeDip(data)?.score ?? 0)-10*valuationRiskFlags(f).length;
  }
  else if (style === "momentum") {
    score=(analyzeMomentum(data,ctx)?.score ?? 0)-10*valuationRiskFlags(f).length;
  }
  else if (style === "smallcap") {
    const t=techSnapshot(data);
    score=25*clamp(num(q?.revenueGrowthPercent)/40)+20*clamp(num(t?.epsGrowthPercent)/40)
      +25*clamp((num(t?.volRatio5v50)-1)/1.5)+15*clamp(1+num(t?.fromHigh3m)/10)+15*clamp(num(q?.roePercent)/20);
    score-=10*valuationRiskFlags(f).length;
  }
  else if (style === "dividend") {
    const payout=q?.payoutPercent;
    score=30*clamp(1-Math.abs(num(f.dividendYieldPercent)-4)/4)+25*clamp(num(f.fcfYieldPercent)/8)
      +20*(payout != null && Number.isFinite(payout) ? clamp((100-payout)/40) : 0)
      +10*clamp(num(q?.fcfDividendCoverage)/2)
      +15*(f.trailingPE != null && f.trailingPE>0 ? clamp((30-f.trailingPE)/15):0);
  }
  return Math.max(0, Math.round(score));
}
