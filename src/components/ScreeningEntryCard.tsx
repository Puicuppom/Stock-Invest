import ValuationDetails from "./ValuationDetails";
import type { StockData } from "@/lib/types";
import type { ScreeningStyle } from "@/lib/screener";
import { screeningEntry } from "@/lib/screening-entry";

export default function ScreeningEntryCard({data, style}: {data: StockData; style: ScreeningStyle}) {
  const entry = screeningEntry(data, style);
  const unit = data.market === "TH" ? "THB" : "USD";
  const format = (n: number) => n.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const distance = entry.price != null && data.lastClose > 0 ? (entry.price / data.lastClose - 1) * 100 : null;
  return <section className="screen-entry" aria-label="ราคาเข้าซื้อประกอบการพิจารณา">
    <span>{style === "short" ? "จุดรอซื้อโดยประมาณ" : "ราคาซื้อไม่เกินตามเกณฑ์"}</span>
    <strong>{entry.price != null ? `${format(entry.price)} ${unit}` : "ยังประเมินไม่ได้"}</strong>
    {distance != null && <p>{distance < 0 ? `ต่ำกว่าราคาปิด ${Math.abs(distance).toFixed(1)}%` : "ราคาปิดอยู่ในเกณฑ์ราคาแล้ว — ยังต้องดูเกณฑ์คัดหุ้นร่วมด้วย"}</p>}
    <p>{entry.basis}</p>
    {entry.stopLoss != null && <p>จุดตัดขาดทุนอ้างอิง {format(entry.stopLoss)} {unit}</p>}
    <p>เป็นราคาตามสูตร ไม่ใช่คำสั่งซื้อหรือการรับรองว่าหุ้นผ่านเกณฑ์ ราคาแสดงปัดทศนิยม 2 ตำแหน่ง</p>
    {style === "long" && <ValuationDetails value={data.fairValue} />}
  </section>;
}
