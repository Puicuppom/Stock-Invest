import type { DeepInfo } from "@/lib/deep";

const f1 = (n: number) => n.toFixed(1);
const pctTxt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

/** ช่วง P/E ย้อนหลังของหุ้นเอง: ตอนนี้ถูกหรือแพงเทียบอดีต */
function PeBand({ pe }: { pe: NonNullable<DeepInfo["pe"]> }) {
  const W = 320, H = 100, pad = 8;
  const cur = pe.current;
  // ตัดยอด P/E ที่พุ่งผิดปกติ (ช่วงกำไรต่ำ) ไม่ให้บีบกราฟจนแบน
  const cap = Math.max(pe.high * 1.3, (cur ?? 0) * 1.15);
  const pts = pe.series.map(s => Math.min(s.pe, cap)).concat(cur != null ? [cur] : []);
  const lo = Math.max(0, Math.min(...pts, pe.low) * 0.9), hi = Math.max(...pts, pe.high) * 1.08;
  const y = (v: number) => H - pad - ((Math.min(v, cap) - lo) / (hi - lo || 1)) * (H - pad * 2);
  const x = (i: number) => (i / Math.max(1, pts.length - 1)) * W;
  const line = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const state = cur == null ? null : cur < pe.low ? "cheap" : cur > pe.high ? "rich" : "fair";
  const tone = state === "cheap" ? "up" : state === "rich" ? "down" : "mid";
  const label = state === "cheap" ? "ถูกกว่าอดีต" : state === "rich" ? "แพงกว่าอดีต" : "ราคาปกติ";
  return (
    <section className="deep-card pe-card">
      <div className="pe-top">
        <h3>P/E เทียบอดีต</h3>
        {state && <span className={`pe-pill ${tone}`}>{label}</span>}
      </div>
      {cur != null && <p className="pe-sub">ตอนนี้ <b className={tone}>{f1(cur)}</b> · ปกติ {Math.round(pe.low)}–{Math.round(pe.high)}</p>}
      <div className="pe-plot">
        <svg className="pe-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`P/E ${pe.years} ปี ช่วงปกติ ${f1(pe.low)}–${f1(pe.high)}`}>
          <rect x="0" y={y(pe.high)} width={W} height={Math.max(2, y(pe.low) - y(pe.high))} className="pe-band" />
          <polyline points={line} className="pe-line" />
        </svg>
        {cur != null && <span className={`pe-dot ${tone}`} style={{ top: `${(y(cur) / H) * 100}%` }} aria-hidden="true" />}
      </div>
      <p className="pe-foot"><span>{pe.years} ปีก่อน</span><span>แถบ = ช่วงปกติ</span><span>วันนี้</span></p>
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
  // วันปิดไตรมาส → ไตรมาสตามปฏิทิน เช่น 2026-09-30 → Q3/26
  const qName = (iso: string) => { const [y, m] = iso.split("-").map(Number); return `Q${Math.ceil(m / 3)}/${String(y).slice(2)}`; };
  return (
    <section className="deep-card">
      <h3>กำไรแต่ละไตรมาส เทียบที่นักวิเคราะห์คาด</h3>
      <p className="deep-lead">ดีกว่าคาด <b className={beats >= Math.ceil(rows.length * 0.75) ? "up" : beats <= rows.length / 2 ? "down" : ""}>{beats} จาก {rows.length}</b> ไตรมาสล่าสุด</p>
      <ul className="eps-rows">
        {[...rows].reverse().map(r => {
          const s = r.surprisePercent;
          const beat = s != null && s > 0;
          return (
            <li key={r.quarter} title={`กำไรต่อหุ้นจริง ${r.actual?.toFixed(2) ?? "—"}${r.estimate != null ? ` · คาด ${r.estimate.toFixed(2)}` : ""}`}>
              <span className="eps-q">{qName(r.quarter)}</span>
              <span className={`eps-word ${s == null ? "" : beat ? "up" : "down"}`}>{s == null ? "ไม่มีข้อมูล" : beat ? "ดีกว่าคาด" : "แย่กว่าคาด"}</span>
              <b className={s == null ? "" : beat ? "up" : "down"}>{s == null ? "" : pctTxt(s)}</b>
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
export default function DeepCards({ deep, trailingEps, part = "all" }: { deep: DeepInfo | null | undefined; trailingEps: number | null; part?: "value" | "results" | "all" }) {
  if (!deep) return null;
  const losing = trailingEps == null || trailingEps <= 0;
  const value = part !== "results", results = part !== "value";
  return (
    <>
      {value && deep.pe && !losing && <PeBand pe={deep.pe} />}
      {value && deep.ps && (losing || !deep.pe) && <PsCard ps={deep.ps} />}
      {results && deep.earnings.length > 0 && <EarningsCard rows={deep.earnings} />}
      {results && deep.dividends && deep.dividends.years.length > 1 && <DividendCard d={deep.dividends} />}
    </>
  );
}
