import type { TradePlan } from "@/lib/trade-plan";
import type { AssetKind } from "@/lib/types";

interface TradePlanCardProps {
  plan: TradePlan;
  currentPrice: number;
  market: "TH" | "US";
  assetKind: AssetKind;
  srMode: "swing" | "pivot";
}

function formatPrice(value: number, _market: "TH" | "US"): string {
  return value.toFixed(2);
}

export default function TradePlanCard({
  plan,
  currentPrice,
  market,
  assetKind,
  srMode,
}: TradePlanCardProps) {
  const modeLabel = srMode === "swing" ? "ถือยาว" : "เทรดสั้น";
  const isStock =
    assetKind === "stock" || assetKind === "etf";

  return (
    <section className={`trade-plan-card trade-plan-${plan.situation}`}>
      <div className="trade-plan-header">
        <div>
          <h3 className="section-title">แผนซื้อ-ขาย</h3>
          <p className="fv-subtitle">จากแนวรับ/ต้าน · {modeLabel}</p>
        </div>
        <span className={`trade-plan-badge trade-plan-badge-${plan.situation}`}>
          {plan.headline}
        </span>
      </div>

      <p className="trade-plan-detail">{plan.detail}</p>

      <div className="trade-plan-grid">
        <div className="trade-plan-box trade-plan-buy">
          <p className="trade-plan-box-label">ซื้อที่</p>
          <p className="trade-plan-box-price">
            {plan.buyPrice != null
              ? formatPrice(plan.buyPrice, market)
              : "—"}
          </p>
          <p className="trade-plan-box-meta">{plan.buyLabel}</p>
          {plan.buyPrice != null &&
            Math.abs(plan.buyPrice - currentPrice) / currentPrice < 0.02 && (
              <p className="trade-plan-box-hint">ใกล้ราคาปัจจุบัน</p>
            )}
        </div>

        <div className="trade-plan-box trade-plan-sell">
          <p className="trade-plan-box-label">ขายที่</p>
          <p className="trade-plan-box-price">
            {plan.sellPrice != null
              ? formatPrice(plan.sellPrice, market)
              : "—"}
          </p>
          <p className="trade-plan-box-meta">{plan.sellLabel}</p>
          {plan.sellPrice != null &&
            Math.abs(plan.sellPrice - currentPrice) / currentPrice < 0.02 && (
              <p className="trade-plan-box-hint">ใกล้ราคาปัจจุบัน</p>
            )}
        </div>

        <div className="trade-plan-box trade-plan-stop">
          <p className="trade-plan-box-label">Stop loss</p>
          <p className="trade-plan-box-price">
            {plan.stopLoss != null
              ? formatPrice(plan.stopLoss, market)
              : "—"}
          </p>
          <p className="trade-plan-box-meta">ใต้แนวรับ</p>
        </div>
      </div>

      {plan.longTermTarget != null && isStock && (
        <div className="trade-plan-long">
          <span className="trade-plan-long-label">
            {plan.longTermLabel ?? "เป้ายาว"}
          </span>
          <span className="trade-plan-long-price">
            {formatPrice(plan.longTermTarget, market)}
          </span>
          <span
            className={
              plan.longTermTarget >= currentPrice
                ? "trade-plan-long-up"
                : "trade-plan-long-down"
            }
          >
            {plan.longTermTarget >= currentPrice ? "+" : ""}
            {(
              ((plan.longTermTarget - currentPrice) / currentPrice) *
              100
            ).toFixed(1)}
            %
          </span>
        </div>
      )}

      {plan.riskReward != null && plan.riskReward > 0 && (
        <p className="trade-plan-rr">
          Risk : Reward ≈ 1 : {plan.riskReward.toFixed(1)}
        </p>
      )}

      <p className="hint-text trade-plan-disclaimer">
        แนะนำจากแนวรับ/ต้านและข้อมูล Yahoo — ใช้ประกอบการตัดสินใจ
        ไม่ใช่คำแนะนำลงทุน
      </p>
    </section>
  );
}
