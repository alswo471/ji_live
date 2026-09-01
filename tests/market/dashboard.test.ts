import { describe, expect, it } from 'vitest';
import { createDashboardService } from '@/lib/market/dashboard';
import type { MarketQuote } from '@/lib/market/types';

const quote = (overrides: Partial<MarketQuote>): MarketQuote => ({
  symbol: '005930', name: '삼성전자', assetClass: 'kr-stock', price: 84200, currency: 'KRW',
  changeRate: 0.0145, previousClose: null, changeRateSource: 'provider', tradingAmount: 1000, asOf: '2026-09-01T10:00:00+09:00',
  session: 'regular', quality: 'realtime', provider: 'toss', confidence: null, estimateInputs: [],
  ...overrides,
});

describe('createDashboardService', () => {
  it('Bithumb 원화 코인을 우선하고 Binance PAXG를 함께 제공한다', async () => {
    const service = createDashboardService({
      toss: async () => [quote({})],
      binance: async () => [
        quote({ symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', currency: 'USD', price: 108450, provider: 'binance', session: 'always-open' }),
        quote({ symbol: 'PAXG', name: '금 연동(PAXG)', assetClass: 'metal', currency: 'USD', price: 3472, provider: 'binance', session: 'always-open' }),
      ],
      bithumb: async () => [quote({ symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', currency: 'KRW', price: 149850000, provider: 'bithumb', session: 'always-open' })],
    });

    const dashboard = await service.getDashboard(new Date('2026-09-01T10:00:00+09:00'));

    expect(dashboard.quotes.find((item) => item.symbol === 'BTC')).toMatchObject({ currency: 'KRW', provider: 'bithumb' });
    expect(dashboard.quotes.find((item) => item.symbol === 'PAXG')).toMatchObject({ price: 3472, provider: 'binance' });
    expect(dashboard).not.toHaveProperty('holdings');
  });

  it('한 공급자 장애가 다른 자산군 응답을 막지 않는다', async () => {
    const service = createDashboardService({
      toss: async () => [quote({})],
      binance: async () => { throw new Error('timeout'); },
      bithumb: async () => [quote({ symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', provider: 'bithumb', session: 'always-open' })],
    });

    const dashboard = await service.getDashboard();

    expect(dashboard.quotes.map((item) => item.symbol)).toEqual(['005930', 'BTC']);
    expect(dashboard.notices).toContain('Binance 시세를 불러오지 못했습니다.');
  });
});
