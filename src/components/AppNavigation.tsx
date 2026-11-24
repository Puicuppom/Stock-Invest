import Link from "next/link";

const ICONS = {
  stocks: <path d="M3 17l5-5 4 3 7-8M15 7h4v4" />,
  rebalance: <><circle cx="12" cy="12" r="8" /><path d="M12 4v8l6 4" /></>,
  screener: <path d="M12 3c.9 3.6 3.6 6 3.6 9.6A3.6 3.6 0 0 1 12 16.2a3.6 3.6 0 0 1-3.6-3.6c0-1.6.8-2.8 1.6-3.8M8 18.5c1.1 1.6 2.4 2.5 4 2.5 3.9 0 6.5-3.1 6.5-7.2" />,
} as const;

const TABS = [
  { key: "stocks", href: "/", label: "วิเคราะห์หุ้น" },
  { key: "rebalance", href: "/rebalance", label: "ปรับพอร์ต" },
  { key: "screener", href: "/screener", label: "หุ้นเด่น" },
] as const;

/** มือถือ: แถบล่าง (ปัดซ้าย/ขวาเปลี่ยนแท็บได้) · คอม: แถบบน */
export default function AppNavigation({ active }: { active: "stocks" | "rebalance" | "screener" }) {
  return (
    <nav className="app-navigation" aria-label="เมนูหลัก" data-active={active}>
      {TABS.map(t => (
        <Link key={t.key} href={t.href} aria-current={active === t.key ? "page" : undefined}>
          <svg className="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[t.key]}</svg>
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
