'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { formatCandleTime, getCandleViewport } from '@/lib/market/candle-intervals';
import type { CandleInterval, CandlePoint, Currency } from '@/lib/market/types';
import type { Theme } from '@/hooks/use-display-preferences';

export function MarketChart({
  candles,
  interval,
  label,
  currency,
  theme,
  state,
  message,
}: {
  candles: CandlePoint[];
  interval: CandleInterval;
  label: string;
  currency: Currency;
  theme: Theme;
  state: 'loading' | 'ready' | 'unavailable' | 'error';
  message: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const viewportIntervalRef = useRef<CandleInterval | null>(null);

  const formatPrice = useCallback((price: number) => {
    const formatted = new Intl.NumberFormat(
      currency === 'KRW' ? 'ko-KR' : 'en-US',
      { maximumFractionDigits: currency === 'KRW' ? 0 : 2 },
    ).format(price);
    return currency === 'KRW'
      ? `${formatted}원`
      : currency === 'USDT'
        ? `${formatted} USDT`
        : `$${formatted}`;
  }, [currency]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, {
      width: container.clientWidth || 800,
      height: container.clientHeight || 360,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#52525b',
      },
      grid: {
        vertLines: { color: '#0f172a0a' },
        horzLines: { color: '#0f172a10' },
      },
      rightPriceScale: { borderColor: '#0f172a1a' },
      timeScale: { borderColor: '#0f172a1a', timeVisible: true },
      localization: { priceFormatter: formatPrice },
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
  }, [formatPrice]);

  useEffect(() => {
    const dark = theme === 'dark';
    chartRef.current?.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: dark ? '#a1a1aa' : '#52525b',
      },
      grid: {
        vertLines: { color: dark ? '#ffffff0a' : '#0f172a0a' },
        horzLines: { color: dark ? '#ffffff12' : '#0f172a10' },
      },
      rightPriceScale: { borderColor: dark ? '#ffffff1a' : '#0f172a1a' },
      timeScale: { borderColor: dark ? '#ffffff1a' : '#0f172a1a' },
    });
  }, [theme]);

  useEffect(() => {
    const intraday = interval === '1m' || interval === '15m' || interval === '1h' || interval === '4h';
    const format = (time: Time) => {
      const timestamp = typeof time === 'number'
        ? time
        : typeof time === 'string'
          ? Date.parse(time) / 1_000
          : Date.UTC(time.year, time.month - 1, time.day) / 1_000;
      return formatCandleTime(timestamp, interval);
    };
    chartRef.current?.applyOptions({
      localization: {
        priceFormatter: formatPrice,
        timeFormatter: (time: Time) => format(time),
      },
      timeScale: {
        timeVisible: intraday,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => format(time),
      },
    });
    viewportIntervalRef.current = null;
  }, [formatPrice, interval]);

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
    if (candles.length && viewportIntervalRef.current !== interval) {
      const lastTime = candles.at(-1)!.time;
      chartRef.current?.timeScale().setVisibleRange({
        from: (lastTime - getCandleViewport(interval).visibleSeconds) as UTCTimestamp,
        to: lastTime as UTCTimestamp,
      });
      viewportIntervalRef.current = interval;
    }
  }, [candles, interval]);

  return <div className="relative overflow-hidden rounded-2xl border bg-card/70">
    <figure ref={containerRef} aria-label={label} className="h-[340px] w-full sm:h-[420px]" />
    {state !== 'ready' && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-card/75 px-6 text-center text-sm text-muted-foreground backdrop-blur-sm" aria-live="polite">
      {state === 'loading' ? '차트 데이터를 불러오는 중입니다…' : message ?? '표시할 차트 데이터가 없습니다.'}
    </div>}
  </div>;
}
