import type { PivotLevels } from "@/lib/types";

interface PivotTableProps {
  pivot: PivotLevels;
  market: "TH" | "US";
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "up" | "down";
}) {
  const toneClass =
    tone === "up"
      ? "text-red-400"
      : tone === "down"
        ? "text-green-400"
        : "text-amber-300";

  return (
    <div className="pivot-row">
      <span className="pivot-label">{label}</span>
      <span className={`pivot-value ${toneClass}`}>{value.toFixed(2)}</span>
    </div>
  );
}

export default function PivotTable({ pivot }: PivotTableProps) {
  return (
    <div className="pivot-card">
      <h3 className="section-title">Pivot Points (วันถัดไป)</h3>
      <div className="pivot-grid">
        <Row label="R3" value={pivot.r3} tone="up" />
        <Row label="R2" value={pivot.r2} tone="up" />
        <Row label="R1" value={pivot.r1} tone="up" />
        <Row label="Pivot" value={pivot.pivot} tone="neutral" />
        <Row label="S1" value={pivot.s1} tone="down" />
        <Row label="S2" value={pivot.s2} tone="down" />
        <Row label="S3" value={pivot.s3} tone="down" />
      </div>
      <p className="hint-text">คำนวณจากราคา H/L/C ของวันก่อนหน้า</p>
    </div>
  );
}
