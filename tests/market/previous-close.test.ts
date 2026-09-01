import { describe, expect, it } from 'vitest';
import { calculateChangeRate, selectPreviousClose } from '@/lib/market/previous-close';

describe('previous close fallback', () => {
  it('현재가와 전일 종가로 실제 등락률을 계산한다', () => {
    expect(calculateChangeRate(213750, 219500)).toBeCloseTo(-0.0262, 4);
    expect(calculateChangeRate(1505000, 1504000)).toBeCloseTo(0.0007, 4);
  });

  it('현재가 시각과 같은 일봉 다음의 종가를 전일 종가로 선택한다', () => {
    const candles = [
      { timestamp: '2026-09-01T00:00:00.000+09:00', closePrice: '213750' },
      { timestamp: '2026-08-31T00:00:00.000+09:00', closePrice: '219500' },
    ];

    expect(selectPreviousClose(candles, '2026-09-01T12:45:38.000+09:00')).toBe(219500);
  });
});
