import { describe, expect, it } from 'vitest';
import { fetchBinanceSpotQuotes } from '@/lib/market/providers/binance';

const atFixtureTime = () => new Date(1788226801000);

describe('fetchBinanceSpotQuotes', () => {
  it('기본 요청은 catalog가 소유한 PAXG만 조회한다', async () => {
    let requestedUrl = '';
    const fetcher: typeof fetch = async (input) => {
      requestedUrl = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      return new Response(
        JSON.stringify([
          {
            symbol: 'PAXGUSDT',
            lastPrice: '3472.18',
            priceChangePercent: '0.31',
            quoteVolume: '14000000',
            closeTime: 1788226800000,
          },
        ]),
        { status: 200 },
      );
    };

    const quotes = await fetchBinanceSpotQuotes(fetcher, undefined, atFixtureTime);

    expect(JSON.parse(new URL(requestedUrl).searchParams.get('symbols')!)).toEqual(['PAXGUSDT']);
    expect(quotes.find((quote) => quote.symbol === 'PAXG')).toMatchObject({
      name: '금 연동(PAXG)',
      assetClass: 'metal',
      price: 3472.18,
      quality: 'realtime',
      provider: 'binance-spot',
      priceKind: 'actual-product',
      comparisonBasis: 'provider-24h',
      sourceLabel: 'Binance 현물',
    });
  });

  it('명시적으로 요청해도 catalog providerSymbol 밖의 Binance 코인을 반환하지 않는다', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          {
            symbol: 'BTCUSDT',
            lastPrice: 'invalid',
            priceChangePercent: '2.50',
            quoteVolume: '1200',
            closeTime: 1788226800000,
          },
          {
            symbol: 'PAXGUSDT',
            lastPrice: '3472.18',
            priceChangePercent: '0.31',
            quoteVolume: '1400',
            closeTime: 1788226800000,
          },
        ]),
        { status: 200 },
      );

    const quotes = await fetchBinanceSpotQuotes(fetcher, [
      'BTCUSDT',
      'PAXGUSDT',
    ], atFixtureTime);

    expect(quotes.map((quote) => quote.symbol)).toEqual(['PAXG']);
    expect(quotes.find((quote) => quote.symbol === 'PAXG')?.price).toBe(
      3472.18,
    );
  });

  it('유한한 양수가 아닌 현물 가격과 거래대금을 unavailable로 정규화한다', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          {
            symbol: 'PAXGUSDT',
            lastPrice: '0',
            priceChangePercent: '-1.2',
            quoteVolume: '-10',
            closeTime: 1788226800000,
          },
        ]),
        { status: 200 },
      );

    const [quote] = await fetchBinanceSpotQuotes(fetcher, ['PAXGUSDT'], atFixtureTime);

    expect(quote).toMatchObject({
      price: null,
      changeRate: null,
      tradingAmount: null,
      quality: 'unavailable',
    });
  });

  it('Date 범위를 벗어난 closeTime은 가격과 기준 시각을 unavailable로 둔다', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          {
            symbol: 'PAXGUSDT',
            lastPrice: '100',
            priceChangePercent: '1',
            quoteVolume: '200',
            closeTime: 9e15,
          },
        ]),
        { status: 200 },
      );

    const [quote] = await fetchBinanceSpotQuotes(
      fetcher,
      ['PAXGUSDT'],
      () => new Date('2026-09-01T10:00:00.000Z'),
    );

    expect(quote).toMatchObject({
      price: null,
      asOf: null,
      quality: 'unavailable',
    });
  });

  it('정책보다 오래된 현물 ticker는 마지막 시각을 유지한 stale로 둔다', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify([{
        symbol: 'PAXGUSDT',
        lastPrice: '3472.18',
        priceChangePercent: '0.31',
        quoteVolume: '14000000',
        closeTime: Date.parse('2026-09-01T09:54:59.000Z'),
        count: 10,
      }]));

    const [quote] = await fetchBinanceSpotQuotes(
      fetcher,
      ['PAXGUSDT'],
      () => new Date('2026-09-01T10:00:00.000Z'),
    );

    expect(quote).toMatchObject({
      symbol: 'PAXG',
      price: 3472.18,
      asOf: '2026-09-01T09:54:59.000Z',
      quality: 'stale',
    });
  });
});
