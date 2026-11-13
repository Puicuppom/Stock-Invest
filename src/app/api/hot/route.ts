import { NextRequest, NextResponse } from "next/server";
import { getYahooAuth, USER_AGENT } from "@/lib/yahoo-auth";

/**
 * GET /api/hot?market=US|TH → หุ้นเด่นวันนี้
 * US: กำลังเป็นข่าว (Yahoo Trending) · ขึ้นแรง · ลงแรง · ซื้อขายมากสุด (เฉพาะบริษัทใหญ่ ≥ 1 หมื่นล้าน USD) + พาดหัวข่าวล่าสุด 1 ข่าว
 * TH: ขึ้นแรง · ลงแรง · ซื้อขายมากสุด ใน SET (ไม่มีข่าวไทยจาก Yahoo)
 * CDN เก็บไว้ 10 นาที
 */
export interface HotItem { symbol: string; name: string; price: number; changePercent: number; marketCap: number | null; news?: { title: string; titleTh?: string | null; publisher: string; link: string; time: number } | null }
export interface HotSection { id: string; title: string; items: HotItem[] }

type Q = { symbol?: string; shortName?: string; longName?: string; regularMarketPrice?: number; regularMarketChangePercent?: number; marketCap?: number; quoteType?: string; exchange?: string };
const US_EX = new Set(["NMS", "NGM", "NCM", "NYQ", "ASE"]);
const toItem = (q: Q): HotItem | null => {
  if (!q.symbol || !(q.regularMarketPrice! > 0)) return null;
  return { symbol: q.symbol.replace(/\.BK$/, ""), name: q.shortName ?? q.longName ?? q.symbol, price: q.regularMarketPrice!, changePercent: q.regularMarketChangePercent ?? 0, marketCap: q.marketCap ?? null };
};

