"use client";
import { useState } from "react";
import { screeningEntry } from "@/lib/screening-entry";
import type { StockData } from "@/lib/types";
import { screenStock, type ScreeningCheck, type ScreeningStyle } from "@/lib/screener";
import type { MarketContext } from "@/lib/momentum";

/** เกณฑ์ → ไอคอน + คำสั้น (ข้อความเต็มอยู่ใน tooltip) */
const CHIP_RULES: [RegExp, string, string][] = [
  [/ลงจากจุดสูงสุด|ห่างจุดสูงสุด|ใกล้จุดสูงสุด/, "📉", ""],
  [/ROE/, "💪", "ROE"],
  [/อัตรากำไร/, "💹", "มาร์จิ้น"],
  [/รายได้/, "📈", "รายได้"],
  [/กำไรคาด/, "🔮", "กำไรคาด"],
  [/หนี้/, "🏦", "หนี้"],
  [/PEG/, "⚖️", "PEG"],
  [/P\/E/, "🏷️", "P/E ถูก"],
  [/EPS|มีกำไรแล้ว/, "💵", "EPS"],
  [/FCF|เงินสดอิสระ/, "💸", "FCF"],
  [/Yield|ปันผล/, "💰", "ปันผล"],
  [/Volume|แรงซื้อ/, "🔥", "Vol"],
  [/แนวโน้ม/, "↗", "ขาขึ้น"],
  [/แรงกว่า/, "🏁", "ชนะตลาด"],
  [/เส้น 50 วัน|วิ่งเกินตัว/, "〰️", "ไม่ร้อนเกิน"],
  [/สภาพคล่อง/, "💧", "สภาพคล่อง"],
  [/ค่าธรรมเนียม/, "💸", "ค่าธรรมเนียม"],
  [/ขนาดกอง|บริษัทเล็ก/, "🏢", ""],
  [/ประวัติ/, "⏳", ""],
  [/เลเวอเรจ/, "🛡️", "กองปกติ"],
];
const shortValue = (v: string) => v.replace(/-?\d+(?:\.\d+)?/g, m => { const n = Number(m); return Math.abs(n) >= 100 ? n.toFixed(0) : String(Math.round(n * 10) / 10); }).replace(/ ?USD| ?THB/g, "").replace("เงินสดมากกว่าหนี้", "เงินสด > หนี้");

function chipOf(c: ScreeningCheck): { icon: string; text: string } | null {
  if (/ข้อมูลกำไร\/หน่วยหุ้น|เป็น ETF|รองรับหุ้นสามัญ/.test(c.label)) return null;
  const rule = CHIP_RULES.find(([re]) => re.test(c.label));
  const value = c.value === "ไม่มีข้อมูล" ? "?" : shortValue(c.value);
  if (!rule) return { icon: "•", text: c.label };
  const [, icon, name] = rule;
  // ค่าที่เป็นข้อความยาว (เช่น ช่วงห่างเส้น 50 วัน · RSI) ใช้แค่ชื่อสั้น
  const wordy = /[ก-๙]/.test(value);
  const text = wordy && (value.length > 14 || value === "ผ่าน" || !/\d/.test(value)) ? (value.includes(">") ? value : name)
    : name && value.includes(name) ? value : [name, value].filter(Boolean).join(" ");
  return { icon, text: text || value };
}

export default function ScreeningEntryCard({ data, style, ctx }: { data: StockData; style: ScreeningStyle; ctx?: MarketContext | null }) {
  const entry = screeningEntry(data, style);
  const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0;
  const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const now = data.lastClose;
  const buy = ok(entry.price) ? entry.price : null;
  const target = ok(data.fairValue.analystTarget) ? data.fairValue.analystTarget : null;
  const upside = target && ok(now) ? (target / now - 1) * 100 : null;
  const toBuy = buy && ok(now) ? (buy / now - 1) * 100 : null;
  // แถบ ซื้อ → ตอนนี้ → เป้า
  const pts = [buy, now, target].filter(ok);
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const pos = (v: number) => (hi > lo ? ((v - lo) / (hi - lo)) * 100 : 50);
  const checks = screenStock(data, style, ctx).map(c => ({ c, chip: chipOf(c) })).filter(x => x.chip);
  // หน้าการ์ดโชว์แค่ไอคอน · แตะไอคอนเพื่อดูรายละเอียด
  const [openKey, setOpenKey] = useState<string | null>(null);
  const opened = checks.find(x => x.c.label === openKey);

  return (
    <section className="screen-entry se2" aria-label="สรุปจุดซื้อและเหตุผล">
      <div className="se-prices">
        <div className="se-buy" title={entry.basis}><span>🛒 ซื้อ ≤</span><b>{buy ? fmt(buy) : "—"}</b>{toBuy != null && <small>{toBuy.toFixed(1)}%</small>}</div>
        <div className="se-now"><span>📍 ตอนนี้</span><b>{ok(now) ? fmt(now) : "—"}</b></div>
        <div className="se-target"><span>🎯 เป้า</span><b>{target ? fmt(target) : "—"}</b>{upside != null && <small className={upside >= 0 ? "up" : "down"}>{upside >= 0 ? "+" : ""}{upside.toFixed(1)}%</small>}</div>
      </div>
      {pts.length >= 2 && (
        <div className="se-track" aria-hidden="true">
          {buy && <i className="se-dot buy" style={{ left: `${pos(buy)}%` }} />}
          {target && <i className="se-dot target" style={{ left: `${pos(target)}%` }} />}
          {ok(now) && <i className="se-dot now" style={{ left: `${pos(now)}%` }} />}
        </div>
      )}
      <div className="se-chips" role="group" aria-label="เกณฑ์ (แตะเพื่อดูรายละเอียด)">
        {checks.map(({ c, chip }) => (
          <button key={c.label} type="button" aria-pressed={openKey === c.label} aria-label={`${c.label}: ${c.value}`}
            className={`se-chip ico ${c.passed === true ? "pass" : c.passed === false ? "fail" : "na"}`}
            onClick={() => setOpenKey(openKey === c.label ? null : c.label)}>
            {chip!.icon}
          </button>
        ))}
      </div>
      {opened && (
        <p className={`se-detail ${opened.c.passed === true ? "pass" : opened.c.passed === false ? "fail" : "na"}`}>
          <b>{opened.c.passed === true ? "✓" : opened.c.passed === false ? "✗" : "?"} {opened.chip!.text}</b>
          <span>{opened.c.reason ?? `${opened.c.label} · ${opened.c.value}`}</span>
        </p>
      )}
    </section>
  );
}
