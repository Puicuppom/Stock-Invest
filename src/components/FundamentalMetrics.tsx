import type { FairValueResult } from "@/lib/types";
import AnalystCard from "./AnalystCard";

export default function FundamentalMetrics({value, market, price}: {value:FairValueResult; market:"TH"|"US"; price:number}) {
  const currency=market==="TH"?"THB":"USD";
  const number=(n:number|null|undefined,suffix="")=>n!=null && Number.isFinite(n)?n.toFixed(2)+suffix:"—";
  // P/E หลักร้อยขึ้นไปเกิดจากกำไรใกล้ศูนย์ ตัวเลขไม่มีความหมาย
  const pe=(n:number|null|undefined)=>n!=null && Number.isFinite(n) && n>200?"สูงมาก":number(n,"x");
  const rows=[
    {label:"P/E ปีหน้า",amount:pe(value.forwardPE),unit:"",note:"Forward P/E · ราคา ÷ กำไรคาดการณ์ปีหน้า · ยิ่งต่ำยิ่งถูก"},
    {label:"P/E ปีล่าสุด",amount:pe(value.trailingPE),unit:"",note:"P/E (TTM) · ราคา ÷ กำไร 12 เดือนล่าสุด"},
    {label:"กำไร/หุ้น",amount:number(value.trailingEps),unit:currency,note:"EPS (TTM) · กำไรต่อหุ้น 12 เดือนล่าสุด"},
    {label:"เงินสด/ราคา",amount:number(value.fcfYieldPercent,"%"),unit:"",note:"FCF Yield · กระแสเงินสดอิสระ ÷ มูลค่าบริษัท · ยิ่งสูงยิ่งคุ้ม"},
    {label:"ปันผล",amount:number(value.dividendYieldPercent,"%"),unit:"",note:value.dividendRate!=null?number(value.dividendRate)+" "+currency+"/หุ้น/ปี":"อัตราผลตอบแทนจากเงินปันผล"},
  ];
  // ซ่อนตัวที่ไม่มีค่า (เช่น ไม่จ่ายปันผล) ให้เหลือเฉพาะที่มีความหมาย
  const shown=rows.filter(r=>r.amount!=="—");
  return <div className="fx-value">
    <AnalystCard value={value} price={price} currency={currency} />
    {shown.length>0 && <div className="fx-metrics">
      {shown.map(row=><div className="fx-metric" key={row.label} title={row.note} tabIndex={0}>
        <small>{row.label}</small><b>{row.amount}</b>
      </div>)}
    </div>}
  </div>;
}
