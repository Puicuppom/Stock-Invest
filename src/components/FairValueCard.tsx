import type { FairValueResult } from "@/lib/types";

interface FairValueCardProps {
  fairValue: FairValueResult;
  currentPrice: number;
  market: "TH" | "US";
}

const VERDICT_LABEL = {
  undervalued: "ถูกกว่าราคายุติธรรม",
  fair: "ใกล้ราคายุติธรรม",
  overvalued: "แพงกว่าราคายุติธรรม",
  unknown: "ข้อมูลไม่พอ",
};

function formatPrice(value: number, market: "TH" | "US"): string {
  const decimals = market === "TH" ? 2 : 2;
  return value.toFixed(decimals);
}

function ModelRow({
  label,
  value,
  market,
}: {
  label: string;
  value: number | null;
  market: "TH" | "US";
}) {
  if (value == null) return null;

  return (
    <div className="fv-row">
      <span className="fv-row-label">{label}</span>
      <span className="fv-row-value">{formatPrice(value, market)}</span>
    </div>
  );
}

export default function FairValueCard({
  fairValue,
  currentPrice,
  market,
}: FairValueCardProps) {
  const { fairValue: fair, upsidePercent, verdict, models, range52w, trailingPE } =
    fairValue;

  const rangePosition =
    range52w && currentPrice > 0
      ? Math.min(
          100,
          Math.max(
            0,
            ((currentPrice - range52w.low) /
              (range52w.high - range52w.low)) *
              100
          )
        )
      : null;

  return (
    <section className="fv-card">
      <div className="fv-header">
        <h3 className="section-title">Fair Value (ราคายุติธรรม)</h3>
        <span className={`fv-badge fv-badge-${verdict}`}>
          {VERDICT_LABEL[verdict]}
        </span>
      </div>

      {fair != null ? (
        <>
          <div className="fv-main">
            <div>
              <p className="fv-label">ราคายุติธรรม</p>
              <p className="fv-price">{formatPrice(fair, market)}</p>
            </div>
            <div className="fv-side">
              <p className="fv-label">ราคาปัจจุบัน</p>
              <p className="fv-current">{formatPrice(currentPrice, market)}</p>
              {upsidePercent != null && (
                <p
                  className={
                    upsidePercent >= 0 ? "fv-upside-up" : "fv-upside-down"
                  }
                >
                  {upsidePercent >= 0 ? "+" : ""}
                  {upsidePercent.toFixed(1)}%
                </p>
              )}
            </div>
          </div>

          <div className="fv-models">
            <ModelRow label="Analyst Target" value={models.analyst} market={market} />
            <ModelRow label="P/E Model" value={models.pe} market={market} />
            <ModelRow label="P/B Model" value={models.pb} market={market} />
          </div>

          {trailingPE != null && (
            <p className="fv-meta">Trailing P/E: {trailingPE.toFixed(2)}</p>
          )}
        </>
      ) : (
        <p className="hint-text">ไม่มีข้อมูลเพียงพอสำหรับคำนวณ Fair Value</p>
      )}

      {range52w && rangePosition != null && (
        <div className="fv-range">
          <div className="fv-range-labels">
            <span>52W Low {formatPrice(range52w.low, market)}</span>
            <span>52W High {formatPrice(range52w.high, market)}</span>
          </div>
          <div className="fv-range-track">
            <span
              className="fv-range-marker"
              style={{ left: `${rangePosition}%` }}
            />
          </div>
        </div>
      )}

      <p className="hint-text fv-disclaimer">
        คำนวณจาก Analyst Target + P/E + P/B — ใช้เพื่อวิเคราะห์ ไม่ใช่คำแนะนำลงทุน
      </p>
    </section>
  );
}
