/** ไอคอนกลับตัว: ลงแล้วขึ้น (V) / ขึ้นแล้วลง (Λ) */
export default function RevIcon({ dir, size = 14 }: { dir: "up" | "down"; size?: number }) {
  return (
    <svg className={`rev-ico rev-ico-${dir}`} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {dir === "up"
        ? <><polyline points="1.5,3 6,12 10,7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><polyline points="10,7 14.5,2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><polyline points="10.5,2.5 14.5,2.5 14.5,6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>
        : <><polyline points="1.5,13 6,4 10,9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><polyline points="10,9 14.5,13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><polyline points="10.5,13.5 14.5,13.5 14.5,9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>}
    </svg>
  );
}
