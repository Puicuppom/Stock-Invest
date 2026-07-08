import { NextRequest, NextResponse } from "next/server";
import {
  CHART_TIME_RANGES,
  type ChartTimeRange,
} from "@/lib/chart-range";
import { fetchChartCandles } from "@/lib/chart-service";
import { resolveSymbol } from "@/lib/symbol";

function parseTimeRange(value: string | null): ChartTimeRange {
  if (value && CHART_TIME_RANGES.includes(value as ChartTimeRange)) {
    return value as ChartTimeRange;
  }
  return "6M";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const market = request.nextUrl.searchParams.get("market") as "TH" | "US" | null;
  const timeRange = parseTimeRange(request.nextUrl.searchParams.get("timeRange"));

  try {
    const resolvedSymbol = resolveSymbol(
      decodeURIComponent(symbol),
      market ?? "US"
    );
    if (!resolvedSymbol) {
      return NextResponse.json({ error: "Stock not found" }, { status: 404 });
    }

    const candles = await fetchChartCandles(resolvedSymbol, timeRange);
    if (candles.length === 0) {
      return NextResponse.json({ error: "No chart data" }, { status: 404 });
    }

    return NextResponse.json({ candles, timeRange });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch chart data";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
