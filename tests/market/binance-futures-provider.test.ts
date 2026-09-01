import { describe, expect, it, vi } from 'vitest';
import { fetchBinanceFuturesTickers } from '@/lib/market/providers/binance-futures';

describe('fetchBinanceFuturesTickers', () => {
  it('필요한 Binance 선물만 DerivativeTicker로 변환한다', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          {
            symbol: 'TSLAUSDT',
            lastPrice: '366.48',
            priceChangePercent: '4.939',
            quoteVolume: '1000000',
            closeTime: 1788249315837,
          },
          {
            symbol: 'BTCUSDT',
            lastPrice: '100000',
            priceChangePercent: '1',
            quoteVolume: '999',
            closeTime: 1788249315837,
          },
        ]),
      );

    const result = await fetchBinanceFuturesTickers(
      fetcher,
      () => new Date(0),
      ['TSLAUSDT'],
    );

    expect(result).toEqual([
      {
        provider: 'binance-futures',
        providerSymbol: 'TSLAUSDT',
        price: 366.48,
        changeRate: 0.04939,
        tradingAmount: 1_000_000,
        asOf: new Date(1788249315837).toISOString(),
      },
    ]);
  });

  it('기본 허용 심볼만 단일 선물 ticker 요청에서 선택한다', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(input).toBe('https://fapi.binance.com/fapi/v1/ticker/24hr');
      expect(init).toMatchObject({ cache: 'no-store' });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(
        JSON.stringify([
          {
            symbol: 'SAMSUNGEMUSDT',
            lastPrice: '99',
            priceChangePercent: '1',
            quoteVolume: '100',
            closeTime: 1,
          },
          {
            symbol: 'BTCUSDT',
            lastPrice: '100000',
            priceChangePercent: '1',
            quoteVolume: '999',
            closeTime: 1,
          },
          {
            symbol: 'AAPLUSDT',
            lastPrice: '220',
            priceChangePercent: '-2',
            quoteVolume: '300',
            closeTime: 1,
          },
        ]),
      );
    });

    const result = await fetchBinanceFuturesTickers(fetcher, () => new Date(0));

    expect(result.map((ticker) => ticker.providerSymbol)).toEqual([
      'SAMSUNGEMUSDT',
      'AAPLUSDT',
    ]);
  });

  it('유한한 양수가 아닌 가격과 거래대금은 해당 선물 ticker에서 null로 정규화한다', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          {
            symbol: 'TSLAUSDT',
            lastPrice: '0',
            priceChangePercent: 'Infinity',
            quoteVolume: '-1',
            closeTime: 1,
          },
          {
            symbol: 'NVDAUSDT',
            lastPrice: '100',
            priceChangePercent: '-2.5',
            quoteVolume: '200',
            closeTime: 1,
          },
        ]),
      );

    const result = await fetchBinanceFuturesTickers(
      fetcher,
      () => new Date(0),
      ['TSLAUSDT', 'NVDAUSDT'],
    );

    expect(result).toEqual([
      {
        provider: 'binance-futures',
        providerSymbol: 'TSLAUSDT',
        price: null,
        changeRate: null,
        tradingAmount: null,
        asOf: new Date(1).toISOString(),
      },
      {
        provider: 'binance-futures',
        providerSymbol: 'NVDAUSDT',
        price: 100,
        changeRate: -0.025,
        tradingAmount: 200,
        asOf: new Date(1).toISOString(),
      },
    ]);
  });
});
