/** ผลรวมของเหตุการณ์ในกลุ่มเดียว — รวมข้ามหุ้นได้ด้วยการบวก (ใช้ได้ทั้งฝั่ง server และ browser) */
export interface Agg { n: number; r20: number; w20: number; r60: number; w60: number; dd20: number }
export type Section = Record<string, Agg>;
export type BacktestResult = Record<string, Section>;

export const emptyAgg = (): Agg => ({ n: 0, r20: 0, w20: 0, r60: 0, w60: 0, dd20: 0 });

export function mergeResults(into: BacktestResult, from: BacktestResult) {
  for (const [sec, buckets] of Object.entries(from)) {
    const s = (into[sec] ??= {});
    for (const [b, a] of Object.entries(buckets)) {
      const t = (s[b] ??= emptyAgg());
      t.n += a.n; t.r20 += a.r20; t.w20 += a.w20; t.r60 += a.r60; t.w60 += a.w60; t.dd20 += a.dd20;
    }
  }
  return into;
}
