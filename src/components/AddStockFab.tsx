"use client";

import { FormEvent, useState } from "react";

interface AddStockFabProps {
  onAdd: (symbol: string, market: "TH" | "US" | "auto") => boolean;
}

export default function AddStockFab({ onAdd }: AddStockFabProps) {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [market, setMarket] = useState<"TH" | "US" | "auto">("auto");
  const [error, setError] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const ok = onAdd(symbol, market);
    if (ok) {
      setSymbol("");
      setError("");
      setOpen(false);
    } else {
      setError("เพิ่มไม่ได้ — ตรวจสอบชื่อหุ้นหรือมีในรายการแล้ว");
    }
  };

  return (
    <>
      <button
        type="button"
        className="fab"
        onClick={() => setOpen(true)}
        aria-label="เพิ่มหุ้น"
      >
        +
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
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
            <form onSubmit={handleSubmit} className="add-form">
              <label className="field-label" htmlFor="symbol-input">
                สัญลักษณ์หุ้น
              </label>
              <input
                id="symbol-input"
                className="text-input"
                placeholder="เช่น PTT, KBANK, AAPL"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                autoFocus
                autoComplete="off"
                autoCapitalize="characters"
              />

              <label className="field-label" htmlFor="market-select">
                ตลาด
              </label>
              <select
                id="market-select"
                className="text-input"
                value={market}
                onChange={(e) =>
                  setMarket(e.target.value as "TH" | "US" | "auto")
                }
              >
                <option value="auto">Auto (ไทย → US)</option>
                <option value="TH">ไทย (SET)</option>
                <option value="US">US</option>
              </select>

              {error && <p className="error-text">{error}</p>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setOpen(false)}
                >
                  ยกเลิก
                </button>
                <button type="submit" className="btn-primary">
                  เพิ่ม
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
