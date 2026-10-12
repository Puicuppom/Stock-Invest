import { NextRequest, NextResponse } from "next/server";
import { fetchLiveQuotes } from "@/lib/yahoo-quote";
import { resolveSymbol } from "@/lib/symbol";

export const dynamic = "force-dynamic";

/** GET /api/quotes?items=AAPL:US,PTT:TH → ราคาล่าสุดของทุกตัวในคำขอเดียว (key = "SYMBOL::MARKET") */
export async function GET(request: NextRequest) {
  const raw = (request.nextUrl.searchParams.get("items") ?? "").split(",").filter(Boolean).slice(0, 60);
  const items = raw.map(s => {
    const i = s.lastIndexOf(":");
    const market = (s.slice(i + 1) === "TH" ? "TH" : "US") as "TH" | "US";
    const symbol = i > 0 ? s.slice(0, i) : s;
    return { id: `${symbol}::${market}`, resolved: resolveSymbol(symbol, market) };
  }).filter(x => x.resolved);
  try {
    const quotes = await fetchLiveQuotes([...new Set(items.map(x => x.resolved))]);
    const bySym = new Map(quotes.map(q => [q.symbol.toUpperCase(), q]));
    const out: Record<string, unknown> = {};
    for (const x of items) {
      const q = bySym.get(x.resolved.toUpperCase());
      if (q) out[x.id] = q;
    }
    return NextResponse.json({ quotes: out, at: Date.now() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "quote failed" }, { status: 502 });
  }
}
