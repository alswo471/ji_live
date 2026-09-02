'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  TickMarkType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { getCandleViewport } from '@/lib/market/candle-intervals';
import {
  findCandleExtrema,
  formatChartAxisTick,
  formatChartCrosshairTime,
  type ChartTickKind,
} from '@/lib/market/chart-indicators';
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
  const markerRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const viewportIntervalRef = useRef<CandleInterval | null>(null);
  const [activeCandle, setActiveCandle] = useState<CandlePoint | null>(null);

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
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    markerRef.current = createSeriesMarkers(candleSeries);

    const handleCrosshairMove = (param: Parameters<Parameters<IChartApi['subscribeCrosshairMove']>[0]>[0]) => {
      const point = param.seriesData.get(candleSeries);
      if (point && 'open' in point && 'high' in point && 'low' in point && 'close' in point && typeof param.time === 'number') {
        setActiveCandle({ time: param.time, open: point.open, high: point.high, low: point.low, close: point.close, volume: 0 });
      } else {
        setActiveCandle(null);
      }
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    const resize = () => chart.applyOptions({ width: container.clientWidth || 800 });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(container);
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markerRef.current = null;
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
    const timestampOf = (time: Time) => {
      const timestamp = typeof time === 'number'
        ? time
        : typeof time === 'string'
          ? Date.parse(time) / 1_000
          : Date.UTC(time.year, time.month - 1, time.day) / 1_000;
      return timestamp;
    };
    const tickKind = (value: TickMarkType): ChartTickKind => value === TickMarkType.Year
      ? 'year'
      : value === TickMarkType.Month
        ? 'month'
        : value === TickMarkType.DayOfMonth
          ? 'day'
          : 'time';
    chartRef.current?.applyOptions({
      localization: {
        priceFormatter: formatPrice,
        timeFormatter: (time: Time) => formatChartCrosshairTime(timestampOf(time), interval),
      },
      timeScale: {
        timeVisible: intraday,
        secondsVisible: false,
        tickMarkFormatter: (time: Time, type: TickMarkType) => formatChartAxisTick(timestampOf(time), interval, tickKind(type)),
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
    const extrema = findCandleExtrema(candles);
    markerRef.current?.setMarkers(extrema ? [
      { id: 'loaded-high', time: extrema.high.time as UTCTimestamp, position: 'atPriceTop', price: extrema.high.price, shape: 'circle', color: '#ef4444', text: `고가 ${formatPrice(extrema.high.price)}`, size: 0.7 },
      { id: 'loaded-low', time: extrema.low.time as UTCTimestamp, position: 'atPriceBottom', price: extrema.low.price, shape: 'circle', color: '#3b82f6', text: `저가 ${formatPrice(extrema.low.price)}`, size: 0.7 },
    ] : []);
    if (candles.length && viewportIntervalRef.current !== interval) {
      const lastTime = candles.at(-1)!.time;
      chartRef.current?.timeScale().setVisibleRange({
        from: (lastTime - getCandleViewport(interval).visibleSeconds) as UTCTimestamp,
        to: lastTime as UTCTimestamp,
      });
      viewportIntervalRef.current = interval;
    }
  }, [candles, formatPrice, interval]);

  const displayedCandle = activeCandle ?? candles.at(-1) ?? null;
  const oldestCandle = candles.at(0) ?? null;

  return <div className="overflow-hidden rounded-2xl border bg-card/70">
    <div className="relative">
      {displayedCandle && <fieldset aria-label="차트 OHLC" className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-x-3 gap-y-1 rounded-lg bg-card/85 px-2.5 py-1.5 font-mono text-[11px] font-bold tabular-nums shadow-sm backdrop-blur-sm sm:text-xs">
        <span>시 {formatPrice(displayedCandle.open)}</span>
        <span className="text-rise">고 {formatPrice(displayedCandle.high)}</span>
        <span className="text-fall">저 {formatPrice(displayedCandle.low)}</span>
        <span>종 {formatPrice(displayedCandle.close)}</span>
      </fieldset>}
      <figure ref={containerRef} aria-label={label} className="h-[340px] w-full sm:h-[420px]" />
      {state !== 'ready' && <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-card/75 px-6 text-center text-sm text-muted-foreground backdrop-blur-sm" aria-live="polite">
        {state === 'loading' ? '차트 데이터를 불러오는 중입니다…' : message ?? '표시할 차트 데이터가 없습니다.'}
      </div>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-[11px] text-muted-foreground">
      <span>{oldestCandle ? `확보 데이터 시작 ${formatChartCrosshairTime(oldestCandle.time, interval)}` : '확보 데이터 확인 중'}</span>
      <span>공급자 상장 이후 실제 데이터만 제공합니다.</span>
    </div>
  </div>;
}
