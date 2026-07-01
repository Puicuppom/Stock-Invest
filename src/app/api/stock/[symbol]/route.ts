import { NextRequest, NextResponse } from "next/server";
import { getStockData } from "@/lib/stock-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const market = request.nextUrl.searchParams.get("market") as
    | "TH"
    | "US"
    | "auto"
    | null;

  try {
    const data = await getStockData(
      decodeURIComponent(symbol),
      market ?? "auto"
    );
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch stock data";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
