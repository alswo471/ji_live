import { describe, expect, it, vi } from 'vitest';
import { createCandleService } from '@/lib/market/candles';
import { fetchBinanceCandles } from '@/lib/market/providers/binance-candles';
import { fetchBithumbCandles } from '@/lib/market/providers/bithumb-candles';
import { INSTRUMENTS } from '@/lib/market/catalog';

const paxg = INSTRUMENTS.find((item) => item.symbol === 'PAXG')!;
const bitcoin = INSTRUMENTS.find((item) => item.symbol === 'BTC')!;
const tesla = INSTRUMENTS.find((item) => item.symbol === 'TSLA')!;

function bithumbCandle(minute: number) {
  const time = minute * 60_000;
  return {
    timestamp: time,
    candle_date_time_utc: new Date(time).toISOString().slice(0, 19),
    opening_price: 100,
    high_price: 110,
    low_price: 90,
    trade_price: 105,
    candle_acc_trade_volume: 10,
  };
}

describe('candle provider adapters', () => {
  it.each([
    ['1m', '1m'],
    ['15m', '15m'],
    ['1h', '1h'],
    ['4h', '4h'],
    ['1d', '1d'],
    ['1w', '1w'],
    ['1M', '1M'],
  ] as const)(
    'Binance %s 요청을 native %s 봉으로 전달한다',
    async (selected, native) => {
      const fetcher = vi.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify([
              [
                1788226800000,
                '3470',
                '3480',
                '3460',
                '3475',
                '125.5',
                1788226859999,
              ],
            ]),
            { status: 200 },
          ),
      );

      await expect(
        fetchBinanceCandles(paxg, selected, fetcher),
      ).resolves.toEqual([
        {
          time: 1788226800,
          open: 3470,
          high: 3480,
          low: 3460,
          close: 3475,
          volume: 125.5,
        },
      ]);
      expect(fetcher.mock.calls[0][0]).toContain(`interval=${native}`);
    },
  );

  it('Binance 선물 종목은 futures klines endpoint를 사용한다', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify([
            [1788226800000, '360', '370', '355', '366', '100', 1788226859999],
          ]),
          { status: 200 },
        ),
    );

    await fetchBinanceCandles(tesla, '15m', fetcher);

    expect(fetcher.mock.calls[0][0]).toContain(
      'https://fapi.binance.com/fapi/v1/klines',
    );
  });

  it.each([
    ['1m', '/minutes/1'],
    ['15m', '/minutes/15'],
    ['1h', '/minutes/60'],
    ['4h', '/minutes/240'],
    ['1d', '/days'],
    ['1w', '/weeks'],
    ['1M', '/months'],
  ] as const)(
    'Bithumb %s 요청을 %s endpoint로 전달한다',
    async (selected, path) => {
      const fetcher = vi.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify([
              {
                timestamp: 1788226860000,
                opening_price: 150,
                high_price: 160,
                low_price: 145,
                trade_price: 155,
                candle_acc_trade_volume: 9,
              },
              {
                timestamp: 1788226800000,
                opening_price: 140,
                high_price: 151,
                low_price: 135,
                trade_price: 150,
                candle_acc_trade_volume: 7,
              },
            ]),
            { status: 200 },
          ),
      );

      const candles = await fetchBithumbCandles(bitcoin, selected, fetcher);

      expect(candles.map((candle) => candle.time)).toEqual([
        1788226800, 1788226860,
      ]);
      expect(fetcher.mock.calls[0][0]).toContain(path);
    },
  );

  it('Bithumb candle 시작 시각을 마지막 체결 timestamp보다 우선한다', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([
      {
        timestamp: 1788313981000,
        candle_date_time_utc: '2026-09-02T01:53:00',
        opening_price: 1380,
        high_price: 1381,
        low_price: 1380,
        trade_price: 1381,
        candle_acc_trade_volume: 31.197,
      },
    ]), { status: 200 }));

    const candles = await fetchBithumbCandles(bitcoin, '1m', fetcher);

    expect(candles[0].time).toBe(1788313980);
  });

  it('보조지표가 없으면 1분봉 화면 수량만 한 번 요청한다', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([
      bithumbCandle(1),
    ]), { status: 200 }));

    await fetchBithumbCandles(bitcoin, '1m', fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toEqual(expect.stringContaining('count=120'));
  });

});

