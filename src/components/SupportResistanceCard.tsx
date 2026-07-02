import type { PivotLevels, PriceZone } from "@/lib/types";

interface SupportResistanceCardProps {
  pivot: PivotLevels;
  zones: PriceZone[];
  currentPrice: number;
}

interface Level {
  price: number;
  label: string;
  kind: "resistance" | "support" | "pivot";
  source: "pivot" | "swing";
  strength?: number;
}

function formatPrice(value: number): string {
  return value.toFixed(2);
}

function distPercent(price: number, current: number): number {
  return ((price - current) / current) * 100;
}

function buildLevels(pivot: PivotLevels, zones: PriceZone[]): Level[] {
  const levels: Level[] = [
    { price: pivot.r3, label: "R3", kind: "resistance", source: "pivot" },
    { price: pivot.r2, label: "R2", kind: "resistance", source: "pivot" },
    { price: pivot.r1, label: "R1", kind: "resistance", source: "pivot" },
    { price: pivot.pivot, label: "Pivot", kind: "pivot", source: "pivot" },
    { price: pivot.s1, label: "S1", kind: "support", source: "pivot" },
    { price: pivot.s2, label: "S2", kind: "support", source: "pivot" },
    { price: pivot.s3, label: "S3", kind: "support", source: "pivot" },
    ...zones.map((zone, index) => ({
      price: zone.price,
      label:
        zone.type === "resistance"
          ? `แนวต้าน ${index + 1}`
          : `แนวรับ ${index + 1}`,
      kind: zone.type,
      source: "swing" as const,
      strength: zone.strength,
    })),
  ];

  const unique = new Map<string, Level>();
  for (const level of levels) {
    const key = `${level.kind}-${level.price.toFixed(2)}`;
    if (!unique.has(key)) unique.set(key, level);
  }

  return [...unique.values()].sort((a, b) => b.price - a.price);
}

export default function SupportResistanceCard({
  pivot,
  zones,
  currentPrice,
}: SupportResistanceCardProps) {
  const levels = buildLevels(pivot, zones);
  const resistances = levels.filter(
    (l) => l.kind === "resistance" && l.price > currentPrice
  );
  const supports = levels.filter(
    (l) => l.kind === "support" && l.price < currentPrice
  );

  const nearestRes = resistances.at(-1) ?? null;
  const nearestSup = supports[0] ?? null;

  const ladderLow = nearestSup?.price ?? currentPrice * 0.95;
  const ladderHigh = nearestRes?.price ?? currentPrice * 1.05;
  const ladderSpan = ladderHigh - ladderLow;
  const pricePos =
    ladderSpan > 0
      ? Math.min(100, Math.max(0, ((currentPrice - ladderLow) / ladderSpan) * 100))
      : 50;

  return (
    <section className="sr-card">
      <h3 className="section-title">แนวรับ / แนวต้าน</h3>

      {(nearestRes || nearestSup) && (
        <div className="sr-nearest">
          {nearestRes && (
            <div className="sr-nearest-box sr-nearest-res">
              <p className="sr-nearest-label">แนวต้านใกล้</p>
              <p className="sr-nearest-price">{formatPrice(nearestRes.price)}</p>
              <p className="sr-nearest-meta">
                {nearestRes.label}
                {nearestRes.source === "swing" &&
                  nearestRes.strength &&
                  ` · ×${nearestRes.strength}`}
              </p>
              <p className="sr-nearest-dist sr-dist-up">
                +{distPercent(nearestRes.price, currentPrice).toFixed(1)}%
              </p>
            </div>
          )}
          {nearestSup && (
            <div className="sr-nearest-box sr-nearest-sup">
              <p className="sr-nearest-label">แนวรับใกล้</p>
              <p className="sr-nearest-price">{formatPrice(nearestSup.price)}</p>
              <p className="sr-nearest-meta">
                {nearestSup.label}
                {nearestSup.strength && ` · ×${nearestSup.strength}`}
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
            <span className="sr-dist-up">{formatPrice(nearestRes.price)}</span>
            <span>{formatPrice(currentPrice)}</span>
            <span className="sr-dist-down">{formatPrice(nearestSup.price)}</span>
          </div>
          <div className="sr-ladder-track">
            <span className="sr-ladder-marker" style={{ left: `${pricePos}%` }} />
          </div>
        </div>
      )}

      <ul className="sr-list">
        {levels.map((level) => {
          const dist = distPercent(level.price, currentPrice);

          return (
            <li
              key={`${level.source}-${level.label}-${level.price}`}
              className={`sr-row sr-row-${level.kind}${
                level.price === nearestRes?.price ||
                level.price === nearestSup?.price
                  ? " sr-row-highlight"
                  : ""
              }`}
            >
              <span className={`sr-tag sr-tag-${level.kind}`}>
                {level.kind === "resistance"
                  ? "ต้าน"
                  : level.kind === "support"
                    ? "รับ"
                    : "Pivot"}
              </span>
              <span className="sr-label">{level.label}</span>
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

      <p className="hint-text">
        Pivot จากวันก่อน · Swing จากจุดสูง/ต่ำ 6 เดือน — ใกล้ราคา = สำคัญกว่า
      </p>
    </section>
  );
}
