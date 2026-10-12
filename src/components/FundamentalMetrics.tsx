import type { FairValueResult } from "@/lib/types";
import AnalystCard from "./AnalystCard";

export default function FundamentalMetrics({value, market, price}: {value:FairValueResult; market:"TH"|"US"; price:number}) {
  const currency=market==="TH"?"THB":"USD";
  const number=(n:number|null|undefined,suffix="")=>n!=null && Number.isFinite(n)?n.toFixed(2)+suffix:"—";
  // P/E หลักร้อยขึ้นไปเกิดจากกำไรใกล้ศูนย์ ตัวเลขไม่มีความหมาย
  const pe=(n:number|null|undefined)=>n!=null && Number.isFinite(n) && n>200?"สูงมาก":number(n,"x");
  const rows=[
    {label:"Fwd P/E",amount:pe(value.forwardPE),unit:"",note:"อิงกำไรคาดการณ์"},
    {label:"P/E (TTM)",amount:pe(value.trailingPE),unit:"",note:"อิงกำไรย้อนหลัง 12 เดือน"},
    {label:"EPS (TTM)",amount:number(value.trailingEps),unit:currency+"/หุ้น",note:"กำไรต่อหุ้นย้อนหลัง 12 เดือน"},
    {label:"FCF Yield",amount:number(value.fcfYieldPercent,"%"),unit:"",note:"กระแสเงินสดอิสระ ÷ มูลค่าตลาด"},
    {label:"อัตราปันผล",amount:number(value.dividendYieldPercent,"%"),unit:"",note:value.dividendRate!=null?number(value.dividendRate)+" "+currency+"/หุ้น/ปี":"อัตราผลตอบแทนจากเงินปันผล"},
  ];
  return <div className="fundamental-metrics fm-v2">
    <AnalystCard value={value} price={price} currency={currency} />
    {rows.map(row=><div className="dash-metric" key={row.label} title={row.note} tabIndex={0}>
      <p className="dash-metric-label">{row.label}</p>
      <div className="fundamental-value"><strong className="dash-metric-value">{row.amount}</strong>{row.unit && <small>{row.unit}</small>}</div>
    </div>)}
  </div>;
}
