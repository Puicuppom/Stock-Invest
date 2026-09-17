import { screeningEntry } from "@/lib/screening-entry";
import type { StockData } from "@/lib/types";
import { screenStock, type ScreeningStyle } from "@/lib/screener";

export default function ScreeningEntryCard({data, style}: {data: StockData; style: ScreeningStyle}) {
  const entry = screeningEntry(data, style);
  const unit = data.market === "TH" ? "THB" : "USD";
  const price = (value: number | null | undefined) => value != null && Number.isFinite(value) && value > 0 ? `${value.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${unit}` : "ยังประเมินไม่ได้";
  const fairValue = data.fairValue.fairValue;
  const upside = entry.price != null && Number.isFinite(entry.price) && entry.price > 0 && fairValue != null && Number.isFinite(fairValue) && fairValue > 0
    ? (fairValue / entry.price - 1) * 100 : null;
  const checks = screenStock(data, style);
  const descriptions: Record<ScreeningStyle, ((value: string) => string)[]> = {
    long: [
      value => `คาดการณ์กำไรต่อหุ้นเป็นบวก (${value})`,
      value => `กระแสเงินสดอิสระเป็นบวก (FCF Yield ${value})`,
      value => `มีส่วนต่างถึงมูลค่าประเมิน ${value}`,
      value => `ใช้ ${value} ประกอบการประเมิน`,
    ],
    dividend: [
      value => `อัตราปันผล ${value} อยู่ในช่วง 2–8%`,
      value => `เงินปันผลต่อหุ้น ${value} ${data.market === "TH" ? "THB" : "USD"}`,
      value => `กระแสเงินสดอิสระเป็นบวก (FCF Yield ${value})`,
      () => "กำไรย้อนหลังเป็นบวก",
    ],
    short: [
      value => `ราคาเหนือค่าเฉลี่ย 20 วัน ${value}`,
      () => "ค่าเฉลี่ย 20 วันสูงกว่า 50 วัน",
      value => `ปริมาณซื้อขายเป็น ${value}ของค่าเฉลี่ย 20 วันก่อน`,
      () => "ราคาเหนือ Pivot",
    ],
  };
  const reasons = checks.flatMap((check, index) => check.passed === true && descriptions[style][index]
    ? [descriptions[style][index](check.value)] : []);
  const passed = checks.length > 0 && checks.every(check => check.passed === true);
  return <section className="screen-entry" aria-label="สรุปเหตุผลคัดหุ้น">
    <div className="screen-entry-prices">
      <div><span title={entry.basis}>ราคาซื้อไม่เกิน</span><strong>{price(entry.price)}</strong></div>
      <div><span>Fair Value</span><strong>{price(fairValue)}</strong></div>
    </div>
    <p className="screen-entry-upside">ส่วนต่างถึง Fair Value <b style={{color: upside == null ? "var(--muted)" : upside >= 0 ? "#34d399" : "#f87171"}}>{upside == null ? "—" : `${upside > 0 ? "+" : ""}${upside.toFixed(1)}%`}</b><small>จากราคาซื้อไม่เกิน</small></p>
    <b>{passed ? "เหตุผลสรุป" : "สรุปผลคัดกรอง"}</b>
    <p>{reasons.length ? reasons.slice(0, 3).join(" · ") : "ยังไม่มีข้อมูลเพียงพอที่ผ่านเกณฑ์"}</p>
    {!passed && reasons.length > 0 && <small>ยังไม่ผ่านครบทุกเกณฑ์</small>}
  </section>;
}
