"use client";

import { FormEvent, useEffect, useState } from "react";
import { isDualMarketSymbol } from "@/lib/dual-market";

interface AddStockFabProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (symbol: string, market: "TH" | "US") => boolean;
}

type Step = "symbol" | "market";

export default function AddStockFab({ open, onOpenChange, onAdd }: AddStockFabProps) {
  const [step, setStep] = useState<Step>("symbol");
  const [symbol, setSymbol] = useState("");
  const [market, setMarket] = useState<"TH" | "US">("TH");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setStep("symbol");
      setSymbol("");
      setMarket("TH");
      setError("");
    }
  }, [open]);

  const normalized = symbol.trim().toUpperCase();
  const dualMarket = isDualMarketSymbol(normalized);

  const goToMarketStep = () => {
    if (!normalized) {
      setError("กรุณากรอกชื่อหุ้น");
      return;
    }
    setError("");
    setStep("market");
  };

  const handleSymbolSubmit = (e: FormEvent) => {
    e.preventDefault();
    goToMarketStep();
  };

  const handleAdd = () => {
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
            {step === "symbol" ? (
              <>
                <p className="modal-step">ขั้นที่ 1/2</p>
                <h2 id="add-stock-title" className="modal-title">
                  ใส่ชื่อหุ้น
                </h2>
                <form onSubmit={handleSymbolSubmit} className="add-form">
                  <label className="field-label" htmlFor="symbol-input">
                    สัญลักษณ์หุ้น
                  </label>
                  <input
                    id="symbol-input"
                    className="text-input"
                    placeholder="เช่น PTT, KBANK, META, AAPL"
                    value={symbol}
                    onChange={(e) => {
                      setSymbol(e.target.value);
                      setError("");
                    }}
                    autoFocus
                    autoComplete="off"
                    autoCapitalize="characters"
                  />

                  {dualMarket && normalized && (
                    <p className="market-hint">
                      {normalized} มีทั้งตลาด <strong>BKK</strong> และ{" "}
                      <strong>US</strong> — ขั้นถัดไปให้เลือกตลาด
                    </p>
                  )}

                  {error && <p className="error-text">{error}</p>}

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => onOpenChange(false)}
                    >
                      ยกเลิก
                    </button>
                    <button type="submit" className="btn-primary">
                      ถัดไป →
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <p className="modal-step">ขั้นที่ 2/2</p>
                <h2 id="add-stock-title" className="modal-title">
                  เลือกตลาดสำหรับ {normalized}
                </h2>

                {dualMarket && (
                  <p className="market-hint market-hint-strong">
                    หุ้น {normalized} มีทั้งไทยและอเมริกา — กดเลือก 1 ตลาด
                  </p>
                )}

                <div className="add-form">
                  <p className="field-label">กดเลือกตลาด</p>

                  <div className="market-options">
                    <label className="market-option">
                      <input
                        type="radio"
                        name="stock-market"
                        value="TH"
                        checked={market === "TH"}
                        onChange={() => setMarket("TH")}
                      />
                      <span className="market-option-card">
                        <span className="market-option-head">
                          <span className="market-option-title">BKK</span>
                          <span className="market-option-badge">SET</span>
                        </span>
                        <span className="market-option-desc">ตลาดหลักทรัพย์แห่งประเทศไทย</span>
                        <span className="market-option-code">{normalized}.BK</span>
                      </span>
                    </label>

                    <label className="market-option">
                      <input
                        type="radio"
                        name="stock-market"
                        value="US"
                        checked={market === "US"}
                        onChange={() => setMarket("US")}
                      />
                      <span className="market-option-card">
                        <span className="market-option-head">
                          <span className="market-option-title">US</span>
                          <span className="market-option-badge">NASDAQ/NYSE</span>
                        </span>
                        <span className="market-option-desc">ตลาดหุ้นอเมริกา</span>
                        <span className="market-option-code">{normalized}</span>
                      </span>
                    </label>
                  </div>

                  {normalized === "META" && (
                    <p className="market-hint">
                      Meta/Facebook → กด <strong>US</strong> · Meta หุ้นไทย → กด{" "}
                      <strong>BKK</strong>
                    </p>
                  )}

                  {error && <p className="error-text">{error}</p>}

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setError("");
                        setStep("symbol");
                      }}
                    >
                      ← กลับ
                    </button>
                    <button type="button" className="btn-primary" onClick={handleAdd}>
                      เพิ่ม {normalized} ({market === "TH" ? "BKK" : "US"})
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
