import { analyzeDip } from "./dip";
import type { StockData } from "./types";

/** กลุ่มในพอร์ต (ใช้ทั้งผู้ช่วยจัดพอร์ต และจัดกลุ่มอัตโนมัติในหน้าปรับพอร์ต) */
export type BucketKey = "core" | "income" | "quality" | "dip" | "small" | "cash";
export type Profile = "safe" | "balanced" | "growth";

/** สัดส่วนตัวอย่างของแต่ละสไตล์ — หน้าปรับพอร์ต (public/rebalance-app/app.js) มีสำเนาของตารางนี้ */
export const PROFILE_MIX: Record<Profile, Partial<Record<BucketKey, number>>> = {
  safe: { core: 55, income: 25, quality: 10, cash: 10 },
  balanced: { core: 40, income: 15, quality: 25, dip: 10, cash: 10 },
  growth: { core: 30, quality: 35, dip: 20, small: 10, cash: 5 },
};

/** จัดกลุ่มสินทรัพย์จากข้อมูลจริง: ETF · หุ้น (ปันผล/จิ๋ว/ลดราคา/แกร่ง) */
export function classifyAsset(data: StockData): { bucket: BucketKey; reason: string } {
  // ETF ทุกชนิด (ดัชนี ปันผล ออปชั่น ทอง) อยู่หมวด ETF
  if (data.assetKind === "etf" || data.assetKind === "gold-etf") return { bucket: "core", reason: data.etf?.category ?? "ETF" };
  if (data.assetKind !== "stock") return { bucket: "core", reason: "สินทรัพย์อื่น" };

  const y = data.fairValue.dividendYieldPercent;
  if (y != null && y >= 3) return { bucket: "income", reason: `ปันผล ${y.toFixed(1)}%` };
  const cap = data.fairValue.marketCap ?? null;
  const smallLimit = data.market === "TH" ? 1e10 : 2e9;
  if (cap != null && cap > 0 && cap < smallLimit) return { bucket: "small", reason: "บริษัทขนาดเล็ก" };
  const dip = analyzeDip(data);
  if (dip?.drawdownPercent != null && dip.drawdownPercent <= -20) return { bucket: "dip", reason: `ลงจากจุดสูงสุด ${dip.drawdownPercent.toFixed(0)}%` };
  return { bucket: "quality", reason: "หุ้นเติบโต" };
}
