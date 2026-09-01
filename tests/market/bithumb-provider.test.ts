import { describe, expect, it } from 'vitest';
import { fetchBithumbSnapshot } from '@/lib/market/providers/bithumb';

describe('fetchBithumbSnapshot', () => {
  it('기본 요청에 합성환율용 KRW-USDT를 포함한다', async () => {
    let requestedUrl = '';
    const fetcher: typeof fetch = async (input) => {
      requestedUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      return new Response('[]');
    };

    await fetchBithumbSnapshot(fetcher);

    expect(requestedUrl).toContain('KRW-USDT');
  });

  it('원화 코인 실제 거래값을 공통 시세로 변환한다', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          {
            market: 'KRW-BTC',
            trade_price: 149850000,
            signed_change_rate: 0.028,
            acc_trade_price_24h: 184200000000,
            timestamp: 1788226800000,
          },
          {
            market: 'KRW-ETH',
            trade_price: 6125000,
            signed_change_rate: -0.0061,
            acc_trade_price_24h: 92000000000,
            timestamp: 1788226800000,
          },
        ]),
        { status: 200 },
      );

    const snapshot = await fetchBithumbSnapshot(fetcher, [
      'KRW-BTC',
      'KRW-ETH',
    ]);

    expect(
      snapshot.quotes.find((quote) => quote.symbol === 'BTC'),
    ).toMatchObject({
      price: 149850000,
      changeRate: 0.028,
      currency: 'KRW',
      provider: 'bithumb',
      priceKind: 'actual-product',
      comparisonBasis: 'provider-24h',
      sourceLabel: 'Bithumb',
    });
    expect(
      snapshot.quotes.find((quote) => quote.symbol === 'ETH'),
    ).toMatchObject({
      price: 6125000,
      changeRate: -0.0061,
      session: 'always-open',
    });
  });

  it('KRW-USDT를 합성 원달러 환산값으로 분리한다', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          {
            market: 'KRW-BTC',
            trade_price: 149850000,
            signed_change_rate: 0.028,
            acc_trade_price_24h: 184200000000,
            timestamp: 1788226800000,
          },
          {
            market: 'KRW-USDT',
            trade_price: 1380,
            signed_change_rate: 0.001,
            acc_trade_price_24h: 1000000,
            timestamp: 1788226800000,
          },
        ]),
      );

    const snapshot = await fetchBithumbSnapshot(fetcher, [
      'KRW-BTC',
      'KRW-USDT',
    ]);

    expect(snapshot.krwPerUsdt).toBe(1380);
    expect(snapshot.fxQuote).toMatchObject({
      symbol: 'USDTKRW',
      price: 1380,
      assetClass: 'fx',
      currency: 'KRW',
      provider: 'bithumb',
      quality: 'estimated',
      priceKind: 'derived-estimate',
      comparisonBasis: 'provider-24h',
      sourceLabel: 'Bithumb KRW-USDT',
      estimateInputs: ['KRW-USDT'],
    });
    expect(snapshot.quotes.map((quote) => quote.symbol)).toEqual(['BTC']);
  });

  it('유효한 KRW-USDT가 없으면 환율과 FX 시세를 만들지 않는다', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          {
            market: 'KRW-USDT',
            trade_price: 0,
            signed_change_rate: 0.001,
            acc_trade_price_24h: 1000000,
            timestamp: 1788226800000,
          },
        ]),
      );

    const snapshot = await fetchBithumbSnapshot(fetcher, ['KRW-USDT']);

    expect(snapshot.krwPerUsdt).toBeNull();
    expect(snapshot.fxQuote).toMatchObject({
      symbol: 'USDTKRW',
      price: null,
      quality: 'unavailable',
      priceKind: 'unavailable',
    });
  });
});
