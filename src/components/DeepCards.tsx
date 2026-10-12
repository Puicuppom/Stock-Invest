import type { DeepInfo } from "@/lib/deep";

const f1 = (n: number) => n.toFixed(1);
const pctTxt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

/** ช่วง P/E ย้อนหลังของหุ้นเอง: ตอนนี้ถูกหรือแพงเทียบอดีต */
function PeBand({ pe }: { pe: NonNullable<DeepInfo["pe"]> }) {
  const W = 320, H = 120, pad = 4;
  const vals = pe.series.map(s => s.pe).concat(pe.current ?? []);
  const lo = Math.min(...vals) * 0.95, hi = Math.max(...vals) * 1.05;
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo || 1)) * (H - pad * 2);
  const x = (i: number) => (i / Math.max(1, pe.series.length - 1)) * (W - 12);
  const line = pe.series.map((s, i) => `${x(i).toFixed(1)},${y(s.pe).toFixed(1)}`).join(" ");
  const cur = pe.current;
  const vsMedian = cur != null ? (cur / pe.median - 1) * 100 : null;
  const tone = vsMedian == null ? "" : vsMedian <= -10 ? "up" : vsMedian >= 10 ? "down" : "";
  return (
    <section className="deep-card">
      <h3>ช่วง P/E ย้อนหลัง {pe.years} ปี</h3>
      {cur != null && vsMedian != null && (
        <p className="deep-lead">ตอนนี้ P/E <b>{f1(cur)}</b> · <b className={tone}>{vsMedian <= 0 ? "ต่ำกว่า" : "สูงกว่า"}ค่ากลาง {f1(Math.abs(vsMedian))}%</b> (ค่ากลาง {f1(pe.median)})</p>
      )}
      <svg className="pe-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`P/E ย้อนหลัง ช่วงกลาง ${f1(pe.low)}–${f1(pe.high)}`}>
        <rect x="0" y={y(pe.high)} width={W} height={Math.max(1, y(pe.low) - y(pe.high))} className="pe-band" />
        <line x1="0" x2={W} y1={y(pe.median)} y2={y(pe.median)} className="pe-median" />
        <polyline points={line} className="pe-line" />
        {cur != null && <circle cx={W - 6} cy={y(cur)} r="4.5" className={`pe-now ${tone}`} />}
      </svg>
      <div className="deep-legend">
        <span><i className="lg-band" /> ช่วงปกติ {f1(pe.low)}–{f1(pe.high)}</span>
        <span><i className="lg-med" /> ค่ากลาง</span>
        {cur != null && <span><i className="lg-now" /> ตอนนี้</span>}
      </div>
      <p className="deep-note">P/E รายเดือนจากกำไรต่อหุ้นรายปีที่ประกาศแล้ว · ต่ำกว่าช่วงปกติ = ถูกเทียบอดีตของหุ้นเอง (ต้องดูด้วยว่ากำไรยังไม่แย่ลง)</p>
    </section>
  );
}

/** ประเมินด้วยยอดขาย (P/S) — ใช้กับบริษัทที่ยังขาดทุน */
function PsCard({ ps }: { ps: NonNullable<DeepInfo["ps"]> }) {
  const vs = ps.current != null && ps.median ? (ps.current / ps.median - 1) * 100 : null;
  const max = Math.max(...ps.history.map(h => h.ps), ps.current ?? 0, 1);
  return (
    <section className="deep-card">
      <h3>ประเมินด้วยยอดขาย (P/S)</h3>
      <p className="deep-lead">
        {ps.current != null ? <>ตอนนี้ราคา <b>{f1(ps.current)} เท่า</b>ของยอดขาย</> : "ไม่มี P/S ปัจจุบัน"}
        {vs != null && <> · <b className={vs <= -10 ? "up" : vs >= 10 ? "down" : ""}>{vs <= 0 ? "ต่ำกว่า" : "สูงกว่า"}ค่ากลาง {f1(Math.abs(vs))}%</b></>}
        {ps.revenueGrowthPercent != null && <> · ยอดขายโต <b className={ps.revenueGrowthPercent >= 0 ? "up" : "down"}>{pctTxt(ps.revenueGrowthPercent)}</b></>}
      </p>
      {ps.history.length > 0 && (
        <ul className="deep-bars">
          {ps.history.map(h => <li key={h.year}><span>{h.year}</span><i style={{ width: `${(h.ps / max) * 100}%` }} /><b>{f1(h.ps)}x</b></li>)}
          {ps.current != null && <li className="now"><span>ตอนนี้</span><i style={{ width: `${(ps.current / max) * 100}%` }} /><b>{f1(ps.current)}x</b></li>}
        </ul>
      )}
      <p className="deep-note">บริษัทที่ยังไม่มีกำไรใช้ P/E ไม่ได้ จึงเทียบราคากับยอดขายแทน · ย้อนหลังใช้จำนวนหุ้นปัจจุบันโดยประมาณ · P/S ต่ำลงขณะยอดขายยังโต = น่าสนใจขึ้น</p>
    </section>
  );
}

