import type { CandleInterval, CandlePoint, Instrument } from '../types';

type BinanceKline = [number, string, string, string, string, string, ...unknown[]];

function normalizeKline(kline: BinanceKline): CandlePoint | null {
  const time = Number(kline[0]) / 1_000;
  const open = Number(kline[1]);
  const high = Number(kline[2]);
  const low = Number(kline[3]);
  const close = Number(kline[4]);
  const volume = Number(kline[5]);
  if (![time, open, high, low, close, volume].every(Number.isFinite)) return null;
  return { time, open, high, low, close, volume };
}

export async function fetchBinanceCandles(
  instrument: Instrument,
  interval: CandleInterval,
  fetcher: typeof fetch = fetch,
): Promise<CandlePoint[]> {
  const limits: Record<CandleInterval, number> = {
    '1m': 120,
    '15m': 96,
    '1h': 120,
    '4h': 186,
    '1d': 183,
    '1w': 104,
    '1M': 120,
  };
  const limit = limits[interval];
  const params = new URLSearchParams({ symbol: instrument.providerSymbol, interval, limit: String(limit) });
  const response = await fetcher(`https://api.binance.com/api/v3/klines?${params.toString()}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error(`Binance 차트 요청에 실패했습니다. (${response.status})`);
  const klines = await response.json() as BinanceKline[];
  return klines.flatMap((kline) => {
    const candle = normalizeKline(kline);
    return candle ? [candle] : [];
  }).sort((a, b) => a.time - b.time);
}
