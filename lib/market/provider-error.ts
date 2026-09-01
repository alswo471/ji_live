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
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed) * 1_000;

  const retryAt = Date.parse(trimmed);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - nowMs) : null;
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
