import { describe, expect, it, vi } from 'vitest';
import { createCandleService } from '@/lib/market/candles';
import { fetchBinanceCandles } from '@/lib/market/providers/binance-candles';
import { fetchBithumbCandles } from '@/lib/market/providers/bithumb-candles';
import { fetchTossCandles } from '@/lib/market/providers/toss-candles';
import { INSTRUMENTS } from '@/lib/market/catalog';

const samsung = INSTRUMENTS.find((item) => item.symbol === '005930')!;
const paxg = INSTRUMENTS.find((item) => item.symbol === 'PAXG')!;
const bitcoin = INSTRUMENTS.find((item) => item.symbol === 'BTC')!;

describe('candle provider adapters', () => {
  it('Toss 1분봉을 읽어 15분봉으로 합산한다', async () => {
    const start = Date.parse('2026-09-01T09:00:00+09:00');
    const request = vi.fn(async () => ({ result: {
      candles: Array.from({ length: 16 }, (_, index) => ({
        timestamp: new Date(start + index * 60_000).toISOString(),
        openPrice: String(100 + index),
        highPrice: String(102 + index),
        lowPrice: String(99 + index),
        closePrice: String(101 + index),
        volume: String(10 + index),
      })).reverse(),
      nextBefore: null,
    } }));

    const candles = await fetchTossCandles(samsung, '15m', request);

    expect(candles).toHaveLength(2);
    expect(candles[0]).toMatchObject({ open: 100, high: 116, low: 99, close: 115, volume: 255 });
    expect(request).toHaveBeenCalledWith(expect.stringContaining('interval=1m'), expect.any(AbortSignal));
  });

  it('KOSPI는 Toss 시장 지표 candle endpoint를 사용한다', async () => {
    const kospi = INSTRUMENTS.find((item) => item.symbol === 'KOSPI')!;
    const request = vi.fn(async () => ({ result: { candles: [], nextBefore: null } }));

    await fetchTossCandles(kospi, '1d', request);

    expect(request).toHaveBeenCalledWith(expect.stringContaining('/api/v1/market-indicators/KOSPI/candles?'), expect.any(AbortSignal));
  });

  it('Toss candle cursor를 다음 페이지에 전달하고 중복·잘못된 봉을 제거한다', async () => {
    const pages = [
      { result: { candles: [
        { timestamp: '2026-09-01T09:01:00+09:00', openPrice: '101', highPrice: '103', lowPrice: '100', closePrice: '102', volume: '10' },
        { timestamp: '2026-09-01T09:00:00+09:00', openPrice: '100', highPrice: '102', lowPrice: '99', closePrice: 'invalid', volume: '10' },
      ], nextBefore: '2026-09-01T09:00:00+09:00' } },
      { result: { candles: [
        { timestamp: '2026-09-01T09:01:00+09:00', openPrice: '101', highPrice: '103', lowPrice: '100', closePrice: '102', volume: '10' },
        { timestamp: '2026-09-01T09:00:00+09:00', openPrice: '99', highPrice: '101', lowPrice: '98', closePrice: '100', volume: '12' },
      ], nextBefore: null } },
    ];
    const request = vi.fn(async (_path: string) => pages.shift());

    const candles = await fetchTossCandles(samsung, '1h', request);

    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toContain('before=2026-09-01T09%3A00%3A00%2B09%3A00');
    expect(candles).toEqual([{ time: Date.parse('2026-09-01T09:00:00+09:00') / 1_000, open: 99, high: 103, low: 98, close: 102, volume: 22 }]);
  });

  it.each([
    ['1m', '1m'], ['15m', '15m'], ['1h', '1h'], ['4h', '4h'], ['1d', '1d'], ['1w', '1w'], ['1M', '1M'],
  ] as const)('Binance %s 요청을 native %s 봉으로 전달한다', async (selected, native) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([
      [1788226800000, '3470', '3480', '3460', '3475', '125.5', 1788226859999],
    ]), { status: 200 }));

    await expect(fetchBinanceCandles(paxg, selected, fetcher)).resolves.toEqual([
      { time: 1788226800, open: 3470, high: 3480, low: 3460, close: 3475, volume: 125.5 },
    ]);
    expect(fetcher.mock.calls[0][0]).toContain(`interval=${native}`);
  });

  it.each([
    ['1m', '/minutes/1'], ['15m', '/minutes/15'], ['1h', '/minutes/60'], ['4h', '/minutes/240'],
    ['1d', '/days'], ['1w', '/weeks'], ['1M', '/months'],
  ] as const)('Bithumb %s 요청을 %s endpoint로 전달한다', async (selected, path) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([
      { timestamp: 1788226860000, opening_price: 150, high_price: 160, low_price: 145, trade_price: 155, candle_acc_trade_volume: 9 },
      { timestamp: 1788226800000, opening_price: 140, high_price: 151, low_price: 135, trade_price: 150, candle_acc_trade_volume: 7 },
    ]), { status: 200 }));

    const candles = await fetchBithumbCandles(bitcoin, selected, fetcher);

    expect(candles.map((candle) => candle.time)).toEqual([1788226800, 1788226860]);
    expect(fetcher.mock.calls[0][0]).toContain(path);
  });
});