function EarningsCard({ rows }: { rows: DeepInfo["earnings"] }) {
  const beats = rows.filter(r => (r.surprisePercent ?? 0) > 0).length;
  return (
    <section className="deep-card">
      <h3>งบ {rows.length} ไตรมาสล่าสุด <small>{beats}/{rows.length} ครั้งดีกว่าคาด</small></h3>
      <ul className="eps-list">
        {rows.map(r => {
          const s = r.surprisePercent;
          const beat = s != null && s > 0;
          return (
            <li key={r.quarter}>
              <span className="eps-q">{r.quarter.slice(0, 7)}</span>
              <span className="eps-v">กำไร/หุ้น <b>{r.actual?.toFixed(2)}</b>{r.estimate != null && <small> คาด {r.estimate.toFixed(2)}</small>}</span>
              <em className={`eps-tag ${s == null ? "" : beat ? "up" : "down"}`}>{s == null ? "—" : `${beat ? "✓ ดีกว่าคาด" : "✗ แย่กว่าคาด"} ${pctTxt(s)}`}</em>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DividendCard({ d }: { d: NonNullable<DeepInfo["dividends"]> }) {
  const max = Math.max(...d.years.map(y => y.total));
  const full = d.years.filter(y => !y.partial);
  const cut = full.length >= 2 && full.at(-1)!.total < full.at(-2)!.total * 0.95;
  return (
    <section className="deep-card">
      <h3>ประวัติปันผล</h3>
      <p className="deep-lead">
        {d.growthStreak > 0 ? <>ไม่ลดปันผล <b className="up">{d.growthStreak} ปีติด</b></> : cut ? <b className="down">ปีล่าสุดปันผลลดลง</b> : "ปันผลไม่สม่ำเสมอ"}
        {d.cagr5 != null && <> · โตเฉลี่ย <b className={d.cagr5 >= 0 ? "up" : "down"}>{pctTxt(d.cagr5)}</b>/ปี (5 ปี)</>}
      </p>
      <div className="div-bars" role="img" aria-label="ปันผลรวมต่อปี">
        {d.years.map(y => (
          <span key={y.year} className={y.partial ? "partial" : ""} title={`${y.year}: ${y.total.toFixed(2)} ${d.currency ?? ""}${y.partial ? " (ปีนี้ยังไม่ครบ)" : ""}`}>
            <i style={{ height: `${Math.max(4, (y.total / max) * 100)}%` }} />
            <small>{y.year.slice(2)}</small>
          </span>
        ))}
      </div>
      <p className="deep-note">ปันผลรวมต่อหุ้นต่อปี ({d.currency ?? ""}) · แท่งจาง = ปีนี้ยังจ่ายไม่ครบ</p>
    </section>
  );
}

/** การ์ดข้อมูลเชิงลึกในแท็บพื้นฐาน */
export default function DeepCards({ deep, trailingEps }: { deep: DeepInfo | null | undefined; trailingEps: number | null }) {
  if (!deep) return null;
  const losing = trailingEps == null || trailingEps <= 0;
  return (
    <>
      {deep.pe && !losing && <PeBand pe={deep.pe} />}
      {deep.ps && (losing || !deep.pe) && <PsCard ps={deep.ps} />}
      {deep.earnings.length > 0 && <EarningsCard rows={deep.earnings} />}
      {deep.dividends && deep.dividends.years.length > 1 && <DividendCard d={deep.dividends} />}
    </>
  );
}
