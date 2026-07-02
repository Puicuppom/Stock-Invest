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
  return value.toFixed(market === "TH" ? 2 : 2);
}

function rangeMarker(
  price: number,
  low: number,
  high: number
): number | null {
  if (high <= low) return null;
  return Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
}

export default function FairValueCard({
  fairValue,
  currentPrice,
  market,
}: FairValueCardProps) {
  const {
    fairValue: target,
    upsidePercent,
    verdict,
    analystRange,
    range52w,
    peReference,
    peReferenceUpsidePercent,
    trailingPE,
    forwardPE,
    forwardEps,
    source,
  } = fairValue;

  const analystPos =
    analystRange && rangeMarker(currentPrice, analystRange.low, analystRange.high);
  const weekPos =
    range52w && rangeMarker(currentPrice, range52w.low, range52w.high);

  return (
    <section className="fv-card">
      <div className="fv-header">
        <div>
          <h3 className="section-title">ราคายุติธรรม</h3>
          <p className="fv-subtitle">เป้าเฉลี่ยนักวิเคราะห์ 12 เดือน · Yahoo</p>
        </div>
        <span className={`fv-badge fv-badge-${verdict}`}>
          {VERDICT_LABEL[verdict]}
        </span>
      </div>

      {target != null ? (
        <>
          <div className="fv-main">
            <div>
              <p className="fv-label">ราคายุติธรรม</p>
              <p className="fv-price">{formatPrice(target, market)}</p>
              {analystRange && (
                <p className="fv-midpoint">
                  ช่วง {formatPrice(analystRange.low, market)} –{" "}
                  {formatPrice(analystRange.high, market)}
                </p>
              )}
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

          {analystRange && analystPos != null && (
            <div className="fv-range fv-analyst-range">
              <div className="fv-range-labels">
                <span>Low {formatPrice(analystRange.low, market)}</span>
                <span>High {formatPrice(analystRange.high, market)}</span>
              </div>
              <div className="fv-range-track fv-range-track-analyst">
                <span
                  className="fv-range-marker"
                  style={{ left: `${analystPos}%` }}
                />
              </div>
            </div>
          )}

          {(peReference != null ||
            forwardPE != null ||
            forwardEps != null ||
            trailingPE != null) && (
            <div className="fv-supplement">
              <p className="fv-supplement-title">ข้อมูลเสริม · Forward P/E</p>
              {forwardPE != null && (
                <div className="fv-row">
                  <span className="fv-row-label">Forward P/E</span>
                  <span className="fv-row-value">{forwardPE.toFixed(1)}x</span>
                </div>
              )}
              {peReference != null && (
                <div className="fv-row">
                  <span className="fv-row-label">P/E อ้างอิง</span>
                  <span className="fv-row-value-group">
                    <span className="fv-row-value">
                      {formatPrice(peReference, market)}
                    </span>
                    {peReferenceUpsidePercent != null && (
                      <span
                        className={
                          peReferenceUpsidePercent >= 0
                            ? "fv-row-pct fv-upside-up"
                            : "fv-row-pct fv-upside-down"
                        }
                      >
                        {peReferenceUpsidePercent >= 0 ? "+" : ""}
                        {peReferenceUpsidePercent.toFixed(1)}%
                      </span>
                    )}
                  </span>
                </div>
              )}
              {(forwardEps != null || trailingPE != null) && (
                <p className="fv-meta">
                  {forwardEps != null && `Forward EPS ${forwardEps.toFixed(2)}`}
                  {forwardEps != null && trailingPE != null && " · "}
                  {trailingPE != null && `Trail P/E ${trailingPE.toFixed(1)}x`}
                </p>
              )}
            </div>
          )}

          {source === "pe-fallback" && (
            <p className="fv-note">ไม่มีราคายุติธรรมจากนักวิเคราะห์ — ใช้ P/E อ้างอิงแทน</p>
          )}
        </>
      ) : (
        <p className="hint-text">ไม่มีข้อมูลราคายุติธรรมสำหรับหุ้นนี้</p>
      )}

      {range52w && weekPos != null && (
        <div className="fv-range">
          <p className="fv-range-title">52 สัปดาห์</p>
          <div className="fv-range-labels">
            <span>{formatPrice(range52w.low, market)}</span>
            <span>{formatPrice(range52w.high, market)}</span>
          </div>
          <div className="fv-range-track">
            <span
              className="fv-range-marker"
              style={{ left: `${weekPos}%` }}
            />
          </div>
        </div>
      )}

      <p className="hint-text fv-disclaimer">
        ข้อมูลจาก Yahoo Finance · ใกล้เคียง Investing.com — ใช้เพื่อวิเคราะห์
        ไม่ใช่คำแนะนำลงทุน
      </p>
    </section>
  );
}
