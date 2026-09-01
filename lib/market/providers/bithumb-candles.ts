import type { CandlePoint, CandleRange, Instrument } from '../types';

type BithumbCandle = {
  timestamp?: number;
  candle_date_time_utc?: string;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
  candle_acc_trade_volume: number;
};

function normalizeCandle(candle: BithumbCandle): CandlePoint | null {
  const time = candle.timestamp === undefined
    ? Date.parse(`${candle.candle_date_time_utc}Z`) / 1_000
    : candle.timestamp / 1_000;
  const open = Number(candle.opening_price);
  const high = Number(candle.high_price);
  const low = Number(candle.low_price);
  const close = Number(candle.trade_price);
  const volume = Number(candle.candle_acc_trade_volume);
  if (![time, open, high, low, close, volume].every(Number.isFinite)) return null;
  return { time, open, high, low, close, volume };
}

export async function fetchBithumbCandles(
  instrument: Instrument,
  range: CandleRange,
  fetcher: typeof fetch = fetch,
): Promise<CandlePoint[]> {
  const isMinute = range === '1d';
  const path = isMinute ? '/v1/candles/minutes/1' : '/v1/candles/days';
  const count = isMinute ? 200 : range === '1w' ? 7 : 30;
  const params = new URLSearchParams({ market: instrument.providerSymbol, count: String(count) });
  const response = await fetcher(`https://api.bithumb.com${path}?${params.toString()}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error(`Bithumb 차트 요청에 실패했습니다. (${response.status})`);
  const candles = await response.json() as BithumbCandle[];
  return candles.flatMap((item) => {
    const candle = normalizeCandle(item);
    return candle ? [candle] : [];
  }).sort((a, b) => a.time - b.time);
}
