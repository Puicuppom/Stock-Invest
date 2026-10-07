import { hasValuationSupport } from "./screener";
import type { StockData } from "./types";
import type { ScreeningStyle } from "./screener";

export interface ScreeningEntry {
  price: number | null;
  basis: string;
  stopLoss?: number;
}
const positive = (value: number | null | undefined): value is number =>
  value != null && Number.isFinite(value) && value > 0;

/** Illustrative entry rules, not an execution price or an investment recommendation. */
export function screeningEntry(data: StockData, style: ScreeningStyle): ScreeningEntry {
  if (data.assetKind !== "stock") return { price: null, basis: "ยังไม่คำนวณราคาเข้าซื้อสำหรับสินทรัพย์ประเภทนี้" };
  const f = data.fairValue;
  if (style === "long") {
    if (!positive(f.fairValue) || !hasValuationSupport(f))
      return { price: null, basis: "ต้องมี 2 โมเดล หรือ 1 โมเดลพร้อมเป้านักวิเคราะห์ที่ใช้ถ่วง" };
    return { price: f.fairValue * 0.8, basis: "เพดานราคาซื้อ = Fair Value × 80% (เผื่อส่วนต่าง 20% ตามสมมติฐานเริ่มต้น)" };
  }
  if (style === "dip") {
    const supports = data.zones.filter(z => z.type === "support" && positive(z.price) && z.price <= data.lastClose).map(z => z.price);
    if (supports.length) return { price: Math.max(...supports), basis: "แนวรับ Swing ใกล้สุดใต้ราคา · หุ้นที่ลงลึกอาจลงต่อ ควรแบ่งซื้อหลายไม้ตามแนวรับ" };
    if (positive(f.fairValue) && hasValuationSupport(f)) return { price: f.fairValue * 0.8, basis: "ไม่มีแนวรับใต้ราคา (ราคาหลุดทุกแนว) จึงใช้ Fair Value × 80% · ควรรอสัญญาณกลับตัวก่อน" };
    return { price: null, basis: "ไม่มีแนวรับใต้ราคาและยังประเมิน Fair Value ไม่ได้" };
  }
  if (style === "momentum" || style === "smallcap") {
    const c = data.candles.slice(-50).map(x => x.close);
    if (c.length < 20) return { price: null, basis: "ข้อมูลราคาไม่พอคำนวณเส้นค่าเฉลี่ย" };
    const sma20 = c.slice(-20).reduce((s, x) => s + x, 0) / 20;
    const sma50 = c.length >= 50 ? c.reduce((s, x) => s + x, 0) / 50 : null;
    const target = sma20 <= data.lastClose ? sma20 : sma50 != null && sma50 <= data.lastClose ? sma50 : null;
    if (target == null) return { price: null, basis: "ราคาอยู่ใต้เส้นค่าเฉลี่ย 20/50 วัน ยังไม่ใช่จังหวะซื้อแบบไปต่อ" };
    return { price: target, basis: `รอย่อมาที่เส้นค่าเฉลี่ย ${target === sma20 ? 20 : 50} วัน หรือซื้อตอนทะลุจุดสูงสุดเดิมพร้อม Volume หนุน` };
  }
  if (style === "dividend") {
    if (!positive(f.dividendRate)) return { price: null, basis: "ไม่มีข้อมูลเงินปันผลต่อหุ้นรายปี" };
    return { price: f.dividendRate / 0.04, basis: "เพดานราคาซื้อ = ปันผลต่อหุ้นรายปี ÷ 4% ก่อนภาษี สมมติปันผลคงเดิม ไม่รับรองว่าจะจ่ายเท่าเดิม" };
  }
  if (!positive(data.lastClose)) return { price: null, basis: "ไม่มีราคาปิดที่ใช้เทียบแนวรับ" };
  const supports = [data.pivot.s1, data.pivot.s2, data.pivot.s3].filter(price => positive(price) && price <= data.lastClose);
  if (!supports.length) return { price: null, basis: "ไม่มีแนวรับ Pivot ที่หรือต่ำกว่าราคาปิด" };
  const price = Math.max(...supports);
  return { price, stopLoss: price * 0.985, basis: "รอเข้าที่แนวรับ Pivot ใกล้สุดใต้ราคาปิด · จุดตัดขาดทุนต่ำกว่าแนวรับ 1.5% ตามสมมติฐานเริ่มต้น" };
}
