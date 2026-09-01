import { INSTRUMENTS } from '../catalog';
import { assessTimestampFreshness } from '../freshness';
import { createProviderRequestError } from '../provider-error';
import type { MarketQuote } from '../types';

const DEFAULT_SYMBOLS = ['PAXGUSDT'];
type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
  closeTime: number;
  count?: number;
};

function finiteNumber(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function finitePositive(value: string | number) {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

export async function fetchBinanceSpotQuotes(
  fetcher: typeof fetch = fetch,
  symbols = DEFAULT_SYMBOLS,
  now: () => Date = () => new Date(),
): Promise<MarketQuote[]> {
  const response = await fetcher(
    `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`,
    {
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    },
  );
  if (!response.ok)
    throw createProviderRequestError('Binance', response, now().getTime());
  const tickers = (await response.json()) as BinanceTicker[];

  return tickers.flatMap((ticker) => {
    const instrument = INSTRUMENTS.find(
      (item) =>
        item.provider === 'binance-spot' &&
        item.providerSymbol === ticker.symbol,
    );
    if (!instrument) return [];
    const assessed = assessTimestampFreshness(
      ticker.closeTime,
      now().getTime(),
      undefined,
      ticker.count === 0,
    );
    const price = assessed.freshness === 'unavailable'
      ? null
      : finitePositive(ticker.lastPrice);
    const percent = finiteNumber(ticker.priceChangePercent);
    return {
      symbol: instrument.symbol,
      name: instrument.name,
      nameKo: instrument.nameKo,
      nameEn: instrument.nameEn,
      assetClass: instrument.assetClass,
      price,
      currency: 'USD',
      changeRate: price === null || percent === null ? null : percent / 100,
      previousClose: null,
      changeRateSource: price === null || percent === null ? null : 'provider',
      tradingAmount: finitePositive(ticker.quoteVolume),
      tradingAmountCurrency: 'USDT',
      asOf: assessed.asOf,
      session: 'always-open',
      quality: price === null
        ? 'unavailable'
        : assessed.freshness === 'stale'
          ? 'stale'
          : 'realtime',
      provider: 'binance-spot',
      providerSymbol: ticker.symbol,
      confidence: null,
      estimateInputs: [],
      priceKind: price === null ? 'unavailable' : 'actual-product',
      comparisonBasis: price === null ? null : 'provider-24h',
      sourceLabel: 'Binance 현물',
    } satisfies MarketQuote;
  });
}