describe('createCandleService', () => {
  it('동일한 분봉 요청을 병합하고 60초 동안 재사용한다', async () => {
    let now = 0;
    const loadToss = vi.fn(async () => [
      { time: 1, open: 100, high: 110, low: 90, close: 105, volume: 10 },
    ]);
    const service = createCandleService({
      loaders: { toss: loadToss, binance: vi.fn(), bithumb: vi.fn() },
      now: () => now,
    });

    const [first, second] = await Promise.all([
      service.getCandles('005930', '1m'),
      service.getCandles('005930', '1m'),
    ]);
    now = 59_999;
    const cached = await service.getCandles('005930', '1m');

    expect(first).toEqual({ candles: second.candles, unavailable: false });
    expect(cached).toEqual(first);
    expect(loadToss).toHaveBeenCalledTimes(1);
  });

  it('공급자 오류를 상세 화면이 유지할 수 있는 응답으로 변환한다', async () => {
    const service = createCandleService({
      loaders: {
        toss: vi.fn(async () => { throw new Error('429'); }),
        binance: vi.fn(),
        bithumb: vi.fn(),
      },
    });

    await expect(service.getCandles('005930', '1w')).resolves.toEqual({
      candles: [],
      unavailable: true,
      message: '차트 데이터를 잠시 불러오지 못했습니다.',
    });
  });

  it('빈 공급자 응답은 긴 interval cache에 저장하지 않는다', async () => {
    const loadToss = vi.fn(async () => []);
    const service = createCandleService({
      loaders: { toss: loadToss, binance: vi.fn(), bithumb: vi.fn() },
    });

    await service.getCandles('005930', '1M');
    await service.getCandles('005930', '1M');

    expect(loadToss).toHaveBeenCalledTimes(2);
  });

  it('Toss candle 요청은 전체 시간 제한을 넘기면 중단한다', async () => {
    vi.useFakeTimers();
    const request = vi.fn((_path: string, signal: AbortSignal) => new Promise<unknown>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));

    const pending = fetchTossCandles(samsung, '1m', request);
    const rejection = expect(pending).rejects.toThrow('시간 제한');
    await vi.advanceTimersByTimeAsync(10_000);

    await rejection;
    expect(request.mock.calls[0][1].aborted).toBe(true);
    vi.useRealTimers();
  });

  it('중복 제거 뒤 목표 봉이 부족하면 불완전한 Toss 응답으로 처리한다', async () => {
    const duplicate = {
      timestamp: '2026-09-01T09:00:00+09:00',
      openPrice: '100', highPrice: '101', lowPrice: '99', closePrice: '100', volume: '10',
    };
    const request = vi.fn(async () => ({
      result: { candles: Array.from({ length: 120 }, () => duplicate), nextBefore: 'next-page' },
    }));

    await expect(fetchTossCandles(samsung, '1m', request)).rejects.toThrow('전체 조회');
  });
});
