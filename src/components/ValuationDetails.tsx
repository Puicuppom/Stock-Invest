import type { FairValueResult } from "@/lib/types";
export default function ValuationDetails({value}: {value: FairValueResult}) {
  if (!value.warnings && !value.models) return null;
  return <details className="valuation-details">
    <summary>วิธีประเมิน · ความเชื่อมั่น {value.confidence === "medium" ? "ปานกลาง" : value.confidence === "low" ? "ต่ำ" : "ข้อมูลไม่พอ"}</summary>
    {value.fairValueLow != null && value.fairValueHigh != null && <p>ช่วงสมมติฐาน {value.fairValueLow.toFixed(2)}–{value.fairValueHigh.toFixed(2)} (ไม่ใช่ช่วงความเชื่อมั่นทางสถิติ)</p>}
    {value.analystWeight ? <p>โมเดล {value.modelFairValue?.toFixed(2)} × 50% + นักวิเคราะห์ {value.analystTarget?.toFixed(2)} × 50% = {value.fairValue?.toFixed(2)}; ช่วงสมมติฐานตรึงเป้านักวิเคราะห์ไว้ที่ค่าเฉลี่ย</p> : null}
    {value.models?.filter(model=>model.name!=="Forward P/E กรณีคาดการณ์").map(model=><div key={model.name}><strong>{model.name}{model.referenceOnly ? " (ประกอบ ไม่รวมค่ากลาง)" : ""}: {model.base.toFixed(2)}</strong><p>กรณีต่ำ {model.low.toFixed(2)} · กลาง {model.base.toFixed(2)} · สูง {model.high.toFixed(2)}</p><p>{model.assumption}</p></div>)}
    <p>ค่ากลางใช้มัธยฐานของวิธีที่นำมารวม ไม่รวมกรณีประกอบ แล้วถ่วงกับเป้านักวิเคราะห์เมื่อมีข้อมูลครบ วิธีต่าง ๆ อาจใช้ข้อมูลกำไรซ้ำกัน จึงไม่ได้เป็นหลักฐานอิสระทั้งหมด</p>
    <ul>{value.warnings?.map(w=><li key={w}>{w}</li>)}</ul>
  </details>;
}
