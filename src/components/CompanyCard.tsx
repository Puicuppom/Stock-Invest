"use client";
import { useState } from "react";
import { financialChecks, type CompanyInfo, type YearValue } from "@/lib/financials";

const SECTOR_TH: Record<string, string> = {
  Technology: "เทคโนโลยี", "Financial Services": "การเงิน", Healthcare: "สุขภาพ",
  "Consumer Cyclical": "สินค้าตามวัฏจักร", "Consumer Defensive": "สินค้าจำเป็น",
  "Communication Services": "การสื่อสาร", Industrials: "อุตสาหกรรม", Energy: "พลังงาน",
  "Basic Materials": "วัสดุพื้นฐาน", "Real Estate": "อสังหาฯ", Utilities: "สาธารณูปโภค",
};
const ICON = { yes: "✓", partial: "●", no: "✗", na: "?" } as const;

/** 1,234,000,000 → 1.23B */
function compact(n: number): string {
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1e12) return `${s}${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(a >= 1e11 ? 0 : 1)}B`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  return `${s}${a.toLocaleString("en-US")}`;
}

function Bars({ title, rows, currency }: { title: string; rows: YearValue[]; currency: string | null }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map(r => Math.abs(r.value)), 1);
  const last = rows.at(-1)!, prev = rows.at(-2);
  const yoy = prev && prev.value !== 0 ? ((last.value - prev.value) / Math.abs(prev.value)) * 100 : null;
  return (
    <div className="fin-bars" title={rows.map(r => `${r.year}: ${compact(r.value)} ${currency ?? ""}`).join("\n")}>
      <div className="fin-bars-head">
        <span>{title}</span>
        <b className={last.value < 0 ? "neg" : ""}>{compact(last.value)}</b>
        {yoy != null && <em className={yoy >= 0 ? "up" : "down"}>{yoy >= 0 ? "+" : ""}{yoy.toFixed(0)}%</em>}
      </div>
      <div className="fin-bars-plot">
        {rows.map(r => (
          <div key={r.year} className="fin-bar-col">
            <i className={r.value < 0 ? "neg" : ""} style={{ height: `${Math.max(4, (Math.abs(r.value) / max) * 100)}%` }} />
            <small>{r.year.slice(2)}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CompanyCard({ company }: { company: CompanyInfo }) {
  const [open, setOpen] = useState<string | null>(null);
  const checks = financialChecks(company);
  const selected = checks.find(c => c.label === open);
  const hasFin = company.revenue.length > 0 || company.netIncome.length > 0;
  const cashMax = Math.max(company.cash ?? 0, company.debt ?? 0, 1);
  const meta = [
    company.sector ? SECTOR_TH[company.sector] ?? company.sector : null,
    company.industry,
    company.employees ? `พนักงาน ${company.employees.toLocaleString("en-US")} คน` : null,
  ].filter(Boolean);
  return (
    <section className="company-card">
      <div className="ss-head"><h3 className="section-title">ธุรกิจ & งบ</h3>{company.currency && <small className="fin-cur">หน่วย {company.currency}</small>}</div>
      {meta.length > 0 && <p className="co-meta">{meta.join(" · ")}{company.website && <> · <a href={company.website} target="_blank" rel="noopener noreferrer">เว็บไซต์</a></>}</p>}
      {company.summary && <details className="co-summary"><summary>ทำธุรกิจอะไร</summary><p lang="en">{company.summary}</p></details>}

      {hasFin && <>
        <div className="fin-grid">
          <Bars title="รายได้" rows={company.revenue} currency={company.currency} />
          <Bars title="กำไรสุทธิ" rows={company.netIncome} currency={company.currency} />
          <Bars title="เงินสดอิสระ" rows={company.fcf} currency={company.currency} />
        </div>
        {company.cash != null && company.debt != null && (
          <div className="fin-cashdebt">
            <div><span>เงินสด</span><i className="cash" style={{ width: `${(company.cash / cashMax) * 100}%` }} /><b>{compact(company.cash)}</b></div>
            <div><span>หนี้</span><i className="debt" style={{ width: `${(company.debt / cashMax) * 100}%` }} /><b>{compact(company.debt)}</b></div>
          </div>
        )}
        <div className="rev-chips fin-checks">
          {checks.map(c => (
            <button key={c.label} type="button" title={c.detail} aria-expanded={open === c.label}
              className={`rev-chip dip-chip rev-${c.state}${open === c.label ? " is-open" : ""}`}
              onClick={() => setOpen(open === c.label ? null : c.label)}>
              <span className="rev-icon" aria-hidden="true">{ICON[c.state]}</span>{c.label}
            </button>
          ))}
        </div>
        {selected && <p className="rev-detail-box" role="status"><b>{selected.label}</b> · {selected.detail}</p>}
      </>}
      {!hasFin && <p className="hint-text">ไม่มีข้อมูลงบการเงินรายปีจาก Yahoo</p>}
    </section>
  );
}
