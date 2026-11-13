import StockScreener from "@/components/StockScreener";
import HotStocks from "@/components/HotStocks";
export const metadata = { title: "หุ้นเด่น | InvestPui" };
export default async function ScreenerPage({ searchParams }: { searchParams: Promise<{ tool?: string }> }) {
  const { tool } = await searchParams;
  return tool ? <StockScreener /> : <HotStocks />;
}
