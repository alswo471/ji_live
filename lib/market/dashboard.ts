import { createCachedProvider } from './cache';
import { INSTRUMENTS } from './catalog';
import {
  composeDerivedQuotes,
  createUnavailableQuote,
} from './derived-quotes';
import { fetchBinanceFuturesTickers } from './providers/binance-futures';
import { fetchBinanceSpotQuotes } from './providers/binance';
import {
  fetchBithumbSnapshot,
  type BithumbSnapshot,
} from './providers/bithumb';
import { fetchHyperliquidTickers } from './providers/hyperliquid';
import type { DashboardResponse, DerivativeTicker, MarketQuote } from './types';

type ProviderName =
  | 'hyperliquid'
  | 'binanceFutures'
  | 'binanceSpot'
  | 'bithumb';
export type DashboardLoaders = {
  hyperliquid: () => Promise<DerivativeTicker[]>;
  binanceFutures: () => Promise<DerivativeTicker[]>;
  binanceSpot: () => Promise<MarketQuote[]>;
  bithumb: () => Promise<BithumbSnapshot>;
};
const LABELS: Record<ProviderName, string> = {
  hyperliquid: 'Hyperliquid',
  binanceFutures: 'Binance 선물',
  binanceSpot: 'Binance 현물',
  bithumb: 'Bithumb',
};

function readProviderResult<T>(
  name: ProviderName,
  result: PromiseSettledResult<{ value: T; stale: boolean }>,
  notices: string[],
) {
  if (result.status === 'rejected') {
    notices.push(`${LABELS[name]} 시세를 불러오지 못했습니다.`);
    return { value: null, stale: false };
  }
  if (result.value.stale)
    notices.push(`${LABELS[name]}의 마지막 정상 시세를 표시합니다.`);
  return result.value;
}

function markQuoteStale(quote: MarketQuote, stale: boolean) {
  return stale && quote.quality !== 'unavailable'
    ? { ...quote, quality: 'stale' as const }
    : quote;
}

export function createDashboardService(loaders: DashboardLoaders) {
  const providers = {
    hyperliquid: createCachedProvider({
      ttlMs: 5_000,
      failureThreshold: 2,
      cooldownMs: 30_000,
      load: loaders.hyperliquid,
    }),
    binanceFutures: createCachedProvider({
      ttlMs: 5_000,
      failureThreshold: 2,
      cooldownMs: 30_000,
      load: loaders.binanceFutures,
    }),
    binanceSpot: createCachedProvider({
      ttlMs: 5_000,
      failureThreshold: 2,
      cooldownMs: 30_000,
      load: loaders.binanceSpot,
    }),
    bithumb: createCachedProvider({
      ttlMs: 5_000,
      failureThreshold: 2,
      cooldownMs: 30_000,
      load: loaders.bithumb,
    }),
  };

  return {
    async getDashboard(now = new Date()): Promise<DashboardResponse> {
      const settled = await Promise.allSettled([
        providers.hyperliquid.get(),
        providers.binanceFutures.get(),
        providers.binanceSpot.get(),
        providers.bithumb.get(),
      ]);
      const notices: string[] = [];
      const hyperliquid = readProviderResult(
        'hyperliquid',
        settled[0],
        notices,
      );
      const binanceFutures = readProviderResult(
        'binanceFutures',
        settled[1],
        notices,
      );
      const binanceSpot = readProviderResult(
        'binanceSpot',
        settled[2],
        notices,
      );
      const bithumb = readProviderResult('bithumb', settled[3], notices);
      const fxRate = bithumb.value
        ? {
            ...bithumb.value.fxRate,
            freshness:
              bithumb.stale && bithumb.value.fxRate.freshness !== 'unavailable'
                ? 'stale' as const
                : bithumb.value.fxRate.freshness,
          }
        : null;
      const derivativeQuotes = composeDerivedQuotes(
        [...(hyperliquid.value ?? []), ...(binanceFutures.value ?? [])],
        fxRate,
      ).map((quote) =>
        markQuoteStale(
          quote,
          (quote.provider === 'hyperliquid' && hyperliquid.stale) ||
            (quote.provider === 'binance-futures' && binanceFutures.stale) ||
            (quote.assetClass === 'kr-stock' && bithumb.stale),
        ),
      );
      const actualQuotes = [
        ...(binanceSpot.value ?? []).map((quote) =>
          markQuoteStale(quote, binanceSpot.stale),
        ),
        ...(bithumb.value?.quotes ?? []).map((quote) =>
          markQuoteStale(quote, bithumb.stale),
        ),
        ...(bithumb.value
          ? [markQuoteStale(bithumb.value.fxQuote, bithumb.stale)]
          : []),
      ];
      const quoteMap = new Map<string, MarketQuote>(
        derivativeQuotes.map((quote) => [quote.symbol, quote]),
      );
      const actualQuoteMap = new Map<string, MarketQuote>();

      for (const quote of actualQuotes) {
        if (quote.provider && quote.providerSymbol) {
          actualQuoteMap.set(
            `${quote.provider}:${quote.providerSymbol}`,
            quote,
          );
        }
      }

      for (const instrument of INSTRUMENTS) {
        if (
          instrument.assetClass === 'kr-stock' ||
          instrument.assetClass === 'us-stock'
        ) continue;
        const quote = actualQuoteMap.get(
          `${instrument.provider}:${instrument.providerSymbol}`,
        );
        quoteMap.set(
          instrument.symbol,
          quote?.symbol === instrument.symbol
            ? quote
            : createUnavailableQuote(instrument),
        );
      }

      return {
        quotes: INSTRUMENTS.map((instrument) =>
          quoteMap.get(instrument.symbol) ?? createUnavailableQuote(instrument)),
        fetchedAt: now.toISOString(),
        notices,
      };
    },
  };
}

const defaultService = createDashboardService({
  hyperliquid: () => fetchHyperliquidTickers(),
  binanceFutures: () => fetchBinanceFuturesTickers(),
  binanceSpot: () => fetchBinanceSpotQuotes(),
  bithumb: () => fetchBithumbSnapshot(),
});

export const getDashboard = (now?: Date) => defaultService.getDashboard(now);
