"use client";
import { useRef, useState } from "react";
import AppNavigation from "./AppNavigation";
import { useWatchlist } from "@/hooks/useWatchlist";
import { mergeResults, type Agg, type BacktestResult } from "@/lib/backtest-merge";

const US_SET = "AAPL MSFT NVDA AMZN GOOGL META AVGO TSLA JPM V MA UNH HD PG KO PEP COST WMT XOM CVX JNJ LLY MRK ABBV ORCL CRM ADBE AMD INTC CSCO NFLX DIS NKE MCD SBUX BA CAT GE IBM QCOM".split(" ");
const TH_SET = "PTT AOT CPALL ADVANC KBANK SCB BDMS GULF DELTA PTTEP SCC BBL CPN MINT HMPRO KTB BH IVL CRC TU".split(" ");
type Universe = "watchlist" | "us" | "th";
type Item = { symbol: string; market: "US" | "TH" };

const LABELS: Record<string, string> = {
  none: "ยังไม่มีสัญญาณ", early: "เริ่มมีสัญญาณ", clear: "ค่อนข้างชัด", confirmed: "กลับตัวยืนยัน",
  up: "▲ ขาขึ้น", upish: "↗ เอียงขึ้น", flat: "↔ ไซด์เวย์", downish: "↘ เอียงลง", down: "▼ ขาลง", sideway: "↔ ไซด์เวย์",
};
const label = (s: string) => s.split(" · ").map(x => LABELS[x] ?? x).join(" · ");
const f1 = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

