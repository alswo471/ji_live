import { describe, expect, it } from 'vitest';
import {
  createProviderRequestError,
  MAX_RETRY_AFTER_MS,
  parseRetryAfter,
} from '@/lib/market/provider-error';

describe('parseRetryAfter', () => {
  const modernNow = Date.parse('2026-09-01T00:00:00.000Z');

  it('정수 초 단위 값을 밀리초로 보존한다', () => {
    expect(parseRetryAfter('2', 1_000)).toBe(2_000);
  });

  it('HTTP-date를 현재 시각 기준 대기 밀리초로 변환한다', () => {
    const now = Date.parse('2026-09-01T00:00:00.000Z');

    expect(parseRetryAfter('Tue, 01 Sep 2026 00:00:03 GMT', now)).toBe(3_000);
  });

  it('유효하지 않은 값은 보존하지 않는다', () => {
    expect(parseRetryAfter('later', 1_000)).toBeNull();
  });

  it.each(['-1', '+3', ' -1 ', ' +3 ', '2.5', '.5', '2.', '1e3', '1E3'])(
    '정수 delay-seconds가 아닌 숫자형 값 %s을 HTTP-date로 재해석하지 않는다',
    (value) => {
      expect(parseRetryAfter(value, modernNow)).toBeNull();
    },
  );

  it('바깥 공백이 있는 unsigned integer seconds는 허용한다', () => {
    expect(parseRetryAfter(' 3 ', 1_000)).toBe(3_000);
  });

  it.each([
    '2026-09-01T00:00:03Z',
    'Tue, 1 Sep 2026 00:00:03 GMT',
    'Mon, 01 Sep 2026 00:00:03 GMT',
    'Tue, 31 Feb 2026 00:00:03 GMT',
  ])('엄격한 IMF-fixdate가 아닌 날짜 %s를 거절한다', (value) => {
    expect(parseRetryAfter(value, modernNow)).toBeNull();
  });

  it('Infinity가 되는 큰 숫자와 운영 상한을 넘는 초를 거절한다', () => {
    expect(parseRetryAfter('9'.repeat(400), 1_000)).toBeNull();
    expect(
      parseRetryAfter(String(MAX_RETRY_AFTER_MS / 1_000 + 1), 1_000),
    ).toBeNull();
  });

  it('운영 상한보다 먼 HTTP-date를 거절한다', () => {
    const farFuture = new Date(modernNow + MAX_RETRY_AFTER_MS + 1_000).toUTCString();

    expect(parseRetryAfter(farFuture, modernNow)).toBeNull();
  });
});

describe('createProviderRequestError', () => {
  it('응답의 429 상태와 Retry-After를 함께 전달한다', () => {
    const response = new Response(null, {
      status: 429,
      headers: { 'Retry-After': '3' },
    });

    const error = createProviderRequestError('Binance', response, 10_000);

    expect(error.status).toBe(429);
    expect(error.retryAfterMs).toBe(3_000);
    expect(error.message).toBe('Binance 시세 요청에 실패했습니다. (429)');
  });
});
