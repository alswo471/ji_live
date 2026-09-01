import { fetchToss } from '@/lib/toss-invest';
import type { CandlePoint, CandleRange, Instrument } from '../types';

export type TossCandleRequester = (path: string) => Promise<unknown>;

type TossCandle = {
  timestamp: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  closePrice: string;
  volume: string;
};

type TossCandleResponse = {
  result: {
    candles: TossCandle[];
    nextBefore?: string | null;
  };
};

function normalizeCandle(candle: TossCandle): CandlePoint | null {
  const time = Date.parse(candle.timestamp) / 1_000;
  const open = Number(candle.openPrice);
  const high = Number(candle.highPrice);
  const low = Number(candle.lowPrice);
  const close = Number(candle.closePrice);
  const volume = Number(candle.volume);
  if (![time, open, high, low, close, volume].every(Number.isFinite)) return null;
  return { time, open, high, low, close, volume };
}

export async function fetchTossCandles(
  instrument: Instrument,
  range: CandleRange,
  request: TossCandleRequester = (path) => fetchToss(path),
): Promise<CandlePoint[]> {
  const isMinute = range === '1d';
  const interval = isMinute ? '1m' : '1d';
  const targetCount = isMinute ? 500 : range === '1w' ? 7 : 30;
  const pageCount = isMinute ? 3 : 1;
  const candles: CandlePoint[] = [];
  let before: string | null = null;

  for (let page = 0; page < pageCount && candles.length < targetCount; page += 1) {
    const params = new URLSearchParams({
      symbol: instrument.providerSymbol,
      interval,
      count: String(Math.min(200, targetCount - candles.length)),
    });
    if (before) params.set('before', before);
    const response = await request(`/api/v1/candles?${params.toString()}`) as TossCandleResponse;
    candles.push(...response.result.candles.flatMap((candle) => {
      const normalized = normalizeCandle(candle);
      return normalized ? [normalized] : [];
    }));
    before = response.result.nextBefore ?? null;
    if (!before) break;
  }

  return [...new Map(candles.map((candle) => [candle.time, candle])).values()]
    .sort((a, b) => a.time - b.time)
    .slice(-targetCount);
}
