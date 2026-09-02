import { describe, expect, it } from 'vitest';
import { aggregateCandles, CANDLE_INTERVALS, formatCandleTime, getCandleViewport } from '@/lib/market/candle-intervals';

describe('candle intervals', () => {
  it('증권 화면에서 사용할 7개 봉 단위를 순서대로 제공한다', () => {
    expect(CANDLE_INTERVALS).toEqual(['1m', '15m', '1h', '4h', '1d', '1w', '1M']);
  });

  it('1분봉을 15분봉 OHLCV로 합산한다', () => {
    const start = Date.parse('2026-09-01T09:00:00+09:00') / 1_000;
    const candles = Array.from({ length: 16 }, (_, index) => ({
      time: start + index * 60,
      open: 100 + index,
      high: 102 + index,
      low: 99 + index,
      close: 101 + index,
      volume: 10 + index,
    }));

    expect(aggregateCandles(candles, '15m', 'Asia/Seoul')).toEqual([
      { time: start, open: 100, high: 116, low: 99, close: 115, volume: 255 },
      { time: start + 15 * 60, open: 115, high: 117, low: 114, close: 116, volume: 25 },
    ]);
  });

  it('일봉을 거래소 현지 달 기준 월봉으로 합산한다', () => {
    const candles = [
      { time: Date.parse('2026-08-31T09:00:00+09:00') / 1_000, open: 90, high: 110, low: 80, close: 100, volume: 10 },
      { time: Date.parse('2026-09-01T09:00:00+09:00') / 1_000, open: 100, high: 120, low: 95, close: 115, volume: 20 },
      { time: Date.parse('2026-09-30T09:00:00+09:00') / 1_000, open: 115, high: 130, low: 105, close: 125, volume: 30 },
    ];

    expect(aggregateCandles(candles, '1M', 'Asia/Seoul')).toEqual([
      candles[0],
      { time: candles[1].time, open: 100, high: 130, low: 95, close: 125, volume: 50 },
    ]);
  });

  it('4시간봉을 미국 현지 시각과 DST 기준으로 묶는다', () => {
    const candles = [
      { time: Date.parse('2026-01-02T00:00:00-05:00') / 1_000, open: 100, high: 102, low: 99, close: 101, volume: 10 },
      { time: Date.parse('2026-01-02T03:59:00-05:00') / 1_000, open: 101, high: 104, low: 100, close: 103, volume: 20 },
    ];

    expect(aggregateCandles(candles, '4h', 'America/New_York')).toEqual([
      { time: candles[0].time, open: 100, high: 104, low: 99, close: 103, volume: 30 },
    ]);
  });

  it('각 봉 단위의 승인된 초기 표시 범위를 반환한다', () => {
    expect(getCandleViewport('1m')).toMatchObject({ label: '1분', visibleSeconds: 2 * 60 * 60 });
    expect(getCandleViewport('15m')).toMatchObject({ label: '15분', visibleSeconds: 24 * 60 * 60 });
    expect(getCandleViewport('1h')).toMatchObject({ label: '1시간', visibleSeconds: 5 * 24 * 60 * 60 });
    expect(getCandleViewport('4h')).toMatchObject({ label: '4시간', visibleSeconds: 31 * 24 * 60 * 60 });
    expect(getCandleViewport('1d')).toMatchObject({ label: '일봉', visibleSeconds: 183 * 24 * 60 * 60 });
    expect(getCandleViewport('1w')).toMatchObject({ label: '주봉', visibleSeconds: 2 * 365 * 24 * 60 * 60 });
    expect(getCandleViewport('1M')).toMatchObject({ label: '월봉', visibleSeconds: 10 * 365 * 24 * 60 * 60 });
  });

  it('봉 단위에 맞게 하단 시간축 형식을 바꾼다', () => {
    const time = Date.parse('2026-09-01T09:05:00+09:00') / 1_000;
    expect(formatCandleTime(time, '1m')).toBe('09.01 09:05');
    expect(formatCandleTime(time, '15m')).toBe('09.01 09:05');
    expect(formatCandleTime(time, '1d')).toBe('09.01');
    expect(formatCandleTime(time, '1w')).toBe('26.09');
    expect(formatCandleTime(time, '1M')).toBe('2026');
  });
});
