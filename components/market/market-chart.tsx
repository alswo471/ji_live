'use client';

import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { CandlePoint } from '@/lib/market/types';
import type { Theme } from '@/hooks/use-display-preferences';

export function MarketChart({
  candles,
  label,
  theme,
  state,
  message,
}: {
  candles: CandlePoint[];
  label: string;
  theme: Theme;
  state: 'loading' | 'ready' | 'unavailable' | 'error';
  message: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const dark = theme === 'dark';
    const chart = createChart(container, {
      width: container.clientWidth || 800,
      height: container.clientHeight || 360,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: dark ? '#a1a1aa' : '#52525b',
      },
      grid: {
        vertLines: { color: dark ? '#ffffff0a' : '#0f172a0a' },
        horzLines: { color: dark ? '#ffffff12' : '#0f172a10' },
      },
      rightPriceScale: { borderColor: dark ? '#ffffff1a' : '#0f172a1a' },
      timeScale: { borderColor: dark ? '#ffffff1a' : '#0f172a1a', timeVisible: true },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444', downColor: '#3b82f6', borderVisible: false,
      wickUpColor: '#ef4444', wickDownColor: '#3b82f6',
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    chart.priceScale('').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const resize = () => chart.applyOptions({ width: container.clientWidth || 800 });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(container);
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [theme]);

  useEffect(() => {
    candleSeriesRef.current?.setData(candles.map((candle) => ({
      time: candle.time as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })));
    volumeSeriesRef.current?.setData(candles.map((candle) => ({
      time: candle.time as UTCTimestamp,
      value: candle.volume,
      color: candle.close >= candle.open ? '#ef444466' : '#3b82f666',
    })));
    if (candles.length) chartRef.current?.timeScale().fitContent();
  }, [candles, theme]);

  return <div className="relative overflow-hidden rounded-2xl border bg-card/70">
    <figure ref={containerRef} aria-label={label} className="h-[340px] w-full sm:h-[420px]" />
    {state !== 'ready' && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-card/75 px-6 text-center text-sm text-muted-foreground backdrop-blur-sm" aria-live="polite">
      {state === 'loading' ? '차트 데이터를 불러오는 중입니다…' : message ?? '표시할 차트 데이터가 없습니다.'}
    </div>}
  </div>;
}
