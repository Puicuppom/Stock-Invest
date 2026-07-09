import {
  buildSrLevels,
  findSrHits,
  nearestSrLevels,
} from "./sr-levels";
import type { FairValueResult, PivotLevels, PriceZone, SrMode } from "./types";

export type TradeSituation =
  | "near-support"
  | "near-resistance"
  | "mid-range"
  | "no-levels";

export interface TradePlan {
  buyPrice: number | null;
  buyLabel: string;
  sellPrice: number | null;
  sellLabel: string;
  stopLoss: number | null;
  longTermTarget: number | null;
  longTermLabel: string | null;
  riskReward: number | null;
  situation: TradeSituation;
  headline: string;
  detail: string;
}

function stopBelowSupport(supportPrice: number, tolerancePercent: number): number {
  const buffer = Math.max(tolerancePercent, 1) / 100;
  return supportPrice * (1 - buffer * 1.5);
}

export function computeTradePlan(
  pivot: PivotLevels,
  zones: PriceZone[],
  currentPrice: number,
  mode: SrMode,
  tolerancePercent: number,
  fairValue: FairValueResult | null,
  includeFairValueTarget: boolean
): TradePlan {
  const levels = buildSrLevels(pivot, zones, mode);
  const { nearestResistance, nearestSupport } = nearestSrLevels(
    levels,
    currentPrice
  );
  const hits = findSrHits(
    pivot,
    zones,
    currentPrice,
    mode,
    tolerancePercent
  );
  const nearSupport = hits.some((h) => h.kind === "support");
  const nearResistance = hits.some((h) => h.kind === "resistance");

  const longTermTarget =
    includeFairValueTarget && fairValue?.fairValue != null
      ? fairValue.fairValue
      : null;
  const longTermLabel =
    longTermTarget != null && fairValue?.source === "analyst"
      ? "เป้านักวิเคราะห์ 12 เดือน"
      : longTermTarget != null
        ? "ราคาอ้างอิง"
        : null;

  if (!nearestSupport && !nearestResistance) {
    return {
      buyPrice: null,
      buyLabel: "—",
      sellPrice: null,
      sellLabel: "—",
      stopLoss: null,
      longTermTarget,
      longTermLabel,
      riskReward: null,
      situation: "no-levels",
      headline: "ยังไม่มีแนวรับ/ต้านชัดเจน",
      detail: "ลองสลับโหมด ถือยาว / เทรดสั้น หรือรอข้อมูลเพิ่ม",
    };
  }

  const buyPrice = nearestSupport?.price ?? null;
  const sellPrice = nearestResistance?.price ?? null;
  const buyLabel = nearestSupport?.label ?? "แนวรับ";
  const sellLabel = nearestResistance?.label ?? "แนวต้าน";
  const stopLoss = nearestSupport
    ? stopBelowSupport(nearestSupport.price, tolerancePercent)
    : null;

  const entry = nearSupport ? currentPrice : buyPrice;
  const riskReward =
    entry != null && sellPrice != null && stopLoss != null && entry > stopLoss
      ? (sellPrice - entry) / (entry - stopLoss)
      : null;

  let situation: TradeSituation = "mid-range";
  let headline = "แผนซื้อ-ขายจากแนวรับ/ต้าน";
  let detail = "";

  if (nearSupport && nearResistance) {
    situation = "near-support";
    headline = "อยู่กลางแนวรับและต้าน";
    detail =
      "ใกล้ทั้งรับและต้าน — ระวังสวิง ใช้ stop loss หากซื้อ";
  } else if (nearSupport) {
    situation = "near-support";
    headline = "ใกล้แนวรับ — โซนซื้อ";
    detail = buyPrice
      ? `ราคาอยู่ใกล้ ${buyLabel} · พิจารณาซื้อแถว ${buyPrice.toFixed(2)} หรือรอ rebound`
      : "ราคาใกล้แนวรับ";
  } else if (nearResistance) {
    situation = "near-resistance";
    headline = "ใกล้แนวต้าน — โซนขาย/ทำกำไร";
    detail = sellPrice
      ? `ราคาอยู่ใกล้ ${sellLabel} · พิจารณาขาย/ลดสัดส่วนแถว ${sellPrice.toFixed(2)}`
      : "ราคาใกล้แนวต้าน";
  } else if (buyPrice != null && sellPrice != null) {
    situation = "mid-range";
    headline = "ราคาอยู่กลางช่วง";
    detail = `รอซื้อใกล้แนวรับ ${buyPrice.toFixed(2)} · ขาย/ทำกำไรใกล้แนวต้าน ${sellPrice.toFixed(2)}`;
  } else if (buyPrice != null) {
    detail = `รอซื้อเมื่อราคาลงใกล้ ${buyPrice.toFixed(2)} (${buyLabel})`;
  } else if (sellPrice != null) {
    detail = `เป้าขาย/ทำกำไรที่ ${sellPrice.toFixed(2)} (${sellLabel})`;
  }

  if (
    longTermTarget != null &&
    longTermTarget > currentPrice &&
    situation === "mid-range"
  ) {
    detail += ` · เป้ายาว ${longTermTarget.toFixed(2)}`;
  }

  return {
    buyPrice,
    buyLabel,
    sellPrice,
    sellLabel,
    stopLoss,
    longTermTarget,
    longTermLabel,
    riskReward,
    situation,
    headline,
    detail,
  };
}
