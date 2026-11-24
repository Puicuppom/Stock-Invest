"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** โหลดล่วงหน้าทั้ง 3 แท็บ ให้กดสลับจากแถบล่างได้ทันที (เปลี่ยนแท็บด้วยการกด ไม่ใช้ปัด) */
export default function SwipeNav() {
  const router = useRouter();
  useEffect(() => { ["/", "/rebalance", "/screener"].forEach(p => router.prefetch(p)); }, [router]);
  return null;
}
