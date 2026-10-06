import FundamentalMetrics from "./FundamentalMetrics";
import type { TradePlan } from "@/lib/trade-plan";
import { assetKindLabel } from "@/lib/instrument";
import type { AssetKind, FairValueResult } from "@/lib/types";
import { TREND_METHOD, trendIcon, type TrendResult } from "@/lib/trend";

interface StockDashboardProps {
  symbol: string;
  companyName: string | null;
  currentPrice: number;
  change: number;
  changePercent: number;
  market: "TH" | "US";
  assetKind: AssetKind;
  fairValue: FairValueResult;
  /** แสดงในการ์ดสรุปสัญญาณแล้ว */
  tradePlan?: TradePlan;
  nearSupport: boolean;
  nearResistance: boolean;
  loading: boolean;
  onRefresh: () => void;
  trend?: TrendResult | null;
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
  nearSupport,
  nearResistance,
  loading,
  onRefresh,
  trend,
}: StockDashboardProps) {
  const changePositive = change >= 0;
  const { range52w, dividendYieldPercent, dividendRate } = fairValue;

  const isGoldSpot = assetKind === "gold-spot";
  const isGoldEtf = assetKind === "gold-etf";
  const isGold = isGoldSpot || isGoldEtf;
  const isEtf = assetKind === "etf" || isGoldEtf;
  const kindLabel = assetKindLabel(assetKind);

  const weekPos =
    range52w && rangeMarker(currentPrice, range52w.low, range52w.high);


  const hasDividendDisplay =
    (dividendYieldPercent != null && dividendYieldPercent > 0) ||
    (dividendRate != null && dividendRate > 0);


  return (
    <section className="stock-dashboard">
      <div className={`dash-top${!isGold && !isEtf ? " dash-top-with-metrics" : ""}`}>
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
            {trend && (
              <span className={`trend-badge trend-${trend.kind}${trend.strong ? " trend-strong" : ""}`} title={trend.reasons.join("\n") + "\n\n" + TREND_METHOD}>
                {trendIcon(trend.kind)} {trend.label}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          className={`refresh-btn dash-refresh${loading ? " is-loading" : ""}`}
          onClick={onRefresh}
          disabled={loading}
          aria-label="รีเฟรช"
          aria-busy={loading}
          title="อัปเดตราคา"
        >
          <span className="refresh-icon" aria-hidden="true">↻</span>
        </button>
        {!isGold && !isEtf && <FundamentalMetrics value={fairValue} market={market} />}
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
      ) : !isEtf ? (
        null
      ) : isEtf ? (
        <div className="dash-metrics">
          <div className="dash-metric dash-metric-wide">
            <p className="dash-metric-label">ETF</p>
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

          <div className="dash-metrics-cols">
            <div className="dash-metric">
              <p className="dash-metric-label">FCF Yield</p>
              <p className="dash-metric-value">—</p>
              <p className="dash-metric-sub">ไม่ใช้กับ ETF</p>
            </div>

            <div className="dash-metric">
              <p className="dash-metric-label">อัตราปันผล</p>
              <p className="dash-metric-value">
                {hasDividendDisplay
                  ? formatDividendDisplay(
                      dividendRate,
                      dividendYieldPercent,
                      market
                    )
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="dash-metrics">
          <div className="dash-metric dash-metric-wide">
            <p className="dash-metric-label">ข้อมูลพื้นฐาน</p>
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

    </section>
  );
}
