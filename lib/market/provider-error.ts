/** 외부 응답 하나가 in-memory 공급자 회로를 장시간 비활성화하지 못하게 하는 운영 상한. */
export const MAX_RETRY_AFTER_MS = 15 * 60_000;

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
  if (/^\d+(?:\.\d+)?$/.test(trimmed))
    return boundedRetryAfterMs(Number(trimmed) * 1_000);

  const retryAt = Date.parse(trimmed);
  return Number.isFinite(retryAt)
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
