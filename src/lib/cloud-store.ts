/** แถวข้อมูลในตาราง portfolios ของ Supabase (ตารางเดียวกับหน้าปรับพอร์ต) — ใช้ฝั่งเซิร์ฟเวอร์ */
export function cloudConfig() {
  const url = process.env.REBALANCE_SUPABASE_URL, key = process.env.REBALANCE_SUPABASE_ANON_KEY, sync = process.env.REBALANCE_SYNC_KEY;
  if (!url || !key || !sync) return null;
  return { url, sync, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" } };
}

export async function readRows<T = unknown>(keys: string[]): Promise<{ sync_key: string; data: T | null }[]> {
  const c = cloudConfig();
  if (!c || !keys.length) return [];
  const q = `${c.url}/rest/v1/portfolios?select=sync_key,data&sync_key=in.(${keys.map(k => `"${k.replace(/"/g, "")}"`).join(",")})`;
  const res = await fetch(q, { headers: c.headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error("อ่านข้อมูลคลาวด์ไม่ได้");
  return res.json();
}

export async function readRow<T = unknown>(key: string): Promise<T | null> {
  const [row] = await readRows<T>([key]);
  return row?.data ?? null;
}

export async function writeRow(key: string, data: unknown): Promise<void> {
  const c = cloudConfig();
  if (!c) throw new Error("ยังไม่ได้ตั้งค่าคลาวด์");
  const res = await fetch(`${c.url}/rest/v1/portfolios?on_conflict=sync_key`, {
    method: "POST",
    headers: { ...c.headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ sync_key: key, data, updated_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error("บันทึกข้อมูลคลาวด์ไม่สำเร็จ");
}

export const rowKey = (suffix: string) => `${cloudConfig()?.sync ?? ""}__${suffix}`;
