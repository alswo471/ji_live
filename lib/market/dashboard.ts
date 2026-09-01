import { createCachedProvider } from './cache';
import { applyEstimates } from './estimate';
import { fetchBinanceQuotes } from './providers/binance';
import { fetchBithumbQuotes } from './providers/bithumb';
import { fetchTossMarketSnapshot } from './providers/toss';
import type { DashboardResponse, MarketQuote } from './types';

type ProviderName = 'toss' | 'binance' | 'bithumb';
type ProviderLoaders = Record<ProviderName, () => Promise<MarketQuote[]>>;
const LABELS: Record<ProviderName, string> = { toss: 'Toss', binance: 'Binance', bithumb: 'Bithumb' };

export function createDashboardService(loaders: ProviderLoaders) {
  const providers = {
    toss: createCachedProvider({ ttlMs: 5_000, failureThreshold: 2, cooldownMs: 30_000, load: loaders.toss }),
    binance: createCachedProvider({ ttlMs: 5_000, failureThreshold: 2, cooldownMs: 30_000, load: loaders.binance }),
    bithumb: createCachedProvider({ ttlMs: 5_000, failureThreshold: 2, cooldownMs: 30_000, load: loaders.bithumb }),
  };

  return {
    async getDashboard(now = new Date()): Promise<DashboardResponse> {
      const names = Object.keys(providers) as ProviderName[];
      const settled = await Promise.allSettled(names.map((name) => providers[name].get()));
      const quoteMap = new Map<string, MarketQuote>();
      const notices: string[] = [];

      settled.forEach((result, index) => {
        const name = names[index];
        if (result.status === 'rejected') {
          notices.push(`${LABELS[name]} 시세를 불러오지 못했습니다.`);
          return;
        }
        if (result.value.stale) notices.push(`${LABELS[name]}의 마지막 정상 시세를 표시합니다.`);
        for (const quote of result.value.value) {
          quoteMap.set(quote.symbol, result.value.stale && quote.quality !== 'unavailable' ? { ...quote, quality: 'stale' } : quote);
        }
      });

      return { quotes: applyEstimates([...quoteMap.values()]), fetchedAt: now.toISOString(), notices };
    },
  };
}

const defaultService = createDashboardService({
  toss: () => fetchTossMarketSnapshot(),
  binance: () => fetchBinanceQuotes(),
  bithumb: () => fetchBithumbQuotes(),
});

export const getDashboard = (now?: Date) => defaultService.getDashboard(now);
