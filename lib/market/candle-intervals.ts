import type { CandleInterval, CandlePoint } from './types';

export const CANDLE_INTERVALS = ['1m', '15m', '1h', '4h', '1d', '1w', '1M'] as const satisfies readonly CandleInterval[];

const VIEWPORTS: Record<CandleInterval, { label: string; visibleSeconds: number; cacheTtlMs: number }> = {
  '1m': { label: '1분', visibleSeconds: 2 * 60 * 60, cacheTtlMs: 60_000 },
  '15m': { label: '15분', visibleSeconds: 24 * 60 * 60, cacheTtlMs: 60_000 },
  '1h': { label: '1시간', visibleSeconds: 5 * 24 * 60 * 60, cacheTtlMs: 60_000 },
  '4h': { label: '4시간', visibleSeconds: 31 * 24 * 60 * 60, cacheTtlMs: 1_800_000 },
  '1d': { label: '일봉', visibleSeconds: 183 * 24 * 60 * 60, cacheTtlMs: 21_600_000 },
  '1w': { label: '주봉', visibleSeconds: 2 * 365 * 24 * 60 * 60, cacheTtlMs: 21_600_000 },
  '1M': { label: '월봉', visibleSeconds: 10 * 365 * 24 * 60 * 60, cacheTtlMs: 21_600_000 },
};

export function getCandleViewport(interval: CandleInterval) {
  return VIEWPORTS[interval];
}

function localDateParts(time: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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

export function formatCandleTime(time: number, interval: CandleInterval, timeZone = 'Asia/Seoul') {
  const { year, month, day, hour, minute } = localDateParts(time, timeZone);
  const monthText = String(month).padStart(2, '0');
  const dayText = String(day).padStart(2, '0');
  if (interval === '1M') return String(year);
  if (interval === '1w') return `${String(year).slice(-2)}.${monthText}`;
  if (interval === '1d') return `${monthText}.${dayText}`;
  return `${monthText}.${dayText} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function bucketKey(time: number, interval: CandleInterval, timeZone: string) {
  if (interval === '1m' || interval === '1d') return String(time);
  const { year, month, day, hour, minute } = localDateParts(time, timeZone);
  const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (interval === '15m') return `${dateKey}-${String(hour).padStart(2, '0')}-${Math.floor(minute / 15)}`;
  if (interval === '1h') return `${dateKey}-${String(hour).padStart(2, '0')}`;
  if (interval === '4h') return `${dateKey}-${Math.floor(hour / 4)}`;
  if (interval === '1M') return `${year}-${String(month).padStart(2, '0')}`;
  const localDate = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (localDate.getUTCDay() + 6) % 7;
  localDate.setUTCDate(localDate.getUTCDate() - daysSinceMonday);
  return localDate.toISOString().slice(0, 10);
}

export function aggregateCandles(candles: CandlePoint[], interval: CandleInterval, timeZone: string) {
  if (interval === '1m' || interval === '1d') return [...candles].sort((a, b) => a.time - b.time);
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const buckets = new Map<string, CandlePoint>();
  for (const candle of sorted) {
    const key = bucketKey(candle.time, interval, timeZone);
    const current = buckets.get(key);
    if (!current) {
      buckets.set(key, { ...candle });
      continue;
    }
    current.high = Math.max(current.high, candle.high);
    current.low = Math.min(current.low, candle.low);
    current.close = candle.close;
    current.volume += candle.volume;
  }
  return [...buckets.values()];
}
