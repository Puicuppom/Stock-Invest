import type { TradePlan } from "@/lib/trade-plan";
import { assetKindLabel } from "@/lib/instrument";
import type { AssetKind, FairValueResult } from "@/lib/types";

interface StockDashboardProps {
  symbol: string;
  companyName: string | null;
  currentPrice: number;
  change: number;
  changePercent: number;
  market: "TH" | "US";
  assetKind: AssetKind;
  fairValue: FairValueResult;
  tradePlan: TradePlan;
  nearSupport: boolean;
  nearResistance: boolean;
  loading: boolean;
  onRefresh: () => void;
}

function formatPrice(value: number): string {
  return value.toFixed(2);
}

function formatDividendDisplay(
  dividendRate: number | null,
  dividendYieldPercent: number | null,
  market: "TH" | "US"
): string {
  const prefix = market === "TH" ? "฿" : "$";
  if (dividendRate != null && dividendRate > 0 && dividendYieldPercent != null) {
    return `${prefix}${dividendRate.toFixed(2)} (${dividendYieldPercent.toFixed(2)}%)`;
  }
  if (dividendRate != null && dividendRate > 0) {
    return `${prefix}${dividendRate.toFixed(2)}`;
  }
  if (dividendYieldPercent != null) {
    return `${dividendYieldPercent.toFixed(2)}%`;
  }
  return "—";
}

function rangeMarker(
  price: number,
  low: number,
  high: number
): number | null {
  if (high <= low) return null;
  return Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
}

