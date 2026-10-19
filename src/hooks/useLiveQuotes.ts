"use client";
import { useEffect, useState } from "react";
import type { LiveQuote } from "@/lib/yahoo-quote";

/** ราคาล่าสุด + ก่อนเปิด/หลังปิด ของหลายตัวในคำขอเดียว · รีเฟรชทุก 30 วินาที (key = "SYMBOL::MARKET") */
export function useLiveQuotes(items: { symbol: string; market: "TH" | "US" }[], enabled = true): Record<string, LiveQuote> {
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const key = items.slice(0, 60).map(i => `${i.symbol}:${i.market}`).join(",");
  useEffect(() => {
    if (!enabled || !key) return;
    let alive = true;
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/quotes?items=${key.split(",").map(encodeURIComponent).join(",")}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { quotes?: Record<string, LiveQuote> };
        if (alive && data.quotes) setQuotes(prev => ({ ...prev, ...data.quotes }));
      } catch { /* ใช้ราคาเดิม */ }
    };
    load();
    const timer = window.setInterval(load, 30_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [key, enabled]);
  return quotes;
}
