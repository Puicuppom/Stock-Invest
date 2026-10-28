"use client";
import { PlusIcon } from "./Icons";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useKeyboardAwareModal } from "@/hooks/useKeyboardAwareModal";
import { normalizeInput } from "@/lib/symbol";
import { StockFoundCard, useStockLookup } from "./StockLookup";

type Mkt = "TH" | "US";
interface AddStockFabProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** หุ้นตัวนี้อยู่ใน Watchlist แล้วหรือยัง */
  isSaved: (symbol: string, market: Mkt) => boolean;
  /** ดาว: เพิ่ม/เอาออก */
  onToggle: (symbol: string, market: Mkt) => void;
  /** แตะการ์ด: เปิดหน้าข้อมูลหุ้น */
  onOpen: (symbol: string, market: Mkt) => void;
}

/** ปุ่ม + และหน้าต่างเพิ่มหุ้น: พิมพ์ → เลือก US/ไทย → ขึ้นการ์ดผลค้นหาเหมือนช่องค้นหา */
export default function AddStockFab({ open, onOpenChange, isSaved, onToggle, onOpen }: AddStockFabProps) {
  const [symbol, setSymbol] = useState("");
  const [market, setMarket] = useState<Mkt>("US");
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => { setPortalReady(true); }, []);
  useEffect(() => { if (!open) setSymbol(""); }, [open]);

  const normalized = normalizeInput(symbol);
  const found = useStockLookup(normalized, market);
  const { panelRef, offsetY } = useKeyboardAwareModal(open);
  const hint =
    normalized === "META" ? "Meta/Facebook อยู่ตลาด US" :
    normalized === "BRKB" || normalized === "BRKA" ? "Berkshire ใช้ BRKB / BRKA ในตลาด US" :
    normalized === "XAUUSD" || normalized === "GCF" ? "ทอง XAU/USD อยู่ตลาด US" :
    normalized === "GLD" || normalized === "IAU" || normalized === "GLDM" ? "ETF ทองสหรัฐ อยู่ตลาด US" :
    normalized === "GOLD01" || normalized === "GOLD03" ? "ETF ทองไทย อยู่ตลาดไทย" : "";

  return (
    <>
      <button type="button" className="fab" onClick={() => onOpenChange(true)} aria-label="เพิ่มหุ้น" title="เพิ่มหุ้น">
        <PlusIcon size={26} />
      </button>

      {portalReady && open && createPortal(
        <div className="modal-backdrop modal-backdrop-compact" onClick={() => onOpenChange(false)}>
          <div
            ref={panelRef}
            className="modal-panel add-stock-panel add2"
            style={offsetY > 0 ? { transform: `translateY(-${offsetY}px)` } : undefined}
            onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-labelledby="add-stock-title"
          >
            <div className="add2-head">
              <h2 id="add-stock-title">เพิ่มหุ้น / ETF</h2>
              <button type="button" className="add2-close" onClick={() => onOpenChange(false)} aria-label="ปิด">×</button>
            </div>
            <form className="wl-search add2-search" onSubmit={e => { e.preventDefault(); if (found?.state === "found" && !isSaved(found.symbol, found.market)) onToggle(found.symbol, found.market); }}>
              <span aria-hidden="true">🔍</span>
              <input
                id="symbol-input" type="search" inputMode="search" placeholder="เช่น META, GLD, PTT"
                value={symbol} onChange={e => setSymbol(e.target.value)}
                autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-label="สัญลักษณ์หุ้น"
              />
              <span className="wl-search-mkt" role="group" aria-label="ตลาด">
                {(["US", "TH"] as const).map(m => <button key={m} type="button" aria-pressed={market === m} onClick={() => setMarket(m)}>{m === "US" ? "US" : "ไทย"}</button>)}
              </span>
            </form>
            {hint && <p className="add2-hint">{hint}</p>}
            <div className="wl-found add2-result" aria-live="polite">
              {found
                ? <StockFoundCard found={found} saved={isSaved(found.symbol, found.market)} onOpen={onOpen} onToggle={onToggle} onSwitchMarket={setMarket} />
                : <p className="add2-empty">พิมพ์ชื่อย่อหุ้น แล้วกด ☆ เพื่อเพิ่ม · แตะการ์ดเพื่อดูข้อมูล</p>}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
