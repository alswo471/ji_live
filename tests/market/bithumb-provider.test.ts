import { describe, expect, it } from 'vitest';
import { fetchBithumbQuotes } from '@/lib/market/providers/bithumb';

describe('fetchBithumbQuotes', () => {
  it('원화 코인 실제 거래값을 공통 시세로 변환한다', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify([
      { market: 'KRW-BTC', trade_price: 149850000, signed_change_rate: 0.028, acc_trade_price_24h: 184200000000, timestamp: 1788226800000 },
      { market: 'KRW-ETH', trade_price: 6125000, signed_change_rate: -0.0061, acc_trade_price_24h: 92000000000, timestamp: 1788226800000 },
    ]), { status: 200 });

    const quotes = await fetchBithumbQuotes(fetcher, ['KRW-BTC', 'KRW-ETH']);

    expect(quotes.find((quote) => quote.symbol === 'BTC')).toMatchObject({ price: 149850000, changeRate: 0.028, currency: 'KRW', provider: 'bithumb' });
    expect(quotes.find((quote) => quote.symbol === 'ETH')).toMatchObject({ price: 6125000, changeRate: -0.0061, session: 'always-open' });
  });
});
