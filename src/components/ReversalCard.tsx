"use client";
import { useState } from "react";
import { analyzeReversal, type ReversalSignal } from "@/lib/reversal";
import type { StockData } from "@/lib/types";

const ICON = { yes: "✓", partial: "●", no: "✗" } as const;

export default function ReversalCard({ data }: { data: StockData }) {
  const [open, setOpen] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const result = analyzeReversal(data);
  if (!result) return null;
  const selected = result.signals.find(s => s.label === open) ?? null;
  const chip = (s: ReversalSignal) => (
    <button
      key={s.label}
      type="button"
      className={`rev-chip rev-${s.state}${open === s.label ? " is-open" : ""}`}
      title={`${s.label}\n${s.detail}`}
      aria-expanded={open === s.label}
      onClick={() => setOpen(open === s.label ? null : s.label)}
    >
      <span className="rev-icon" aria-hidden="true">{ICON[s.state]}</span>{s.short}
    </button>
  );
  return (
    <section className="reversal-card">
      <div className="rev-head">
        <h3 className="section-title">สัญญาณกลับตัว <small>{result.score}/7</small></h3>
        <span className={`rev-verdict rev-verdict-${result.verdictKind}`}>{result.verdict}</span>
        <button type="button" className="rev-info-btn" aria-label="วิธีอ่าน" aria-expanded={info} onClick={() => setInfo(!info)}>ⓘ</button>
      </div>
      <div className="rev-chips">
        {result.signals.filter(s => s.group === "early").map(chip)}
        <span className="rev-divider" aria-hidden="true" />
        {result.signals.filter(s => s.group === "confirm").map(chip)}
      </div>
      {selected && (
        <p className="rev-detail-box" role="status">
          <b>{selected.label}</b> · {selected.detail}
        </p>
      )}
      {info && (
        <p className="rev-info">
          {result.context ? result.context + " · " : ""}
          5 ตัวแรกเป็นสัญญาณเริ่มต้น (แถวจุดต่ำ) · 2 ตัวหลังเป็นสัญญาณยืนยัน · ✓ = 1 คะแนน ● = 0.5 · แตะชิปเพื่อดูตัวเลข · ใช้คู่กับจุดตัดขาดทุนเสมอ
        </p>
      )}
    </section>
  );
}
