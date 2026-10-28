"use client";
import { useEffect, useRef, useState } from "react";
import ScreenRow from "./ScreenRow";
import ScreeningEntryCard from "./ScreeningEntryCard";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { screenStock, valuationRiskFlags, type ScreeningCheck, type ScreeningStyle } from "@/lib/screener";
import { interestScore } from "@/lib/screener-ranking";
import { returnPercent, type MarketContext } from "@/lib/momentum";
import { analyzeTrend, LEAN_GLYPH, LEAN_SHORT, trendLean } from "@/lib/trend";
import type { StockData, WatchlistItem } from "@/lib/types";
import { BUCKET_META, loadProfileMixes, PROFILE_MIX, PROFILE_NAME, saveProfileMixes, type BucketKey, type Profile, type ProfileMixes } from "@/lib/portfolio-plan";

/* ── ผู้ช่วยจัดพอร์ต: เลือกสไตล์ → สัดส่วนตัวอย่าง → คัดหุ้นให้แต่ละกลุ่มอัตโนมัติ ── */

type Market = "US" | "TH";

export const BUCKETS: Record<BucketKey, { name: string; hint: string; style: ScreeningStyle | null }> = {
  core: { name: BUCKET_META.core.name, hint: "กองดัชนีกระจายความเสี่ยง ค่าธรรมเนียมต่ำ", style: "etf" },
  income: { name: BUCKET_META.income.name, hint: "กระแสเงินสด ผันผวนน้อย", style: "dividend" },
  quality: { name: BUCKET_META.quality.name, hint: "พื้นฐานเยี่ยม อยู่ในขาขึ้น", style: "momentum" },
  dip: { name: BUCKET_META.dip.name, hint: "พื้นฐานดี ราคาลงลึก ถือรอฟื้น", style: "dip" },
  small: { name: BUCKET_META.small.name, hint: "โตเร็ว ผันผวนสูง ใช้เงินส่วนน้อย", style: "smallcap" },
  cash: { name: BUCKET_META.cash.name, hint: "สำรองไว้ซื้อตอนลดราคา", style: null },
};
const ORDER: BucketKey[] = ["core", "income", "quality", "dip", "small", "cash"];
const PROFILE_HINT: Record<Profile, string> = { safe: "เน้นไม่ขาดทุนหนัก รับปันผล", balanced: "โตไปพร้อมความเสี่ยงพอดี", growth: "ถือยาว รับความผันผวนได้มาก" };
const PROFILE_KEYS: Profile[] = ["safe", "balanced", "growth"];

/* ETF แกนหลักที่คัดไว้ (US) — ไทยใช้ผลค้นหา ETF จากตลาด */
const CORE_US = ["VOO", "VTI", "QQQM", "VXUS", "VT", "SCHD"];
const PICKS = 3;
const MAX_CHECK = 60;
const CONCURRENCY = 4;
const STORE_KEY = "planner:v1";

type Pick = { symbol: string; data: StockData; checks: ScreeningCheck[]; score: number; passed: boolean };
type BucketResult = { picks: Pick[]; near: Pick[]; checked: number; done: boolean; error?: string };
// เก็บผลไว้ข้ามการเปลี่ยนหน้า (ไม่ต้องค้นใหม่)
const memo: Record<string, BucketResult> = {};
let memoCtx: Record<Market, MarketContext | null> = { US: null, TH: null };
// หุ้นตัวเดียวกันโผล่หลายกลุ่ม → ดึงครั้งเดียว ใช้ร่วมกัน (เก็บ promise ไว้ กันยิงซ้ำระหว่างที่กำลังโหลด)
const stockMemo = new Map<string, Promise<StockData | null>>();
function loadScreenStock(symbol: string, m: Market, signal: AbortSignal): Promise<StockData | null> {
  const k = `${m}:${symbol}`;
  let job = stockMemo.get(k);
  if (!job) {
    job = fetch(`/api/stock/${encodeURIComponent(symbol)}?market=${m}&mode=screen`, { signal: AbortSignal.timeout(30000) })
      .then(r => (r.ok ? (r.json() as Promise<StockData>) : null))
      .catch(() => null);
    job.then(d => { if (!d) stockMemo.delete(k); });   // โหลดไม่ได้ → ลองใหม่ได้รอบหน้า
    stockMemo.set(k, job);
  }
  // ยกเลิกเฉพาะฝั่งที่รอ ไม่ยกเลิกการโหลดที่กลุ่มอื่นใช้ร่วม
  return new Promise(resolve => {
    if (signal.aborted) return resolve(null);
    const onAbort = () => resolve(null);
    signal.addEventListener("abort", onAbort, { once: true });
    job!.then(d => { signal.removeEventListener("abort", onAbort); resolve(d); });
  });
}
// กลุ่มที่กำลังค้นอยู่ (กันเริ่มซ้ำ และให้กลุ่มที่ค้างจากการออกหน้ากลางคันได้ค้นต่อ)
const running = new Map<string, AbortController>();

