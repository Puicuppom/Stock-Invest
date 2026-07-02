import {
  buildSrLevels,
  nearestSrLevels,
  type SrHit,
} from "@/lib/sr-levels";
import type { PivotLevels, PriceZone, SrMode } from "@/lib/types";

interface SupportResistanceCardProps {
  pivot: PivotLevels;
  zones: PriceZone[];
  currentPrice: number;
  mode: SrMode;
  hits: SrHit[];
  tolerancePercent: number;
  toleranceOptions: readonly number[];
  onModeChange: (mode: SrMode) => void;
  onToleranceChange: (percent: number) => void;
}
const MODE_COPY: Record<
  SrMode,
  { title: string; subtitle: string; hint: string; empty: string }
> = {
  swing: {
    title: "แนวรับ / แนวต้าน",
    subtitle: "ถือยาว · Swing 6 เดือน",
    hint: "จากจุดสูง/ต่ำย้อนหลัง · × = จำนวนครั้งที่ราคาเคยสะท้อน",
    empty: "ไม่พบโซน Swing ที่ชัดเจน",
  },
  pivot: {
    title: "Pivot Points",
    subtitle: "เทรดสั้น · วันถัดไป",
    hint: "คำนวณจาก High/Low/Close ของวันก่อนหน้า",
    empty: "ไม่มีข้อมูล Pivot",
  },
};

function formatPrice(value: number): string {
  return value.toFixed(2);
}

function distPercent(price: number, current: number): number {
  return ((price - current) / current) * 100;
}

function isNearHit(levelPrice: number, hits: SrHit[]): boolean {
  return hits.some((hit) => hit.level.price === levelPrice);
}

