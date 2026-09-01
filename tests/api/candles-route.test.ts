import { describe, expect, it } from 'vitest';
import { handleCandleRequest } from '@/app/api/market/[symbol]/candles/route';

describe('candle route', () => {
  it('지원하지 않는 기간은 400을 반환한다', async () => {
    const response = await handleCandleRequest(
      new Request('http://localhost/api/market/005930/candles?interval=1y'),
      '005930',
      async () => ({ candles: [], unavailable: false }),
    );

    expect(response.status).toBe(400);
  });

  it('카탈로그에 없는 종목은 404를 반환한다', async () => {
    const response = await handleCandleRequest(
      new Request('http://localhost/api/market/UNKNOWN/candles?interval=1d'),
      'UNKNOWN',
      async () => ({ candles: [], unavailable: false }),
    );

    expect(response.status).toBe(404);
  });

  it('유효한 요청은 candle service 결과를 공개 cache header와 반환한다', async () => {
    const response = await handleCandleRequest(
      new Request('http://localhost/api/market/005930/candles?interval=1m'),
      '005930',
      async () => ({ candles: [{ time: 1, open: 1, high: 2, low: 1, close: 2, volume: 3 }], unavailable: false }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=60');
    await expect(response.json()).resolves.toMatchObject({ unavailable: false, candles: [{ close: 2 }] });
  });

  it.each(['1m', '15m', '1h', '4h', '1d', '1w', '1M'])('%s 봉 요청을 허용한다', async (interval) => {
    let received = '';
    const response = await handleCandleRequest(
      new Request(`http://localhost/api/market/005930/candles?interval=${interval}`),
      '005930',
      async (_symbol, selectedInterval) => {
        received = selectedInterval;
        return { candles: [], unavailable: false };
      },
    );

    expect(response.status).toBe(200);
    expect(received).toBe(interval);
  });

  it('일시적으로 사용할 수 없는 응답은 공개 cache에 저장하지 않는다', async () => {
    const response = await handleCandleRequest(
      new Request('http://localhost/api/market/005930/candles?interval=1M'),
      '005930',
      async () => ({ candles: [], unavailable: true, message: '일시적인 오류' }),
    );

    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
