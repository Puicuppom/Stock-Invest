import { NextRequest, NextResponse } from "next/server";
import { fetchLiveQuotes } from "@/lib/yahoo-quote";
import { resolveSymbol } from "@/lib/symbol";

export const dynamic = "force-dynamic";

/* ถาม Yahoo ไม่เกิน 1 ครั้ง / 4 วิ ต่อชุดหุ้นเดียวกัน (Yahoo จำกัดราว 2,000 ครั้ง/ชม./IP)
 * · ดึงไม่สำเร็จ (เช่นโดนจำกัด) → ส่งราคาล่าสุดที่จำไว้ (ไม่เกิน 2 นาที) แทน */
const FRESH_MS = 4000, STALE_MS = 120_000;
const memo = new Map<string, { at: number; quotes: Awaited<ReturnType<typeof fetchLiveQuotes>> }>();

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
    const syms = [...new Set(items.map(x => x.resolved))].sort();
    const mkey = syms.join(",");
    const hit = memo.get(mkey);
    let quotes: Awaited<ReturnType<typeof fetchLiveQuotes>>;
    if (hit && Date.now() - hit.at < FRESH_MS) quotes = hit.quotes;
    else {
      try {
        quotes = await fetchLiveQuotes(syms);
        memo.set(mkey, { at: Date.now(), quotes });
        if (memo.size > 50) memo.delete(memo.keys().next().value as string);
      } catch (e) {
        if (hit && Date.now() - hit.at < STALE_MS) quotes = hit.quotes;
        else throw e;
      }
    }
    const bySym = new Map(quotes.map(q => [q.symbol.toUpperCase(), q]));
    const out: Record<string, unknown> = {};
    for (const x of items) {
      const q = bySym.get(x.resolved.toUpperCase());
      if (q) out[x.id] = q;
    }
    return NextResponse.json({ quotes: out, at: Date.now() }, { headers: { "Cache-Control": "public, s-maxage=4, stale-while-revalidate=8" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "quote failed" }, { status: 502 });
  }
}
