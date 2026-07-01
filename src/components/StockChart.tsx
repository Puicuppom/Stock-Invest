"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, PivotLevels, PriceZone } from "@/lib/types";

interface StockChartProps {
  candles: Candle[];
  pivot: PivotLevels;
  zones: PriceZone[];
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
};

function toUtc(date: string): UTCTimestamp {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000) as UTCTimestamp;
}

export default function StockChart({ candles, pivot, zones }: StockChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);

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

    addLine(pivot.pivot, CHART_COLORS.pivot, "P", LineStyle.Solid);
    addLine(pivot.r1, CHART_COLORS.resistance, "R1");
    addLine(pivot.r2, CHART_COLORS.resistance, "R2");
    addLine(pivot.s1, CHART_COLORS.support, "S1");
    addLine(pivot.s2, CHART_COLORS.support, "S2");

    zones.forEach((zone, index) => {
      addLine(
        zone.price,
        zone.type === "resistance" ? CHART_COLORS.resistance : CHART_COLORS.support,
        zone.type === "resistance" ? `R${index + 1}` : `S${index + 1}`
      );
    });

    chart.timeScale().fitContent();
  }, [candles, pivot, zones]);

  return (
    <div className="chart-shell">
      <div ref={containerRef} className="chart-canvas" />
    </div>
  );
}
