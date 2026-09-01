import { describe, expect, it } from 'vitest';
import { resolveSession, type SessionCalendar } from '@/lib/market/session';

const calendar: SessionCalendar = {
  day: null,
  pre: { startTime: '2026-09-01T17:00:00+09:00', endTime: '2026-09-01T22:30:00+09:00' },
  regular: { startTime: '2026-09-01T22:30:00+09:00', endTime: '2026-09-02T05:00:00+09:00' },
  after: { startTime: '2026-09-02T05:00:00+09:00', endTime: '2026-09-02T07:00:00+09:00' },
};

describe('resolveSession', () => {
  it.each([
    ['2026-09-01T18:00:00+09:00', 'pre'],
    ['2026-09-01T23:00:00+09:00', 'regular'],
    ['2026-09-02T06:00:00+09:00', 'after'],
    ['2026-09-02T08:00:00+09:00', 'closed'],
  ] as const)('%s의 시장 세션을 %s로 판정한다', (now, expected) => {
    expect(resolveSession(new Date(now), calendar)).toBe(expected);
  });

  it('휴장일에는 항상 closed를 반환한다', () => {
    expect(resolveSession(new Date('2026-09-01T23:00:00+09:00'), { day: null, pre: null, regular: null, after: null })).toBe('closed');
  });
});
