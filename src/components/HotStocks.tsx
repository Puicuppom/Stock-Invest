"use client";
import { useEffect, useState } from "react";
import AppNavigation from "./AppNavigation";
import StockLogo from "./StockLogo";
import { useWatchlist } from "@/hooks/useWatchlist";
import type { HotSection } from "@/app/api/hot/route";

const ago = (sec: number) => {
  const m = Math.max(0, Math.round((Date.now() / 1000 - sec) / 60));
  return m < 60 ? `${m} นาที` : m < 1440 ? `${Math.round(m / 60)} ชม.` : `${Math.round(m / 1440)} วัน`;
};
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** หุ้นเด่นวันนี้: กำลังเป็นข่าว / ขึ้นแรง / ลงแรง / ซื้อขายมาก · แตะดาวเพื่อเพิ่ม Watchlist */
export default function HotStocks() {
  const [market, setMarket] = useState<"US" | "TH">("US");
  const [data, setData] = useState<{ sections: HotSection[]; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("trend");
  const { items, addStock, removeStock, loaded } = useWatchlist();
  useEffect(() => { try { if (localStorage.getItem("hotMkt") === "TH") setMarket("TH"); } catch { /* ignore */ } }, []);
  useEffect(() => {
    let alive = true;
    setData(null); setError(null);
    fetch(`/api/hot?market=${market}`).then(r => r.json()).then(j => {
      if (!alive) return;
      if (j.error || !Array.isArray(j.sections)) { setError("โหลดไม่สำเร็จ ลองใหม่อีกครั้ง"); return; }
      setData(j);
      setTab(t => (j.sections.some((s: HotSection) => s.id === t) ? t : j.sections[0]?.id ?? "gain"));
    }).catch(() => alive && setError("โหลดไม่สำเร็จ ลองใหม่อีกครั้ง"));
    return () => { alive = false; };
  }, [market]);
  const pickMarket = (m: "US" | "TH") => { setMarket(m); try { localStorage.setItem("hotMkt", m); } catch { /* ignore */ } };
  const section = data?.sections.find(s => s.id === tab) ?? data?.sections[0];
  const inList = (sym: string) => items.some(i => i.symbol === sym && i.market === market);
  const toggle = (sym: string) => {
    if (!loaded) return;
    if (inList(sym)) { const it = items.find(i => i.symbol === sym && i.market === market); if (it) removeStock(`${it.symbol}::${it.market}`); }
    else addStock(sym, market);
  };

  return (
    <main className="app-shell hot">
      <AppNavigation active="screener" />
      <div className="hot-head">
        <h1>หุ้นเด่นวันนี้</h1>
        <span className="wl-search-mkt" role="group" aria-label="ตลาด">
          {(["US", "TH"] as const).map(m => <button key={m} type="button" aria-pressed={market === m} onClick={() => pickMarket(m)}>{m === "US" ? "US" : "ไทย"}</button>)}
        </span>
      </div>
      {data && <div className="hot-tabs" role="tablist">
        {data.sections.map(s => <button key={s.id} type="button" role="tab" aria-selected={section?.id === s.id} className={section?.id === s.id ? "on" : ""} onClick={() => setTab(s.id)}>{s.title}</button>)}
      </div>}
      {error && <p className="hot-msg">{error}</p>}
      {!data && !error && <ul className="hot-list">{Array.from({ length: 6 }, (_, i) => <li key={i} className="hot-row"><i className="sk" style={{ display: "block", height: 52, borderRadius: 12, width: "100%" }} /></li>)}</ul>}
      {section && (
        <ul className="hot-list">
          {section.items.map(it => {
            const saved = inList(it.symbol);
            const up = it.changePercent >= 0;
            return (
              <li key={it.symbol} className="hot-row">
                <a className="hot-main" href={`/?open=${encodeURIComponent(it.symbol)}::${market}`}>
                  <span className="wl-logo hot-logo"><span className="wl-logo-text">{it.symbol.slice(0, 4)}</span><StockLogo symbol={market === "TH" ? `${it.symbol}.BK` : it.symbol} size={36} className="wl-logo-img" /></span>
                  <span className="hot-name"><b>{it.symbol}</b><small>{it.name}</small></span>
                  <span className="hot-price"><b>{market === "TH" ? "฿" : "$"}{fmt(it.price)}</b><em className={up ? "up" : "down"}>{up ? "+" : ""}{it.changePercent.toFixed(2)}%</em></span>
                </a>
                <button type="button" className={`hot-star${saved ? " on" : ""}`} aria-pressed={saved} aria-label={saved ? "เอาออกจาก Watchlist" : "เพิ่ม Watchlist"} onClick={() => toggle(it.symbol)}>{saved ? "★" : "☆"}</button>
                {it.news && <a className="hot-news" href={it.news.link} target="_blank" rel="noopener noreferrer" title={it.news.title} lang={it.news.titleTh ? "th" : "en"}>{it.news.titleTh || it.news.title}<small> · {ago(it.news.time)}</small></a>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="hot-foot">{data ? `อัปเดต ${new Date(data.at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} · ` : ""}{market === "US" ? "เฉพาะบริษัทใหญ่ ≥ 1 หมื่นล้าน USD" : "เฉพาะบริษัท ≥ 1 หมื่นล้านบาท"}</p>
    </main>
  );
}
