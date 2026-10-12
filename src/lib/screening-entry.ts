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
  if (style === "etf" && (data.assetKind === "etf" || data.assetKind === "gold-etf")) {
    const supports = data.zones.filter(z => z.type === "support" && positive(z.price) && z.price <= data.lastClose).map(z => z.price);
    if (supports.length) return { price: Math.max(...supports), basis: "แนวรับ Swing ใกล้สุดใต้ราคา · ETF ดัชนีเหมาะทยอยซื้อหลายไม้ตอนลงลึก" };
    return { price: null, basis: "ไม่มีแนวรับใต้ราคา · ทยอยซื้อเป็นงวดแทนการรอราคาเดียว" };
  }
  if (data.assetKind !== "stock") return { price: null, basis: "ยังไม่คำนวณราคาเข้าซื้อสำหรับสินทรัพย์ประเภทนี้" };
  const f = data.fairValue;
  if (style === "dip") {
    const supports = data.zones.filter(z => z.type === "support" && positive(z.price) && z.price <= data.lastClose).map(z => z.price);
    if (supports.length) return { price: Math.max(...supports), basis: "แนวรับ Swing ใกล้สุดใต้ราคา · หุ้นที่ลงลึกอาจลงต่อ ควรแบ่งซื้อหลายไม้ตามแนวรับ" };
    return { price: null, basis: "ไม่มีแนวรับใต้ราคา (ราคาหลุดทุกแนว) · ควรรอสัญญาณกลับตัวก่อน" };
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
  return { price: null, basis: "" };
}
