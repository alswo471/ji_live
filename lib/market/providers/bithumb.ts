import { INSTRUMENTS } from '../catalog';
import type { MarketQuote } from '../types';

const DEFAULT_MARKETS = [
  'KRW-BTC',
  'KRW-ETH',
  'KRW-SOL',
  'KRW-XRP',
  'KRW-DOGE',
  'KRW-USDT',
];
type BithumbTicker = {
  market: string;
  trade_price: number;
  signed_change_rate: number;
  acc_trade_price_24h: number;
  timestamp: number;
};

export type BithumbSnapshot = {
  quotes: MarketQuote[];
  krwPerUsdt: number | null;
  fxQuote: MarketQuote;
};

function finiteNumber(value: unknown) {
  if (typeof value !== 'number') return null;
  return Number.isFinite(value) ? value : null;
}

function finitePositive(value: unknown) {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function isoDateOrNull(timestamp: unknown) {
  if (typeof timestamp !== 'number') return null;
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export async function fetchBithumbSnapshot(
  fetcher: typeof fetch = fetch,
  markets = DEFAULT_MARKETS,
): Promise<BithumbSnapshot> {
  const response = await fetcher(
    `https://api.bithumb.com/v1/ticker?markets=${encodeURIComponent(markets.join(','))}`,
    {
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    },
  );
  if (!response.ok)
    throw new Error(`Bithumb 시세 요청에 실패했습니다. (${response.status})`);
  const tickers = (await response.json()) as BithumbTicker[];

  const usdtTicker = tickers.find((ticker) => ticker.market === 'KRW-USDT');
  const krwPerUsdt = finitePositive(usdtTicker?.trade_price);
  const fxChangeRate =
    krwPerUsdt === null ? null : finiteNumber(usdtTicker?.signed_change_rate);
  const fxQuote: MarketQuote = {
    symbol: 'USDTKRW',
    name: 'USDT/KRW 합성환율',
    nameKo: 'USDT/KRW 합성환율',
    nameEn: 'USDT/KRW Synthetic Rate',
    assetClass: 'fx',
    price: krwPerUsdt,
    currency: 'KRW',
    changeRate: fxChangeRate,
    previousClose: null,
    changeRateSource: fxChangeRate === null ? null : 'provider',
    tradingAmount:
      krwPerUsdt === null
        ? null
        : finitePositive(usdtTicker?.acc_trade_price_24h),
    asOf: krwPerUsdt === null ? null : isoDateOrNull(usdtTicker?.timestamp),
    session: 'always-open',
    quality: krwPerUsdt === null ? 'unavailable' : 'estimated',
    provider: 'bithumb',
    confidence: null,
    estimateInputs: ['KRW-USDT'],
    priceKind: krwPerUsdt === null ? 'unavailable' : 'derived-estimate',
    comparisonBasis: krwPerUsdt === null ? null : 'provider-24h',
    sourceLabel: 'Bithumb KRW-USDT',
  };

  const quotes = tickers
    .filter((ticker) => ticker.market !== 'KRW-USDT')
    .map((ticker) => {
      const symbol = ticker.market.replace(/^KRW-/, '');
      const instrument = INSTRUMENTS.find((item) => item.symbol === symbol);
      const price = finitePositive(ticker.trade_price);
      const changeRate =
        price === null ? null : finiteNumber(ticker.signed_change_rate);
      return {
        symbol,
        name: instrument?.name ?? symbol,
        nameKo: instrument?.nameKo,
        nameEn: instrument?.nameEn,
        assetClass: 'crypto',
        price,
        currency: 'KRW',
        changeRate,
        previousClose: null,
        changeRateSource: changeRate === null ? null : 'provider',
        tradingAmount: finitePositive(ticker.acc_trade_price_24h),
        asOf: isoDateOrNull(ticker.timestamp),
        session: 'always-open',
        quality: price === null ? 'unavailable' : 'realtime',
        provider: 'bithumb',
        confidence: null,
        estimateInputs: [],
        priceKind: price === null ? 'unavailable' : 'actual-product',
        comparisonBasis: price === null ? null : 'provider-24h',
        sourceLabel: 'Bithumb',
      } satisfies MarketQuote;
    });

  return { quotes, krwPerUsdt, fxQuote };
}
