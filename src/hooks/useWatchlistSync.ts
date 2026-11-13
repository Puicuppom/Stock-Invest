"use client";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { WATCHLIST_KEY, type WatchlistItem } from "@/lib/types";
export const WATCHLIST_DIRTY = `${WATCHLIST_KEY}-pending`;
const DIRTY_EVENT = "watchlist-dirty";
/** มีการแก้ Watchlist → ทำเครื่องหมายรอซิงค์ แล้วซิงค์เกือบทันที (ไม่ต้องรอรอบถัดไป) */
export function markWatchlistDirty() {
  localStorage.setItem(WATCHLIST_DIRTY, "1");
  window.dispatchEvent(new Event(DIRTY_EVENT));
}
/* ดึงจากคลาวด์ทุก 30 วินาที เฉพาะตอนเปิดหน้าอยู่ (เดิม 5 วินาที = เรียก API ~720 ครั้ง/ชม.) */
const POLL_MS = 30_000;

export function useWatchlistSync(loaded: boolean, setItems: Dispatch<SetStateAction<WatchlistItem[]>>) {
  const [syncStatus,setStatus] = useState("บันทึกในเครื่อง");
  // หุ้นที่ถืออยู่ในพอร์ต (จำไว้ในเครื่องเพื่อเรียงได้ทันทีตอนเปิด)
  const [held,setHeld] = useState<string[]>([]);
  useEffect(()=>{ try { const v = JSON.parse(localStorage.getItem("wlHeld")||"[]"); if (Array.isArray(v)) setHeld(v); } catch { /* ignore */ } },[]);
  useEffect(()=>{
    if (!loaded) return;
    let stopped = false, running = false;
    const abort = new AbortController();
    async function sync() {
      if (running || stopped) return;
      running = true;
      try {
        // เครื่องใหม่ (ยังไม่เคยบันทึก) = รายการตั้งต้น → ต้องรับจากคลาวด์ ห้ามเอาตั้งต้นไปทับคลาวด์
        const fresh = localStorage.getItem(WATCHLIST_KEY) === null;
        const before = localStorage.getItem(WATCHLIST_KEY) || "[]";
        const response = await fetch("/api/watchlist", {signal:abort.signal,cache:"no-store"});
        if (!response.ok) throw new Error();
        const cloud = await response.json();
        if (stopped) return;
        if (!cloud.enabled) {setStatus("บันทึกในเครื่อง · ยังไม่ได้ตั้งค่าซิงค์"); return;}
        if (Array.isArray(cloud.held)) {
          const ids = cloud.held.filter((h: WatchlistItem)=>h && typeof h.symbol==="string").map((h: WatchlistItem)=>`${h.symbol}::${h.market}`);
          setHeld(prev=>JSON.stringify(prev)===JSON.stringify(ids)?prev:ids);
          try { localStorage.setItem("wlHeld", JSON.stringify(ids)); } catch { /* ignore */ }
        }
        if (cloud.items !== null && (!Array.isArray(cloud.items) || cloud.items.some((i: WatchlistItem)=>!i || typeof i.symbol!=="string" || !["TH","US"].includes(i.market)))) throw new Error();
        if (localStorage.getItem(WATCHLIST_DIRTY) || cloud.items === null) {
          const snapshot = localStorage.getItem(WATCHLIST_KEY) || "[]";
          setStatus("กำลังซิงค์ Watchlist…");
          const saved = await fetch("/api/watchlist", {method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:JSON.parse(snapshot)}),signal:abort.signal});
          if (!saved.ok) throw new Error();
          if (stopped) return;
          if (localStorage.getItem(WATCHLIST_KEY) === snapshot) localStorage.removeItem(WATCHLIST_DIRTY);
        } else if (fresh || localStorage.getItem(WATCHLIST_KEY) === before) {
          const remote = JSON.stringify(cloud.items);
          if (remote !== before) {localStorage.setItem(WATCHLIST_KEY,remote);setItems(cloud.items);}
        }
        setStatus(localStorage.getItem(WATCHLIST_DIRTY) ? "รอซิงค์การแก้ไขล่าสุด" : "Watchlist ซิงค์แล้ว");
      } catch { if (!stopped) setStatus("Watchlist ยังไม่ซิงค์ · เก็บในเครื่องและจะลองใหม่"); }
      finally {running=false;}
    }
    void sync();
    const poll = () => { if (document.visibilityState === "visible") void sync(); };
    const timer = window.setInterval(poll, POLL_MS);
    let soon: number | undefined;
    // หลังแก้ไข รอให้บันทึกลงเครื่องก่อน แล้วค่อยส่งขึ้นคลาวด์ (ถ้ากำลังซิงค์อยู่ ลองซ้ำอีกที)
    const onDirty = () => { window.clearTimeout(soon); soon = window.setTimeout(function push() { if (running) { soon = window.setTimeout(push, 800); return; } void sync(); }, 600); };
    const onVisible = () => { if (document.visibilityState === "visible") void sync(); };
    window.addEventListener(DIRTY_EVENT, onDirty);
    window.addEventListener("focus",sync);
    window.addEventListener("online",sync);
    document.addEventListener("visibilitychange", onVisible);
    return ()=>{stopped=true;abort.abort();clearInterval(timer);window.clearTimeout(soon);window.removeEventListener(DIRTY_EVENT,onDirty);window.removeEventListener("focus",sync);window.removeEventListener("online",sync);document.removeEventListener("visibilitychange",onVisible);};
  },[loaded,setItems]);
  return { syncStatus, held };
}
