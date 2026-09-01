import { describe, expect, it } from 'vitest';
import {
  createProviderRequestError,
  parseRetryAfter,
} from '@/lib/market/provider-error';

describe('parseRetryAfter', () => {
  it('초 단위 값을 밀리초로 보존한다', () => {
    expect(parseRetryAfter('2.5', 1_000)).toBe(2_500);
  });

  it('HTTP-date를 현재 시각 기준 대기 밀리초로 변환한다', () => {
    const now = Date.parse('2026-09-01T00:00:00.000Z');

    expect(parseRetryAfter('Tue, 01 Sep 2026 00:00:03 GMT', now)).toBe(3_000);
  });

  it('유효하지 않은 값은 보존하지 않는다', () => {
    expect(parseRetryAfter('later', 1_000)).toBeNull();
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
