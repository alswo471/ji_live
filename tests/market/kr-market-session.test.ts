import { describe, expect, it } from 'vitest';
import {
  KR_MARKET_SESSION_LABELS,
  resolveKrMarketSession,
} from '@/lib/market/kr-market-session';

describe('resolveKrMarketSession', () => {
  it.each([
    ['2026-09-02T15:00:00Z', 'overnight'],
    ['2026-09-02T23:00:00Z', 'nxt-pre'],
    ['2026-09-02T23:50:00Z', 'krx-opening-auction'],
    ['2026-09-03T00:00:00Z', 'krx-regular'],
    ['2026-09-03T00:00:30Z', 'krx-nxt-overlap'],
    ['2026-09-03T06:20:00Z', 'krx-closing-auction'],
    ['2026-09-03T06:30:00Z', 'nxt-transition'],
    ['2026-09-03T06:40:00Z', 'nxt-after'],
    ['2026-09-03T11:00:00Z', 'closed'],
  ] as const)('KST 시장 구간 %s을 %s로 판별한다', (at, expected) => {
    expect(resolveKrMarketSession(new Date(at))).toBe(expected);
  });

  it('주말에는 시각과 무관하게 휴장으로 판별한다', () => {
    expect(resolveKrMarketSession(new Date('2026-09-05T01:00:00Z'))).toBe('closed');
  });

  it('확인된 휴장일에는 평일이어도 휴장으로 판별한다', () => {
    expect(
      resolveKrMarketSession(
        new Date('2026-09-03T01:00:00Z'),
        new Set(['2026-09-03']),
      ),
    ).toBe('closed');
  });

  it('내장된 2026년 공휴일과 KRX 연말 휴장일을 휴장으로 판별한다', () => {
    expect(resolveKrMarketSession(new Date('2026-07-17T01:00:00Z'))).toBe('closed');
    expect(resolveKrMarketSession(new Date('2026-12-31T01:00:00Z'))).toBe('closed');
  });

  it('공식 휴장 달력이 등록되지 않은 연도를 영업일로 추측하지 않는다', () => {
    expect(resolveKrMarketSession(new Date('2027-01-04T01:00:00Z'))).toBe('closed');
  });

  it('세션별 사용자 문구를 가격 성격과 분리해 제공한다', () => {
    expect(KR_MARKET_SESSION_LABELS).toMatchObject({
      'nxt-pre': '프리마켓 추정',
      'krx-nxt-overlap': '정규장 추정',
      'nxt-after': '애프터마켓 추정',
      closed: '휴장 중 추정',
    });
  });
});
