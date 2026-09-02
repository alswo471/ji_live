import type { CandleInterval, CandlePoint } from './types';

export type ChartTickKind = 'year' | 'month' | 'day' | 'time';

function dateParts(time: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(time * 1_000));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

export function formatChartAxisTick(
  time: number,
  interval: CandleInterval,
  tickKind: ChartTickKind,
  timeZone = 'Asia/Seoul',
) {
  const { year, month, day, hour, minute } = dateParts(time, timeZone);
  if (interval === '1M') return tickKind === 'year' ? `${year}년` : `${year}년 ${month}월`;
  if (interval === '1w') return tickKind === 'year' ? `${year}년` : `${month}월 ${Math.ceil(day / 7)}주`;
  if (interval === '1d') return tickKind === 'year' ? `${year}년` : `${month}월 ${day}일`;
  if (tickKind === 'time') {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  return tickKind === 'year' ? `${year}년` : `${month}월 ${day}일`;
}

export function formatChartCrosshairTime(time: number, interval: CandleInterval, timeZone = 'Asia/Seoul') {
  const { year, month, day, hour, minute } = dateParts(time, timeZone);
  const date = `${year}. ${month}. ${day}.`;
  if (interval === '1d' || interval === '1w' || interval === '1M') return date;
  return `${date} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function findCandleExtrema(candles: CandlePoint[]) {
  if (!candles.length) return null;
  return candles.reduce((result, candle) => ({
    high: candle.high > result.high.price ? { time: candle.time, price: candle.high } : result.high,
    low: candle.low < result.low.price ? { time: candle.time, price: candle.low } : result.low,
  }), {
    high: { time: candles[0].time, price: candles[0].high },
    low: { time: candles[0].time, price: candles[0].low },
  });
}
