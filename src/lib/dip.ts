import type { StockData } from "./types";

/** วิเคราะห์ "หุ้นดีลดราคา": ลงมาลึกแค่ไหน · พื้นฐานยังดีไหม · ถูกจริงหรือกับดัก */
export type DipState = "yes" | "partial" | "no" | "na";
export interface DipCheck { short: string; label: string; state: DipState; detail: string; group: "quality" | "value" }
export type DipKind = "good" | "watch" | "trap" | "weak" | "notdeep" | "na";
export interface DipResult {
  /** % จากจุดสูงสุด 52 สัปดาห์ (ติดลบ) */
  drawdownPercent: number | null;
  high52: number | null;
  checks: DipCheck[];
  kind: DipKind;
  verdict: string;
  /** 0–100 ใช้เรียงในหน้าคัดหุ้น */
  score: number;
}

const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const f1 = (n: number) => n.toFixed(1);

export const DIP_DEEP_PERCENT = 25;

export const DIP_METHOD =
  "ลงลึก = ต่ำกว่าจุดสูงสุด 52 สัปดาห์ · พื้นฐาน: ROE ≥ 10%, อัตรากำไรจากการดำเนินงาน ≥ 10%, รายได้ไม่หดตัว, หนี้สุทธิ ≤ 3 เท่า EBITDA · " +
  "ถูกจริงหรือกับดัก: กำไรคาดการณ์ไม่ลดลงเกิน 10% จากกำไร 12 เดือนล่าสุด, P/E ต่ำกว่ามัธยฐานในอดีตของหุ้นเอง, ราคาต่ำกว่า Fair Value ≥ 15% · " +
  "ข้อมูลจาก Yahoo ยังไม่ได้ปรับรายการพิเศษ ใช้คัดไปศึกษาต่อ ไม่ใช่คำแนะนำการลงทุน";

export function drawdownFromHigh(data: StockData): { percent: number | null; high: number | null } {
  const fromCandles = data.candles.slice(-252).reduce((m, c) => Math.max(m, c.high || c.close), 0);
  const high = Math.max(data.fairValue.range52w?.high ?? 0, fromCandles);
  if (!(high > 0) || !(data.lastClose > 0)) return { percent: null, high: null };
  return { percent: (data.lastClose / high - 1) * 100, high };
}

