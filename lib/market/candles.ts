import { INSTRUMENTS } from './catalog';
import { fetchBinanceCandles } from './providers/binance-candles';
import { fetchBithumbCandles } from './providers/bithumb-candles';
import { fetchTossCandles } from './providers/toss-candles';
import type { CandlePoint, CandleRange, CandleResponse, Instrument, MarketProvider } from './types';

type CandleLoader = (instrument: Instrument, range: CandleRange) => Promise<CandlePoint[]>;
type CandleLoaders = Record<MarketProvider, CandleLoader>;

const defaultLoaders: CandleLoaders = {
  toss: fetchTossCandles,
  binance: fetchBinanceCandles,
  bithumb: fetchBithumbCandles,
};

export function createCandleService(options: {
  loaders?: CandleLoaders;
  now?: () => number;
} = {}) {
  const loaders = options.loaders ?? defaultLoaders;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { value: CandleResponse; expiresAt: number }>();
  const inFlight = new Map<string, Promise<CandleResponse>>();

  async function getCandles(symbol: string, range: CandleRange): Promise<CandleResponse> {
    const instrument = INSTRUMENTS.find((item) => item.symbol === symbol.toUpperCase());
    if (!instrument) return { candles: [], unavailable: true, message: '지원하지 않는 종목입니다.' };
    const key = `${instrument.symbol}:${range}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.value;
    const pending = inFlight.get(key);
    if (pending) return pending;

    const request = loaders[instrument.provider](instrument, range)
      .then((candles) => {
        const value = { candles, unavailable: candles.length === 0 } satisfies CandleResponse;
        cache.set(key, { value, expiresAt: now() + (range === '1d' ? 60_000 : 21_600_000) });
        return value;
      })
      .catch(() => ({
        candles: [],
        unavailable: true,
        message: '차트 데이터를 잠시 불러오지 못했습니다.',
      } satisfies CandleResponse))
      .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
  }

  return { getCandles };
}

const candleService = createCandleService();
export const getCandles = candleService.getCandles;
