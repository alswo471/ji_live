import { describe, expect, it, vi } from 'vitest';
import { createDashboardService } from '@/lib/market/dashboard';
import type { BithumbSnapshot } from '@/lib/market/providers/bithumb';
import type { DerivativeTicker, MarketQuote } from '@/lib/market/types';

const derivative = (
  overrides: Partial<DerivativeTicker>,
): DerivativeTicker => ({
  provider: 'binance-futures',
  providerSymbol: 'TSLAUSDT',
  price: 100,
  changeRate: 0.01,
  tradingAmount: 1_000_000,
  asOf: '2026-09-01T10:00:00.000Z',
  ...overrides,
});

const quote = (overrides: Partial<MarketQuote>): MarketQuote => ({
  symbol: 'BTC',
  name: '비트코인',
  assetClass: 'crypto',
  price: 100,
  currency: 'KRW',
  changeRate: 0.01,
  previousClose: null,
  changeRateSource: 'provider',
  tradingAmount: 1_000,
  asOf: '2026-09-01T10:00:00.000Z',
  session: 'always-open',
  quality: 'realtime',
  provider: 'bithumb',
  confidence: null,
  estimateInputs: [],
  priceKind: 'actual-product',
  comparisonBasis: 'provider-24h',
  sourceLabel: 'Bithumb',
  ...overrides,
});

const bithumbSnapshot = (
  overrides: Partial<BithumbSnapshot> = {},
): BithumbSnapshot => ({
  quotes: [quote({ symbol: 'BTC' })],
  krwPerUsdt: 1_380,
  fxQuote: quote({
    symbol: 'USDTKRW',
    name: 'USDT/KRW 합성환율',
    assetClass: 'fx',
    price: 1_380,
    priceKind: 'derived-estimate',
    quality: 'estimated',
    sourceLabel: 'Bithumb KRW-USDT',
    estimateInputs: ['KRW-USDT'],
  }),
  ...overrides,
});

const loaders = () => ({
  hyperliquid: vi.fn(async () => [
    derivative({
      provider: 'hyperliquid',
      providerSymbol: 'xyz:SMSN',
      price: 60,
    }),
  ]),
  binanceFutures: vi.fn(async () => [
    derivative({ providerSymbol: 'TSLAUSDT', price: 366 }),
  ]),
  binanceSpot: vi.fn(async () => [
    quote({
      symbol: 'PAXG',
      name: '금 연동(PAXG)',
      assetClass: 'metal',
      currency: 'USD',
      provider: 'binance-spot',
      sourceLabel: 'Binance 현물',
    }),
  ]),
  bithumb: vi.fn(async () => bithumbSnapshot()),
});

