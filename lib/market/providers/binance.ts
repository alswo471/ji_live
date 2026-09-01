import { INSTRUMENTS } from '../catalog';
import type { MarketQuote } from '../types';

const DEFAULT_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'PAXGUSDT',
];
type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
  closeTime: number;
};

function finiteNumber(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function finitePositive(value: string | number) {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function isoDateOrNull(timestamp: number) {
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export async function fetchBinanceSpotQuotes(
  fetcher: typeof fetch = fetch,
  symbols = DEFAULT_SYMBOLS,
): Promise<MarketQuote[]> {
  const response = await fetcher(
    `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`,
    {
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    },
  );
  if (!response.ok)
    throw new Error(`Binance 시세 요청에 실패했습니다. (${response.status})`);
  const tickers = (await response.json()) as BinanceTicker[];

  return tickers.map((ticker) => {
    const baseSymbol = ticker.symbol.replace(/USDT$/, '');
    const instrument = INSTRUMENTS.find((item) => item.symbol === baseSymbol);
    const price = finitePositive(ticker.lastPrice);
    const percent = finiteNumber(ticker.priceChangePercent);
    return {
      symbol: baseSymbol,
      name: instrument?.name ?? baseSymbol,
      nameKo: instrument?.nameKo,
      nameEn: instrument?.nameEn,
      assetClass: instrument?.assetClass ?? 'crypto',
      price,
      currency: 'USD',
      changeRate: percent === null ? null : percent / 100,
      previousClose: null,
      changeRateSource: percent === null ? null : 'provider',
      tradingAmount: finitePositive(ticker.quoteVolume),
      asOf: Number.isFinite(ticker.closeTime)
        ? isoDateOrNull(ticker.closeTime)
        : null,
      session: 'always-open',
      quality: price === null ? 'unavailable' : 'realtime',
      provider: 'binance-spot',
      confidence: null,
      estimateInputs: [],
      priceKind: 'actual-product',
      comparisonBasis: 'provider-24h',
      sourceLabel: 'Binance 현물',
    } satisfies MarketQuote;
  });
}
