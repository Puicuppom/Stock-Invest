"use client";
import { useState } from "react";
import Gauge from "./Gauge";
import SrLadder from "./SrLadder";
import { analyzeReversal, type ReversalSignal } from "@/lib/reversal";
import type { SrHit } from "@/lib/sr-levels";
import { TREND_METHOD, trendIcon, type TrendResult } from "@/lib/trend";
import type { TradePlan } from "@/lib/trade-plan";
import { analyzeVolume, VOLUME_METHOD } from "@/lib/volume";
import type { SrMode, StockData } from "@/lib/types";

interface Props {
  data: StockData;
  trend: TrendResult | null;
  tradePlan: TradePlan;
  srMode: SrMode;
  onModeChange: (mode: SrMode) => void;
  hits: SrHit[];
  tolerancePercent: number;
  toleranceOptions: readonly number[];
  onToleranceChange: (percent: number) => void;
}

const ICON = { yes: "✓", partial: "●", no: "✗" } as const;
const p2 = (n: number) => n.toFixed(2);

export default function SignalSummary(props: Props) {
  const { data, trend, tradePlan, srMode, onModeChange } = props;
  const [openSignal, setOpenSignal] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const price = data.lastClose;
  const reversal = analyzeReversal(data);
  const vol = analyzeVolume(data);
  const volMax = vol ? Math.max(...vol.bars.map(b => b.volume), vol.avg20) : 0;
  const fv = data.fairValue;
  const upside = fv.upsidePercent;
  const selected = reversal?.signals.find(s => s.label === openSignal) ?? null;

  // แผน: ใช้แนวรับ/ต้านตามโหมด ถ้าไม่มี (ราคาหลุดทุกแนว/ทำจุดสูงใหม่) ใช้ค่าสำรอง: Pivot แล้วค่อย 52 สัปดาห์
  type PlanItem = { price: number; note: string; fallback: boolean } | null;
  const pivotBelow = ([["S1", data.pivot.s1], ["S2", data.pivot.s2], ["S3", data.pivot.s3]] as const)
    .filter(([, v]) => v > 0 && v < price).sort((a, b) => b[1] - a[1])[0];
  const pivotAbove = ([["R1", data.pivot.r1], ["R2", data.pivot.r2], ["R3", data.pivot.r3]] as const)
    .filter(([, v]) => v > price).sort((a, b) => a[1] - b[1])[0];
  const low52 = fv.range52w?.low, high52 = fv.range52w?.high;
  const buy: PlanItem = tradePlan.buyPrice != null
    ? { price: tradePlan.buyPrice, note: tradePlan.buyLabel, fallback: false }
    : pivotBelow ? { price: pivotBelow[1], note: `* ไม่มีแนวรับ${srMode === "swing" ? "ถือยาว" : ""}ใต้ราคา (ราคาหลุดทุกแนว) จึงใช้ Pivot ${pivotBelow[0]} แทน`, fallback: true }
    : low52 != null && low52 < price ? { price: low52, note: "* ไม่มีแนวรับใต้ราคา จึงใช้จุดต่ำสุด 52 สัปดาห์แทน", fallback: true }
    : null;
  const sell: PlanItem = tradePlan.sellPrice != null
    ? { price: tradePlan.sellPrice, note: tradePlan.sellLabel, fallback: false }
    : pivotAbove ? { price: pivotAbove[1], note: `* ไม่มีแนวต้าน${srMode === "swing" ? "ถือยาว" : ""}เหนือราคา (ทำจุดสูงใหม่) จึงใช้ Pivot ${pivotAbove[0]} แทน`, fallback: true }
    : high52 != null && high52 > price ? { price: high52, note: "* ไม่มีแนวต้านเหนือราคา จึงใช้จุดสูงสุด 52 สัปดาห์แทน", fallback: true }
    : null;
  const stop: PlanItem = tradePlan.stopLoss != null
    ? { price: tradePlan.stopLoss, note: "ใต้แนวรับ", fallback: false }
    : buy ? { price: buy.price * (1 - (Math.max(props.tolerancePercent, 1) / 100) * 1.5), note: "* คำนวณใต้ราคาซื้อสำรอง", fallback: true }
    : null;
  const plan = { buy, sell, stop };

  const valueText = upside == null ? null : upside >= 10 ? `ถูกกว่า ${upside.toFixed(0)}%` : upside <= -10 ? `แพงกว่า ${Math.abs(upside).toFixed(0)}%` : "ใกล้ราคายุติธรรม";
  const valueTone = upside == null ? "" : upside >= 10 ? "good" : upside <= -10 ? "bad" : "mid";
  const rsi = reversal?.rsi ?? null;
  const rsiText = rsi == null ? "" : rsi < 30 ? "ขายมากเกิน" : rsi > 70 ? "ซื้อมากเกิน" : "ปกติ";
  const rsiTone = rsi == null ? "" : rsi < 30 ? "good" : rsi > 70 ? "bad" : "mid";

  const chip = (s: ReversalSignal) => (
    <button key={s.label} type="button" title={`${s.label}\n${s.detail}`} aria-expanded={openSignal === s.label}
      className={`rev-chip rev-${s.state}${openSignal === s.label ? " is-open" : ""}`}
      onClick={() => setOpenSignal(openSignal === s.label ? null : s.label)}>
      <span className="rev-icon" aria-hidden="true">{ICON[s.state]}</span>{s.short}
    </button>
  );

  return (
    <section className="signal-summary">
      <div className="ss-head">
        <h3 className="section-title">สรุปสัญญาณ</h3>
        <button type="button" className="rev-info-btn" aria-label="วิธีอ่าน" aria-expanded={info} onClick={() => setInfo(!info)}>ⓘ</button>
      </div>

      <div className="ss-row">
        <span className="ss-label">แผน</span>
        <div className="ss-body ss-plan">
          <span className={`ss-pill ss-pill-buy${plan.buy?.fallback ? " ss-fallback" : ""}`} title={plan.buy?.note}>ซื้อ <b>{plan.buy ? p2(plan.buy.price) : "—"}</b>{plan.buy?.fallback && <sup>*</sup>}</span>
          <span className={`ss-pill ss-pill-sell${plan.sell?.fallback ? " ss-fallback" : ""}`} title={plan.sell?.note}>ขาย <b>{plan.sell ? p2(plan.sell.price) : "—"}</b>{plan.sell?.fallback && <sup>*</sup>}</span>
          <span className={`ss-pill ss-pill-stop${plan.stop?.fallback ? " ss-fallback" : ""}`} title={plan.stop?.note}>Stop <b>{plan.stop ? p2(plan.stop.price) : "—"}</b>{plan.stop?.fallback && <sup>*</sup>}</span>
        </div>
      </div>

      {trend && (
        <div className="ss-row" id="ss-trend" title={trend.reasons.join("\n") + "\n\n" + TREND_METHOD}>
          <span className="ss-label">แนวโน้ม</span>
          <div className="ss-body ss-inline">
            <span className={`trend-badge trend-${trend.kind}${trend.strong ? " trend-strong" : ""}`}>{trendIcon(trend.kind)} {trend.label}</span>
            <span className="ss-range">{p2(trend.rangeLow)}–{p2(trend.rangeHigh)}</span>
          </div>
        </div>
      )}

      {((upside != null && fv.fairValue != null) || rsi != null) && (
        <div className="ss-gauges">
          {upside != null && fv.fairValue != null && (
            <Gauge
              title="มูลค่า"
              value={50 - (upside * 50) / 40}
              zones={[
                { from: 0, to: 37.5, color: "var(--success, #4ade80)" },
                { from: 37.5, to: 62.5, color: "var(--warning, #fbbf24)" },
                { from: 62.5, to: 100, color: "var(--danger, #f87171)" },
              ]}
              main={valueText ?? ""}
              sub={`FV ${p2(fv.fairValue)}`}
              tone={valueTone as "good" | "bad" | "mid" | ""}
              leftLabel="ถูก"
              rightLabel="แพง"
              hint="ราคาปัจจุบันเทียบราคายุติธรรม · เข็มซ้าย = ถูก ขวา = แพง (สุดหน้าปัด = ต่างกัน 40%)"
            />
          )}
          {rsi != null && (
            <Gauge
              title="RSI"
              value={rsi}
              zones={[
                { from: 0, to: 30, color: "var(--success, #4ade80)" },
                { from: 30, to: 70, color: "var(--muted, #94a3b8)" },
                { from: 70, to: 100, color: "var(--danger, #f87171)" },
              ]}
              main={rsi.toFixed(0)}
              sub={rsiText}
              tone={rsiTone as "good" | "bad" | "mid" | ""}
              leftLabel="0"
              rightLabel="100"
              hint="RSI 14 วัน · ต่ำกว่า 30 = ขายมากเกิน (อาจเด้ง) · สูงกว่า 70 = ซื้อมากเกิน (อาจย่อ)"
            />
          )}
        </div>
      )}

      {vol && (
        <div className="ss-row" id="ss-vol" title={VOLUME_METHOD}>
          <span className="ss-label">Volume</span>
          <div className="ss-body ss-inline ss-vol">
            <span className="vol-spark" aria-hidden="true">
              {vol.bars.map((b, i) => (
                <i key={i} className={`${b.up ? "up" : "down"}${i === vol.bars.length - 1 ? " last" : ""}`}
                  style={{ height: `${Math.max(6, (b.volume / volMax) * 100)}%` }} />
              ))}
              <s style={{ bottom: `${(vol.avg20 / volMax) * 100}%` }} />
            </span>
            <span className={`vol-ratio tone-${vol.tone}`}><b>{vol.label}</b> <small>{vol.lastRatio.toFixed(1)} เท่าของปกติ</small></span>
            <span className={`vol-bal tone-${vol.balanceTone}`}>2 สัปดาห์: {vol.balanceLabel}</span>
          </div>
        </div>
      )}

      <div className="ss-sr-block" id="ss-sr">
        <div className="ss-sr-bar">
          <span className="ss-label">แนวรับ/แนวต้าน</span>
          <div className="ss-sr-mode" role="group" aria-label="โหมดแนวรับแนวต้าน">
            <button type="button" className={srMode === "swing" ? "active" : ""} aria-pressed={srMode === "swing"} onClick={() => onModeChange("swing")} title="ถือยาว · จุดกลับตัว 6 เดือน">ถือยาว</button>
            <button type="button" className={srMode === "pivot" ? "active" : ""} aria-pressed={srMode === "pivot"} onClick={() => onModeChange("pivot")} title="เทรดสั้น · Pivot วันถัดไป">เทรดสั้น</button>
          </div>
          <button type="button" className="ss-sr-tol" title="แตะเพื่อเปลี่ยนระยะที่ถือว่า 'ใกล้' แนวรับ/แนวต้าน"
            onClick={() => {
              const opts = props.toleranceOptions;
              const i = opts.indexOf(props.tolerancePercent);
              props.onToleranceChange(opts[(i + 1) % opts.length]);
            }}>ใกล้ ±{props.tolerancePercent}%</button>
        </div>
        {vol?.breakout && (
          <p className={`ss-brk ${vol.breakout.dir === "up" ? "is-up" : "is-down"}${vol.breakout.strong ? " is-strong" : ""}`}
            title={`วันที่ทะลุมีคนซื้อขาย ${vol.breakout.ratio.toFixed(1)} เท่าของปกติ`}>
            {vol.breakout.dir === "up" ? "▲ ทะลุแนวต้าน" : "▼ หลุดแนวรับ"} {p2(vol.breakout.level)}
            <em>{vol.breakout.strong
              ? (vol.breakout.dir === "up" ? "คนซื้อหนาแน่น · น่าเชื่อถือ" : "คนขายหนาแน่น · น่าเชื่อถือ")
              : (vol.breakout.dir === "up" ? "คนซื้อบางเบา · ระวังหลอก" : "คนขายบางเบา · อาจเด้งกลับ")}</em>
            <small>{vol.breakout.daysAgo === 0 ? "วันล่าสุด" : `${vol.breakout.daysAgo} วันก่อน`}</small>
          </p>
        )}
        <SrLadder pivot={data.pivot} zones={data.zones} price={price} mode={srMode} tolerancePercent={props.tolerancePercent} />
      </div>

      {reversal && (
        <div className="ss-row ss-row-top">
          <span className="ss-label">กลับตัว</span>
          <div className="ss-body">
            <div className="ss-dots-line">
              <span className="ss-dots" aria-label={`คะแนน ${reversal.score} จาก 7`}>
                {reversal.signals.map(s => <i key={s.label} className={`ss-dot ss-dot-${s.state}`} />)}
              </span>
              <b>{reversal.score}/7</b>
              <span className={`rev-verdict rev-verdict-${reversal.verdictKind}`}>{reversal.verdict}</span>
            </div>
            <div className="rev-chips">
              {reversal.signals.filter(s => s.group === "early").map(chip)}
              <span className="rev-divider" aria-hidden="true" />
              {reversal.signals.filter(s => s.group === "confirm").map(chip)}
            </div>
            {selected && <p className="rev-detail-box" role="status"><b>{selected.label}</b> · {selected.detail}</p>}
          </div>
        </div>
      )}


      {info && (
        <p className="rev-info">
          {reversal?.context ? reversal.context + " · " : ""}
          มูลค่า: ซ้าย = ราคาต่ำกว่าราคายุติธรรม · ตำแหน่ง: ● ใกล้ซ้าย = ใกล้แนวรับ · RSI ต่ำกว่า 30 ขายมากเกิน สูงกว่า 70 ซื้อมากเกิน ·
          กลับตัว: 5 ชิปแรกเป็นสัญญาณเริ่มต้น 2 ชิปหลังเป็นสัญญาณยืนยัน ✓ = 1 ● = 0.5 แตะชิปเพื่อดูตัวเลข · เครื่องมือวิเคราะห์ ไม่ใช่คำแนะนำการลงทุน ใช้คู่กับ Stop loss เสมอ
        </p>
      )}

    </section>
  );
}
