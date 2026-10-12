"use client";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { WATCHLIST_KEY, type WatchlistItem } from "@/lib/types";
export const WATCHLIST_DIRTY = `${WATCHLIST_KEY}-pending`;

export function useWatchlistSync(loaded: boolean, setItems: Dispatch<SetStateAction<WatchlistItem[]>>) {
  const [syncStatus,setStatus] = useState("บันทึกในเครื่อง");
  useEffect(()=>{
    if (!loaded) return;
    let stopped = false, running = false;
    const abort = new AbortController();
    async function sync() {
      if (running || stopped) return;
      running = true;
      try {
        const before = localStorage.getItem(WATCHLIST_KEY) || "[]";
        const response = await fetch("/api/watchlist", {signal:abort.signal,cache:"no-store"});
        if (!response.ok) throw new Error();
        const cloud = await response.json();
        if (stopped) return;
        if (!cloud.enabled) {setStatus("บันทึกในเครื่อง · ยังไม่ได้ตั้งค่าซิงค์"); return;}
        if (cloud.items !== null && (!Array.isArray(cloud.items) || cloud.items.some((i: WatchlistItem)=>!i || typeof i.symbol!=="string" || !["TH","US"].includes(i.market)))) throw new Error();
        if (localStorage.getItem(WATCHLIST_DIRTY) || cloud.items === null) {
          const snapshot = localStorage.getItem(WATCHLIST_KEY) || "[]";
          setStatus("กำลังซิงค์ Watchlist…");
          const saved = await fetch("/api/watchlist", {method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:JSON.parse(snapshot)}),signal:abort.signal});
          if (!saved.ok) throw new Error();
          if (stopped) return;
          if (localStorage.getItem(WATCHLIST_KEY) === snapshot) localStorage.removeItem(WATCHLIST_DIRTY);
        } else if (localStorage.getItem(WATCHLIST_KEY) === before) {
          const remote = JSON.stringify(cloud.items);
          if (remote !== before) {localStorage.setItem(WATCHLIST_KEY,remote);setItems(cloud.items);}
        }
        setStatus(localStorage.getItem(WATCHLIST_DIRTY) ? "รอซิงค์การแก้ไขล่าสุด" : "Watchlist ซิงค์แล้ว");
      } catch { if (!stopped) setStatus("Watchlist ยังไม่ซิงค์ · เก็บในเครื่องและจะลองใหม่"); }
      finally {running=false;}
    }
    void sync();
    const timer = window.setInterval(sync,5000);
    window.addEventListener("focus",sync);
    window.addEventListener("online",sync);
    return ()=>{stopped=true;abort.abort();clearInterval(timer);window.removeEventListener("focus",sync);window.removeEventListener("online",sync);};
  },[loaded,setItems]);
  return syncStatus;
}
