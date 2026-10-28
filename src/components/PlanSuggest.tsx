"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import StockLogo from "./StockLogo";
import { BUCKET_META, PROFILE_NAME, classifyAsset, loadProfileMixes, type BucketKey, type Profile } from "@/lib/portfolio-plan";
import { screenStock, type ScreeningCheck, type ScreeningStyle } from "@/lib/screener";
import { interestScore } from "@/lib/screener-ranking";
import type { MarketContext } from "@/lib/momentum";
import type { StockData, WatchlistItem } from "@/lib/types";

/** กลุ่ม → เกณฑ์คัดหุ้น (ชุดเดียวกับผู้ช่วยจัดพอร์ต) */
const STYLE_OF: Partial<Record<BucketKey, ScreeningStyle>> = { core: "etf", income: "dividend", quality: "momentum", dip: "dip", small: "smallcap" };
const PROFILES: Profile[] = ["safe", "balanced", "growth"];

type Snapshot = { plan?: Profile; chosen?: boolean; portfolio?: string; cur?: Partial<Record<BucketKey, number>>; holdings?: string[] };
function loadSnapshot(): Snapshot | null {
  try { return JSON.parse(localStorage.getItem("rbPlanSnapshot:v1") || "null"); } catch { return null; }
}
const bare = (s: string) => s.toUpperCase().replace(/\.BK$/, "");

function checksFor(bucket: BucketKey, data: StockData, ctx: MarketContext | null): ScreeningCheck[] {
  const checks = screenStock(data, STYLE_OF[bucket]!, ctx);
  return bucket === "core" ? checks.filter(c => !/ลงจาก|จุดสูงสุด/.test(c.label)) : checks;
}

type Pick = { id: string; item: WatchlistItem; data: StockData; bucket: BucketKey; pass: boolean; miss?: string; score: number };

/** Watchlist → ตัวที่น่าเติมเข้าพอร์ต ตามแผน มั่นคง/สมดุล/เติบโต และกลุ่มที่พอร์ตยังขาด */
export default function PlanSuggest({ rows, ctx }: { rows: { id: string; item: WatchlistItem; data?: StockData }[]; ctx: Record<string, MarketContext> }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [plan, setPlan] = useState<Profile>("balanced");
  const [mixes, setMixes] = useState(() => ({ safe: {}, balanced: {}, growth: {} }) as ReturnType<typeof loadProfileMixes>);
  useEffect(() => {
    const s = loadSnapshot();
    setSnap(s); setMixes(loadProfileMixes());
    if (s?.plan && PROFILES.includes(s.plan)) setPlan(s.plan);
  }, []);

  const mix = mixes[plan];
  const cur = snap?.cur ?? {};
  const held = new Set((snap?.holdings ?? []).map(bare));
  // กลุ่มที่ยังต่ำกว่าเป้า (ไม่นับเงินสด) เรียงจากขาดมากสุด
  const gaps = (Object.keys(STYLE_OF) as BucketKey[])
    .map(k => ({ k, gap: (mix[k] ?? 0) - (cur[k] ?? 0) }))
    .filter(g => (mix[g.k] ?? 0) > 0 && g.gap > 1)
    .sort((a, b) => b.gap - a.gap);

  const picks: Pick[] = [];
  for (const { id, item, data } of rows) {
    if (!data || held.has(bare(item.symbol))) continue;
    const { bucket } = classifyAsset(data);
    if (!STYLE_OF[bucket] || !gaps.some(g => g.k === bucket)) continue;
    const checks = checksFor(bucket, data, ctx[item.market] ?? null);
    const failed = checks.filter(c => c.passed !== true);
    const pass = checks.length > 0 && failed.length === 0;
    if (!pass && !(failed.length === 1 && checks.length > 1)) continue;
    picks.push({ id, item, data, bucket, pass, miss: failed[0]?.label, score: interestScore(data, STYLE_OF[bucket]!, ctx[item.market] ?? null) });
  }
  const groups = gaps.map(g => ({ ...g, list: picks.filter(p => p.bucket === g.k).sort((a, b) => Number(b.pass) - Number(a.pass) || b.score - a.score).slice(0, 3) }))
    .filter(g => g.list.length);
  const loading = rows.some(r => !r.data);

  return (
    <section className="ps" aria-label="น่าเติมเข้าพอร์ต">
      <div className="ps-head">
        <div>
          <b>น่าเติมเข้าพอร์ต</b>
          <small>{snap?.cur ? `${snap.portfolio ?? "พอร์ต"} · ${snap.chosen ? "แผนที่ตั้งไว้" : "แผนที่ใกล้สุด"}: ${PROFILE_NAME[snap.plan ?? plan]}` : "ยังไม่มีข้อมูลพอร์ต · เทียบกับสัดส่วนแผนเต็ม"}</small>
        </div>
        <span className="scr-seg" role="group" aria-label="แผนพอร์ต">
          {PROFILES.map(p => <button key={p} type="button" aria-pressed={plan === p} onClick={() => setPlan(p)}>{PROFILE_NAME[p]}</button>)}
        </span>
      </div>
      {!gaps.length ? <p className="ps-empty">พอร์ตครบตามแผน{PROFILE_NAME[plan]}แล้ว</p>
        : !groups.length ? <p className="ps-empty">{loading ? "กำลังวิเคราะห์ Watchlist…" : "ยังไม่มีตัวใน Watchlist ที่เข้าเกณฑ์กลุ่มที่ขาด"}</p>
        : groups.map(g => (
          <div key={g.k} className="ps-group" style={{ ["--bk" as string]: BUCKET_META[g.k].color }}>
            <div className="ps-gh"><i />{BUCKET_META[g.k].name}<em>ขาด {g.gap.toFixed(0)}%</em><small>{(cur[g.k] ?? 0).toFixed(0)}% / {mix[g.k]}%</small></div>
            <ul>
              {g.list.map(p => (
                <li key={p.id}>
                  <Link href={`/?s=${encodeURIComponent(p.id)}`}>
                    <span className="wl-logo ps-logo">
                      <span className="wl-logo-text">{p.item.symbol.slice(0, 4)}</span>
                      <StockLogo symbol={p.item.market === "TH" ? `${p.item.symbol}.BK` : p.item.symbol} size={36} className="wl-logo-img" />
                    </span>
                    <span className="ps-name"><b>{p.item.symbol}</b><small>{p.data.longName ?? ""}</small></span>
                    <span className={`ps-tag ${p.pass ? "pass" : "near"}`} title={p.pass ? "ผ่านเกณฑ์ครบ" : `ขาด: ${p.miss}`}>{p.pass ? "ผ่านครบ" : "เกือบผ่าน"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </section>
  );
}
