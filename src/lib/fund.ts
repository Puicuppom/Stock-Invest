/**
 * กองทุนรวมไทย: รายชื่อ + NAV ล่าสุดจาก Finnomena (API สาธารณะ ไม่เป็นทางการ — ถ้ารูปแบบเปลี่ยน จะคืน null)
 */
const BASE = "https://www.finnomena.com/fn3/api/fund";
const HEADERS = { "User-Agent": "Mozilla/5.0 (InvestPui)", Accept: "application/json" };

export interface FundInfo { id: string; code: string; name: string }
export interface FundNav { code: string; name: string; nav: number; date: string; changePercent: number | null }

let listMemo: { at: number; list: FundInfo[] } | null = null;

export async function fundList(): Promise<FundInfo[]> {
  if (listMemo && Date.now() - listMemo.at < 6 * 3600_000) return listMemo.list;
  const res = await fetch(`${BASE}/public/list`, { headers: HEADERS, next: { revalidate: 86400 }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error("fund list failed");
  const raw = (await res.json()) as { id?: string; short_code?: string; name_th?: string }[];
  const list = (Array.isArray(raw) ? raw : [])
    .filter(x => x.id && x.short_code)
    .map(x => ({ id: x.id!, code: x.short_code!.trim(), name: (x.name_th ?? "").trim() }));
  if (list.length) listMemo = { at: Date.now(), list };
  return list;
}

const norm = (s: string) => s.toUpperCase().replace(/\s+/g, "");

export async function findFund(code: string): Promise<FundInfo | null> {
  const key = norm(code);
  return (await fundList()).find(f => norm(f.code) === key) ?? null;
}

export async function searchFunds(q: string, limit = 8): Promise<FundInfo[]> {
  const key = norm(q);
  if (!key) return [];
  const list = await fundList();
  const starts = list.filter(f => norm(f.code).startsWith(key));
  const contains = list.filter(f => !norm(f.code).startsWith(key) && (norm(f.code).includes(key) || f.name.includes(q.trim())));
  return [...starts.sort((a, b) => a.code.length - b.code.length), ...contains].slice(0, limit);
}

export async function fundNav(code: string): Promise<FundNav | null> {
  const f = await findFund(code);
  if (!f) return null;
  const res = await fetch(`${BASE}/v2/public/funds/${encodeURIComponent(f.id)}/latest`, { headers: HEADERS, next: { revalidate: 1800 }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const d = (await res.json())?.data;
  const nav = Number(d?.value);
  if (!Number.isFinite(nav) || nav <= 0) return null;
  const ch = Number(d?.d_change);
  return { code: f.code, name: f.name, nav, date: String(d?.date ?? "").slice(0, 10), changePercent: Number.isFinite(ch) ? ch : null };
}