export default function StockDashboard({
  symbol,
  companyName,
  currentPrice,
  change,
  changePercent,
  market,
  assetKind,
  fairValue,
  tradePlan,
  nearSupport,
  nearResistance,
  loading,
  onRefresh,
}: StockDashboardProps) {
  const changePositive = change >= 0;
  const {
    fairValue: target,
    upsidePercent,
    modelRange,
    analystTarget,
    analystUpsidePercent,
    range52w,
    peReference,
    peReferenceUpsidePercent,
    modelCount,
    trailingPE,
    forwardPE,
    forwardEps,
    fcfYieldPercent,
    dividendYieldPercent,
    dividendRate,
  } = fairValue;

  const isGoldSpot = assetKind === "gold-spot";
  const isGoldEtf = assetKind === "gold-etf";
  const isGold = isGoldSpot || isGoldEtf;
  const isEtf = assetKind === "etf" || isGoldEtf;
  const kindLabel = assetKindLabel(assetKind);

  const modelPos =
    modelRange && rangeMarker(currentPrice, modelRange.low, modelRange.high);
  const weekPos =
    range52w && rangeMarker(currentPrice, range52w.low, range52w.high);

  const showFundamentals =
    !isGold && target != null && !isEtf;

  const hasSupplement =
    forwardPE != null ||
    peReference != null ||
    forwardEps != null ||
    trailingPE != null ||
    analystTarget != null;

  return (
    <section className="stock-dashboard">
      <div className="dash-top">
        <div className="dash-quote">
          <p className="eyebrow">InvestPui.com</p>
          <h1 className="dash-symbol">{symbol}</h1>
          {companyName && <p className="dash-company">{companyName}</p>}
          <div className="dash-price-row">
            <span className="dash-price">{formatPrice(currentPrice)}</span>
            <span className={changePositive ? "change-up" : "change-down"}>
              {changePositive ? "+" : ""}
              {change.toFixed(2)} ({changePercent.toFixed(2)}%)
            </span>
          </div>
          <div className="dash-badges">
            <span className="market-badge">
              {market === "TH" ? "BKK" : "US"}
            </span>
            {kindLabel && (
              <span className="market-badge asset-badge">{kindLabel}</span>
            )}
            {nearSupport && (
              <span className="header-sr-tag header-sr-tag-sup">รับ</span>
            )}
            {nearResistance && (
              <span className="header-sr-tag header-sr-tag-res">ต้าน</span>
            )}
          </div>
        </div>

        <button
          type="button"
          className="refresh-btn dash-refresh"
          onClick={onRefresh}
          disabled={loading}
          aria-label="รีเฟรช"
        >
          ↻
        </button>
      </div>

      {isGold ? (
        <div className="dash-metrics">
          <div className="dash-metric dash-metric-wide">
            <p className="dash-metric-label">
              {isGoldSpot ? "XAU/USD" : "ETF ทอง"}
            </p>
            <p className="dash-metric-value">{formatPrice(currentPrice)}</p>
            {range52w && (
              <p className="dash-metric-sub">
                52W {formatPrice(range52w.low)} – {formatPrice(range52w.high)}
              </p>
            )}
          </div>
          {range52w && weekPos != null && (
            <div className="dash-metric dash-metric-wide">
              <p className="dash-metric-label">52 สัปดาห์</p>
              <div className="dash-mini-range">
                <div className="fv-range-track">
                  <span
                    className="fv-range-marker"
                    style={{ left: `${weekPos}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      ) : showFundamentals ? (
        <div className="dash-metrics">
          <div className={`dash-fv-row${hasSupplement ? "" : " dash-fv-row-solo"}`}>
            <div className="dash-metric dash-metric-fv">
              <p className="dash-metric-label">
                ราคายุติธรรม
                {modelCount >= 2 && (
                  <span className="dash-metric-tag">{modelCount} โมเดล</span>
                )}
              </p>
              <div className="dash-metric-head">
                <p className="dash-metric-value">{formatPrice(target)}</p>
                {upsidePercent != null && (
                  <p
                    className={
                      upsidePercent >= 0
                        ? "dash-metric-pct change-up"
                        : "dash-metric-pct change-down"
                    }
                  >
                    {upsidePercent >= 0 ? "+" : ""}
                    {upsidePercent.toFixed(1)}%
                  </p>
                )}
              </div>
              {modelRange && modelPos != null && (
                <div className="dash-mini-range">
                  <div className="fv-range-labels dash-range-labels">
                    <span>{formatPrice(modelRange.low)}</span>
                    <span>{formatPrice(modelRange.high)}</span>
                  </div>
                  <div className="fv-range-track fv-range-track-analyst">
                    <span
                      className="fv-range-marker"
                      style={{ left: `${modelPos}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {hasSupplement && (
              <div className="dash-metric dash-metric-supplement">
                <p className="dash-metric-label">ข้อมูลเสริม</p>
                {analystTarget != null && (
                  <p className="dash-sup-line">
                    <span>เป้านักวิเคราะห์</span>
                    <span className="dash-sup-value">
                      {formatPrice(analystTarget)}
                      {analystUpsidePercent != null && (
                        <em
                          className={
                            analystUpsidePercent >= 0
                              ? "change-up"
                              : "change-down"
                          }
                        >
                          {analystUpsidePercent >= 0 ? "+" : ""}
                          {analystUpsidePercent.toFixed(1)}%
                        </em>
                      )}
                    </span>
                  </p>
                )}
                {forwardPE != null && (
                  <p className="dash-sup-line">
                    <span>Fwd P/E</span>
                    <span>{forwardPE.toFixed(1)}x</span>
                  </p>
                )}
                {peReference != null && (
                  <p className="dash-sup-line">
                    <span>P/E อ้างอิง</span>
                    <span className="dash-sup-value">
                      {formatPrice(peReference)}
                      {peReferenceUpsidePercent != null && (
                        <em
                          className={
                            peReferenceUpsidePercent >= 0
                              ? "change-up"
                              : "change-down"
                          }
                        >
                          {peReferenceUpsidePercent >= 0 ? "+" : ""}
                          {peReferenceUpsidePercent.toFixed(1)}%
                        </em>
                      )}
                    </span>
                  </p>
                )}
                {(forwardEps != null || trailingPE != null) && (
                  <p className="dash-metric-sub dash-sup-meta">
                    {forwardEps != null && `EPS ${forwardEps.toFixed(2)}`}
                    {forwardEps != null && trailingPE != null && " · "}
                    {trailingPE != null && `Trail ${trailingPE.toFixed(1)}x`}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="dash-metrics-cols">
            <div className="dash-metric">
              <p className="dash-metric-label">FCF Yield</p>
              <p
                className={`dash-metric-value${
                  fcfYieldPercent != null && fcfYieldPercent < 0
                    ? " change-down"
                    : ""
                }`}
              >
                {fcfYieldPercent != null
                  ? `${fcfYieldPercent.toFixed(2)}%`
                  : "—"}
              </p>
            </div>

            <div className="dash-metric">
              <p className="dash-metric-label">อัตราปันผล</p>
              <p className="dash-metric-value">
                {formatDividendDisplay(
                  dividendRate,
                  dividendYieldPercent,
                  market
                )}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="dash-metrics">
          <div className="dash-metric dash-metric-wide">
            <p className="dash-metric-label">
              {isEtf ? "ETF" : "ข้อมูลพื้นฐาน"}
            </p>
            <p className="dash-metric-value">{formatPrice(currentPrice)}</p>
            {range52w && weekPos != null && (
              <div className="dash-mini-range">
                <div className="fv-range-labels dash-range-labels">
                  <span>{formatPrice(range52w.low)}</span>
                  <span>{formatPrice(range52w.high)}</span>
                </div>
                <div className="fv-range-track">
                  <span
                    className="fv-range-marker"
                    style={{ left: `${weekPos}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="dash-trade-grid">
        <div className="trade-plan-box trade-plan-buy">
          <p className="trade-plan-box-label">ซื้อที่</p>
          <p className="trade-plan-box-price">
            {tradePlan.buyPrice != null
              ? formatPrice(tradePlan.buyPrice)
              : "—"}
          </p>
          <p className="trade-plan-box-meta">{tradePlan.buyLabel}</p>
          {tradePlan.buyPrice != null &&
            Math.abs(tradePlan.buyPrice - currentPrice) / currentPrice <
              0.02 && (
              <p className="trade-plan-box-hint">ใกล้ราคาปัจจุบัน</p>
            )}
        </div>

        <div className="trade-plan-box trade-plan-sell">
          <p className="trade-plan-box-label">ขายที่</p>
          <p className="trade-plan-box-price">
            {tradePlan.sellPrice != null
              ? formatPrice(tradePlan.sellPrice)
              : "—"}
          </p>
          <p className="trade-plan-box-meta">{tradePlan.sellLabel}</p>
          {tradePlan.sellPrice != null &&
            Math.abs(tradePlan.sellPrice - currentPrice) / currentPrice <
              0.02 && (
              <p className="trade-plan-box-hint">ใกล้ราคาปัจจุบัน</p>
            )}
        </div>

        <div className="trade-plan-box trade-plan-stop">
          <p className="trade-plan-box-label">Stop loss</p>
          <p className="trade-plan-box-price">
            {tradePlan.stopLoss != null
              ? formatPrice(tradePlan.stopLoss)
              : "—"}
          </p>
          <p className="trade-plan-box-meta">ใต้แนวรับ</p>
        </div>
      </div>
    </section>
  );
}
