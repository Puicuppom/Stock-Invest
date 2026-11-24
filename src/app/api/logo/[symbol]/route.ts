import { NextRequest } from "next/server";

export const runtime = "edge";

/** GET /api/logo/NVDA → โลโก้หุ้น ผ่าน CDN ของเว็บเอง (เก็บไว้ 30 วัน · เร็วกว่าดึงจากต้นทางทุกครั้ง) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const sym = decodeURIComponent(symbol).toUpperCase().replace(/\.PNG$/, "").replace(/[^A-Z0-9.\-]/g, "").slice(0, 16);
  if (!sym) return new Response(null, { status: 400 });
  try {
    const res = await fetch(`https://financialmodelingprep.com/image-stock/${encodeURIComponent(sym)}.png`, { headers: { "User-Agent": "Mozilla/5.0" } });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.startsWith("image/")) {
      return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } });
    }
    return new Response(res.body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