export default function SupportResistanceCard({
  pivot,
  zones,
  currentPrice,
  mode,
  hits,
  tolerancePercent,
  toleranceOptions,
  onModeChange,
  onToleranceChange,
}: SupportResistanceCardProps) {
  const copy = MODE_COPY[mode];
  const levels = buildSrLevels(pivot, zones, mode);
  const { nearestResistance: nearestRes, nearestSupport: nearestSup } =
    nearestSrLevels(levels, currentPrice);
  const ladderLow = nearestSup?.price ?? currentPrice * 0.95;
  const ladderHigh = nearestRes?.price ?? currentPrice * 1.05;
  const ladderSpan = ladderHigh - ladderLow;
  const pricePos =
    ladderSpan > 0
      ? Math.min(
          100,
          Math.max(0, ((currentPrice - ladderLow) / ladderSpan) * 100)
        )
      : 50;

  return (
    <section className="sr-card">
      <div className="sr-header">
        <div>
          <h3 className="section-title">{copy.title}</h3>
          <p className="fv-subtitle">{copy.subtitle}</p>
        </div>
        <div className="sr-mode-toggle" role="group" aria-label="โหมดแนวรับแนวต้าน">
          <button
            type="button"
            className={`sr-mode-btn${mode === "swing" ? " active" : ""}`}
            onClick={() => onModeChange("swing")}
          >
            ถือยาว
          </button>
          <button
            type="button"
            className={`sr-mode-btn${mode === "pivot" ? " active" : ""}`}
            onClick={() => onModeChange("pivot")}
          >
            เทรดสั้น
          </button>
        </div>
      </div>

      <div className="sr-tolerance">
        <span className="sr-tolerance-label">Tag เมื่อใกล้ระดับ</span>
        <div className="sr-tolerance-options">
          {toleranceOptions.map((value) => (
            <button
              key={value}
              type="button"
              className={`sr-tolerance-btn${
                tolerancePercent === value ? " active" : ""
              }`}
              onClick={() => onToleranceChange(value)}
            >
              ±{value}%
            </button>
          ))}
        </div>
      </div>

      {levels.length === 0 ? (
        <p className="hint-text">{copy.empty}</p>
      ) : (
        <>
          {(nearestRes || nearestSup) && (
            <div className="sr-nearest">
              {nearestRes && (
                <div
                  className={`sr-nearest-box sr-nearest-res${
                    isNearHit(nearestRes.price, hits) ? " sr-nearest-near" : ""
                  }`}
                >
                  <div className="sr-nearest-head">
                    <p className="sr-nearest-label">แนวต้านใกล้</p>
                    {isNearHit(nearestRes.price, hits) && (
                      <span className="sr-near-tag sr-near-tag-res">ใกล้ต้าน</span>
                    )}
                  </div>
                  <p className="sr-nearest-price">
                    {formatPrice(nearestRes.price)}
                  </p>
                  <p className="sr-nearest-meta">
                    {nearestRes.label}
                    {mode === "swing" &&
                      nearestRes.strength &&
                      ` · ×${nearestRes.strength}`}
                  </p>
                  <p className="sr-nearest-dist sr-dist-up">
                    +{distPercent(nearestRes.price, currentPrice).toFixed(1)}%
                  </p>
                </div>
              )}
              {nearestSup && (
                <div
                  className={`sr-nearest-box sr-nearest-sup${
                    isNearHit(nearestSup.price, hits) ? " sr-nearest-near" : ""
                  }`}
                >
                  <div className="sr-nearest-head">
                    <p className="sr-nearest-label">แนวรับใกล้</p>
                    {isNearHit(nearestSup.price, hits) && (
                      <span className="sr-near-tag sr-near-tag-sup">ใกล้รับ</span>
                    )}
                  </div>
                  <p className="sr-nearest-price">
                    {formatPrice(nearestSup.price)}
                  </p>
                  <p className="sr-nearest-meta">
                    {nearestSup.label}
                    {mode === "swing" &&
                      nearestSup.strength &&
                      ` · ×${nearestSup.strength}`}
                  </p>
                  <p className="sr-nearest-dist sr-dist-down">
                    {distPercent(nearestSup.price, currentPrice).toFixed(1)}%
                  </p>
                </div>
              )}
            </div>
          )}

          {nearestRes && nearestSup && (
            <div className="sr-ladder">
              <div className="sr-ladder-labels">
                <span className="sr-dist-up">
                  {formatPrice(nearestRes.price)}
                </span>
                <span>{formatPrice(currentPrice)}</span>
                <span className="sr-dist-down">
                  {formatPrice(nearestSup.price)}
                </span>
              </div>
              <div className="sr-ladder-track">
                <span
                  className="sr-ladder-marker"
                  style={{ left: `${pricePos}%` }}
                />
              </div>
            </div>
          )}

          <ul className="sr-list">
            {levels.map((level) => {
              const dist = distPercent(level.price, currentPrice);
              const near = isNearHit(level.price, hits);

              return (
                <li
                  key={`${level.source}-${level.label}-${level.price}`}
                  className={`sr-row sr-row-${level.kind}${
                    level.price === nearestRes?.price ||
                    level.price === nearestSup?.price
                      ? " sr-row-highlight"
                      : ""
                  }${near ? " sr-row-near" : ""}`}
                >
                  <span className={`sr-tag sr-tag-${level.kind}`}>
                    {level.kind === "resistance"
                      ? "ต้าน"
                      : level.kind === "support"
                        ? "รับ"
                        : "Pivot"}
                  </span>
                  <span className="sr-label">
                    {level.label}
                    {mode === "swing" && level.strength
                      ? ` ×${level.strength}`
                      : ""}
                    {near && (
                      <span
                        className={`sr-near-tag sr-near-tag-${
                          level.kind === "support" ? "sup" : "res"
                        }`}
                      >
                        {level.kind === "support" ? "ใกล้รับ" : "ใกล้ต้าน"}
                      </span>
                    )}
                  </span>
                  <span className="sr-price">{formatPrice(level.price)}</span>
                  <span
                    className={
                      dist >= 0 ? "sr-dist sr-dist-up" : "sr-dist sr-dist-down"
                    }
                  >
                    {dist >= 0 ? "+" : ""}
                    {dist.toFixed(1)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="hint-text">{copy.hint}</p>
    </section>
  );
}
