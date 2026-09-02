import { describe, expect, it } from 'vitest';
import {
  findCandleExtrema,
  formatChartAxisTick,
  formatChartCrosshairTime,
} from '@/lib/market/chart-indicators';
import type { CandlePoint } from '@/lib/market/types';

const candles: CandlePoint[] = [
  { time: 1, open: 9, high: 11, low: 8, close: 10, volume: 100 },
  { time: 2, open: 10, high: 13, low: 9, close: 12, volume: 110 },
  { time: 3, open: 12, high: 15, low: 11, close: 14, volume: 120 },
  { time: 4, open: 14, high: 16, low: 12, close: 16, volume: 130 },
];

describe('chart indicators', () => {
  it('불러온 구간에서 고가와 저가가 발생한 캔들을 찾는다', () => {
    expect(findCandleExtrema(candles)).toEqual({
      high: { time: 4, price: 16 },
      low: { time: 1, price: 8 },
    });
  });

  it('분봉은 날짜 경계에는 날짜를, 같은 날에는 시간만 표시한다', () => {
    const time = Date.parse('2026-09-02T10:15:00+09:00') / 1_000;
    expect(formatChartAxisTick(time, '1m', 'day')).toBe('9월 2일');
    expect(formatChartAxisTick(time, '1m', 'time')).toBe('10:15');
    expect(formatChartCrosshairTime(time, '1m')).toBe('2026. 9. 2. 10:15');
  });

  it('일봉·주봉·월봉은 주기에 맞는 날짜 단위를 표시한다', () => {
    const time = Date.parse('2026-09-09T09:00:00+09:00') / 1_000;
    expect(formatChartAxisTick(time, '1d', 'day')).toBe('9월 9일');
    expect(formatChartAxisTick(time, '1w', 'day')).toBe('9월 2주');
    expect(formatChartAxisTick(time, '1M', 'month')).toBe('2026년 9월');
  });
});
