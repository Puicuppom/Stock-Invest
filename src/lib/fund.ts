/**
 * กองทุนรวมไทย: NAV ล่าสุด — ก.ล.ต. Open API (ตั้ง SEC_API_KEY) หรือ Finnomena (ไม่เป็นทางการ อาจถูกบล็อกจากเซิร์ฟเวอร์)
 */
const BASE = "https://www.finnomena.com/fn3/api/fund";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "th-TH,th;q=0.9,en;q=0.8",
  Referer: "https://www.finnomena.com/fund",
};

export interface FundInfo { id: string; code: string; name: string }
export interface FundNav { code: string; name: string; nav: number; date: string; changePercent: number | null }

let listMemo: { at: number; list: FundInfo[] } | null = null;

export async function fundList(): Promise<FundInfo[]> {
  if (listMemo && Date.now() - listMemo.at < 6 * 3600_000) return listMemo.list;
  // รายชื่อใหญ่ (~1MB) เกินแคชของ Next → เก็บในหน่วยความจำแทน
  const res = await fetch(`${BASE}/public/list`, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`fund list failed (${res.status})`);
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

async function finnomenaSearch(q: string, limit = 8): Promise<FundInfo[]> {
  const key = norm(q);
  if (!key) return [];
  const list = await fundList();
  const starts = list.filter(f => norm(f.code).startsWith(key));
  const contains = list.filter(f => !norm(f.code).startsWith(key) && (norm(f.code).includes(key) || f.name.includes(q.trim())));
  return [...starts.sort((a, b) => a.code.length - b.code.length), ...contains].slice(0, limit);
}


/* ── ก.ล.ต. Open API v2 (ทางการ) — ใช้เมื่อตั้งค่า SEC_API_KEY ใน Vercel ── */
const SEC = "https://api.sec.or.th";
type SecProfile = { proj_id?: string; proj_abbr_name?: string; fund_class_name?: string; proj_name_th?: string; fund_status?: string; cancel_date?: string };
type SecNav = { proj_id?: string; fund_class_name?: string; nav_date?: string; last_val?: number };
const secKey = () => process.env.SEC_API_KEY?.trim() || "";

async function secGet<T>(path: string, revalidate: number): Promise<T[]> {
  const res = await fetch(SEC + path, { headers: { "Ocp-Apim-Subscription-Key": secKey(), Accept: "application/json" }, next: { revalidate }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`SEC API ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.items) ? json.items : [];
}

const codeOf = (p: SecProfile) => (p.fund_class_name?.trim() || p.proj_abbr_name?.trim() || "").toUpperCase();
const active = (p: SecProfile) => !p.cancel_date && (!p.fund_status || p.fund_status === "RG");

async function secProfiles(q: string): Promise<SecProfile[]> {
  return secGet<SecProfile>(`/v2/fund/general-info/profiles?project_info=${encodeURIComponent(q)}&page_size=50`, 86400);
}

/** หา proj_id + ชื่อคลาสของรหัสกอง เช่น K-USA-A(A) → โครงการ K-USA คลาส K-USA-A(A) */
const secFindMemo = new Map<string, { projId: string; cls: string; name: string } | null>();
async function secFind(code: string) {
  const key = norm(code);
  if (secFindMemo.has(key)) return secFindMemo.get(key)!;
  // ลองรหัสเต็มก่อน แล้วตัดส่วนท้าย (-A(A), (A), -H) ทีละขั้น เพื่อหาโครงการแม่
  const tries = [code, code.replace(/\([^)]*\)$/, ""), ...code.split("-").map((_, i, a) => a.slice(0, a.length - i).join("-")).slice(1)]
    .map(s => s.trim()).filter((s, i, a) => s.length >= 2 && a.indexOf(s) === i);
  for (const t of tries) {
    const rows = (await secProfiles(t)).filter(active);
    const hit = rows.find(r => norm(codeOf(r)) === key) ?? rows.find(r => norm(r.proj_abbr_name ?? "") === key && !r.fund_class_name);
    if (hit?.proj_id) {
      const found = { projId: hit.proj_id, cls: hit.fund_class_name?.trim() || "", name: hit.proj_name_th?.trim() || "" };
      secFindMemo.set(key, found);
      return found;
    }
  }
  secFindMemo.set(key, null);
  return null;
}

async function secNav(code: string): Promise<FundNav | null> {
  const f = await secFind(code);
  if (!f) return null;
  const day = (d: number) => new Date(Date.now() + 7 * 3600_000 - d * 86400_000).toISOString().slice(0, 10);
  const qs = `proj_id=${encodeURIComponent(f.projId)}&start_nav_date=${day(14)}&end_nav_date=${day(0)}&page_size=100${f.cls ? `&fund_class_name=${encodeURIComponent(f.cls)}` : ""}`;
  const rows = (await secGet<SecNav>(`/v2/fund/daily-info/nav?${qs}`, 3600))
    .filter(r => Number(r.last_val) > 0 && r.nav_date && (!f.cls || norm(r.fund_class_name ?? "") === norm(f.cls)))
    .sort((a, b) => String(b.nav_date).localeCompare(String(a.nav_date)));
  const [last, prev] = rows;
  if (!last) return null;
  const nav = Number(last.last_val);
  const prevNav = Number(prev?.last_val);
  return { code: code.toUpperCase(), name: f.name, nav, date: String(last.nav_date).slice(0, 10), changePercent: prevNav > 0 ? (nav / prevNav - 1) * 100 : null };
}

async function secSearch(q: string, limit: number): Promise<FundInfo[]> {
  const rows = (await secProfiles(q.trim())).filter(active);
  const seen = new Set<string>();
  const out: FundInfo[] = [];
  for (const r of rows) {
    const code = codeOf(r);
    if (!code || seen.has(code) || !r.proj_id) continue;
    seen.add(code);
    out.push({ id: r.proj_id, code, name: r.proj_name_th?.trim() || "" });
  }
  const key = norm(q);
  return out.sort((a, b) => Number(norm(b.code).startsWith(key)) - Number(norm(a.code).startsWith(key)) || a.code.length - b.code.length).slice(0, limit);
}

/** แหล่งข้อมูล: ก.ล.ต. ถ้ามีคีย์ · ไม่งั้น Finnomena */
export function fundSource() { return secKey() ? "sec" : "finnomena"; }

export async function fundNav(code: string): Promise<FundNav | null> {
  if (secKey()) return secNav(code);
  return finnomenaNav(code);
}

export async function searchFunds(q: string, limit = 8): Promise<FundInfo[]> {
  if (secKey()) return secSearch(q, limit);
  return finnomenaSearch(q, limit);
}

async function finnomenaNav(code: string): Promise<FundNav | null> {
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
