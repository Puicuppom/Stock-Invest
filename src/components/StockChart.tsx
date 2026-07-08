"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  CHART_TIME_RANGES,
  DEFAULT_CHART_RANGE,
  visibleStartIndex,
  type ChartTimeRange,
} from "@/lib/chart-range";
import { buildEmaSeries, EMA_PERIODS } from "@/lib/ema";
import type { Candle, PivotLevels, PriceZone, SrMode } from "@/lib/types";

interface StockChartProps {
  candles: Candle[];
  pivot: PivotLevels;
  zones: PriceZone[];
  mode: SrMode;
}

const CHART_COLORS = {
  background: "#0f172a",
  text: "#94a3b8",
  grid: "#1e293b",
  up: "#22c55e",
  down: "#ef4444",
  pivot: "#fbbf24",
  resistance: "#f87171",
  support: "#4ade80",
  ema20: "#38bdf8",
  ema50: "#a78bfa",
  ema200: "#fb923c",
};

const EMA_LABELS: Record<(typeof EMA_PERIODS)[number], string> = {
  20: "EMA 20",
  50: "EMA 50",
  200: "EMA 200",
};

function toUtc(date: string): UTCTimestamp {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000) as UTCTimestamp;
}

function applyVisibleRange(
  chart: IChartApi,
  candles: Candle[],
  range: ChartTimeRange
) {
  if (candles.length === 0) return;

  const startIdx = visibleStartIndex(candles.length, range);
  chart.timeScale().setVisibleRange({
    from: toUtc(candles[startIdx].date),
    to: toUtc(candles[candles.length - 1].date),
  });
}

export default function StockChart({ candles, pivot, zones, mode }: StockChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const emaSeriesRef = useRef<
    Record<(typeof EMA_PERIODS)[number], ISeriesApi<"Line"> | null>
  >({ 20: null, 50: null, 200: null });
  const priceLinesRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);
  const [timeRange, setTimeRange] = useState<ChartTimeRange>(DEFAULT_CHART_RANGE);
  const stockKeyRef = useRef("");

  const stockKey =
    candles.length > 0
      ? `${candles[0].date}:${candles[candles.length - 1].date}:${candles.length}`
      : "";

  useEffect(() => {
    if (!stockKey || stockKey === stockKeyRef.current) return;
    stockKeyRef.current = stockKey;
    setTimeRange(DEFAULT_CHART_RANGE);
  }, [stockKey]);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.background },
        textColor: CHART_COLORS.text,
      },
      grid: {
        vertLines: { color: CHART_COLORS.grid },
        horzLines: { color: CHART_COLORS.grid },
      },
      rightPriceScale: { borderColor: CHART_COLORS.grid },
      timeScale: { borderColor: CHART_COLORS.grid },
      crosshair: { mode: 1 },
      handleScroll: { vertTouchDrag: false },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: CHART_COLORS.up,
      downColor: CHART_COLORS.down,
      borderUpColor: CHART_COLORS.up,
      borderDownColor: CHART_COLORS.down,
      wickUpColor: CHART_COLORS.up,
      wickDownColor: CHART_COLORS.down,
    });

    const emaColors: Record<(typeof EMA_PERIODS)[number], string> = {
      20: CHART_COLORS.ema20,
      50: CHART_COLORS.ema50,
      200: CHART_COLORS.ema200,
    };

    for (const period of EMA_PERIODS) {
      emaSeriesRef.current[period] = chart.addSeries(LineSeries, {
        color: emaColors[period],
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
    }

    chartRef.current = chart;
    seriesRef.current = series;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        chart.applyOptions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      emaSeriesRef.current = { 20: null, 50: null, 200: null };
      priceLinesRef.current = [];
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || candles.length === 0) return;

    series.setData(
      candles.map((c) => ({
        time: toUtc(c.date),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    for (const period of EMA_PERIODS) {
      const emaSeries = emaSeriesRef.current[period];
      if (!emaSeries) continue;

      const points = buildEmaSeries(candles, period);
      emaSeries.setData(
        points.map((point) => ({
          time: toUtc(point.date),
          value: point.value,
        }))
      );
    }

    priceLinesRef.current.forEach((line) => series.removePriceLine(line));
    priceLinesRef.current = [];

    const addLine = (price: number, color: string, title: string, style = LineStyle.Dashed) => {
      const line = series.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: style,
        axisLabelVisible: true,
        title,
      });
      priceLinesRef.current.push(line);
    };

    if (mode === "pivot") {
      addLine(pivot.pivot, CHART_COLORS.pivot, "P", LineStyle.Solid);
      addLine(pivot.r1, CHART_COLORS.resistance, "R1");
      addLine(pivot.r2, CHART_COLORS.resistance, "R2");
      addLine(pivot.s1, CHART_COLORS.support, "S1");
      addLine(pivot.s2, CHART_COLORS.support, "S2");
    } else {
      let res = 0;
      let sup = 0;
      zones.forEach((zone) => {
        const title =
          zone.type === "resistance"
            ? `ต้าน${++res}`
            : `รับ${++sup}`;
        addLine(
          zone.price,
          zone.type === "resistance"
            ? CHART_COLORS.resistance
            : CHART_COLORS.support,
          title
        );
      });
    }
  }, [candles, pivot, zones, mode]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length === 0) return;
    applyVisibleRange(chart, candles, timeRange);
  }, [candles, timeRange]);

  return (
    <div className="chart-shell">
      <div className="chart-legend">
        {EMA_PERIODS.map((period) => (
          <span key={period} className={`chart-legend-item chart-legend-ema${period}`}>
            {EMA_LABELS[period]}
          </span>
        ))}
      </div>
      <div ref={containerRef} className="chart-canvas" />
      <div className="chart-range-bar" role="toolbar" aria-label="ช่วงเวลากรaf">
        {CHART_TIME_RANGES.map((range) => (
          <button
            key={range}
            type="button"
            className={`chart-range-btn${timeRange === range ? " active" : ""}`}
            onClick={() => setTimeRange(range)}
          >
            {range}
          </button>
        ))}
      </div>
    </div>
  );
}
