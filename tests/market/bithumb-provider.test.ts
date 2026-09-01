import { describe, expect, it } from 'vitest';
import { fetchBithumbSnapshot } from '@/lib/market/providers/bithumb';

const atFixtureTime = () => new Date(1788226801000);

function ticker(market: string, timestamp: number) {
  return {
    market,
    trade_price: market === 'KRW-USDT' ? 1380 : 149850000,
    prev_closing_price: market === 'KRW-USDT' ? 1378.62 : 145770000,
    signed_change_rate: market === 'KRW-USDT' ? 0.001 : 0.028,
    acc_trade_price_24h: market === 'KRW-USDT' ? 1000000 : 184200000000,
    timestamp,
  };
}

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
            prev_closing_price: 145770000,
            signed_change_rate: 0.028,
            acc_trade_price_24h: 184200000000,
            timestamp: 1788226800000,
          },
          {
            market: 'KRW-ETH',
            trade_price: 6125000,
            prev_closing_price: 6162600,
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
    ], atFixtureTime);

    expect(
      snapshot.quotes.find((quote) => quote.symbol === 'BTC'),
    ).toMatchObject({
      price: 149850000,
      previousClose: 145770000,
      changeRate: 0.028,
      currency: 'KRW',
      provider: 'bithumb',
      priceKind: 'actual-product',
      comparisonBasis: 'previous-close',
      changeRateSource: 'previous-close',
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
            prev_closing_price: 145770000,
            signed_change_rate: 0.028,
            acc_trade_price_24h: 184200000000,
            timestamp: 1788226800000,
          },
          {
            market: 'KRW-USDT',
            trade_price: 1380,
            prev_closing_price: 1378.62,
            signed_change_rate: 0.001,
            acc_trade_price_24h: 1000000,
            timestamp: 1788226800000,
          },
        ]),
      );

    const snapshot = await fetchBithumbSnapshot(fetcher, [
      'KRW-BTC',
      'KRW-USDT',
    ], atFixtureTime);

    expect(snapshot.fxRate).toEqual({
      rate: 1380,
      provider: 'bithumb',
      providerSymbol: 'KRW-USDT',
      asOf: new Date(1788226800000).toISOString(),
      freshness: 'fresh',
    });
    expect(snapshot.fxQuote).toMatchObject({
      symbol: 'USDTKRW',
      price: 1380,
      assetClass: 'fx',
      currency: 'KRW',
      provider: 'bithumb',
      quality: 'estimated',
      priceKind: 'derived-estimate',
      previousClose: 1378.62,
      comparisonBasis: 'previous-close',
      changeRateSource: 'previous-close',
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
            prev_closing_price: 1378.62,
            signed_change_rate: 0.001,
            acc_trade_price_24h: 1000000,
            timestamp: 1788226800000,
          },
        ]),
      );

    const snapshot = await fetchBithumbSnapshot(fetcher, ['KRW-USDT'], atFixtureTime);

    expect(snapshot.fxRate.rate).toBeNull();
    expect(snapshot.fxQuote).toMatchObject({
      symbol: 'USDTKRW',
      price: null,
      quality: 'unavailable',
      priceKind: 'unavailable',
    });
  });

  it('KRW-USDT operational sanity bound 밖의 값은 clamp하지 않고 unavailable로 둔다', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify([{
        market: 'KRW-USDT',
        trade_price: 10_000,
        prev_closing_price: 9_900,
        signed_change_rate: 0.01,
        acc_trade_price_24h: 1_000_000,
        timestamp: 1788226800000,
      }]));

    const snapshot = await fetchBithumbSnapshot(
      fetcher,
      ['KRW-USDT'],
      atFixtureTime,
    );

    expect(snapshot.fxRate.rate).toBeNull();
    expect(snapshot.fxQuote).toMatchObject({
      price: null,
      quality: 'unavailable',
      priceKind: 'unavailable',
    });
  });

  it('유효하지 않은 provider timestamp는 가격을 unavailable로 두고 환율 입력에서 제외한다', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify([
        {
          market: 'KRW-BTC',
          trade_price: 149850000,
          prev_closing_price: 145770000,
          signed_change_rate: 0.028,
          acc_trade_price_24h: 184200000000,
          timestamp: 9e15,
        },
        {
          market: 'KRW-USDT',
          trade_price: 1380,
          prev_closing_price: 1378.62,
          signed_change_rate: 0.001,
          acc_trade_price_24h: 1000000,
          timestamp: 9e15,
        },
      ]));

    const snapshot = await fetchBithumbSnapshot(
      fetcher,
      ['KRW-BTC', 'KRW-USDT'],
      () => new Date('2026-09-01T10:00:00.000Z'),
    );

    expect(snapshot.fxRate.rate).toBeNull();
    expect(snapshot.fxQuote).toMatchObject({
      price: null,
      asOf: null,
      quality: 'unavailable',
    });
    expect(snapshot.quotes[0]).toMatchObject({
      price: null,
      asOf: null,
      quality: 'unavailable',
    });
  });

  it('정책보다 오래된 provider timestamp는 마지막 시각과 값을 stale로 유지한다', async () => {
    const timestamp = Date.parse('2026-09-01T09:54:59.000Z');
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify([
        {
          market: 'KRW-BTC',
          trade_price: 149850000,
          prev_closing_price: 145770000,
          signed_change_rate: 0.028,
          acc_trade_price_24h: 184200000000,
          timestamp,
        },
        {
          market: 'KRW-USDT',
          trade_price: 1380,
          prev_closing_price: 1378.62,
          signed_change_rate: 0.001,
          acc_trade_price_24h: 1000000,
          timestamp,
        },
      ]));

    const snapshot = await fetchBithumbSnapshot(
      fetcher,
      ['KRW-BTC', 'KRW-USDT'],
      () => new Date('2026-09-01T10:00:00.000Z'),
    );

    expect(snapshot.fxRate).toMatchObject({
      rate: 1380,
      asOf: '2026-09-01T09:54:59.000Z',
      freshness: 'stale',
    });
    expect(snapshot.fxQuote).toMatchObject({
      price: 1380,
      asOf: '2026-09-01T09:54:59.000Z',
      quality: 'stale',
    });
    expect(snapshot.quotes[0]).toMatchObject({
      price: 149850000,
      asOf: '2026-09-01T09:54:59.000Z',
      quality: 'stale',
    });
  });

  it('정상 epoch timestamp는 KST 보정 없이 원래 시각을 유지한다', async () => {
    const timestamp = Date.parse('2026-09-01T09:59:59.000Z');
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify([ticker('KRW-BTC', timestamp)]));

    const snapshot = await fetchBithumbSnapshot(
      fetcher,
      ['KRW-BTC'],
      () => new Date('2026-09-01T10:00:00.000Z'),
    );

    expect(snapshot.quotes[0]).toMatchObject({
      price: 149850000,
      asOf: '2026-09-01T09:59:59.000Z',
      quality: 'realtime',
    });
  });

  it('현재보다 정확히 9시간 앞선 live-style timestamp를 UTC epoch로 정규화한다', async () => {
    const normalizedTimestamp = Date.parse('2026-09-01T09:59:59.000Z');
    const rawTimestamp = normalizedTimestamp + 9 * 60 * 60 * 1_000;
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify([
        ticker('KRW-BTC', rawTimestamp),
        ticker('KRW-USDT', rawTimestamp),
      ]));

    const snapshot = await fetchBithumbSnapshot(
      fetcher,
      ['KRW-BTC', 'KRW-USDT'],
      () => new Date('2026-09-01T10:00:00.000Z'),
    );

    expect(snapshot.quotes[0]).toMatchObject({
      price: 149850000,
      asOf: '2026-09-01T09:59:59.000Z',
      quality: 'realtime',
    });
    expect(snapshot.fxRate).toMatchObject({
      rate: 1380,
      asOf: '2026-09-01T09:59:59.000Z',
      freshness: 'fresh',
    });
    expect(snapshot.fxQuote).toMatchObject({
      price: 1380,
      asOf: '2026-09-01T09:59:59.000Z',
      quality: 'estimated',
    });
  });

  it('KST 보정 후보도 미래이면 arbitrary future timestamp를 unavailable로 유지한다', async () => {
    const rawTimestamp = Date.parse('2026-09-01T22:00:00.000Z');
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify([ticker('KRW-BTC', rawTimestamp)]));

    const snapshot = await fetchBithumbSnapshot(
      fetcher,
      ['KRW-BTC'],
      () => new Date('2026-09-01T10:00:00.000Z'),
    );

    expect(snapshot.quotes[0]).toMatchObject({
      price: null,
      asOf: null,
      quality: 'unavailable',
    });
  });

  it('KST 보정 후 정책보다 오래된 timestamp는 정규화 시각을 stale로 유지한다', async () => {
    const normalizedTimestamp = Date.parse('2026-09-01T09:54:59.000Z');
    const rawTimestamp = normalizedTimestamp + 9 * 60 * 60 * 1_000;
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify([
        ticker('KRW-BTC', rawTimestamp),
        ticker('KRW-USDT', rawTimestamp),
      ]));

    const snapshot = await fetchBithumbSnapshot(
      fetcher,
      ['KRW-BTC', 'KRW-USDT'],
      () => new Date('2026-09-01T10:00:00.000Z'),
    );

    expect(snapshot.quotes[0]).toMatchObject({
      price: 149850000,
      asOf: '2026-09-01T09:54:59.000Z',
      quality: 'stale',
    });
    expect(snapshot.fxRate).toMatchObject({
      rate: 1380,
      asOf: '2026-09-01T09:54:59.000Z',
      freshness: 'stale',
    });
    expect(snapshot.fxQuote).toMatchObject({
      price: 1380,
      asOf: '2026-09-01T09:54:59.000Z',
      quality: 'stale',
    });
  });
});
