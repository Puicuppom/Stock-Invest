import { screeningEntry } from "@/lib/screening-entry";
import type { StockData } from "@/lib/types";
import { screenStock, type ScreeningStyle } from "@/lib/screener";
import type { MarketContext } from "@/lib/momentum";

export default function ScreeningEntryCard({data, style, ctx}: {data: StockData; style: ScreeningStyle; ctx?: MarketContext | null}) {
  const entry = screeningEntry(data, style);
  const unit = data.market === "TH" ? "THB" : "USD";
  const price = (value: number | null | undefined) => value != null && Number.isFinite(value) && value > 0 ? `${value.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${unit}` : "ยังประเมินไม่ได้";
  const fairValue = data.fairValue.fairValue;
  const upside = data.lastClose != null && Number.isFinite(data.lastClose) && data.lastClose > 0 && fairValue != null && Number.isFinite(fairValue) && fairValue > 0
    ? (fairValue / data.lastClose - 1) * 100 : null;
  const checks = screenStock(data, style, ctx);
  // เหตุผลมาจากเกณฑ์ที่ผ่านโดยตรง จึงตรงกับเกณฑ์เสมอ
  const reasons = checks.flatMap(check => check.passed === true && check.reason ? [check.reason] : []);
  const passed = checks.length > 0 && checks.every(check => check.passed === true);
  return <section className="screen-entry" aria-label="สรุปเหตุผลคัดหุ้น">
    <div className="screen-entry-prices">
      <div><span title={entry.basis}>ราคาซื้อไม่เกิน</span><strong>{price(entry.price)}</strong></div>
      <div><span>Fair Value</span><strong>{price(fairValue)}</strong></div>
    </div>
    <p className="screen-entry-upside">ส่วนต่างถึง Fair Value <b style={{color: upside == null ? "var(--muted)" : upside >= 0 ? "#34d399" : "#f87171"}}>{upside == null ? "—" : `${upside > 0 ? "+" : ""}${upside.toFixed(1)}%`}</b><small>จากราคาปิดล่าสุด</small></p>
    <b>{passed ? "เหตุผลสรุป" : "สรุปผลคัดกรอง"}</b>
    <p>{reasons.length ? reasons.slice(0, 5).map(reason => <span key={reason} style={{display: "block"}}>{reason}</span>) : "ยังไม่มีข้อมูลเพียงพอที่ผ่านเกณฑ์"}</p>
    {!passed && reasons.length > 0 && <small>ยังไม่ผ่านครบทุกเกณฑ์</small>}
  </section>;
}
