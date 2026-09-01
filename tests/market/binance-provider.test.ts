import { describe, expect, it } from 'vitest';
import { fetchBinanceQuotes } from '@/lib/market/providers/binance';

describe('fetchBinanceQuotes', () => {
  it('글로벌 코인과 PAXG 실제 거래값을 공통 시세로 변환한다', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify([
      { symbol: 'BTCUSDT', lastPrice: '108450.25', priceChangePercent: '2.50', quoteVolume: '1200000000', closeTime: 1788226800000 },
      { symbol: 'PAXGUSDT', lastPrice: '3472.18', priceChangePercent: '0.31', quoteVolume: '14000000', closeTime: 1788226800000 },
    ]), { status: 200 });

    const quotes = await fetchBinanceQuotes(fetcher, ['BTCUSDT', 'PAXGUSDT']);

    expect(quotes.find((quote) => quote.symbol === 'BTC')).toMatchObject({ price: 108450.25, changeRate: 0.025, currency: 'USD', session: 'always-open', provider: 'binance' });
    expect(quotes.find((quote) => quote.symbol === 'PAXG')).toMatchObject({ name: '금 연동(PAXG)', assetClass: 'metal', price: 3472.18, quality: 'realtime' });
  });

  it('한 종목의 잘못된 가격이 다른 정상 종목을 제거하지 않는다', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify([
      { symbol: 'BTCUSDT', lastPrice: 'invalid', priceChangePercent: '2.50', quoteVolume: '1200', closeTime: 1788226800000 },
      { symbol: 'PAXGUSDT', lastPrice: '3472.18', priceChangePercent: '0.31', quoteVolume: '1400', closeTime: 1788226800000 },
    ]), { status: 200 });

    const quotes = await fetchBinanceQuotes(fetcher, ['BTCUSDT', 'PAXGUSDT']);

    expect(quotes.find((quote) => quote.symbol === 'BTC')?.quality).toBe('unavailable');
    expect(quotes.find((quote) => quote.symbol === 'PAXG')?.price).toBe(3472.18);
  });
});
