import type { PivotLevels, PriceZone, SrMode } from "./types";

export interface SrLevel {
  price: number;
  label: string;
  kind: "resistance" | "support" | "pivot";
  source: "pivot" | "swing";
  strength?: number;
}

export function buildSrLevels(
  pivot: PivotLevels,
  zones: PriceZone[],
  mode: SrMode
): SrLevel[] {
  if (mode === "swing") {
    let res = 0;
    let sup = 0;
    return zones
      .map((zone) => ({
        price: zone.price,
        label:
          zone.type === "resistance"
            ? `แนวต้าน ${++res}`
            : `แนวรับ ${++sup}`,
        kind: zone.type,
        source: "swing" as const,
        strength: zone.strength,
      }))
      .sort((a, b) => b.price - a.price);
  }

  return (
    [
      { price: pivot.r2, label: "R2", kind: "resistance", source: "pivot" },
      { price: pivot.r1, label: "R1", kind: "resistance", source: "pivot" },
      { price: pivot.pivot, label: "Pivot", kind: "pivot", source: "pivot" },
      { price: pivot.s1, label: "S1", kind: "support", source: "pivot" },
      { price: pivot.s2, label: "S2", kind: "support", source: "pivot" },
    ] satisfies SrLevel[]
  ).sort((a, b) => b.price - a.price);
}

export function nearestSrLevels(
  levels: SrLevel[],
  currentPrice: number
): {
  nearestResistance: SrLevel | null;
  nearestSupport: SrLevel | null;
} {
  const resistances = levels.filter(
    (l) => l.kind === "resistance" && l.price > currentPrice
  );
  const supports = levels.filter(
    (l) => l.kind === "support" && l.price < currentPrice
  );

  return {
    nearestResistance: resistances.at(-1) ?? null,
    nearestSupport: supports[0] ?? null,
  };
}

export function distancePercent(
  price: number,
  levelPrice: number
): number {
  if (levelPrice <= 0) return Infinity;
  return (Math.abs(price - levelPrice) / levelPrice) * 100;
}

export function isNearLevel(
  price: number,
  levelPrice: number,
  tolerancePercent: number
): boolean {
  return distancePercent(price, levelPrice) <= tolerancePercent;
}

export interface SrHit {
  kind: "support" | "resistance";
  level: SrLevel;
  price: number;
  distancePercent: number;
}

export function findSrHits(
  pivot: PivotLevels,
  zones: PriceZone[],
  currentPrice: number,
  mode: SrMode,
  tolerancePercent: number
): SrHit[] {
  const levels = buildSrLevels(pivot, zones, mode);
  const { nearestResistance, nearestSupport } = nearestSrLevels(
    levels,
    currentPrice
  );
  const hits: SrHit[] = [];

  if (
    nearestSupport &&
    isNearLevel(currentPrice, nearestSupport.price, tolerancePercent)
  ) {
    hits.push({
      kind: "support",
      level: nearestSupport,
      price: currentPrice,
      distancePercent: distancePercent(currentPrice, nearestSupport.price),
    });
  }

  if (
    nearestResistance &&
    isNearLevel(currentPrice, nearestResistance.price, tolerancePercent)
  ) {
    hits.push({
      kind: "resistance",
      level: nearestResistance,
      price: currentPrice,
      distancePercent: distancePercent(currentPrice, nearestResistance.price),
    });
  }

  return hits;
}
