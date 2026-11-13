"use client";
import { useState } from "react";
import type { StockData } from "@/lib/types";

type Tone = "good" | "bad" | "mid";
interface Tag { id: string; text: string; tone: Tone; why: string }

const growth = (rows?: { value: number }[]) => {
  if (!rows || rows.length < 2) return null;
  const a = rows[rows.length - 2].value, b = rows[rows.length - 1].value;
  return a > 0 ? (b / a - 1) * 100 : null;
};

/** สรุปพื้นฐานเป็นป้ายสั้น ๆ: แตะเพื่อดูเหตุผล */
export default function FundSummary({ data }: { data: StockData }) {
  const [open, setOpen] = useState<string | null>(null);
  const fv = data.fairValue;
  const price = data.lastClose;
  const tags: Tag[] = [];

  const v = fv.analystView;
  if (fv.analystTarget != null && price > 0) {
    const up = (fv.analystTarget / price - 1) * 100;
    const buy = v ? v.strongBuy + v.buy : 0, all = v ? buy + v.hold + v.sell + v.strongSell : 0;
    const buyPct = all ? (buy / all) * 100 : null;
    tags.push({ id: "an", tone: up >= 15 ? "good" : up <= 0 ? "bad" : "mid",
      text: `เป้า ${up >= 0 ? "+" : ""}${up.toFixed(0)}%`,
      why: `นักวิเคราะห์ตั้งเป้าเฉลี่ย ${fv.analystTarget.toFixed(2)}${buyPct != null ? ` · ${buyPct.toFixed(0)}% แนะนำซื้อ` : ""}` });
  }

  const pe = data.deep?.pe;
  if (pe?.current != null) {
    const cheap = pe.current < pe.low, rich = pe.current > pe.high;
    tags.push({ id: "pe", tone: cheap ? "good" : rich ? "bad" : "mid",
      text: cheap ? "ถูกกว่าอดีต" : rich ? "แพงกว่าอดีต" : "ราคาปกติ",
      why: `P/E ตอนนี้ ${pe.current.toFixed(1)} · ช่วงปกติ ${pe.years} ปี ${pe.low.toFixed(1)}–${pe.high.toFixed(1)}` });
  }

  const eq = data.deep?.earnings ?? [];
  if (eq.length) {
    const beats = eq.filter(r => (r.surprisePercent ?? 0) > 0).length;
    tags.push({ id: "eps", tone: beats >= Math.ceil(eq.length * 0.75) ? "good" : beats <= eq.length / 2 ? "bad" : "mid",
      text: `งบดีกว่าคาด ${beats}/${eq.length}`, why: `กำไรต่อหุ้น ${eq.length} ไตรมาสล่าสุด ออกมาดีกว่าที่นักวิเคราะห์คาด ${beats} ครั้ง` });
  }

  const c = data.company;
  const rev = growth(c?.revenue), ni = growth(c?.netIncome);
  if (rev != null) tags.push({ id: "rev", tone: rev >= 10 ? "good" : rev < 0 ? "bad" : "mid",
    text: rev >= 0 ? `รายได้โต ${rev.toFixed(0)}%` : `รายได้หด ${Math.abs(rev).toFixed(0)}%`, why: "รายได้ปีล่าสุดเทียบปีก่อน" });
  if (ni != null) tags.push({ id: "ni", tone: ni >= 10 ? "good" : ni < 0 ? "bad" : "mid",
    text: ni >= 0 ? `กำไรโต ${ni.toFixed(0)}%` : `กำไรลด ${Math.abs(ni).toFixed(0)}%`, why: "กำไรสุทธิปีล่าสุดเทียบปีก่อน" });
  if (c?.cash != null && c?.debt != null) {
    const ok = c.cash >= c.debt;
    tags.push({ id: "debt", tone: ok ? "good" : c.debt > c.cash * 3 ? "bad" : "mid",
      text: ok ? "เงินสดมากกว่าหนี้" : "หนี้มากกว่าเงินสด", why: "เงินสดและเงินลงทุนระยะสั้น เทียบหนี้สินที่มีดอกเบี้ยทั้งหมด" });
  }

  if (!tags.length) return null;
  const good = tags.filter(t => t.tone === "good").length, bad = tags.filter(t => t.tone === "bad").length;
  const verdict = good >= tags.length * 0.6 && bad === 0 ? { t: "พื้นฐานแข็งแรง", k: "good" } : bad >= tags.length * 0.4 ? { t: "พื้นฐานน่าห่วง", k: "bad" } : { t: "พื้นฐานปานกลาง", k: "mid" };
  const sel = tags.find(t => t.id === open);

  return (
    <section className="fx-sum">
      <div className="fx-head">
        <span className={`fx-verdict tone-${verdict.k}`}>{verdict.t}</span>
        <small>ดี {good} · ระวัง {bad} จาก {tags.length}</small>
      </div>
      <div className="sx-tags">
        {tags.map(t => (
          <button key={t.id} type="button" className={`sx-tag tone-${t.tone}${open === t.id ? " is-open" : ""}`} aria-expanded={open === t.id} onClick={() => setOpen(open === t.id ? null : t.id)}>{t.text}</button>
        ))}
      </div>
      {sel && <p className="sx-explain" role="status">{sel.why}</p>}
    </section>
  );
}
