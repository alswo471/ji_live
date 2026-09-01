import { describe, expect, it } from 'vitest';
import { fetchTossMarketSnapshot, type TossRequester } from '@/lib/market/providers/toss';

describe('fetchTossMarketSnapshot', () => {
  it('주식·KOSPI·환율을 공통 시세와 현재 세션으로 변환한다', async () => {
    const request: TossRequester = async (path) => {
      if (path.startsWith('/api/v1/prices')) return { result: [
        { symbol: '005930', timestamp: '2026-09-01T10:00:00+09:00', lastPrice: '84200', currency: 'KRW' },
        { symbol: 'QQQ', timestamp: '2026-09-01T10:00:00+09:00', lastPrice: '612.84', currency: 'USD' },
      ] };
      if (path.includes('market-indicators/prices')) return { result: [{ symbol: 'KOSPI', timestamp: '2026-09-01T10:00:00+09:00', lastPrice: '2714.08' }] };
      if (path.startsWith('/api/v1/exchange-rate')) return { result: { rate: '1381.2', validFrom: '2026-09-01T10:00:00+09:00' } };
      if (path === '/api/v1/market-calendar/KR') return { result: { today: { integrated: {
        preMarket: { startTime: '2026-09-01T08:00:00+09:00', endTime: '2026-09-01T09:00:00+09:00' },
        regularMarket: { startTime: '2026-09-01T09:00:00+09:00', endTime: '2026-09-01T15:30:00+09:00' },
        afterMarket: { startTime: '2026-09-01T15:30:00+09:00', endTime: '2026-09-01T20:00:00+09:00' },
      } } } };
      if (path === '/api/v1/market-calendar/US') return { result: { today: {
        dayMarket: { startTime: '2026-09-01T09:00:00+09:00', endTime: '2026-09-01T16:50:00+09:00' },
        preMarket: { startTime: '2026-09-01T17:00:00+09:00', endTime: '2026-09-01T22:30:00+09:00' },
        regularMarket: { startTime: '2026-09-01T22:30:00+09:00', endTime: '2026-09-02T05:00:00+09:00' },
        afterMarket: { startTime: '2026-09-02T05:00:00+09:00', endTime: '2026-09-02T07:00:00+09:00' },
      } } };
      if (path.includes('/api/v1/rankings')) return { result: { rankings: [{ symbol: '005930', price: { changeRate: '0.0145' }, tradingAmount: '184200000000' }] } };
      throw new Error(`예상하지 않은 요청: ${path}`);
    };

    const quotes = await fetchTossMarketSnapshot(new Date('2026-09-01T10:00:00+09:00'), request);

    expect(quotes.find((quote) => quote.symbol === '005930')).toMatchObject({ price: 84200, changeRate: 0.0145, session: 'regular', quality: 'realtime' });
    expect(quotes.find((quote) => quote.symbol === 'QQQ')).toMatchObject({ name: 'NASDAQ 100 연동(QQQ)', price: 612.84, session: 'day' });
    expect(quotes.find((quote) => quote.symbol === 'KOSPI')).toMatchObject({ price: 2714.08, session: 'regular' });
    expect(quotes.find((quote) => quote.symbol === 'USDKRW')).toMatchObject({ price: 1381.2, quality: 'realtime' });
  });

  it('랭킹 밖 종목은 전일 종가로 실제 등락률을 계산한다', async () => {
    const request: TossRequester = async (path) => {
      if (path.startsWith('/api/v1/prices')) return { result: [
        { symbol: '042700', timestamp: '2026-09-01T12:45:38+09:00', lastPrice: '213750', currency: 'KRW' },
      ] };
      if (path.includes('/api/v1/rankings')) return { result: { rankings: [] } };
      if (path.includes('market-indicators/prices')) return { result: [] };
      if (path.startsWith('/api/v1/exchange-rate')) return { result: { rate: '1381.2', validFrom: '2026-09-01T10:00:00+09:00' } };
      if (path === '/api/v1/market-calendar/KR') return { result: { today: { integrated: {
        preMarket: null,
        regularMarket: { startTime: '2026-09-01T09:00:00+09:00', endTime: '2026-09-01T15:30:00+09:00' },
        afterMarket: null,
      } } } };
      if (path === '/api/v1/market-calendar/US') return { result: { today: { dayMarket: null, preMarket: null, regularMarket: null, afterMarket: null } } };
      throw new Error(`예상하지 않은 요청: ${path}`);
    };
    const loadPreviousCloses = async () => new Map([['042700', 219500]]);

    const quotes = await fetchTossMarketSnapshot(new Date('2026-09-01T12:45:38+09:00'), request, loadPreviousCloses);

    expect(quotes.find((quote) => quote.symbol === '042700')).toMatchObject({
      price: 213750,
      previousClose: 219500,
      changeRate: expect.closeTo(-0.0262, 4),
      changeRateSource: 'previous-close',
    });
  });
});