export function analyzeDip(data: StockData): DipResult | null {
  if (data.assetKind !== "stock") return null;
  const f = data.fairValue;
  const q = f.quality ?? null;
  const financial = q?.sector === "Financial Services";
  const { percent: dd, high } = drawdownFromHigh(data);
  const checks: DipCheck[] = [];

  // ── พื้นฐาน ──
  const roe = q?.roePercent;
  checks.push({ group: "quality", short: "ROE", label: "ROE ≥ 10%", state: finite(roe) ? (roe >= 10 ? "yes" : "no") : "na",
    detail: finite(roe) ? `ผลตอบแทนต่อส่วนผู้ถือหุ้น ${f1(roe)}%` : "ไม่มีข้อมูล ROE" });
  const margin = q?.operatingMarginPercent;
  checks.push({ group: "quality", short: "กำไร", label: "อัตรากำไรจากการดำเนินงาน ≥ 10%",
    state: financial ? "na" : finite(margin) ? (margin >= 10 ? "yes" : margin > 0 ? "partial" : "no") : "na",
    detail: financial ? "ไม่ใช้กับกลุ่มการเงิน" : finite(margin) ? `อัตรากำไรจากการดำเนินงาน ${f1(margin)}%` : "ไม่มีข้อมูล" });
  const growth = q?.revenueGrowthPercent;
  checks.push({ group: "quality", short: "ยอดขาย", label: "รายได้ไม่หดตัว", state: finite(growth) ? (growth >= 0 ? "yes" : growth >= -5 ? "partial" : "no") : "na",
    detail: finite(growth) ? `รายได้ล่าสุด ${growth >= 0 ? "+" : ""}${f1(growth)}% เทียบปีก่อน` : "ไม่มีข้อมูล" });
  const debt = q?.netDebtToEbitda;
  checks.push({ group: "quality", short: "หนี้", label: "หนี้สุทธิ ≤ 3 เท่า EBITDA",
    state: financial ? "na" : finite(debt) ? (debt <= 3 ? "yes" : debt <= 4 ? "partial" : "no") : "na",
    detail: financial ? "ไม่ใช้กับกลุ่มการเงิน" : finite(debt) ? (debt <= 0 ? "เงินสดมากกว่าหนี้" : `หนี้สุทธิ ${f1(debt)} เท่าของ EBITDA`) : "ไม่มีข้อมูล" });

  // ── ถูกจริงหรือกับดัก ──
  const ttm = f.trailingEps, fwd = f.forwardEps;
  const epsRatio = finite(ttm) && ttm > 0 && finite(fwd) ? fwd / ttm : null;
  checks.push({ group: "value", short: "กำไรข้างหน้า", label: "กำไรคาดการณ์ไม่ลดลง",
    state: finite(fwd) && fwd <= 0 ? "no" : epsRatio == null ? "na" : epsRatio >= 0.95 ? "yes" : epsRatio >= 0.9 ? "partial" : "no",
    detail: finite(fwd) && fwd <= 0 ? "คาดว่าขาดทุน"
      : epsRatio == null ? "ไม่มีข้อมูลกำไรคาดการณ์"
      : `กำไรคาดการณ์ ${epsRatio >= 1 ? "เพิ่ม" : "ลด"} ${f1(Math.abs(epsRatio - 1) * 100)}% จาก 12 เดือนล่าสุด${epsRatio < 0.9 ? " · ราคาลงเพราะกำไรลดด้วย" : ""}` });
  const pe = f.trailingPE, hist = f.historicalPE;
  checks.push({ group: "value", short: "P/E ต่ำกว่าอดีต", label: "P/E ต่ำกว่าค่ากลางในอดีต",
    state: !finite(pe) || pe <= 0 || !hist ? "na" : pe < hist.median * 0.95 ? "yes" : pe <= hist.median * 1.1 ? "partial" : "no",
    detail: !finite(pe) || pe <= 0 ? "ไม่มี P/E (กำไรติดลบหรือไม่มีข้อมูล)" : !hist ? `P/E ${f1(pe)} · ประวัติไม่พอเทียบ`
      : `P/E ${f1(pe)} เทียบค่ากลาง ${hist.years} ปี ${f1(hist.median)} (${f1((pe / hist.median - 1) * 100)}%)` });
  const up = f.upsidePercent;
  checks.push({ group: "value", short: "ต่ำกว่า FV", label: "ต่ำกว่า Fair Value ≥ 15%",
    state: finite(up) ? (up >= 15 ? "yes" : up >= 0 ? "partial" : "no") : "na",
    detail: finite(up) ? (up >= 0 ? `ต่ำกว่าราคายุติธรรม ${f1(up)}%` : `สูงกว่าราคายุติธรรม ${f1(-up)}%`) : "ไม่มีราคายุติธรรม" });

  const quality = checks.filter(c => c.group === "quality");
  const value = checks.filter(c => c.group === "value");
  const qualityFails = quality.filter(c => c.state === "no").length;
  const qualityKnown = quality.filter(c => c.state !== "na").length;
  const trap = value.some(c => c.state === "no" && (c.short === "กำไรข้างหน้า" || c.short === "P/E ต่ำกว่าอดีต"));
  const valueYes = value.filter(c => c.state === "yes").length;

  const pts = (c: DipCheck, w: number) => (c.state === "yes" ? w : c.state === "partial" ? w / 2 : c.state === "na" ? w / 3 : 0);
  const score = Math.round(
    30 * clamp01(dd != null ? -dd / 40 : 0)
    + quality.reduce((s, c) => s + pts(c, 8.75), 0)
    + pts(value[0], 15) + pts(value[1], 10) + pts(value[2], 10),
  );

  let kind: DipKind, verdict: string;
  if (dd == null || qualityKnown < 2) { kind = "na"; verdict = "ข้อมูลไม่พอ"; }
  else if (dd > -15) { kind = "notdeep"; verdict = "ยังไม่ลดราคา"; }
  else if (qualityFails >= 2) { kind = "weak"; verdict = "ลงลึก แต่พื้นฐานอ่อน"; }
  else if (trap) { kind = "trap"; verdict = "ถูก แต่ระวังกับดัก"; }
  else if (dd <= -20 && valueYes >= 1) { kind = "good"; verdict = "หุ้นดีลดราคา"; }
  else { kind = "watch"; verdict = "น่าจับตา"; }

  return { drawdownPercent: dd, high52: high, checks, kind, verdict, score };
}