function Table({ title, sec, base, long }: { title: string; sec: Record<string, Agg>; base: Agg | undefined; long?: boolean }) {
  const rows = Object.entries(sec).sort((a, b) => b[1].n - a[1].n);
  const b20 = base && base.n ? base.r20 / base.n : 0;
  const plan = title.startsWith("แผนซื้อ");
  return (
    <section className="bt-sec">
      <h3>{title}</h3>
      <table>
        <thead><tr><th>กลุ่ม</th><th>ครั้ง</th>
          {plan ? <><th>ผลเฉลี่ยต่อไม้</th><th>สัดส่วน</th></>
            : <><th>{long ? "6 ด." : "20 วัน"}</th><th>ชนะ</th><th>{long ? "12 ด." : "60 วัน"}</th><th>ชนะ</th><th>{long ? "ร่วงสุด 6 ด." : "ร่วงสุด 20 วัน"}</th></>}
        </tr></thead>
        <tbody>
          {rows.map(([k, a]) => {
            const r20 = a.r20 / a.n, r60 = a.r60 / a.n;
            const tone = plan ? "" : a.n < 30 ? "dim" : r20 > b20 + 0.5 ? "good" : r20 < b20 - 0.5 ? "bad" : "";
            const total = rows.reduce((s, [, x]) => s + x.n, 0);
            return (
              <tr key={k} className={tone}>
                <td>{label(k)}</td><td>{a.n}</td>
                {plan ? <><td>{f1(r20)}</td><td>{(a.n / total * 100).toFixed(0)}%</td></>
                  : <><td>{f1(r20)}</td><td>{(a.w20 / a.n * 100).toFixed(0)}%</td><td>{f1(r60)}</td><td>{(a.w60 / a.n * 100).toFixed(0)}%</td><td>{f1(a.dd20 / a.n)}</td></>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export default function BacktestRunner() {
  const { items, loaded } = useWatchlist();
  const [universe, setUniverse] = useState<Universe>("us");
  const [signals, setSignals] = useState<BacktestResult>({});
  const [fair, setFair] = useState<BacktestResult>({});
  const [done, setDone] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  const list = (): Item[] => universe === "watchlist" ? items.map(i => ({ symbol: i.symbol, market: i.market }))
    : universe === "us" ? US_SET.map(symbol => ({ symbol, market: "US" as const })) : TH_SET.map(symbol => ({ symbol, market: "TH" as const }));

  async function run() {
    ctrl.current?.abort();
    const abort = new AbortController(); ctrl.current = abort;
    const todo = list();
    setBusy(true); setSignals({}); setFair({}); setDone([]); setFailed([]);
    const accS: BacktestResult = {}, accF: BacktestResult = {};
    let i = 0;
    const worker = async () => {
      while (i < todo.length && !abort.signal.aborted) {
        const it = todo[i++];
        try {
          const r = await fetch(`/api/backtest?symbol=${encodeURIComponent(it.symbol)}&market=${it.market}`, { signal: abort.signal });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          mergeResults(accS, d.signals); mergeResults(accF, d.fair);
          setSignals(structuredClone(accS)); setFair(structuredClone(accF));
          setDone(p => [...p, it.symbol]);
        } catch { if (!abort.signal.aborted) setFailed(p => [...p, it.symbol]); }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setBusy(false);
  }

  function copy() {
    const round = (r: BacktestResult) => Object.fromEntries(Object.entries(r).map(([s, b]) => [s, Object.fromEntries(Object.entries(b).map(([k, a]) =>
      [k, [a.n, +(a.r20 / a.n).toFixed(2), +(a.w20 / a.n * 100).toFixed(0), +(a.r60 / a.n).toFixed(2), +(a.w60 / a.n * 100).toFixed(0), +(a.dd20 / a.n).toFixed(2)]]))]));
    const text = JSON.stringify({ universe, stocks: done.length, failed, columns: "n, avgRet20|6m, win20%, avgRet60|12m, win60%, avgMaxDD", signals: round(signals), fair: round(fair) });
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const sBase = signals["ภาพรวม (ทุกวัน)"]?.["ทั้งหมด"];
  const fBase = fair["ภาพรวม (ทุกเดือน)"]?.["ทั้งหมด"];
  const total = list().length;
  return (
    <main className="app-shell screener bt">
      <AppNavigation active="screener" />
      <header><h1>ทดสอบย้อนหลัง</h1></header>
      <div className="screen-styles" role="group">
        {(["us", "th", "watchlist"] as Universe[]).map(u => (
          <button key={u} aria-pressed={universe === u} disabled={busy} onClick={() => setUniverse(u)}>
            {u === "us" ? `หุ้นใหญ่ US (${US_SET.length})` : u === "th" ? `หุ้นใหญ่ไทย (${TH_SET.length})` : `Watchlist (${items.length})`}
          </button>
        ))}
      </div>
      <details className="screen-desc"><summary>วิธีทดสอบ</summary><p>
        ใช้ราคารายวัน 10 ปีจาก Yahoo ทุก ๆ 3 วันทำการ คำนวณสัญญาณจากข้อมูลถึงวันนั้นเท่านั้น (ไม่เห็นอนาคต) แล้ววัดผลตอบแทน 20 และ 60 วันทำการถัดไป ·
        สีเขียว = ดีกว่าค่าเฉลี่ยทุกวันเกิน 0.5 จุด สีแดง = แย่กว่า สีจาง = ตัวอย่างน้อยกว่า 30 ครั้ง ·
        ราคายุติธรรมทดสอบได้เฉพาะโมเดล P/E (ใช้ EPS รายปีที่ประกาศแล้ว หน่วง 120 วัน) ทุกเดือน วัดผล 6 และ 12 เดือน · ไม่มีเป้านักวิเคราะห์/กำไรคาดการณ์ย้อนหลัง ·
        หุ้นในรายการเป็นหุ้นที่ยังอยู่รอดถึงวันนี้ ผลตอบแทนรวมจึงสูงกว่าความจริง (survivorship bias) ให้ดูการเทียบระหว่างกลุ่มเป็นหลัก
      </p></details>
      <div className="screen-actions">
        <button disabled={busy || (universe === "watchlist" && (!loaded || !items.length))} onClick={run}>{busy ? `กำลังทดสอบ ${done.length + failed.length}/${total}` : "▶ เริ่มทดสอบ"}</button>
        {busy && <button onClick={() => { ctrl.current?.abort(); setBusy(false); }}>หยุด</button>}
        {done.length > 0 && !busy && <button onClick={copy}>{copied ? "คัดลอกแล้ว ✓" : "📋 คัดลอกผลส่งให้ Claude"}</button>}
      </div>
      {failed.length > 0 && <p className="hint-text">โหลดไม่ได้: {failed.join(", ")}</p>}

      {Object.keys(signals).length > 0 && <h2>สัญญาณ</h2>}
      {Object.entries(signals).map(([k, sec]) => <Table key={k} title={k} sec={sec} base={sBase} />)}
      {Object.keys(fair).length > 0 && <h2>ราคายุติธรรม</h2>}
      {Object.entries(fair).map(([k, sec]) => <Table key={k} title={k} sec={sec} base={fBase} long />)}
    </main>
  );
}
