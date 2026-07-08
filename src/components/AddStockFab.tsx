"use client";

import { useEffect, useState } from "react";

interface AddStockFabProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (symbol: string, market: "TH" | "US") => boolean;
}

export default function AddStockFab({ open, onOpenChange, onAdd }: AddStockFabProps) {
  const [symbol, setSymbol] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setSymbol("");
      setError("");
    }
  }, [open]);

  const normalized = symbol.trim().toUpperCase();

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

      {open && (
        <div className="modal-backdrop" onClick={() => onOpenChange(false)}>
          <div
            className="modal-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-stock-title"
          >
            <h2 id="add-stock-title" className="modal-title">
              เพิ่มหุ้น
            </h2>

            <div className="add-form">
              <label className="field-label" htmlFor="symbol-input">
                สัญลักษณ์หุ้น
              </label>
              <input
                id="symbol-input"
                className="text-input"
                placeholder="เช่น META, AAPL, BRKB, PTT"
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  setError("");
                }}
                autoFocus
                autoComplete="off"
                autoCapitalize="characters"
              />

              <p className="field-label">เลือกตลาดแล้วเพิ่มเลย</p>
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
                  Berkshire → กด <strong>US</strong> · ใช้ BRKB / BRKA (Yahoo: BRK-B / BRK-A)
                </p>
              )}

              {error && <p className="error-text">{error}</p>}

              <button
                type="button"
                className="btn-secondary btn-full"
                onClick={() => onOpenChange(false)}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