describe('createCandleService', () => {
  it('한국 파생 candle과 시점별 환율 candle을 원화 추정 이력으로 합성한다', async () => {
    const loadHyperliquid = vi.fn(async () => [
      { time: 100, open: 60, high: 61, low: 59, close: 60.5, volume: 1_000 },
    ]);
    const loadFx = vi.fn(async () => [
      { time: 100, open: 1_380, high: 1_382, low: 1_368, close: 1_381, volume: 10 },
    ]);
    const service = createCandleService({
      loaders: { hyperliquid: loadHyperliquid },
      fxLoader: loadFx,
    });

    await expect(service.getCandles('005930', '1m')).resolves.toMatchObject({
      candles: [{ time: 100, close: 83_551, volume: 1_000 }],
      unavailable: false,
      priceKind: 'derived-estimate',
      volumeKind: 'derivative-contracts',
      sourceLabel: 'Hyperliquid 파생상품 × Bithumb KRW-USDT',
      estimateInputs: ['xyz:SMSN', 'KRW-USDT'],
    });
    expect(loadHyperliquid).toHaveBeenCalledTimes(1);
    expect(loadFx).toHaveBeenCalledTimes(1);
  });

  it('한국 파생 또는 환율 candle이 비면 숫자를 만들지 않는다', async () => {
    const service = createCandleService({
      loaders: { hyperliquid: vi.fn(async () => []) },
      fxLoader: vi.fn(async () => [
        { time: 100, open: 1_380, high: 1_382, low: 1_368, close: 1_381, volume: 10 },
      ]),
    });

    await expect(service.getCandles('005930', '1m')).resolves.toMatchObject({
      candles: [],
      unavailable: true,
      message: '원화 추정 차트 입력을 잠시 불러오지 못했습니다.',
    });
  });

  it('동일한 분봉 요청을 병합하고 60초 동안 재사용한다', async () => {
    let now = 0;
    const loadBithumb = vi.fn(async () => [
      { time: 1, open: 100, high: 110, low: 90, close: 105, volume: 10 },
    ]);
    const service = createCandleService({
      loaders: { bithumb: loadBithumb },
      now: () => now,
    });

    const [first, second] = await Promise.all([
      service.getCandles('BTC', '1m'),
      service.getCandles('BTC', '1m'),
    ]);
    now = 59_999;
    const cached = await service.getCandles('BTC', '1m');

    expect(first).toEqual({ candles: second.candles, unavailable: false });
    expect(cached).toEqual(first);
    expect(loadBithumb).toHaveBeenCalledTimes(1);
  });

  it('공급자 오류를 상세 화면이 유지할 수 있는 응답으로 변환한다', async () => {
    const service = createCandleService({
      loaders: {
        bithumb: vi.fn(async () => {
          throw new Error('429');
        }),
      },
    });

    await expect(service.getCandles('BTC', '1w')).resolves.toEqual({
      candles: [],
      unavailable: true,
      message: '차트 데이터를 잠시 불러오지 못했습니다.',
    });
  });

  it('빈 공급자 응답은 긴 interval cache에 저장하지 않는다', async () => {
    const loadBithumb = vi.fn(async () => []);
    const service = createCandleService({
      loaders: { bithumb: loadBithumb },
    });

    await service.getCandles('BTC', '1M');
    await service.getCandles('BTC', '1M');

    expect(loadBithumb).toHaveBeenCalledTimes(2);
  });

  it('등록되지 않은 공급자는 명시적 미지원 응답을 반환한다', async () => {
    const service = createCandleService({ loaders: {} });

    await expect(service.getCandles('PAXG', '1d')).resolves.toEqual({
      candles: [],
      unavailable: true,
      message: '차트 데이터를 제공하지 않는 종목입니다.',
    });
  });
});
