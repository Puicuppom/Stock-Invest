import type { FairValueResult } from "@/lib/types";

export default function FundamentalMetrics({value, market}: {value:FairValueResult; market:"TH"|"US"}) {
  const currency=market==="TH"?"THB":"USD";
  const number=(n:number|null|undefined,suffix="")=>n!=null && Number.isFinite(n)?n.toFixed(2)+suffix:"—";
  const pct=(n:number|null)=>n!=null && Number.isFinite(n)?(n>=0?"+":"")+n.toFixed(1)+"%":null;
  const missingReason=value.warnings?.find(w=>/สกุลเงินงบ|REIT|กำไรขาดทุน/.test(w)) ?? "ข้อมูลพื้นฐานไม่พอหรือโหลดไม่สำเร็จ";
  const rows=[
    {label:"ราคายุติธรรม",amount:number(value.fairValue),unit:currency,note:value.analystWeight?"โมเดล 50% + นักวิเคราะห์ 50%":"โมเดลอย่างเดียว",upside:value.upsidePercent},
    {label:"เป้านักวิเคราะห์",amount:number(value.analystTarget),unit:currency,note:"ราคาเป้าหมายเฉลี่ยจาก Yahoo",upside:value.analystUpsidePercent},
    {label:"Fwd P/E",amount:number(value.forwardPE,"x"),note:"อิงกำไรคาดการณ์",upside:null},
    {label:"P/E (TTM)",amount:number(value.trailingPE,"x"),note:"อิงกำไรย้อนหลัง 12 เดือน",upside:null},
    {label:"EPS (TTM)",amount:number(value.trailingEps),unit:currency+"/หุ้น",note:"กำไรต่อหุ้นย้อนหลัง 12 เดือน",upside:null},
    {label:"FCF Yield",amount:number(value.fcfYieldPercent,"%"),note:"กระแสเงินสดอิสระ ÷ มูลค่าตลาด",upside:null},
    {label:"อัตราปันผล",amount:number(value.dividendYieldPercent,"%"),note:value.dividendRate!=null?number(value.dividendRate)+" "+currency+"/หุ้น/ปี":"อัตราผลตอบแทนจากเงินปันผล",upside:null},
  ];
  return <div className="fundamental-metrics">
    {rows.map(row=><div className="dash-metric" key={row.label} title={row.amount==="—" && row.label==="ราคายุติธรรม"?missingReason:row.note} tabIndex={0}>
      <p className="dash-metric-label">{row.label}{row.label==="ราคายุติธรรม" && value.analystWeight ? <small> · 50/50</small> : null}</p>
      <div className="fundamental-value"><strong className="dash-metric-value">{row.amount}</strong>{row.unit && <small>{row.unit}</small>}{pct(row.upside) && <span className={row.upside!>=0?"change-up":"change-down"}>{pct(row.upside)}</span>}</div>
      {row.label==="ราคายุติธรรม" && row.amount==="—" && <small className="fundamental-unavailable">{missingReason.includes("REIT")?"ต้องใช้ FFO/NAV":missingReason.includes("สกุลเงิน")?"ตรวจสกุลเงิน/ADR":"ข้อมูลไม่พอ"}</small>}
    </div>)}
  </div>;
}
