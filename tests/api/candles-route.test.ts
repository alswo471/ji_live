import { describe, expect, it } from 'vitest';
import { handleCandleRequest } from '@/app/api/market/[symbol]/candles/route';

describe('candle route', () => {
  it('지원하지 않는 기간은 400을 반환한다', async () => {
    const response = await handleCandleRequest(
      new Request('http://localhost/api/market/005930/candles?range=1y'),
      '005930',
      async () => ({ candles: [], unavailable: false }),
    );

    expect(response.status).toBe(400);
  });

  it('카탈로그에 없는 종목은 404를 반환한다', async () => {
    const response = await handleCandleRequest(
      new Request('http://localhost/api/market/UNKNOWN/candles?range=1d'),
      'UNKNOWN',
      async () => ({ candles: [], unavailable: false }),
    );

    expect(response.status).toBe(404);
  });

  it('유효한 요청은 candle service 결과를 공개 cache header와 반환한다', async () => {
    const response = await handleCandleRequest(
      new Request('http://localhost/api/market/005930/candles?range=1d'),
      '005930',
      async () => ({ candles: [{ time: 1, open: 1, high: 2, low: 1, close: 2, volume: 3 }], unavailable: false }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=60');
    await expect(response.json()).resolves.toMatchObject({ unavailable: false, candles: [{ close: 2 }] });
  });
});
