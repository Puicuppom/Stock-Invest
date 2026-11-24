"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

const ORDER = ["/", "/rebalance", "/screener"];

/** ปัดซ้าย = แท็บถัดไป · ปัดขวา = แท็บก่อนหน้า (ตัวจับท่าทางอยู่ใน /ptr.js) */
export default function SwipeNav() {
  const router = useRouter();
  useEffect(() => {
    ORDER.forEach(p => router.prefetch(p));
    const w = window as Window & { __swipeNav?: (dir: "left" | "right") => void };
    let t = 0;
    w.__swipeNav = dir => {
      const i = ORDER.indexOf(location.pathname.replace(/\/$/, "") || "/");
      if (i < 0) return;
      const next = ORDER[i + (dir === "left" ? 1 : -1)];
      if (!next) return;
      document.documentElement.dataset.swipe = dir;
      window.clearTimeout(t);
      t = window.setTimeout(() => { delete document.documentElement.dataset.swipe; }, 900);
      router.push(next);
    };
    return () => { delete w.__swipeNav; };
  }, [router]);
  return null;
}