async function yget<T>(url: string, auth: { cookie: string; crumb: string }): Promise<T> {
  const u = new URL(url); u.searchParams.set("crumb", auth.crumb);
  const r = await fetch(u, { headers: { "User-Agent": USER_AGENT, Cookie: auth.cookie }, next: { revalidate: 600 }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`yahoo ${r.status}`);
  return r.json() as Promise<T>;
}

async function predefined(id: string, auth: { cookie: string; crumb: string }) {
  const j = await yget<{ finance?: { result?: { quotes?: Q[] }[] } }>(`https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${id}&count=100`, auth);
  return j.finance?.result?.[0]?.quotes ?? [];
}

async function thScreen(sortField: string, sortType: "ASC" | "DESC", auth: { cookie: string; crumb: string }) {
  const r = await fetch(`https://query1.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(auth.crumb)}`, {
    method: "POST", headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT, Cookie: auth.cookie },
    body: JSON.stringify({ offset: 0, size: 40, sortField, sortType, quoteType: "EQUITY", userId: "", userIdType: "guid",
      query: { operator: "and", operands: [{ operator: "eq", operands: ["region", "th"] }, { operator: "eq", operands: ["exchange", "SET"] }, { operator: "gte", operands: ["intradaymarketcap", 10e9] }] } }),
    next: { revalidate: 600 }, signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`screener ${r.status}`);
  const j = await r.json() as { finance?: { result?: { quotes?: Q[] }[] } };
  // ตัด DR / NVDR / หุ้นต่างประเทศที่จดในไทย
  return (j.finance?.result?.[0]?.quotes ?? []).filter(q => q.symbol && /^[A-Z0-9&]+\.BK$/.test(q.symbol) && !/-R\.BK$|\d{2}\.BK$/.test(q.symbol));
}

/** แปลพาดหัวเป็นไทย (ฟรี ไม่ต้องใช้คีย์): Google Translate → สำรอง MyMemory · เก็บผลแปลไว้ 1 วันต่อพาดหัว */
async function toThai(text: string): Promise<string | null> {
  try {
    const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=th&dt=t&q=${encodeURIComponent(text)}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(5000) });
    if (r.ok) { const j = await r.json() as [[string][]]; const out = j?.[0]?.map(x => x[0]).join("").trim(); if (out) return out; }
  } catch { /* ลองตัวสำรอง */ }
  try {
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|th`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(5000) });
    if (r.ok) { const j = await r.json() as { responseData?: { translatedText?: string } }; return j.responseData?.translatedText?.trim() || null; }
  } catch { /* ไม่มีคำแปล */ }
  return null;
}

async function headline(symbol: string, auth: { cookie: string; crumb: string }) {
  try {
    const j = await yget<{ news?: { title?: string; publisher?: string; link?: string; providerPublishTime?: number; relatedTickers?: string[] }[] }>(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=5`, auth);
    const list = (j.news ?? []).filter(n => n.title && n.link);
    const n = list.find(x => x.relatedTickers?.includes(symbol)) ?? list[0];
    return n ? { title: n.title!, titleTh: await toThai(n.title!), publisher: n.publisher ?? "", link: n.link!, time: n.providerPublishTime ?? 0 } : null;
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  const market = request.nextUrl.searchParams.get("market") === "TH" ? "TH" : "US";
  try {
    const auth = await getYahooAuth();
    let sections: HotSection[];
    if (market === "US") {
      const big = (q: Q) => q.quoteType === "EQUITY" && US_EX.has(q.exchange ?? "") && (q.marketCap ?? 0) >= 10e9;
      const [trend, gain, lose, active] = await Promise.all([
        yget<{ finance?: { result?: { quotes?: { symbol: string }[] }[] } }>("https://query1.finance.yahoo.com/v1/finance/trending/US?count=40", auth).catch(() => null),
        predefined("day_gainers", auth).catch(() => []), predefined("day_losers", auth).catch(() => []), predefined("most_actives", auth).catch(() => []),
      ]);
      // Trending มีแค่ชื่อ → ขอราคา/ประเภท/ขนาดเพิ่ม แล้วเก็บเฉพาะหุ้นบริษัทใหญ่ในตลาดหลัก
      const tSyms = (trend?.finance?.result?.[0]?.quotes ?? []).map(q => q.symbol).filter(s => /^[A-Z.]{1,6}$/.test(s));
      const tq = tSyms.length ? await yget<{ quoteResponse?: { result?: Q[] } }>(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tSyms.join(",")}`, auth).then(j => j.quoteResponse?.result ?? []).catch(() => []) : [];
      const pick = (qs: Q[], n: number) => qs.filter(big).map(toItem).filter((x): x is HotItem => !!x).slice(0, n);
      sections = [
        { id: "trend", title: "กำลังเป็นข่าว", items: pick(tSyms.map(s => tq.find(q => q.symbol === s)).filter((q): q is Q => !!q), 8) },
        { id: "gain", title: "ขึ้นแรงวันนี้", items: pick(gain, 6) },
        { id: "lose", title: "ลงแรงวันนี้", items: pick(lose, 6) },
        { id: "active", title: "ซื้อขายมากสุด", items: pick(active, 6) },
      ];
      // พาดหัวข่าว 1 ข่าวต่อหุ้น (ไม่ซ้ำ)
      const uniq = [...new Set(sections.flatMap(s => s.items.map(i => i.symbol)))];
      const news = new Map(await Promise.all(uniq.map(async s => [s, await headline(s, auth)] as const)));
      sections.forEach(s => s.items.forEach(i => { i.news = news.get(i.symbol) ?? null; }));
    } else {
      const [gain, lose, active] = await Promise.all([
        thScreen("percentchange", "DESC", auth).catch(() => []), thScreen("percentchange", "ASC", auth).catch(() => []), thScreen("dayvolume", "DESC", auth).catch(() => []),
      ]);
      const pick = (qs: Q[], n: number, f?: (i: HotItem) => boolean) => qs.map(toItem).filter((x): x is HotItem => !!x && (!f || f(x))).slice(0, n);
      sections = [
        { id: "gain", title: "ขึ้นแรงวันนี้", items: pick(gain, 8, i => i.changePercent > 0) },
        { id: "lose", title: "ลงแรงวันนี้", items: pick(lose, 8, i => i.changePercent < 0) },
        { id: "active", title: "ซื้อขายมากสุด", items: pick(active, 8) },
      ];
    }
    return NextResponse.json({ market, at: Date.now(), sections: sections.filter(s => s.items.length) }, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" }, { status: 502 });
  }
}
