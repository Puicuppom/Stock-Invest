"use client";
import { useState } from "react";
import { analyzeEtfDip, etfReturns, ETF_DIP_PERCENT } from "@/lib/etf";
import type { StockData } from "@/lib/types";

const money = (n: number | null, cur: string) => {
  if (n == null) return "—";
  const a = Math.abs(n);
  const s = a >= 1e12 ? `${(n / 1e12).toFixed(2)} ล้านล้าน` : a >= 1e9 ? `${(n / 1e9).toFixed(1)} พันล้าน` : a >= 1e6 ? `${(n / 1e6).toFixed(0)} ล้าน` : n.toLocaleString("en-US");
  return `${s} ${cur}`;
};
const pctTxt = (n: number | null, d = 1, sign = true) => (n == null ? "—" : `${sign && n > 0 ? "+" : ""}${n.toFixed(d)}%`);
const tone = (n: number | null) => (n == null ? "" : n >= 0 ? "up" : "down");

/** การ์ดข้อมูล ETF: ลดราคาเทียบประวัติของกอง · ค่าธรรมเนียม · ผลตอบแทน · หุ้นที่ถือ · กลุ่มอุตสาหกรรม */
export default function EtfCard({ data }: { data: StockData }) {
  const [allSectors, setAllSectors] = useState(false);
  const e = data.etf ?? null;
  const dip = analyzeEtfDip(data.candles);
  const ret = etfReturns(data.candles);
  const cur = data.market === "TH" ? "THB" : "USD";
  const fee = e?.expenseRatio ?? null;
  const feeTone = fee == null ? "" : fee <= 0.2 ? "up" : fee > 0.75 ? "down" : "";
  const sectors = e?.sectors ?? [];
  const shownSectors = allSectors ? sectors : sectors.slice(0, 5);
  const maxHolding = Math.max(...(e?.holdings ?? []).map(h => h.percent), 1);
  const ddPos = dip?.drawdownPercent != null && dip.maxDrawdown ? Math.min(100, (dip.drawdownPercent / dip.maxDrawdown) * 100) : 0;

  return (
    <section className="etf-card" id="etf-card">
      <header className="etf-head">
        <h2>📦 ETF</h2>
        {e?.category && <span className="etf-cat">{e.category}</span>}
        {e?.family && <small>{e.family}</small>}
      </header>

      {e?.leveraged && <p className="etf-warn">⚠ กองเลเวอเรจ/สวนตลาด — ขาดทุนสะสมได้แม้ดัชนีไม่ลง ไม่เหมาะถือยาว</p>}

      {dip && dip.drawdownPercent != null && (
        <div className={`etf-dip etf-dip-${dip.kind}`}>
          <div className="etf-dip-top">
            <span className="etf-dip-verdict">{dip.kind === "good" ? "🏷️ " : dip.kind === "watch" ? "👀 " : ""}{dip.verdict}</span>
            <b>{dip.drawdownPercent.toFixed(1)}%</b>
            <small>จากจุดสูงสุด {dip.high52?.toLocaleString("en-US", { maximumFractionDigits: 2 })}</small>
          </div>
          {dip.maxDrawdown != null && dip.maxDrawdown < 0 && (
            <div className="etf-dd-bar" aria-label="ความลึกเทียบครั้งที่ลงลึกสุด">
              <i style={{ width: `${Math.max(2, ddPos)}%` }} />
              <span className="etf-dd-mark" style={{ left: `${Math.min(100, (-ETF_DIP_PERCENT / dip.maxDrawdown) * 100)}%` }} title={`เกณฑ์ลดราคา −${ETF_DIP_PERCENT}%`} />
            </div>
          )}
          <ul className="etf-dip-facts">
            {dip.maxDrawdown != null && <li>ลึกสุดใน {dip.years} ปี <b>{dip.maxDrawdown.toFixed(0)}%</b>{dip.maxDrawdownDate ? ` (${dip.maxDrawdownDate.slice(0, 7)})` : ""}</li>}
            {dip.deeperShare != null && dip.drawdownPercent < -1 && <li>มีแค่ <b>{dip.deeperShare.toFixed(0)}%</b> ของวันใน {dip.years} ปี ที่ลงลึกกว่านี้</li>}
            {dip.episodes > 0 && <li>เคยลง ≥ {ETF_DIP_PERCENT}% <b>{dip.episodes}</b> รอบ · ฟื้นกลับจุดเดิม {dip.recovered} รอบ{dip.medianRecoveryDays != null ? <> · จากจุดต่ำสุดใช้เวลากลาง ~<b>{dip.medianRecoveryDays < 60 ? `${dip.medianRecoveryDays} วัน` : `${(dip.medianRecoveryDays / 30).toFixed(0)} เดือน`}</b></> : null}</li>}
          </ul>
        </div>
      )}

      <div className="etf-grid">
        <div><span>💸 ค่าธรรมเนียม/ปี</span><b className={feeTone}>{fee != null ? `${fee.toFixed(2)}%` : "—"}</b></div>
        <div><span>🏦 ขนาดกอง</span><b>{money(e?.totalAssets ?? null, cur)}</b></div>
        <div><span>💰 ปันผล</span><b>{e?.yieldPercent != null ? `${e.yieldPercent.toFixed(2)}%` : "—"}</b></div>
        <div><span>1 ปี</span><b className={tone(ret.y1)}>{pctTxt(ret.y1)}</b></div>
        <div><span>3 ปี (ต่อปี)</span><b className={tone(ret.y3)}>{pctTxt(ret.y3)}</b></div>
        <div><span>5 ปี (ต่อปี)</span><b className={tone(ret.y5)}>{pctTxt(ret.y5)}</b></div>
      </div>
      <p className="etf-note">ผลตอบแทนจากราคา ไม่รวมปันผล</p>

      {e && e.holdings.length > 0 && (
        <div className="etf-block">
          <h3>หุ้นที่ถือมากสุด {e.top10Percent != null && <small>10 ตัวแรก = {e.top10Percent.toFixed(0)}% ของกอง</small>}</h3>
          <ul className="etf-bars">
            {e.holdings.map(h => (
              <li key={h.name}>
                <span className="etf-bar-name">{h.symbol ? <><b>{h.symbol}</b> <small>{h.name}</small></> : <b>{h.name}</b>}</span>
                <span className="etf-bar"><i style={{ width: `${(h.percent / maxHolding) * 100}%` }} /></span>
                <span className="etf-bar-val">{h.percent.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sectors.length > 0 && (
        <div className="etf-block">
          <h3>กลุ่มอุตสาหกรรม</h3>
          <div className="etf-stack" aria-hidden="true">
            {sectors.map((s, i) => <i key={s.key} style={{ flex: s.percent, opacity: 1 - i * 0.07 }} title={`${s.label} ${s.percent.toFixed(1)}%`} />)}
          </div>
          <ul className="etf-bars">
            {shownSectors.map(s => (
              <li key={s.key}>
                <span className="etf-bar-name">{s.label}</span>
                <span className="etf-bar"><i style={{ width: `${Math.min(100, s.percent)}%` }} /></span>
                <span className="etf-bar-val">{s.percent.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
          {sectors.length > 5 && <button type="button" className="etf-more" onClick={() => setAllSectors(!allSectors)}>{allSectors ? "ย่อ" : `ดูทั้งหมด ${sectors.length} กลุ่ม`}</button>}
        </div>
      )}

      {!e && <p className="etf-note">ไม่มีข้อมูลไส้ในกองจากแหล่งข้อมูล (มักเกิดกับ ETF ไทย)</p>}
    </section>
  );
}
