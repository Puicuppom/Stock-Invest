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

/** ชื่อ/สีของกลุ่ม — ชุดเดียวกับหน้าปรับพอร์ต */
export const BUCKET_META: Record<BucketKey, { name: string; color: string }> = {
  core: { name: "ETF", color: "#38bdf8" },
  income: { name: "หุ้นปันผล", color: "#f59e0b" },
  quality: { name: "หุ้นเติบโต", color: "#22c55e" },
  dip: { name: "หุ้นลดราคา", color: "#ec4899" },
  small: { name: "หุ้นขนาดเล็ก", color: "#a78bfa" },
  cash: { name: "เงินสด", color: "#94a3b8" },
};
export const PROFILE_NAME: Record<Profile, string> = { safe: "มั่นคง", balanced: "สมดุล", growth: "เติบโต" };

/* สัดส่วนที่ผู้ใช้ตั้งเอง: localStorage กลางที่หน้าปรับพอร์ตใช้ร่วม (และซิงค์ไปกับพอร์ต) */
export const PLAN_STORE_KEY = "planProfiles:v1";
export type ProfileMixes = Record<Profile, Partial<Record<BucketKey, number>>>;
export function loadProfileMixes(): ProfileMixes {
  let saved: { profiles?: Partial<ProfileMixes> } | null = null;
  try { saved = JSON.parse(localStorage.getItem(PLAN_STORE_KEY) || "null"); } catch { /* ignore */ }
  return {
    safe: { ...(saved?.profiles?.safe ?? PROFILE_MIX.safe) },
    balanced: { ...(saved?.profiles?.balanced ?? PROFILE_MIX.balanced) },
    growth: { ...(saved?.profiles?.growth ?? PROFILE_MIX.growth) },
  };
}
export function saveProfileMixes(mixes: ProfileMixes) {
  try { localStorage.setItem(PLAN_STORE_KEY, JSON.stringify({ profiles: mixes, updatedAt: Date.now() })); } catch { /* ignore */ }
}

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
