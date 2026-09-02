/** 외부 응답 하나가 in-memory 공급자 회로를 장시간 비활성화하지 못하게 하는 운영 상한. */
export const MAX_RETRY_AFTER_MS = 15 * 60_000;

const IMF_FIXDATE_PATTERN = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

export function boundedRetryAfterMs(value: unknown) {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_RETRY_AFTER_MS
    ? value
    : null;
}

export class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs: number | null,
  ) {
    super(message);
    this.name = 'ProviderRequestError';
  }
}

export function parseRetryAfter(value: string | null, nowMs: number) {
  if (value === null) return null;
  const trimmed = value.trim();
  // RFC 9110 delay-seconds는 부호나 소수점이 없는 1*DIGIT 형식이다.
  if (/^\d+$/.test(trimmed))
    return boundedRetryAfterMs(Number(trimmed) * 1_000);

  // Date.parse의 느슨한 숫자·날짜 해석을 피하고 HTTP-date의 IMF-fixdate만 허용한다.
  if (!IMF_FIXDATE_PATTERN.test(trimmed)) return null;
  const retryAt = Date.parse(trimmed);
  return Number.isFinite(retryAt) && new Date(retryAt).toUTCString() === trimmed
    ? boundedRetryAfterMs(Math.max(0, retryAt - nowMs))
    : null;
}

export function createProviderRequestError(
  provider: string,
  response: Response,
  nowMs = Date.now(),
) {
  return new ProviderRequestError(
    `${provider} 시세 요청에 실패했습니다. (${response.status})`,
    response.status,
    parseRetryAfter(response.headers.get('Retry-After'), nowMs),
  );
}
