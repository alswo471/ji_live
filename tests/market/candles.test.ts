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
  it('Toss 분봉을 최대 세 페이지까지 읽고 잘못된 봉을 제외한 뒤 시간순으로 정렬한다', async () => {
    const pages = [
      { result: { candles: [
        { timestamp: '2026-09-01T09:02:00+09:00', openPrice: '102', highPrice: '104', lowPrice: '101', closePrice: '103', volume: '20' },
        { timestamp: '2026-09-01T09:01:00+09:00', openPrice: '101', highPrice: '103', lowPrice: '100', closePrice: 'invalid', volume: '10' },
      ], nextBefore: 'page-2' } },
      { result: { candles: [
        { timestamp: '2026-09-01T09:00:00+09:00', openPrice: '100', highPrice: '102', lowPrice: '99', closePrice: '101', volume: '15' },
      ], nextBefore: 'page-3' } },
      { result: { candles: [
        { timestamp: '2026-09-01T08:59:00+09:00', openPrice: '99', highPrice: '101', lowPrice: '98', closePrice: '100', volume: '12' },
      ], nextBefore: 'page-4' } },
    ];
    let index = 0;
    const request = vi.fn(async () => pages[index++]);

    const candles = await fetchTossCandles(samsung, '1d', request);

    expect(candles.map((candle) => candle.close)).toEqual([100, 101, 103]);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('Binance kline 배열을 공통 캔들 형식으로 변환한다', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify([
      [1788226800000, '3470', '3480', '3460', '3475', '125.5', 1788226859999],
    ]), { status: 200 });

    await expect(fetchBinanceCandles(paxg, '1d', fetcher)).resolves.toEqual([
      { time: 1788226800, open: 3470, high: 3480, low: 3460, close: 3475, volume: 125.5 },
    ]);
  });

  it('Bithumb 최신순 응답을 시간 오름차순으로 변환한다', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify([
      { timestamp: 1788226860000, opening_price: 150, high_price: 160, low_price: 145, trade_price: 155, candle_acc_trade_volume: 9 },
      { timestamp: 1788226800000, opening_price: 140, high_price: 151, low_price: 135, trade_price: 150, candle_acc_trade_volume: 7 },
    ]), { status: 200 });

    const candles = await fetchBithumbCandles(bitcoin, '1d', fetcher);

    expect(candles.map((candle) => candle.time)).toEqual([1788226800, 1788226860]);
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
      service.getCandles('005930', '1d'),
      service.getCandles('005930', '1d'),
    ]);
    now = 59_999;
    const cached = await service.getCandles('005930', '1d');

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
});