/** ETF หลัก: ใช้เกณฑ์ ETF แต่ไม่บังคับว่าต้องลดราคา */
function checksFor(bucket: BucketKey, data: StockData, ctx: MarketContext | null): ScreeningCheck[] {
  const style = BUCKETS[bucket].style!;
  const checks = screenStock(data, style, ctx);
  return bucket === "core" ? checks.filter(c => !/ลงจาก|จุดสูงสุด/.test(c.label)) : checks;
}

function loadSaved(): { profile: Profile; market: Market; amount: string } | null {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; }
}
const fullMix = (m: Partial<Record<BucketKey, number>>) => Object.fromEntries(ORDER.map(k => [k, m[k] ?? 0])) as Record<BucketKey, number>;

export default function PortfolioPlanner({ items, loaded, onAdd, onScreen }: {
  items: WatchlistItem[]; loaded: boolean;
  onAdd: (symbol: string, market: Market) => boolean;
  /** เปิดตัวคัดหุ้นแบบละเอียดของกลุ่มนั้น */
  onScreen: (style: ScreeningStyle, market: Market) => void;
}) {
  const [profile, setProfile] = useState<Profile>("balanced");
  // สัดส่วนของทุกสไตล์ (แก้ได้ · ใช้ร่วมกับหน้าปรับพอร์ต)
  const [mixes, setMixes] = useState<ProfileMixes>(PROFILE_MIX as ProfileMixes);
  const mix = fullMix(mixes[profile]);
  const [market, setMarket] = useState<Market>("US");
  const [amount, setAmount] = useState("");
  const [results, setResults] = useState<Record<string, BucketResult>>({ ...memo });
  const [open, setOpen] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    const s = loadSaved();
    if (s) { setProfile(PROFILE_KEYS.includes(s.profile) ? s.profile : "balanced"); setMarket(s.market); setAmount(s.amount ?? ""); }
    setMixes(loadProfileMixes());
    setReady(true);
    return () => ctrl.current?.abort();
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ profile, market, amount })); } catch { /* ignore */ }
  }, [ready, profile, market, amount]);

  const sum = ORDER.reduce((s, k) => s + mix[k], 0);
  const active = ORDER.filter(k => mix[k] > 0 && BUCKETS[k].style);
  const key = (b: BucketKey) => `${market}:${b}`;
  const busy = active.some(b => results[key(b)] && !results[key(b)].done);

  // ค้นหาเฉพาะกลุ่มที่ยังไม่มีผล (หรือกด ↻)
  useEffect(() => {
    if (!ready) return;
    const todo = active.filter(b => !memo[key(b)] || (!memo[key(b)].done && !running.has(key(b))));
    if (todo.length) run(todo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, market, active.join(",")]);
  // เปลี่ยนตลาด → หยุดค้นของตลาดเดิม
  useEffect(() => () => { ctrl.current?.abort(); ctrl.current = null; }, [market]);

  async function marketCtx(signal: AbortSignal): Promise<MarketContext | null> {
    if (memoCtx[market]) return memoCtx[market];
    const indexName = market === "US" ? "S&P 500" : "SET";
    try {
      const r = await fetch(`/api/stock/${encodeURIComponent(market === "US" ? "^GSPC" : "^SET.BK")}?market=${market}&mode=screen`, { signal });
      const d = await r.json();
      memoCtx = { ...memoCtx, [market]: { index6mPercent: r.ok ? returnPercent(d.candles.map((c: { close: number }) => c.close), 126) : null, indexName } };
    } catch { memoCtx = { ...memoCtx, [market]: { index6mPercent: null, indexName } }; }
    return memoCtx[market];
  }

  async function run(buckets: BucketKey[]) {
    // ไม่ยกเลิกกลุ่มอื่นที่กำลังค้นอยู่ — ยกเลิกเฉพาะตอนเปลี่ยนตลาดหรือออกจากหน้า
    if (!ctrl.current || ctrl.current.signal.aborted) ctrl.current = new AbortController();
    const abort = ctrl.current;
    const m = market;
    const todo = buckets.filter(b => !running.has(`${m}:${b}`));
    if (!todo.length) return;
    const set = (b: BucketKey, r: BucketResult) => { memo[`${m}:${b}`] = r; setResults(prev => ({ ...prev, [`${m}:${b}`]: r })); };
    todo.forEach(b => { running.set(`${m}:${b}`, abort); set(b, { picks: [], near: [], checked: 0, done: false }); });
    const ctx = await marketCtx(abort.signal);
    await Promise.all(todo.map(async b => {
      try { await scanBucket(b, m, ctx, abort.signal, r => set(b, r)); }
      finally {
        // ลบเฉพาะงานของรอบนี้ (ถ้ากด ↻ ไปแล้ว อย่าไปลบผลของรอบใหม่)
        if (running.get(`${m}:${b}`) === abort) {
          running.delete(`${m}:${b}`);
          // ถูกยกเลิกกลางคัน → ลบผลค้าง ให้เริ่มใหม่ได้เมื่อกลับมา
          if (abort.signal.aborted && !memo[`${m}:${b}`]?.done) delete memo[`${m}:${b}`];
        }
      }
    }));
  }

  async function scanBucket(b: BucketKey, m: Market, ctx: MarketContext | null, signal: AbortSignal, emit: (r: BucketResult) => void) {
    const style = BUCKETS[b].style!;
    const picks: Pick[] = [], near: Pick[] = [];
    let checked = 0, offset: number | null = 0, enough = false;
    let queue: string[] = b === "core" && m === "US" ? [...CORE_US] : [];
    const seen = new Set<string>();
    const publish = (done: boolean, error?: string) => emit({
      picks: [...picks].sort((x, y) => y.score - x.score).slice(0, PICKS),
      near: [...near].sort((x, y) => y.score - x.score).slice(0, PICKS),
      checked, done, error,
    });
    try {
      while (!signal.aborted && !enough && checked < MAX_CHECK) {
        if (!queue.length) {
          if (offset === null || (b === "core" && m === "US")) break;
          const params: URLSearchParams = new URLSearchParams({ market: m, sector: "", cap: style === "smallcap" ? "small" : "all", offset: String(offset), style, size: "60" });
          const res: Response = await fetch(`/api/discover?${params}`, { signal });
          const j: { symbols?: string[]; nextOffset?: number | null; error?: string } = await res.json();
          if (!res.ok || !Array.isArray(j.symbols)) throw new Error(j.error || "ค้นหารายชื่อไม่สำเร็จ");
          offset = j.nextOffset ?? null;
          queue = j.symbols.filter((s: string) => !seen.has(s));
          if (!queue.length) { if (offset === null) break; continue; }
        }
        const batch = queue.splice(0, CONCURRENCY);
        const rows = await Promise.all(batch.map(async symbol => {
          seen.add(symbol);
          const data = await loadScreenStock(symbol, m, signal);
          return data ? { symbol, data } : null;
        }));
        for (const row of rows) {
          if (!row) continue;
          checked++;
          const checks = checksFor(b, row.data, ctx);
          const failed = checks.filter(c => c.passed !== true).length;
          const pick = { symbol: row.symbol, data: row.data, checks, score: interestScore(row.data, style, ctx), passed: checks.length > 0 && failed === 0 };
          if (pick.passed) picks.push(pick);
          else if (checks.length > 1 && failed === 1) near.push(pick);
        }
        // พบตัวผ่านพอสำหรับจัดอันดับแล้ว (มากกว่าที่แสดงเล็กน้อยเพื่อเลือกตัวดีสุด)
        enough = picks.length >= PICKS + 2;
        publish(false);
      }
      if (!signal.aborted) publish(true);
    } catch (e) {
      if (!signal.aborted) publish(true, e instanceof Error ? e.message : "ค้นหาไม่สำเร็จ");
    }
  }

  const updateMix = (next: Partial<Record<BucketKey, number>>) => {
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => (v ?? 0) > 0)) as Partial<Record<BucketKey, number>>;
    const all = { ...mixes, [profile]: clean };
    setMixes(all);
    saveProfileMixes(all);
  };
  const step = (k: BucketKey, d: number) => updateMix({ ...mix, [k]: Math.max(0, Math.min(100, mix[k] + d)) });
  const money = Number(amount.replace(/,/g, "")) || 0;
  const cur = market === "TH" ? "฿" : "$";
  const fmt = (n: number) => `${cur}${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  // ราคาสดของหุ้นที่แนะนำ
  const shown = active.flatMap(b => {
    const r = results[key(b)];
    return (r?.picks.length ? r.picks : r?.near ?? []).map(p => ({ symbol: p.symbol, market }));
  });
  const live = useLiveQuotes(shown, !busy);

  return (
    <section className="planner">
      <div className="pl-tabs" role="tablist" aria-label="สไตล์พอร์ต">
        {PROFILE_KEYS.map(p => (
          <button key={p} type="button" role="tab" aria-selected={profile === p} className={profile === p ? "on" : ""} onClick={() => setProfile(p)}>{PROFILE_NAME[p]}</button>
        ))}
      </div>
      <p className="pl-hint">{PROFILE_HINT[profile]} · กด − / ＋ ที่แต่ละกลุ่มเพื่อตั้งสัดส่วนของสไตล์นี้</p>

      <div className="pl-bar" aria-hidden="true">
        {ORDER.filter(k => mix[k] > 0).map(k => <i key={k} style={{ flex: mix[k], background: BUCKET_META[k].color }} title={`${BUCKETS[k].name} ${mix[k]}%`} />)}
      </div>

      <div className="pl-tools">
        <span className="scr-seg" role="group" aria-label="ตลาด">
          {(["US", "TH"] as const).map(m => <button key={m} type="button" aria-pressed={market === m} onClick={() => setMarket(m)}>{m === "US" ? "US" : "ไทย"}</button>)}
        </span>
        <label className="pl-amount"><span>เงินลงทุน {cur}</span>
          <input type="text" inputMode="decimal" placeholder="ไม่ระบุก็ได้" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} />
        </label>
        <button type="button" className="pl-refresh" disabled={busy} title="ค้นหาใหม่" aria-label="ค้นหาใหม่"
          onClick={() => { ctrl.current?.abort(); ctrl.current = null; active.forEach(b => { delete memo[key(b)]; running.delete(key(b)); }); for (const k of [...stockMemo.keys()]) if (k.startsWith(`${market}:`)) stockMemo.delete(k); run(active); }}>↻</button>
      </div>
      {sum !== 100 && <p className="pl-sum">รวม {sum}% · {sum > 100 ? `เกิน ${sum - 100}%` : `ขาด ${100 - sum}%`} <button type="button" onClick={() => updateMix({ ...PROFILE_MIX[profile] })}>คืนค่าเริ่มต้น</button></p>}

      {ORDER.map(k => {
        const bk = BUCKETS[k];
        const r = results[key(k)];
        const list = r?.picks.length ? r.picks : r?.near ?? [];
        const isNear = !r?.picks.length && list.length > 0;
        const bucketMoney = money * mix[k] / 100;
        return (
          <div key={k} className={`pl-bucket pl-b-${k}${mix[k] === 0 ? " off" : ""}`}>
            <header>
              <span className="pl-dot" style={{ background: BUCKET_META[k].color }} aria-hidden="true" />
              <span className="pl-title"><b>{bk.name}</b><small>{bk.hint}</small></span>
              <span className="pl-pct">
                <button type="button" aria-label={`ลด ${bk.name}`} onClick={() => step(k, -5)}>−</button>
                <b>{mix[k]}%</b>
                <button type="button" aria-label={`เพิ่ม ${bk.name}`} onClick={() => step(k, 5)}>＋</button>
              </span>
            </header>
            {money > 0 && mix[k] > 0 && <p className="pl-money">{fmt(bucketMoney)}{bk.style && list.length > 0 ? ` · ตัวละ ~${fmt(bucketMoney / list.length)}` : ""}</p>}
            {bk.style && mix[k] > 0 && (
              <>
                {!r || (!r.done && !list.length) ? <p className="pl-wait"><i className="sk sk-line" />กำลังคัด… {r ? `ตรวจ ${r.checked}` : ""}</p> : null}
                {r?.done && !list.length && <p className="pl-wait">{r.error ? `⚠ ${r.error}` : `ยังไม่พบตัวที่ผ่านเกณฑ์ (ตรวจ ${r.checked} ตัว) · พักเงินกลุ่มนี้ไว้ก่อน หรือคัดเพิ่ม`}</p>}
                {isNear && <p className="pl-note">≈ ยังไม่มีตัวผ่านครบ · แสดงตัวที่ขาด 1 เกณฑ์</p>}
                {list.length > 0 && (
                  <ul className="wl-list scr-list">
                    {list.map((p, i) => {
                      const q = live[`${p.symbol}::${market}`];
                      const price = q?.price ?? p.data.lastClose;
                      const trend = analyzeTrend(p.data);
                      const lean = trend ? trendLean(trend.kind, trend.label) : null;
                      const flags = valuationRiskFlags(p.data.fairValue);
                      const per = money > 0 ? bucketMoney / list.length : 0;
                      const inList = items.some(it => it.symbol === p.symbol && it.market === market);
                      const id = `${k}:${p.symbol}`;
                      return (
                        <ScreenRow key={p.symbol} symbol={p.symbol} market={market} name={p.data.longName}
                          price={price} changePercent={q?.changePercent ?? p.data.changePercent} ext={q?.ext}
                          open={open === id} onToggle={() => setOpen(open === id ? null : id)}
                          line2={<>
                            <em className="scr-chip rank">#{i + 1}</em>
                            <em className="scr-chip score" title="คะแนนความน่าสนใจ">★ {p.score}</em>
                            {lean && <em className={`scr-chip ico lean lean-${lean}`} title={LEAN_SHORT[lean]}>{LEAN_GLYPH[lean]}</em>}
                            {flags.length > 0 && <em className="scr-chip warn" title={flags.join(" · ")}>⚠</em>}
                            {per > 0 && price > 0 && <em className="scr-chip" title="ซื้อได้ประมาณ">≈{(per / price).toFixed(per / price < 10 ? 2 : 0)} หุ้น</em>}
                          </>}>
                          {!p.passed && <p className="screen-near-fail">✗ {p.checks.filter(c => c.passed !== true).map(c => c.label).join(" · ")}</p>}
                          <ScreeningEntryCard data={p.data} style={bk.style!} ctx={memoCtx[market]} />
                          <div className="scr-actions">
                            <button type="button" disabled={!loaded || inList} onClick={() => onAdd(p.symbol, market)}>{inList ? "อยู่ใน Watchlist แล้ว" : "+ เพิ่ม Watchlist"}</button>
                          </div>
                        </ScreenRow>
                      );
                    })}
                  </ul>
                )}
                {(r?.done || list.length > 0) && <button type="button" className="pl-more" onClick={() => onScreen(bk.style!, market)}>🔍 คัดเพิ่มในกลุ่มนี้</button>}
              </>
            )}
          </div>
        );
      })}
      <p className="pl-disclaim">สัดส่วนเป็นตัวอย่างทั่วไปตามสไตล์ ไม่ใช่คำแนะนำการลงทุนเฉพาะบุคคล · หุ้นที่แนะนำคัดตามเกณฑ์อัตโนมัติ ควรศึกษาก่อนซื้อ และทยอยซื้อ</p>
    </section>
  );
}
