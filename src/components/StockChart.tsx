"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  chartFetchConfig,
  DEFAULT_CHART_RANGE,
  type ChartTimeRange,
} from "@/lib/chart-range";
import { buildEmaSeries, EMA_PERIODS } from "@/lib/ema";
import type { Candle, PivotLevels, PriceZone, SrMode } from "@/lib/types";

interface StockChartProps {
  symbol: string;
  market: "TH" | "US";
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

function toChartTime(date: string): UTCTimestamp {
  const normalized = date.includes("T") ? date : `${date}T00:00:00Z`;
  return Math.floor(new Date(normalized).getTime() / 1000) as UTCTimestamp;
}

function measureChartSize(container: HTMLDivElement) {
  const width = container.clientWidth || container.parentElement?.clientWidth || 320;
  const height = container.clientHeight || container.parentElement?.clientHeight || 240;
  return {
    width: Math.max(width, 280),
    height: Math.max(height, 180),
  };
}

export default function StockChart({
  symbol,
  market,
  pivot,
  zones,
  mode,
}: StockChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const emaSeriesRef = useRef<
    Record<(typeof EMA_PERIODS)[number], ISeriesApi<"Line"> | null>
  >({ 20: null, 50: null, 200: null });
  const priceLinesRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);
  const [timeRange, setTimeRange] = useState<ChartTimeRange>(DEFAULT_CHART_RANGE);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState("");
  const [chartReady, setChartReady] = useState(false);

  const stockKey = `${symbol}::${market}`;

  useEffect(() => {
    setTimeRange(DEFAULT_CHART_RANGE);
    setCandles([]);
    setChartError("");
  }, [stockKey]);

  useEffect(() => {
    let cancelled = false;

    const loadChart = async () => {
      setChartLoading(true);
      setChartError("");

      try {
        const params = new URLSearchParams({
          market,
          timeRange,
        });
        const res = await fetch(
          `/api/stock/${encodeURIComponent(symbol)}/chart?${params}`
        );
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error ?? "โหลดกรafไม่สำเร็จ");
        }

        if (!cancelled) {
          setCandles(json.candles as Candle[]);
        }
      } catch (err) {
        if (!cancelled) {
          setCandles([]);
          setChartError(
            err instanceof Error ? err.message : "โหลดกรafไม่สำเร็จ"
          );
        }
      } finally {
        if (!cancelled) {
          setChartLoading(false);
        }
      }
    };

    loadChart();

    return () => {
      cancelled = true;
    };
  }, [symbol, market, timeRange]);

  const applyChartData = useCallback(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || candles.length === 0) return;

    series.setData(
      candles.map((c) => ({
        time: toChartTime(c.date),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    for (const period of EMA_PERIODS) {
      const emaSeries = emaSeriesRef.current[period];
      if (!emaSeries) continue;

      if (candles.length >= period) {
        const points = buildEmaSeries(candles, period);
        emaSeries.setData(
          points.map((point) => ({
            time: toChartTime(point.date),
            value: point.value,
          }))
        );
      } else {
        emaSeries.setData([]);
      }
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

    chart.timeScale().applyOptions({
      barSpacing: timeRange === "1D" ? 4 : 6,
      minBarSpacing: timeRange === "1D" ? 1 : 0.5,
      rightOffset: timeRange === "1D" ? 6 : 0,
    });
    chart.timeScale().fitContent();
  }, [candles, pivot, zones, mode, timeRange]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const { width, height } = measureChartSize(container);

    const chart = createChart(container, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.background },
        textColor: CHART_COLORS.text,
      },
      grid: {
        vertLines: { color: CHART_COLORS.grid },
        horzLines: { color: CHART_COLORS.grid },
      },
      rightPriceScale: { borderColor: CHART_COLORS.grid },
      timeScale: {
        borderColor: CHART_COLORS.grid,
        timeVisible: true,
        secondsVisible: false,
      },
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
    setChartReady(true);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextWidth = Math.max(entry.contentRect.width, 280);
      const nextHeight = Math.max(entry.contentRect.height, 180);
      chart.applyOptions({ width: nextWidth, height: nextHeight });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      emaSeriesRef.current = { 20: null, 50: null, 200: null };
      priceLinesRef.current = [];
      setChartReady(false);
    };
  }, []);

  useEffect(() => {
    if (!chartReady) return;
    applyChartData();
  }, [chartReady, applyChartData]);

  const activeEmaPeriods = EMA_PERIODS.filter((period) => candles.length >= period);
  const intervalLabel = chartFetchConfig(timeRange).label;

  return (
    <div className="chart-shell">
      <div className="chart-top-bar">
        <div className="chart-legend">
          {activeEmaPeriods.map((period) => (
            <span key={period} className={`chart-legend-item chart-legend-ema${period}`}>
              {EMA_LABELS[period]}
            </span>
          ))}
        </div>
        <span className="chart-interval-badge">{intervalLabel}</span>
      </div>
      <div className="chart-canvas-wrap">
        {chartLoading && <div className="chart-loading">กำลังโหลดกรaf...</div>}
        {chartError && !chartLoading && (
          <div className="chart-loading chart-loading-error">{chartError}</div>
        )}
        <div ref={containerRef} className="chart-canvas" />
      </div>
      <div className="chart-range-bar" role="toolbar" aria-label="ช่วงเวลากรaf">
        {CHART_TIME_RANGES.map((range) => (
          <button
            key={range}
            type="button"
            className={`chart-range-btn${timeRange === range ? " active" : ""}`}
            onClick={() => setTimeRange(range)}
            disabled={chartLoading && timeRange === range}
          >
            {range}
          </button>
        ))}
      </div>
    </div>
  );
}
