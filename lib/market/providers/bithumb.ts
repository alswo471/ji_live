import { INSTRUMENTS, KRW_USDT_SANITY_BOUNDS } from '../catalog';
import {
  assessTimestampFreshness,
  MARKET_TICKER_FRESHNESS,
} from '../freshness';
import { createProviderRequestError } from '../provider-error';
import type { FxConversionInput, MarketQuote } from '../types';

const DEFAULT_MARKETS = [
  'KRW-BTC',
  'KRW-ETH',
  'KRW-SOL',
  'KRW-XRP',
  'KRW-DOGE',
  'KRW-USDT',
];
const BITHUMB_KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
type BithumbTicker = {
  market: string;
  trade_price: number;
  prev_closing_price: number;
  signed_change_rate: number;
  acc_trade_price_24h: number;
  timestamp: number;
};

export type BithumbSnapshot = {
  quotes: MarketQuote[];
  fxRate: FxConversionInput;
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

function isWithinSanityBounds(
  value: number | null,
  bounds: { minExclusive: number; maxExclusive: number },
) {
  return value !== null && value > bounds.minExclusive && value < bounds.maxExclusive;
}

/**
 * Bithumb ticker가 UTC 거래시각을 KST wall-clock epoch로 보낼 때만 9시간을
 * 되돌린다. 이미 유효한 epoch는 유지하고 보정 후보도 공통 freshness 정책으로
 * 다시 검증해 임의의 미래 시각을 수신 시각으로 가장하지 않는다.
 */
function assessBithumbTimestampFreshness(timestamp: unknown, nowMs: number) {
  const original = assessTimestampFreshness(timestamp, nowMs);
  if (
    original.freshness !== 'unavailable' ||
    typeof timestamp !== 'number' ||
    timestamp <= nowMs + MARKET_TICKER_FRESHNESS.futureToleranceMs
  ) {
    return original;
  }

  const normalized = assessTimestampFreshness(
    timestamp - BITHUMB_KST_OFFSET_MS,
    nowMs,
  );
  return normalized.freshness === 'unavailable' ? original : normalized;
}

export async function fetchBithumbSnapshot(
  fetcher: typeof fetch = fetch,
  markets = DEFAULT_MARKETS,
  now: () => Date = () => new Date(),
): Promise<BithumbSnapshot> {
  const response = await fetcher(
    `https://api.bithumb.com/v1/ticker?markets=${encodeURIComponent(markets.join(','))}`,
    {
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    },
  );
  if (!response.ok)
    throw createProviderRequestError('Bithumb', response, now().getTime());
  const tickers = (await response.json()) as BithumbTicker[];

  const usdtTicker = tickers.find((ticker) => ticker.market === 'KRW-USDT');
  const fxFreshness = assessBithumbTimestampFreshness(
    usdtTicker?.timestamp,
    now().getTime(),
  );
  const parsedKrwPerUsdt = fxFreshness.freshness === 'unavailable'
    ? null
    : finitePositive(usdtTicker?.trade_price);
  const krwPerUsdt = isWithinSanityBounds(
    parsedKrwPerUsdt,
    KRW_USDT_SANITY_BOUNDS,
  )
    ? parsedKrwPerUsdt
    : null;
  const fxPreviousClose =
    krwPerUsdt === null ? null : finitePositive(usdtTicker?.prev_closing_price);
  const fxChangeRate =
    krwPerUsdt === null || fxPreviousClose === null
      ? null
      : finiteNumber(usdtTicker?.signed_change_rate);
  const fxQuote: MarketQuote = {
    symbol: 'USDTKRW',
    name: 'USDT/KRW 합성환율',
    nameKo: 'USDT/KRW 합성환율',
    nameEn: 'USDT/KRW Synthetic Rate',
    assetClass: 'fx',
    price: krwPerUsdt,
    currency: 'KRW',
    changeRate: fxChangeRate,
    previousClose: fxPreviousClose,
    changeRateSource: fxChangeRate === null ? null : 'previous-close',
    tradingAmount:
      krwPerUsdt === null
        ? null
        : finitePositive(usdtTicker?.acc_trade_price_24h),
    tradingAmountCurrency: krwPerUsdt === null ? null : 'KRW',
    volumeKind: null,
    asOf: krwPerUsdt === null ? null : fxFreshness.asOf,
    session: 'always-open',
    quality: krwPerUsdt === null
      ? 'unavailable'
      : fxFreshness.freshness === 'stale'
        ? 'stale'
        : 'estimated',
    provider: 'bithumb',
    providerSymbol: 'KRW-USDT',
    confidence: null,
    estimateInputs: ['KRW-USDT'],
    priceKind: krwPerUsdt === null ? 'unavailable' : 'derived-estimate',
    comparisonBasis:
      krwPerUsdt === null || fxPreviousClose === null
        ? null
        : 'previous-close',
    sourceLabel: 'Bithumb KRW-USDT',
  };

  const quotes = tickers
    .flatMap((ticker) => {
      if (ticker.market === 'KRW-USDT') return [];
      const instrument = INSTRUMENTS.find(
        (item) =>
          item.provider === 'bithumb' &&
          item.providerSymbol === ticker.market &&
          item.assetClass === 'crypto',
      );
      if (!instrument) return [];
      const freshness = assessBithumbTimestampFreshness(
        ticker.timestamp,
        now().getTime(),
      );
      const price = freshness.freshness === 'unavailable'
        ? null
        : finitePositive(ticker.trade_price);
      const previousClose =
        price === null ? null : finitePositive(ticker.prev_closing_price);
      const changeRate =
        price === null || previousClose === null
          ? null
          : finiteNumber(ticker.signed_change_rate);
      return {
        symbol: instrument.symbol,
        name: instrument.name,
        nameKo: instrument.nameKo,
        nameEn: instrument.nameEn,
        assetClass: 'crypto',
        price,
        currency: 'KRW',
        changeRate,
        previousClose,
        changeRateSource: changeRate === null ? null : 'previous-close',
        tradingAmount: finitePositive(ticker.acc_trade_price_24h),
        tradingAmountCurrency: 'KRW',
        volumeKind: null,
        asOf: price === null ? null : freshness.asOf,
        session: 'always-open',
        quality: price === null
          ? 'unavailable'
          : freshness.freshness === 'stale'
            ? 'stale'
            : 'realtime',
        provider: 'bithumb',
        providerSymbol: ticker.market,
        confidence: null,
        estimateInputs: [],
        priceKind: price === null ? 'unavailable' : 'actual-product',
        comparisonBasis:
          price === null || previousClose === null ? null : 'previous-close',
        sourceLabel: 'Bithumb',
      } satisfies MarketQuote;
    });

  return {
    quotes,
    fxRate: {
      rate: krwPerUsdt,
      provider: 'bithumb',
      providerSymbol: 'KRW-USDT',
      asOf: fxQuote.asOf,
      freshness:
        fxQuote.quality === 'stale'
          ? 'stale'
          : fxQuote.quality === 'unavailable'
            ? 'unavailable'
            : 'fresh',
    },
    fxQuote,
  };
}
