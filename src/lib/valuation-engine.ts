import type { FairValueData } from "./types";
export interface ValuationModel { referenceOnly?: boolean; name: string; low: number; base: number; high: number; assumption: string }
const positive = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0;
const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
export function evaluateValuation(market: "TH"|"US", data: FairValueData) {
  const models: ValuationModel[]=[];
  const warnings=["ใช้ข้อมูลล่าสุด ไม่ได้ปรับกำไรปกติจากงบหลายปี", "EV/EBITDA และตัวคูณสำรองเป็นสมมติฐานของแอป ไม่ใช่ค่ากลางบริษัทคู่เทียบล่าสุด"];
  warnings.push(...(data.normalizationNotes ?? []));
  const expectedCurrency=market === "TH" ? "THB" : "USD";
  if (data.financialCurrency !== expectedCurrency || data.quoteCurrency !== expectedCurrency) {
    warnings.push("สกุลเงินงบ/ราคาต่างกันหรือยืนยันไม่ได้ จึงไม่คำนวณข้ามสกุลเงิน");
    return finish(models,warnings);
  }
  const sector=data.sector || "";
  const financial=sector === "Financial Services";
  const realEstate=sector === "Real Estate";
  const cyclical=["Energy","Basic Materials","Industrials","Consumer Cyclical"].includes(sector);
  if (!sector) warnings.push("ไม่มีข้อมูลกลุ่มธุรกิจ ใช้ได้เฉพาะ P/E และปันผล");
  if (realEstate) warnings.push("อสังหาริมทรัพย์/REIT ต้องใช้ FFO หรือ NAV จึงงดประเมินด้วยสูตรทั่วไป");
  // Forward EPS may be adjusted while trailing EPS is GAAP: never average them.
  const eps=positive(data.trailingEps)?data.trailingEps:null;
  const history=data.historicalPE;
  const sectorPE=financial?12:cyclical?14:sector === "Technology"?22:sector === "Healthcare"?20:sector === "Utilities"?16:18;
  const anchor=sectorPE*(market === "TH"?0.8:1);
  if (!realEstate && eps != null) {
    // Explicit conservative scenario policy, not a fitted fair-value formula.
    // History contributes only 25%; bound its contribution relative to the sector scenario.
    const clamp=(pe:number)=>Math.max(anchor*0.5,Math.min(anchor*2,pe));
    const blend=(pe:number)=>anchor*0.75+clamp(pe)*0.25;
    const selected=history?blend(history.median):anchor;
    const low=history?Math.min(selected*0.8,blend(history.low)):selected*0.75;
    const high=history?Math.max(selected*1.2,blend(history.high)):selected*1.25;
    models.push({name:"P/E กรณีประเมินแบบระมัดระวัง",low:eps*low,base:eps*selected,high:eps*high,assumption:"EPS TTM " + eps.toFixed(2) + " × P/E " + selected.toFixed(2) + " = " + (eps*selected).toFixed(2) + (history?"; น้ำหนัก 75% ตัวคูณกลุ่มธุรกิจสมมติ " + anchor + " และ 25% P/E ประวัติ " + history.median.toFixed(2) + " โดยจำกัดส่วนประวัติไว้ที่ 0.5–2 เท่าของตัวคูณกลุ่มธุรกิจ":"; ใช้ตัวคูณกลุ่มธุรกิจสมมติ ไม่มีประวัติพอ")});
    warnings.push("น้ำหนัก 75/25 และกรอบ P/E เป็นนโยบายประมาณการของแอป ยังไม่ได้พิสูจน์ความแม่นยำหรือเทียบกับข้อมูลคู่แข่ง ไม่ใช่สูตร InvestingPro");
    if(history) {
      models.push({name:"P/E เทียบประวัติของหุ้น",referenceOnly:true,low:eps*history.low,base:eps*history.median,high:eps*history.high,assumption:"ข้อมูลประกอบเท่านั้น: EPS TTM × P/E ย้อนหลัง จาก " + history.months + " เดือน; งบปีหน่วง 120 วันแทนวันประกาศจริง อาจมีการปรับย้อนหลัง ไม่ใช่ backtest"});
      if(history.high/history.low>2) warnings.push("P/E ย้อนหลังกระจายกว้าง อาจเกิดจากฐานกำไรต่ำ/รายการพิเศษ จึงไม่ใช้ราคาจากประวัติตรง ๆ");
    }
    if(positive(data.forwardEps) && (data.forwardEps/eps>1.8 || data.forwardEps/eps<0.5)) warnings.push("EPS คาดการณ์ต่างจาก TTM มาก อาจมาจากการเติบโตหรือการปรับบัญชี จึงไม่ผสมสองชุด");
  } else if(!realEstate) warnings.push("EPS TTM ไม่เป็นบวกหรือไม่มีข้อมูล จึงงด P/E ไม่ใช้กำไรคาดการณ์แทนโดยอัตโนมัติ");
  if (!realEstate && !financial && positive(data.forwardEps) && data.peerForward) {
    const peer=data.peerForward;
    models.push({name:"Forward P/E คู่เทียบ",referenceOnly:true,low:data.forwardEps*peer.low,base:data.forwardEps*peer.median,high:data.forwardEps*peer.high,assumption:"EPS คาดการณ์ " + data.forwardEps.toFixed(2) + " × Forward P/E มัธยฐาน " + peer.median.toFixed(2) + "; คู่เทียบ " + peer.peers.map(p=>p.symbol+" "+p.pe.toFixed(2)+"x").join(", ") + "; ช่วง P25–P75 ของตัวคูณ ณ " + peer.asOf.slice(0,10) + "; กรองอุตสาหกรรมเดียวกัน รายได้โตต่างไม่เกิน 30 จุดเปอร์เซ็นต์ และ operating margin ต่างไม่เกิน 20 จุดเปอร์เซ็นต์; Yahoo ยังไม่ยืนยันงวด FY/NTM และ GAAP/adjusted จึงเป็นข้อมูลประกอบ ไม่ใช่ราคาเป้าปีหน้า"});
  }
  if (!data.peerForward && !realEstate && !financial && sector && positive(data.forwardEps)) {
    // Separate forecast sensitivity: do not mix adjusted forward earnings with GAAP TTM.
    const forecast=data.forwardEps;
    models.push({name:"Forward P/E กรณีคาดการณ์",referenceOnly:true,low:forecast*.8*anchor*.8,base:forecast*anchor,high:forecast*1.2*anchor*1.2,assumption:"EPS คาดการณ์จาก Yahoo " + forecast.toFixed(2) + " × Forward P/E สมมติ " + anchor.toFixed(1) + "; กรณีต่ำ/สูงปรับทั้ง EPS และ P/E −20%/+20%; ไม่ใช้ P/E ย้อนหลังคูณกำไรคาดการณ์ ไม่เพิ่มพรีเมียมเพราะป้าย AI; ยังไม่ยืนยันงวดประมาณการและฐาน GAAP/adjusted หรือ Forward P/E ของคู่เทียบ จึงไม่รวมราคาหลัก"});
  }
  if (financial && positive(data.bookValue) && positive(data.returnOnEquity) && data.returnOnEquity<=0.3) {
    const roe=data.returnOnEquity;
    const r=market === "TH"?.12:.11;
    // Sustainable growth requires retention g/ROE; keep g below ROE and r.
    const g=Math.min(.02,roe*.25);
    const pb=(discount:number,growth:number)=>(roe-growth)/(discount-growth);
    const base=pb(r,g);
    models.push({name:"P/BV อิง ROE (การเงิน)",low:data.bookValue*Math.min(pb(r+.02,0),base,pb(r-.01,g)),base:data.bookValue*base,high:data.bookValue*Math.max(pb(r+.02,0),base,pb(r-.01,g)),assumption:"BVPS " + data.bookValue.toFixed(2) + " × P/BV " + base.toFixed(2) + "; P/BV=(ROE−g)/(r−g), ROE " + (roe*100).toFixed(1) + "%, r " + (r*100).toFixed(0) + "%, g " + (g*100).toFixed(1) + "%; สมมติ ROE คงที่ ยังไม่ตรวจคุณภาพสินทรัพย์/เงินกองทุน"});
  }
  if (!financial && !realEstate && sector && positive(data.ebitda) && positive(data.sharesOutstanding) && finite(data.totalDebt) && data.totalDebt>=0 && finite(data.totalCash) && data.totalCash>=0) {
    const multiple=cyclical?8:sector === "Technology"?16:12;
    const value=(m:number)=>(data.ebitda!*m-data.totalDebt!+data.totalCash!)/data.sharesOutstanding!;
    if(value(multiple*0.75)>0) models.push({name:"EV/EBITDA หลังหักหนี้สุทธิ",referenceOnly:models.some(m=>m.name.startsWith("P/E")),low:value(multiple*0.75),base:value(multiple),high:value(multiple*1.25),assumption:"EBITDA × " + multiple + " เท่า − หนี้ + เงินสด แล้วหารจำนวนหุ้น; ตัวคูณ ±25% ยังไม่ปรับ minority/preferred"});
    else warnings.push("หนี้สูงเมื่อเทียบ EBITDA จึงงดสูตร EV/EBITDA");
  }
  if (!realEstate && positive(data.dividendRate) && positive(data.trailingEps) && data.dividendRate>=data.trailingEps*0.3 && data.dividendRate<=data.trailingEps*0.85 && finite(data.revenueGrowth) && data.revenueGrowth>=0 && data.revenueGrowth<=0.1 && finite(data.earningsGrowth) && data.earningsGrowth>=0 && data.earningsGrowth<=0.15) {
    const r=market === "TH"?0.11:0.10;
    models.push({name:"ปันผลเติบโตคงที่",low:data.dividendRate/(r+0.02),base:data.dividendRate*1.02/(r-0.02),high:data.dividendRate*1.03/(r-0.01-0.03),assumption:"ใช้เฉพาะ payout 30–85% และการเติบโตล่าสุดไม่สูง; ปันผลเติบโต 0/2/3%; ผลตอบแทนที่ต้องการ " + ((r+0.02)*100).toFixed(0)+"/"+(r*100).toFixed(0)+"/"+((r-0.01)*100).toFixed(0)+"%; ยังไม่ตรวจประวัติปันผลหลายปี"});
  }
  if (financial) warnings.push("กลุ่มการเงินงด EV/EBITDA; ยังไม่มีเงินกองทุนและคุณภาพสินเชื่อ");
  warnings.push("ไม่ใช้ OCF แทน FCF และไม่ทำ DCF เมื่อยังแยก FCFE/FCFF ไม่ได้");
  return finish(models,warnings);
}
function finish(allModels: ValuationModel[], warnings: string[]) {
  const models=allModels.filter(m=>!m.referenceOnly);
  if(allModels.some(m=>m.referenceOnly)) warnings.push("โมเดลที่ระบุประกอบไม่รวมค่ากลาง; EV/EBITDA ตัวคูณคงที่ใช้เป็นข้อมูลประกอบเมื่อมี P/E");
  const median=(values:number[])=>{const s=[...values].sort((a,b)=>a-b);return s.length%2?s[Math.floor(s.length/2)]:(s[s.length/2-1]+s[s.length/2])/2;};
  const base=models.length?median(models.map(m=>m.base)):null;
  const spread=base ? (Math.max(...models.map(m=>m.base))-Math.min(...models.map(m=>m.base)))/base : 0;
  if(spread>0.6)warnings.push("โมเดลให้ค่าต่างกันมาก ควรตรวจงบและสมมติฐานก่อนใช้");
  const confidence: "low"|"medium"|"unavailable" = models.length ? "low" : "unavailable";
  return {fairValue:base,fairValueLow:models.length?Math.min(...models.map(m=>m.low)):null,fairValueHigh:models.length?Math.max(...models.map(m=>m.high)):null,modelCount:models.length,peReference:models.find(m=>m.name.startsWith("P/E"))?.base ?? null,models:allModels,warnings,confidence};
}
