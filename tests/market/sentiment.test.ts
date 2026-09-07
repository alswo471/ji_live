import { describe, expect, it } from 'vitest';
import { parseSentiment } from '@/lib/market/sentiment';

describe('비트코인 심리지수 공급자 경계', () => {
  const payload = (value: unknown, timestamp: unknown = '1788739200') => ({
    data: [{ value, timestamp, value_classification: 'Fear' }],
    metadata: { error: null },
  });
  it('값과 원본 기준 시각을 유지한다', () => {
    expect(parseSentiment(payload('33'), 1788750000000)).toEqual({
      value: 33,
      classification: 'Fear',
      asOf: '2026-09-07T00:00:00.000Z',
    });
  });
  it.each(['', '-1', '101', 'NaN', null, '1.5'])(
    '잘못된 값 %s를 숫자로 꾸미지 않는다',
    (value) => {
      expect(() => parseSentiment(payload(value), 1788750000000)).toThrow();
    },
  );
  it('미래·오래된 기준시각과 공급자 오류를 거부한다', () => {
    expect(() => parseSentiment(payload('33', '1'), 1788750000000)).toThrow();
    expect(() =>
      parseSentiment(payload('33', '9999999999'), 1788750000000),
    ).toThrow();
    expect(() =>
      parseSentiment(
        { ...payload('33'), metadata: { error: 'unavailable' } },
        1788750000000,
      ),
    ).toThrow();
  });
});
