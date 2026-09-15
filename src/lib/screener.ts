import type { StockData } from "./types";
export type ScreeningStyle = "long" | "dividend" | "short";
export const screeningStyles = {
  long: { label: "ถือยาว", description: "คัดจากกำไร เงินสด และมูลค่า ยังไม่ยืนยันการเติบโตหลายปีหรือคุณภาพหนี้" },
  dividend: { label: "ปันผล", description: "คัดจากปันผลและเงินสด ยังไม่ยืนยันความต่อเนื่องหรือความปลอดภัยของปันผล" },
  short: { label: "เทรดสั้น", description: "คัดจากแนวโน้มและปริมาณซื้อขายรายวัน ใช้ราคาปิด ไม่ใช่ราคาสด" },
};
export interface ScreeningCheck { label: string; value: string; passed: boolean | null }
export function screenStock(data: StockData, style: ScreeningStyle): ScreeningCheck[] {
  const f = data.fairValue;
  const check = (label: string, value: number | null | undefined, predicate: (n: number) => boolean, suffix = ""): ScreeningCheck => ({
    label, value: value != null && Number.isFinite(value) ? `${value.toFixed(2)}${suffix}` : "ไม่มีข้อมูล",
    passed: value != null && Number.isFinite(value) ? predicate(value) : null,
  });
  if (data.assetKind !== "stock") return [{label: "รองรับหุ้นสามัญเท่านั้น", value: "ไม่ใช้กับ ETF/ทอง/ค่าเงิน", passed: null}];
  if (style === "long") return [
    check("Forward EPS > 0", f.forwardEps, n => n > 0),
    check("FCF Yield > 0%", f.fcfYieldPercent, n => n > 0, "%"),
    check("Upside ถึง Fair Value ≥ 10%", f.upsidePercent, n => n >= 10, "%"),
    check("โมเดลมูลค่า ≥ 2 โมเดล", f.modelCount, n => n >= 2),
  ];
  if (style === "dividend") return [
    check("Dividend Yield 2–8%", f.dividendYieldPercent, n => n >= 2 && n <= 8, "%"),
    check("เงินปันผลต่อหุ้น > 0", f.dividendRate, n => n > 0),
    check("FCF Yield > 0%", f.fcfYieldPercent, n => n > 0, "%"),
    check("P/E ย้อนหลัง > 0", f.trailingPE, n => n > 0),
  ];
  const candles = data.candles;
  const average = (n: number) => candles.length >= n ? candles.slice(-n).reduce((sum,c) => sum+c.close,0)/n : null;
  const sma20 = average(20), sma50 = average(50);
  const prior = candles.slice(-21,-1);
  const volume = prior.length === 20 ? prior.reduce((sum,c)=>sum+c.volume,0)/20 : 0;
  return [
    check("ราคาเหนือ SMA20", sma20 && data.lastClose > 0 ? (data.lastClose/sma20-1)*100 : null, n=>n>0, "%"),
    check("SMA20 เหนือ SMA50", sma20 && sma50 ? (sma20/sma50-1)*100 : null,n=>n>0,"%"),
    check("Volume ≥ 1.2 เท่าของ 20 วันก่อน", volume > 0 ? candles[candles.length-1].volume/volume : null,n=>n>=1.2," เท่า"),
    check("ราคาเหนือ Pivot", data.pivot.pivot > 0 ? (data.lastClose/data.pivot.pivot-1)*100 : null,n=>n>0,"%"),
  ];
}