describe('createDashboardService', () => {
  it('파생 ticker와 Bithumb 합성환율로 공개 dashboard를 만든다', async () => {
    const service = createDashboardService(loaders());

    const dashboard = await service.getDashboard(
      new Date('2026-09-01T10:00:00.000Z'),
    );

    expect(
      dashboard.quotes
        .filter((item) => item.assetClass === 'kr-stock')
        .map((item) => item.symbol),
    ).toEqual([
      '005930',
      '000660',
      '005380',
      '009150',
      '035420',
      '042700',
      '066570',
    ]);
    expect(
      dashboard.quotes
        .filter((item) => item.assetClass === 'us-stock')
        .map((item) => item.symbol),
    ).toEqual(['TSLA', 'NVDA', 'AAPL', 'GOOGL']);
    expect(
      dashboard.quotes.find((item) => item.symbol === '005930'),
    ).toMatchObject({
      price: 82_800,
      provider: 'hyperliquid',
      priceKind: 'derived-estimate',
      comparisonBasis: 'provider-24h',
      sourceLabel: 'Hyperliquid 파생상품',
    });
    expect(
      dashboard.quotes.find((item) => item.symbol === 'TSLA'),
    ).toMatchObject({
      price: 366,
      provider: 'binance-futures',
      priceKind: 'derived-estimate',
    });
    expect(
      dashboard.quotes.find((item) => item.symbol === 'BTC'),
    ).toMatchObject({ currency: 'KRW', provider: 'bithumb' });
    expect(
      dashboard.quotes.find((item) => item.symbol === 'PAXG'),
    ).toMatchObject({
      provider: 'binance-spot',
      priceKind: 'actual-product',
    });
    expect(
      dashboard.quotes.find((item) => item.symbol === 'USDTKRW'),
    ).toMatchObject({
      assetClass: 'fx',
      priceKind: 'derived-estimate',
    });
    expect(
      dashboard.quotes.some((item) => (item.provider as string) === 'toss'),
    ).toBe(false);
    expect(dashboard).toEqual(
      expect.objectContaining({
        fetchedAt: '2026-09-01T10:00:00.000Z',
        notices: [],
      }),
    );
  });

  it('네 공급자를 병렬로 불러온다', async () => {
    const pending = new Map<string, () => void>();
    const wait = (name: string) =>
      new Promise<void>((resolve) => pending.set(name, resolve));
    const service = createDashboardService({
      hyperliquid: async () => {
        await wait('hyperliquid');
        return [];
      },
      binanceFutures: async () => {
        await wait('binanceFutures');
        return [];
      },
      binanceSpot: async () => {
        await wait('binanceSpot');
        return [];
      },
      bithumb: async () => {
        await wait('bithumb');
        return bithumbSnapshot({ quotes: [], krwPerUsdt: null });
      },
    });

    const request = service.getDashboard();
    await vi.waitFor(() =>
      expect([...pending.keys()].sort()).toEqual([
        'binanceFutures',
        'binanceSpot',
        'bithumb',
        'hyperliquid',
      ]),
    );
    pending.forEach((resolve) => resolve());

    await expect(request).resolves.toBeDefined();
  });

  it('동일한 cache miss를 공급자별 하나의 요청으로 병합하고 5초간 재사용한다', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-01T10:00:00.000Z'));
      const providerLoaders = loaders();
      const service = createDashboardService(providerLoaders);

      await Promise.all([service.getDashboard(), service.getDashboard()]);
      await service.getDashboard();
      Object.values(providerLoaders).forEach((load) =>
        expect(load).toHaveBeenCalledTimes(1),
      );

      vi.advanceTimersByTime(5_000);
      await service.getDashboard();
      Object.values(providerLoaders).forEach((load) =>
        expect(load).toHaveBeenCalledTimes(2),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('Bithumb 장애 시 미국 추정가와 PAXG는 유지하고 한국 추정가는 unavailable로 둔다', async () => {
    const providerLoaders = loaders();
    providerLoaders.bithumb.mockRejectedValue(new Error('timeout'));
    const service = createDashboardService(providerLoaders);

    const dashboard = await service.getDashboard();

    expect(dashboard.quotes.find((item) => item.symbol === 'TSLA')?.price).toBe(
      366,
    );
    expect(
      dashboard.quotes.find((item) => item.symbol === 'PAXG')?.provider,
    ).toBe('binance-spot');
    expect(
      dashboard.quotes.find((item) => item.symbol === '005930'),
    ).toMatchObject({
      price: null,
      quality: 'unavailable',
      priceKind: 'unavailable',
    });
    expect(dashboard.quotes.some((item) => item.symbol === 'USDTKRW')).toBe(
      false,
    );
    expect(dashboard.notices).toContain('Bithumb 시세를 불러오지 못했습니다.');
  });

  it('마지막 정상 공급자값을 쓰면 의존하는 시세를 stale로 표시한다', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-01T10:00:00.000Z'));
      const providerLoaders = loaders();
      const service = createDashboardService(providerLoaders);
      await service.getDashboard();
      providerLoaders.bithumb.mockRejectedValue(new Error('timeout'));
      vi.advanceTimersByTime(5_000);

      const dashboard = await service.getDashboard();

      expect(
        dashboard.quotes.find((item) => item.symbol === 'BTC')?.quality,
      ).toBe('stale');
      expect(
        dashboard.quotes.find((item) => item.symbol === '005930')?.quality,
      ).toBe('stale');
      expect(dashboard.notices).toContain(
        'Bithumb의 마지막 정상 시세를 표시합니다.',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
