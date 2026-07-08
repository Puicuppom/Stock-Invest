"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { normalizeInput } from "@/lib/symbol";

interface AddStockFabProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (symbol: string, market: "TH" | "US") => boolean;
}

export default function AddStockFab({ open, onOpenChange, onAdd }: AddStockFabProps) {
  const [symbol, setSymbol] = useState("");
  const [error, setError] = useState("");
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setSymbol("");
      setError("");
    }
  }, [open]);

  const normalized = normalizeInput(symbol);

  const handleAdd = (market: "TH" | "US") => {
    if (!normalized) {
      setError("กรุณากรอกชื่อหุ้น");
      return;
    }

    const ok = onAdd(normalized, market);
    if (ok) {
      onOpenChange(false);
    } else {
      setError("เพิ่มหุ้นไม่สำเร็จ");
    }
  };

  return (
    <>
      <button
        type="button"
        className="fab"
        onClick={() => onOpenChange(true)}
        aria-label="เพิ่มหุ้น"
      >
        +
      </button>

      {portalReady &&
        open &&
        createPortal(
          <div className="modal-backdrop modal-backdrop-compact" onClick={() => onOpenChange(false)}>
            <div
              className="modal-panel add-stock-panel"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-stock-title"
            >
              <h2 id="add-stock-title" className="add-stock-title">
                เพิ่มหุ้น / ETF
              </h2>

              <div className="add-form">
                <label className="field-label" htmlFor="symbol-input">
                  สัญลักษณ์
                </label>
                <input
                  id="symbol-input"
                  className="text-input"
                  placeholder="META, XAU/USD, GLD, PTT"
                  value={symbol}
                  onChange={(e) => {
                    setSymbol(e.target.value);
                    setError("");
                  }}
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="characters"
                />

                <p className="field-label">เลือกตลาด</p>
                <div className="market-quick-add">
                  <button
                    type="button"
                    className="market-quick-btn market-quick-us"
                    onClick={() => handleAdd("US")}
                  >
                    <span className="market-quick-title">US</span>
                    <span className="market-quick-sub">NASDAQ / NYSE</span>
                    {normalized && (
                      <span className="market-quick-code">{normalized}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="market-quick-btn market-quick-bkk"
                    onClick={() => handleAdd("TH")}
                  >
                    <span className="market-quick-title">BKK</span>
                    <span className="market-quick-sub">SET</span>
                    {normalized && (
                      <span className="market-quick-code">
                        {normalized.includes(".") ? normalized : `${normalized}.BK`}
                      </span>
                    )}
                  </button>
                </div>

                {normalized === "META" && (
                  <p className="market-hint">
                    Meta/Facebook → กด <strong>US</strong> · Meta หุ้นไทย → กด{" "}
                    <strong>BKK</strong>
                  </p>
                )}

                {(normalized === "BRKB" || normalized === "BRKA") && (
                  <p className="market-hint">
                    Berkshire → กด <strong>US</strong> · ใช้ BRKB / BRKA
                  </p>
                )}

                {(normalized === "XAUUSD" || normalized === "GCF") && (
                  <p className="market-hint">
                    ทอง XAU/USD → กด <strong>US</strong>
                  </p>
                )}

                {(normalized === "GLD" ||
                  normalized === "IAU" ||
                  normalized === "GLDM") && (
                  <p className="market-hint">
                    ETF ทอง US → กด <strong>US</strong>
                  </p>
                )}

                {(normalized === "GOLD01" || normalized === "GOLD03") && (
                  <p className="market-hint">
                    ETF ทองไทย → กด <strong>BKK</strong>
                  </p>
                )}

                {error && <p className="error-text">{error}</p>}

                <button
                  type="button"
                  className="btn-secondary btn-full add-stock-cancel"
                  onClick={() => onOpenChange(false)}
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
