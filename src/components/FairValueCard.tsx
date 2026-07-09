import type { AssetKind, FairValueResult } from "@/lib/types";
import { assetKindLabel } from "@/lib/instrument";

interface FairValueCardProps {
  fairValue: FairValueResult;
  currentPrice: number;
  market: "TH" | "US";
  assetKind: AssetKind;
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
  assetKind,
}: FairValueCardProps) {
  const {
    fairValue: target,
    upsidePercent,
    verdict,
    modelRange,
    analystTarget,
    analystUpsidePercent,
    modelCount,
    range52w,
    peReference,
    peReferenceUpsidePercent,
    trailingPE,
    forwardPE,
    forwardEps,
    fcfYieldPercent,
    dividendYieldPercent,
    dividendRate,
    source,
  } = fairValue;

  const modelPos =
    modelRange && rangeMarker(currentPrice, modelRange.low, modelRange.high);
  const weekPos =
    range52w && rangeMarker(currentPrice, range52w.low, range52w.high);

  const kindLabel = assetKindLabel(assetKind);
  const isGoldSpot = assetKind === "gold-spot";
  const isGoldEtf = assetKind === "gold-etf";
  const isGold = isGoldSpot || isGoldEtf;
  const isEtf = assetKind === "etf" || isGoldEtf;

  if (isGold) {
    return (
      <section className="fv-card fv-card-gold-etf">
        <div className="fv-header">
          <div>
            <h3 className="section-title">
              {isGoldSpot ? "ทองคำ XAU/USD" : "ETF ทองคำ"}
            </h3>
            <p className="fv-subtitle">
              {isGoldSpot
                ? "ราคาทอง spot · แนวรับ/ต้าน · EMA · 52 สัปดาห์"
                : "วิเคราะห์จากราคา · แนวรับ/ต้าน · EMA · ช่วง 52 สัปดาห์"}
            </p>
          </div>
          <span className="fv-badge fv-badge-gold-etf">
            {isGoldSpot ? "XAU/USD" : "ETF ทอง"}
          </span>
        </div>

        <div className="fv-main">
          <div>
            <p className="fv-label">ราคาปัจจุบัน</p>
            <p className="fv-price">{formatPrice(currentPrice, market)}</p>
          </div>
          {range52w && weekPos != null && (
            <div className="fv-side">
              <p className="fv-label">52 สัปดาห์</p>
              <p className="fv-midpoint">
                {formatPrice(range52w.low, market)} –{" "}
                {formatPrice(range52w.high, market)}
              </p>
            </div>
          )}
        </div>

        {range52w && weekPos != null && (
          <div className="fv-range">
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

        <p className="fv-note fv-note-gold">
          {isGoldSpot
            ? "ราคาอ้างอิง Gold Futures (COMEX) ใกล้เคียง XAU/USD spot — ใช้แนวรับ/ต้านและ EMA เป็นหลัก"
            : "ETF ทองไม่มีราคายุติธรรมแบบหุ้น — ราคาเคลื่อนตามทองคำโลก ใช้แนวรับ/ต้านและ EMA เป็นหลัก"}
        </p>

        <p className="hint-text fv-disclaimer">
          {isGoldSpot
            ? "เพิ่มด้วย XAU/USD หรือ XAUUSD · ไม่ใช่คำแนะนำลงทุน"
            : "ตัวอย่าง US: GLD, IAU · ไทย: GOLD01, GOLD03 · ไม่ใช่คำแนะนำลงทุน"}
        </p>
      </section>
    );
  }

  return (
    <section className="fv-card">
      <div className="fv-header">
        <div>
          <h3 className="section-title">
            {isEtf ? "ข้อมูล ETF" : "ราคายุติธรรม"}
          </h3>
          <p className="fv-subtitle">
            {isEtf
              ? "ช่วงราคา · Yahoo"
              : `เฉลี่ย ${modelCount || "หลาย"} โมเดล · DCF · Multiples · Dividend`}
          </p>
        </div>
        {kindLabel ? (
          <span className="fv-badge fv-badge-etf">{kindLabel}</span>
        ) : (
          <span className={`fv-badge fv-badge-${verdict}`}>
            {VERDICT_LABEL[verdict]}
          </span>
        )}
      </div>

      {!isEtf && target != null ? (
        <>
          <div className="fv-main">
            <div>
              <p className="fv-label">ราคายุติธรรม</p>
              <p className="fv-price">{formatPrice(target, market)}</p>
              {modelRange && (
                <p className="fv-midpoint">
                  ช่วงโมเดล {formatPrice(modelRange.low, market)} –{" "}
                  {formatPrice(modelRange.high, market)}
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

          {!isEtf &&
            (fcfYieldPercent != null || dividendYieldPercent != null) && (
            <div className="fv-yield-row">
              {fcfYieldPercent != null && (
                <div className="fv-yield-box">
                  <p className="fv-yield-label">FCF Yield</p>
                  <p
                    className={`fv-yield-value${
                      fcfYieldPercent < 0 ? " fv-yield-neg" : ""
                    }`}
                  >
                    {fcfYieldPercent.toFixed(2)}%
                  </p>
                </div>
              )}
              {dividendYieldPercent != null && (
                <div className="fv-yield-box">
                  <p className="fv-yield-label">อัตราปันผล</p>
                  <p className="fv-yield-value">
                    {dividendYieldPercent.toFixed(2)}%
                  </p>
                  {dividendRate != null && dividendRate > 0 && (
                    <p className="fv-yield-sub">
                      {formatPrice(dividendRate, market)}/หุ้น/ปี
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {modelRange && modelPos != null && (
            <div className="fv-range fv-analyst-range">
              <div className="fv-range-labels">
                <span>Low {formatPrice(modelRange.low, market)}</span>
                <span>High {formatPrice(modelRange.high, market)}</span>
              </div>
              <div className="fv-range-track fv-range-track-analyst">
                <span
                  className="fv-range-marker"
                  style={{ left: `${modelPos}%` }}
                />
              </div>
            </div>
          )}

          {(analystTarget != null ||
            peReference != null ||
            forwardPE != null ||
            forwardEps != null ||
            trailingPE != null) && (
            <div className="fv-supplement">
              <p className="fv-supplement-title">ข้อมูลเสริม</p>
              {analystTarget != null && (
                <div className="fv-row">
                  <span className="fv-row-label">เป้านักวิเคราะห์</span>
                  <span className="fv-row-value-group">
                    <span className="fv-row-value">
                      {formatPrice(analystTarget, market)}
                    </span>
                    {analystUpsidePercent != null && (
                      <span
                        className={
                          analystUpsidePercent >= 0
                            ? "fv-row-pct fv-upside-up"
                            : "fv-row-pct fv-upside-down"
                        }
                      >
                        {analystUpsidePercent >= 0 ? "+" : ""}
                        {analystUpsidePercent.toFixed(1)}%
                      </span>
                    )}
                  </span>
                </div>
              )}
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
            <p className="fv-note">โมเดลไม่ครบ — ใช้ P/E เป็นหลัก</p>
          )}
          {source === "multi-model" && (
            <p className="fv-note">เฉลี่ยจากหลายโมเดล (คล้าย Investing.com Pro)</p>
          )}
        </>
      ) : !isEtf ? (
        <p className="hint-text">ไม่มีข้อมูลราคายุติธรรมสำหรับหุ้นนี้</p>
      ) : (
        <div className="fv-main">
          <div>
            <p className="fv-label">ราคาปัจจุบัน</p>
            <p className="fv-price">{formatPrice(currentPrice, market)}</p>
          </div>
        </div>
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

      {isEtf && (
        <p className="fv-note">
          ETF ไม่มีราคายุติธรรมแบบหุ้น — ใช้แนวรับ/ต้านและ EMA ประกอบการตัดสินใจ
        </p>
      )}

      <p className="hint-text fv-disclaimer">
        ข้อมูลจาก Yahoo Finance · ใช้เพื่อวิเคราะห์ ไม่ใช่คำแนะนำลงทุน
      </p>
    </section>
  );
}
