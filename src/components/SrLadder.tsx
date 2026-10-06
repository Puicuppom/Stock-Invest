import { buildSrLevels } from "@/lib/sr-levels";
import type { PivotLevels, PriceZone, SrMode } from "@/lib/types";

/** บันไดราคาแนวตั้ง: แนวต้านด้านบน แนวรับด้านล่าง ราคาปัจจุบันตรงกลาง */
export default function SrLadder({ pivot, zones, price, mode, tolerancePercent, max = 3 }: {
  pivot: PivotLevels; zones: PriceZone[]; price: number; mode: SrMode; tolerancePercent: number; max?: number;
}) {
  // ใช้กติกาเดียวกับทั้งแอป: แนวต้าน = ระดับแนวต้านเหนือราคา, แนวรับ = ระดับแนวรับใต้ราคา
  const levels = buildSrLevels(pivot, zones, mode);
  const above = levels.filter(l => l.kind === "resistance" && l.price > price).sort((a, b) => a.price - b.price).slice(0, max).reverse();
  const below = levels.filter(l => l.kind === "support" && l.price < price).sort((a, b) => b.price - a.price).slice(0, max);
  if (!above.length && !below.length) return <p className="hint-text">ไม่พบแนวรับ/แนวต้านที่ชัดเจน</p>;
  const near = (p: number) => (Math.abs(price - p) / p) * 100 <= tolerancePercent;
  const strength = (s?: number) => {
    const n = Math.max(1, Math.min(3, s ?? 1));
    return mode === "swing" ? "●".repeat(n) + "○".repeat(3 - n) : "";
  };
  const row = (l: (typeof levels)[number], side: "res" | "sup", rank: number) => {
    const dist = (l.price / price - 1) * 100;
    return (
      <li key={`${side}-${l.price}`} className={`lad-row lad-${side}${near(l.price) ? " lad-near" : ""}`}
        title={`${l.label}${l.strength ? ` · ราคาเคยกลับตัวที่นี่ ${l.strength} ครั้ง` : ""}`}>
        <span className="lad-tag">{side === "res" ? `ต้าน ${rank}` : `รับ ${rank}`}</span>
        <span className="lad-price">{l.price.toFixed(2)}{near(l.price) && <em className="lad-near-tag">ใกล้</em>}</span>
        <span className="lad-dots" aria-label={l.strength ? `แข็ง ${l.strength}` : undefined}>{strength(l.strength)}</span>
        <span className="lad-dist">{dist > 0 ? "+" : ""}{dist.toFixed(1)}%</span>
      </li>
    );
  };
  return (
    <ol className="lad">
      {above.map((l, i) => row(l, "res", above.length - i))}
      <li className="lad-now"><span>ราคาตอนนี้</span><b>{price.toFixed(2)}</b></li>
      {below.map((l, i) => row(l, "sup", i + 1))}
    </ol>
  );
}
