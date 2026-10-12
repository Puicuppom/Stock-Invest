import type { Metadata } from "next";
import AppNavigation from "@/components/AppNavigation";

export const metadata: Metadata = {
  title: "ปรับพอร์ต | InvestPui.com",
  description: "จัดการพอร์ตและคำนวณการปรับสัดส่วนการลงทุน",
};

export default function RebalancePage() {
  return (
    <main className="rebalance-shell">
      <AppNavigation active="rebalance" />
      <iframe
        className="rebalance-frame"
        src="/rebalance-app/index.html"
        title="ReBalance Stock — จัดการและปรับสัดส่วนพอร์ต"
      />
    </main>
  );
}
