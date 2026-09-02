import { describe, expect, it, vi } from 'vitest';
import { INSTRUMENTS } from '@/lib/market/catalog';
import { fetchHyperliquidCandles } from '@/lib/market/providers/hyperliquid-candles';
import { getCandleViewport } from '@/lib/market/candle-intervals';

const samsung = INSTRUMENTS.find((item) => item.symbol === '005930')!;

describe('fetchHyperliquidCandles', () => {
  it('HIP-3 종목의 candleSnapshot을 공통 OHLCV로 정규화한다', async () => {
    const now = 1_788_226_900_000;
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([
      { t: 1_788_226_800_000, o: '60', h: '61', l: '59', c: '60.5', v: '1200' },
      { t: 1_788_226_700_000, o: '0', h: '61', l: '59', c: '60', v: '1' },
    ]), { status: 200 }));

    const candles = await fetchHyperliquidCandles(
      samsung,
      '15m',
      fetcher,
      () => now,
    );

    expect(candles).toEqual([{
      time: 1_788_226_800,
      open: 60,
      high: 61,
      low: 59,
      close: 60.5,
      volume: 1200,
    }]);
    const rawBody = fetcher.mock.calls[0][1]?.body;
    expect(typeof rawBody).toBe('string');
    if (typeof rawBody !== 'string') throw new Error('request body가 문자열이 아닙니다.');
    const body = JSON.parse(rawBody);
    expect(body).toMatchObject({
      type: 'candleSnapshot',
      req: {
        coin: 'xyz:SMSN',
        interval: '15m',
        endTime: now,
      },
    });
    expect(body.req.startTime).toBe(now - getCandleViewport('15m').visibleSeconds * 1_000);
  });

  it('HTTP 오류를 공급자 상태가 포함된 오류로 변환한다', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, {
      status: 429,
      headers: { 'Retry-After': '3' },
    }));

    await expect(
      fetchHyperliquidCandles(samsung, '1m', fetcher, () => 1_000),
    ).rejects.toMatchObject({ status: 429, retryAfterMs: 3_000 });
  });
});
