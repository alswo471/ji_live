import { describe, expect, it } from 'vitest';
import { assessTimestampFreshness } from '@/lib/market/freshness';

const policy = { maxAgeMs: 300_000, futureToleranceMs: 60_000 };
const nowMs = Date.parse('2026-09-01T10:00:00.000Z');

describe('assessTimestampFreshness', () => {
  it('유효하지 않은 공급자 시각을 수신 시각으로 대체하지 않는다', () => {
    expect(assessTimestampFreshness(9e15, nowMs, policy)).toEqual({
      asOf: null,
      freshness: 'unavailable',
    });
  });

  it('정책보다 오래된 공급자 시각은 원래 시각을 유지한 stale로 판정한다', () => {
    expect(
      assessTimestampFreshness(
        Date.parse('2026-09-01T09:54:59.000Z'),
        nowMs,
        policy,
      ),
    ).toEqual({
      asOf: '2026-09-01T09:54:59.000Z',
      freshness: 'stale',
    });
  });

  it('실제 응답 필드가 거래 없음으로 나타내면 유효한 마지막 시각을 stale로 둔다', () => {
    expect(
      assessTimestampFreshness(
        Date.parse('2026-09-01T09:59:59.000Z'),
        nowMs,
        policy,
        true,
      ),
    ).toEqual({
      asOf: '2026-09-01T09:59:59.000Z',
      freshness: 'stale',
    });
  });
});
