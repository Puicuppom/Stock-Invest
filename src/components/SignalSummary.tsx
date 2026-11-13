"use client";
import { useState } from "react";
import { estimateHolderCost } from "@/lib/holder-cost";
import type React from "react";
import SrLadder from "./SrLadder";
import { analyzeReversal, analyzeTopReversal, reversalTag, rsiSeries, type ReversalSignal } from "@/lib/reversal";
import { completedCandles } from "@/lib/screener";
import type { SrHit } from "@/lib/sr-levels";
import { trendIcon, type TrendResult } from "@/lib/trend";
import type { TradePlan } from "@/lib/trade-plan";
import { analyzeVolume } from "@/lib/volume";
import { eventBadges } from "@/lib/events";
import { analyzeDip, type DipCheck } from "@/lib/dip";
import { atrSeries, RATING_METHOD, technicalRating, type RatingItem } from "@/lib/indicators";
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
  const [openDip, setOpenDip] = useState<string | null>(null);
  const [openRating, setOpenRating] = useState(false);
  const [openSignalTag, setOpenSignalTag] = useState<string | null>(null);
  const price = data.lastClose;
  // กลับตัวขึ้น (ลงแล้วขึ้น) หรือกลับตัวลง (ขึ้นแล้วลง): หุ้นขาขึ้นหรือมีสัญญาณขึ้นแล้วลงชัด → ดูฝั่งกลับตัวลง
  const revTag = reversalTag(data);
  const revDown = revTag ? revTag.dir === "down" : trend?.kind === "up";
  const reversal = revDown ? analyzeTopReversal(data) : analyzeReversal(data);
  const vol = analyzeVolume(data);
  const dip = analyzeDip(data);
  const dipSelected = dip?.checks.find(c => c.label === openDip) ?? null;
  const eventWarn = eventBadges(data.events, data.market).filter(b => b.tone === "warn" || (b.kind === "earnings" && b.days < 0));
  const volMax = vol ? Math.max(...vol.bars.map(b => b.volume), vol.avg20) : 0;
  const fv = data.fairValue;
  // ใช้เป้านักวิเคราะห์ (เฉลี่ย) แทนราคายุติธรรม
  const target = fv.analystTarget;
  const upside = target != null && price > 0 ? (target / price - 1) * 100 : null;
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
  const doneCandles = completedCandles(data);
  const sharesOut = data.fairValue.marketCap && data.lastClose > 0 ? data.fairValue.marketCap / data.lastClose : null;
  const holder = data.assetKind === "gold-spot" ? null : estimateHolderCost(doneCandles, price, sharesOut);
  const atrRaw = atrSeries(doneCandles).at(-1);
  const atr = atrRaw != null && Number.isFinite(atrRaw) ? atrRaw : null;
  const rating = technicalRating(doneCandles);
  const stop: PlanItem = tradePlan.stopLoss != null
    ? { price: tradePlan.stopLoss, note: atr != null ? `ใต้แนวรับ 1 ATR (ความผันผวนเฉลี่ยต่อวัน ${p2(atr)})` : "ใต้แนวรับ", fallback: false }
    : buy && atr != null ? { price: buy.price - atr, note: `* ใต้ราคาซื้อสำรอง 1 ATR (${p2(atr)})`, fallback: true }
    : buy ? { price: buy.price * (1 - (Math.max(props.tolerancePercent, 1) / 100) * 1.5), note: "* คำนวณใต้ราคาซื้อสำรอง", fallback: true }
    : null;
  const plan = { buy, sell, stop };

  // RSI ใช้แค่ 15 วัน — หุ้นเพิ่งเข้าตลาด (ข้อมูล <70 วัน) ยังแสดง RSI ได้แม้ยังวิเคราะห์แนวโน้ม/กลับตัวไม่ได้
  const done = completedCandles(data);
  const rsiFallback = done.length > 15 ? rsiSeries(done.map(c => c.close)).at(-1) : undefined;
  const rsi = reversal?.rsi ?? (rsiFallback != null && Number.isFinite(rsiFallback) ? rsiFallback : null);
  const shortHistory = !reversal || !trend ? done.length : null;
  const rsiText = rsi == null ? "" : rsi < 30 ? "ขายมากเกิน" : rsi > 70 ? "ซื้อมากเกิน" : "ปกติ";
  const rsiTone = rsi == null ? "" : rsi < 30 ? "good" : rsi > 70 ? "bad" : "mid";

  const chip = (s: ReversalSignal) => (
    <button key={s.label} type="button" title={`${s.label}\n${s.detail}`} aria-expanded={openSignal === s.label}
      className={`rev-chip rev-${s.state}${openSignal === s.label ? " is-open" : ""}`}
      onClick={() => setOpenSignal(openSignal === s.label ? null : s.label)}>
      <span className="rev-icon" aria-hidden="true">{ICON[s.state]}</span>{s.short}
    </button>
  );

  const dipChip = (c: DipCheck) => (
    <button key={c.label} type="button" title={`${c.label}\n${c.detail}`} aria-expanded={openDip === c.label}
      className={`rev-chip dip-chip rev-${c.state}${openDip === c.label ? " is-open" : ""}`}
      onClick={() => setOpenDip(openDip === c.label ? null : c.label)}>
      <span className="rev-icon" aria-hidden="true">{c.state === "na" ? "?" : ICON[c.state]}</span>{c.short}
    </button>
  );

  // ── สรุปให้อ่านง่าย: ป้ายสั้น + แตะเพื่อดูเหตุผล (เปิดได้ทีละอัน) ──
  type TagTone = "good" | "bad" | "mid" | "dim";
  type Tag = { id: string; text: string; tone: TagTone; body: React.ReactNode };
  const tags: Tag[] = [];
  if (dip && dip.drawdownPercent != null && dip.kind !== "na") {
    const tone: TagTone = dip.kind === "good" ? "good" : dip.kind === "trap" ? "bad" : dip.kind === "notdeep" ? "dim" : "mid";
    tags.push({ id: "dip", tone, text: `${dip.verdict} ${dip.drawdownPercent.toFixed(0)}%`, body: (
      <>
        <p className="sx-why">ราคาลงมา {Math.abs(dip.drawdownPercent).toFixed(0)}% จากจุดสูงสุด {dip.high52 != null ? p2(dip.high52) : ""} · เช็กว่าเป็นหุ้นดีที่ถูกลง หรือถูกเพราะแย่ลง</p>
        <div className="rev-chips"><span className="dip-group">พื้นฐาน</span>{dip.checks.filter(c => c.group === "quality").map(dipChip)}</div>
        <div className="rev-chips dip-chips-2"><span className="dip-group">ถูกจริง?</span>{dip.checks.filter(c => c.group === "value").map(dipChip)}</div>
        {dipSelected && <p className="rev-detail-box" role="status"><b>{dipSelected.label}</b> · {dipSelected.detail}</p>}
      </>) });
  }
  if (reversal && reversal.verdictKind !== "none") {
    tags.push({ id: "rev", tone: revDown ? "bad" : "good", text: `${revDown ? "กลับตัวลง" : "กลับตัวขึ้น"} ${reversal.score}/7`, body: (
      <>
        <p className="sx-why">{reversal.verdict} · ผ่าน {reversal.score} จาก 7 ข้อ (ยิ่งมากยิ่งชัด)</p>
        <div className="rev-chips">{reversal.signals.filter(s => s.group === "early").map(chip)}<span className="rev-divider" aria-hidden="true" />{reversal.signals.filter(s => s.group === "confirm").map(chip)}</div>
        {selected && <p className="rev-detail-box" role="status"><b>{selected.label}</b> · {selected.detail}</p>}
      </>) });
  }
  if (vol?.breakout) {
    const b = vol.breakout;
    tags.push({ id: "brk", tone: b.dir === "up" ? (b.strong ? "good" : "mid") : (b.strong ? "bad" : "mid"),
      text: `${b.dir === "up" ? "ทะลุแนวต้าน" : "หลุดแนวรับ"} ${p2(b.level)}`,
      body: <p className="sx-why">{b.daysAgo === 0 ? "วันล่าสุด" : `${b.daysAgo} วันก่อน`} · ซื้อขาย {b.ratio.toFixed(1)} เท่าของปกติ · {b.strong ? "คนเล่นหนาแน่น น่าเชื่อถือ" : "คนเล่นบางเบา ระวังหลอก"}</p> });
  }
  if (vol && (vol.tone === "good" || vol.tone === "bad")) {
    tags.push({ id: "vol", tone: vol.tone, text: vol.label, body: (
      <div className="ss-vol sx-vol">
        <span className="vol-spark" aria-hidden="true">
          {vol.bars.map((b, i) => <i key={i} className={`${b.up ? "up" : "down"}${i === vol.bars.length - 1 ? " last" : ""}`} style={{ height: `${Math.max(6, (b.volume / volMax) * 100)}%` }} />)}
          <s style={{ bottom: `${(vol.avg20 / volMax) * 100}%` }} />
        </span>
        <p className="sx-why">วันล่าสุดซื้อขาย {vol.lastRatio.toFixed(1)} เท่าของปกติ · 2 สัปดาห์: {vol.balanceLabel}</p>
      </div>) });
  }
  if (trend?.cross) tags.push({ id: "cross", tone: trend.cross === "golden" ? "good" : "bad", text: trend.cross === "golden" ? "Golden Cross" : "Death Cross",
    body: <p className="sx-why">{trend.cross === "golden" ? "เส้นเฉลี่ย 50 วันเพิ่งตัดขึ้นเหนือ 200 วัน · มักเป็นจุดเริ่มขาขึ้นระยะยาว" : "เส้นเฉลี่ย 50 วันเพิ่งตัดลงใต้ 200 วัน · มักเป็นจุดเริ่มขาลงระยะยาว"}</p> });
  const openTag = tags.find(t => t.id === openSignalTag) ?? null;

  const trendTone: TagTone = trend?.kind === "up" ? "good" : trend?.kind === "down" ? "bad" : "mid";
  const tiles: { id: string; label: string; value: string; sub: string; tone: TagTone; why: string }[] = [];
  // ชื่อสั้นให้พอดีช่อง (ชื่อเต็มอยู่ในคำอธิบายเมื่อแตะ)
  const trendShort = (t: TrendResult) => /กลับตัวขึ้น/.test(t.label) ? "กลับตัวขึ้น" : /กลับตัวลง/.test(t.label) ? "กลับตัวลง"
    : /เอียงขึ้น/.test(t.label) ? "เอียงขึ้น" : /เอียงลง/.test(t.label) ? "เอียงลง" : t.label;
  if (trend) tiles.push({ id: "trend", label: "แนวโน้ม", value: `${trendIcon(trend.kind, trend.label)} ${trendShort(trend)}`, sub: trend.adx != null ? `ADX ${trend.adx.toFixed(0)} · ${trend.adx >= 25 ? "ชัด" : trend.adx >= 20 ? "เริ่มมี" : "อ่อน"}` : "", tone: trendTone,
    why: `${trend.label} · ${trend.reasons.join(" · ")}` });
  if (rsi != null) tiles.push({ id: "rsi", label: "RSI", value: rsi.toFixed(0), sub: rsiText, tone: rsiTone === "good" ? "good" : rsiTone === "bad" ? "bad" : "dim",
    why: "RSI 14 วัน · ต่ำกว่า 30 = ขายมากเกิน อาจเด้ง · สูงกว่า 70 = ซื้อมากเกิน อาจย่อ" });
  if (upside != null && target != null) tiles.push({ id: "target", label: "เป้านักวิเคราะห์", value: `${upside >= 0 ? "+" : ""}${upside.toFixed(0)}%`, sub: `เป้า ${p2(target)}`, tone: upside >= 15 ? "good" : upside <= 0 ? "bad" : "mid",
    why: `ราคาเป้าเฉลี่ยของนักวิเคราะห์ ${p2(target)} · ${upside >= 0 ? `ยังห่างอีก ${upside.toFixed(0)}%` : `ราคาเกินเป้าแล้ว ${Math.abs(upside).toFixed(0)}%`}` });
  const openTile = tiles.find(t => t.id === openSignalTag) ?? null;
  const toggle = (id: string) => { setOpenSignalTag(openSignalTag === id ? null : id); setOpenSignal(null); setOpenDip(null); };

  return (
    <section className="signal-summary sx">
      {rating && (
        <div className="sx-hero" title={RATING_METHOD}>
          <div className="sx-hero-top">
            <span className={`sx-verdict tr-${rating.kind}`}>{rating.label}</span>
            <span className="tr-tf">กราฟรายวัน</span>
          </div>
          <span className="tr-meter" aria-hidden="true"><i style={{ left: `${((rating.score + 1) / 2) * 100}%` }} /></span>
          <button type="button" className="sx-more" aria-expanded={openRating} onClick={() => setOpenRating(!openRating)}>
            <span><b className="ss-good">ซื้อ {rating.counts.buy}</b> · กลาง {rating.counts.neutral} · <b className="ss-bad">ขาย {rating.counts.sell}</b></span>
            <span className="sx-more-link">{openRating ? "ซ่อน" : "ดูตัวชี้วัด"}</span>
          </button>
          {openRating && (
            <div className="tr-detail">
              {([["เส้นเฉลี่ย", rating.ma], ["โมเมนตัม", rating.osc]] as const).map(([name, g]) => (
                <div key={name} className="tr-group">
                  <p className="tr-group-head">{name} <span className={g.score > 0.1 ? "ss-good" : g.score < -0.1 ? "ss-bad" : ""}>{g.score > 0.5 ? "ซื้อแรง" : g.score > 0.1 ? "ซื้อ" : g.score >= -0.1 ? "กลาง" : g.score >= -0.5 ? "ขาย" : "ขายแรง"}</span></p>
                  <ul>{g.items.map((it: RatingItem) => (
                    <li key={it.name}><span>{it.name}</span><span className="tr-val">{it.value}</span><span className={`tr-act tr-act-${it.action}`}>{it.action === "buy" ? "ซื้อ" : it.action === "sell" ? "ขาย" : "กลาง"}</span></li>
                  ))}</ul>
                </div>
              ))}
              <p className="tr-note">สูตรเดียวกับ TradingView · ดูจากราคาอย่างเดียว</p>
            </div>
          )}
        </div>
      )}

      {tiles.length > 0 && (
        <div className="sx-tiles">
          {tiles.map(t => (
            <button key={t.id} type="button" className={`sx-tile tone-${t.tone}${openSignalTag === t.id ? " is-open" : ""}`} aria-expanded={openSignalTag === t.id} onClick={() => toggle(t.id)}>
              <small>{t.label}</small><b>{t.value}</b><em>{t.sub}</em>
            </button>
          ))}
        </div>
      )}
      {openTile && <p className="sx-explain" role="status">{openTile.why}</p>}

      <div className="sx-plan">
        <span className={`ss-pill ss-pill-buy${plan.buy?.fallback ? " ss-fallback" : ""}`} title={plan.buy?.note}><small>ซื้อ</small><b>{plan.buy ? p2(plan.buy.price) : "—"}</b></span>
        <span className={`ss-pill ss-pill-sell${plan.sell?.fallback ? " ss-fallback" : ""}`} title={plan.sell?.note}><small>ขาย</small><b>{plan.sell ? p2(plan.sell.price) : "—"}</b></span>
        <span className={`ss-pill ss-pill-stop${plan.stop?.fallback ? " ss-fallback" : ""}`} title={plan.stop?.note}><small>ตัดขาดทุน</small><b>{plan.stop ? p2(plan.stop.price) : "—"}</b></span>
      </div>
      {eventWarn.map(b => (
        <p key={b.kind} className={`ss-event-warn ev-${b.kind}`}>
          {b.kind === "earnings" ? (b.days < 0 ? "📅 เพิ่งประกาศงบ ราคาอาจเหวี่ยงแรง" : `📅 ${b.text} · ช่วงงบราคาเหวี่ยงแรง`) : `💰 ${b.text}`}
        </p>
      ))}

      {tags.length > 0 && (
        <div className="sx-tags">
          {tags.map(t => (
            <button key={t.id} type="button" className={`sx-tag tone-${t.tone}${openSignalTag === t.id ? " is-open" : ""}`} aria-expanded={openSignalTag === t.id} onClick={() => toggle(t.id)}>{t.text}</button>
          ))}
        </div>
      )}
      {openTag && <div className="sx-explain">{openTag.body}</div>}

      {holder && (() => {
        const vs = (price / holder.avg - 1) * 100;
        const lo = Math.min(holder.avg, price), hi = Math.max(holder.avg, price), span = (hi - lo) || lo * 0.1;
        const at = (v: number) => 10 + ((v - (lo - span * 0.1)) / (span * 1.2)) * 80;
        // ราคาต่ำกว่าทุนคนส่วนใหญ่ = ได้ของถูกกว่าคนอื่น (สีเขียว)
        return (
          <div className="hc" title="ทุนส่วนใหญ่ = ประมาณจากราคาและปริมาณซื้อขาย 2 ปี (แบบ Chip Distribution) ไม่ใช่ข้อมูลพอร์ตจริงของคนอื่น">
            <div className="hc-nums">
              <div><small>ทุนส่วนใหญ่</small><b>{p2(holder.avg)}</b></div>
              <div><small>ราคาตอนนี้</small><b>{p2(price)}</b></div>
              <span className={`hc-pill ${vs <= 0 ? "up" : "down"}`}>ราคา{vs <= 0 ? "ต่ำกว่า" : "สูงกว่า"} {Math.abs(vs).toFixed(0)}%</span>
            </div>
            <div className="hc-bar" aria-hidden="true">
              <span className="hc-dot avg" style={{ left: `${at(holder.avg)}%` }}><em>ส่วนใหญ่</em></span>
              <span className="hc-dot now below" style={{ left: `${at(price)}%` }}><em>ราคา</em></span>
            </div>
          </div>
        );
      })()}

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
            }}>±{props.tolerancePercent}%</button>
        </div>
        <SrLadder pivot={data.pivot} zones={data.zones} price={price} mode={srMode} tolerancePercent={props.tolerancePercent} />
      </div>

      {shortHistory != null && shortHistory < 70 && (
        <p className="ss-short">มีข้อมูลราคา {shortHistory} วัน · สัญญาณบางตัวต้องใช้ 70 วันขึ้นไป</p>
      )}
    </section>
  );
}
