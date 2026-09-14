import Link from "next/link";

export default function AppNavigation({ active }: { active: "stocks" | "rebalance" }) {
  return (
    <nav className="app-navigation" aria-label="เมนูหลัก">
      <Link href="/" aria-current={active === "stocks" ? "page" : undefined}>
        วิเคราะห์หุ้น
      </Link>
      <Link href="/rebalance" aria-current={active === "rebalance" ? "page" : undefined}>
        ปรับพอร์ต
      </Link>
    </nav>
  );
}
