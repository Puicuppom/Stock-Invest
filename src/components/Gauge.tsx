/** เกจครึ่งวงกลมแบบหน้าปัดรถ — value 0..100 (0 = ซ้ายสุด, 100 = ขวาสุด) */
export interface GaugeZone { from: number; to: number; color: string }

const CX = 60, CY = 58, R = 46;
const point = (pct: number, r = R) => {
  const a = Math.PI * (1 - pct / 100);
  return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) };
};
const arc = (from: number, to: number) => {
  const a = point(from), b = point(to);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${R} ${R} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
};

export default function Gauge({ title, value, zones, main, sub, tone, leftLabel, rightLabel, hint }: {
  title: string;
  value: number;
  zones: GaugeZone[];
  main: string;
  sub?: string;
  tone?: "good" | "bad" | "mid" | "";
  leftLabel?: string;
  rightLabel?: string;
  hint?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const tip = point(v, R - 12);
  return (
    <div className="gauge" title={hint}>
      <p className="gauge-title">{title}</p>
      <svg viewBox="0 0 120 66" className="gauge-svg" role="img" aria-label={`${title} ${main}${sub ? " " + sub : ""}`}>
        <path d={arc(0, 100)} className="gauge-track" />
        {zones.map(z => <path key={`${z.from}-${z.to}`} d={arc(z.from, z.to)} style={{ stroke: z.color }} className="gauge-zone" />)}
        {[0, 25, 50, 75, 100].map(t => {
          const a = point(t, R - 8), b = point(t, R - 4);
          return <line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="gauge-tick" />;
        })}
        <line x1={CX} y1={CY} x2={tip.x} y2={tip.y} className="gauge-needle" />
        <circle cx={CX} cy={CY} r={4.5} className="gauge-hub" />
      </svg>
      <div className="gauge-ends"><span>{leftLabel}</span><span>{rightLabel}</span></div>
      <p className={`gauge-main ss-${tone ?? ""}`}>{main}</p>
      {sub && <p className="gauge-sub">{sub}</p>}
    </div>
  );
}
