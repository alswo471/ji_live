import { INSTRUMENTS } from './catalog';
import { fetchBinanceCandles } from './providers/binance-candles';
import { fetchBithumbCandles } from './providers/bithumb-candles';
import { fetchHyperliquidCandles } from './providers/hyperliquid-candles';
import { getCandleViewport } from './candle-intervals';
import { composeKrwDerivedCandles } from './krw-derived-candles';
import type {
  CandleInterval,
  CandlePoint,
  CandleResponse,
  Instrument,
  MarketProvider,
} from './types';

type CandleLoader = (
  instrument: Instrument,
  interval: CandleInterval,
) => Promise<CandlePoint[]>;
type CandleLoaders = Partial<Record<MarketProvider, CandleLoader>>;

const defaultLoaders: CandleLoaders = {
  hyperliquid: fetchHyperliquidCandles,
  'binance-futures': fetchBinanceCandles,
  'binance-spot': fetchBinanceCandles,
  bithumb: fetchBithumbCandles,
};

export function createCandleService(
  options: {
    loaders?: CandleLoaders;
    fxLoader?: CandleLoader;
    now?: () => number;
  } = {},
) {
  const loaders = options.loaders ?? defaultLoaders;
  const fxLoader = options.fxLoader ?? fetchBithumbCandles;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { value: CandleResponse; expiresAt: number }>();
  const inFlight = new Map<string, Promise<CandleResponse>>();

  async function getCandles(
    symbol: string,
    interval: CandleInterval,
  ): Promise<CandleResponse> {
    const instrument = INSTRUMENTS.find(
      (item) => item.symbol === symbol.toUpperCase(),
    );
    if (!instrument)
      return {
        candles: [],
        unavailable: true,
        message: '지원하지 않는 종목입니다.',
      };
    const loader = loaders[instrument.provider];
    if (!loader)
      return {
        candles: [],
        unavailable: true,
        message: '차트 데이터를 제공하지 않는 종목입니다.',
      };
    const key = `${instrument.symbol}:${interval}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.value;
    const pending = inFlight.get(key);
    if (pending) return pending;

    const request = (async () => {
      if (instrument.assetClass !== 'kr-stock') {
        const candles = await loader(instrument, interval);
        return {
          candles,
          unavailable: candles.length === 0,
        } satisfies CandleResponse;
      }

      const fxInstrument = INSTRUMENTS.find((item) => item.symbol === 'USDTKRW');
      if (!fxInstrument) {
        return {
          candles: [],
          unavailable: true,
          message: '원화 추정 차트의 환율 기준을 확인하지 못했습니다.',
        } satisfies CandleResponse;
      }
      const [derivativeCandles, fxCandles] = await Promise.all([
        loader(instrument, interval),
        fxLoader(fxInstrument, interval),
      ]);
      const candles = composeKrwDerivedCandles(
        derivativeCandles,
        fxCandles,
        interval,
      );
      return {
        candles,
        unavailable: candles.length === 0,
        ...(candles.length === 0
          ? { message: '원화 추정 차트 입력을 잠시 불러오지 못했습니다.' }
          : {}),
        priceKind: 'derived-estimate',
        volumeKind: 'derivative-contracts',
        sourceLabel: `${instrument.provider === 'hyperliquid' ? 'Hyperliquid 파생상품' : 'Binance 무기한선물'} × Bithumb KRW-USDT`,
        estimateInputs: [instrument.providerSymbol, 'KRW-USDT'],
      } satisfies CandleResponse;
    })()
      .then((value) => {
        if (value.candles.length > 0) {
          cache.set(key, {
            value,
            expiresAt: now() + getCandleViewport(interval).cacheTtlMs,
          });
        }
        return value;
      })
      .catch(
        () =>
          ({
            candles: [],
            unavailable: true,
            message: '차트 데이터를 잠시 불러오지 못했습니다.',
          }) satisfies CandleResponse,
      )
      .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
  }

  return { getCandles };
}

const candleService = createCandleService();
export const getCandles = candleService.getCandles;
