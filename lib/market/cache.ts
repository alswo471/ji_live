import {
  boundedRetryAfterMs,
  ProviderRequestError,
} from './provider-error';

export function createCachedProvider<T>(options: {
  ttlMs: number;
  failureThreshold: number;
  cooldownMs: number;
  load: () => Promise<T>;
  now?: () => number;
}) {
  const clock = options.now ?? Date.now;
  let cached: { value: T; expiresAt: number } | null = null;
  let inFlight: Promise<{ value: T; stale: boolean }> | null = null;
  let consecutiveFailures = 0;
  let openUntil = 0;
  let lastError: unknown = new Error('공급자 회로가 열려 있습니다.');

  function fallbackDelay(exponent: number) {
    return options.cooldownMs * 2 ** Math.min(exponent, 10);
  }

  async function loadValue() {
    try {
      const value = await options.load();
      cached = { value, expiresAt: clock() + options.ttlMs };
      consecutiveFailures = 0;
      openUntil = 0;
      return { value, stale: false };
    } catch (error) {
      consecutiveFailures += 1;
      lastError = error;
      if (error instanceof ProviderRequestError && error.status === 429) {
        const retryAfterMs = boundedRetryAfterMs(error.retryAfterMs);
        openUntil = clock() +
          (retryAfterMs ?? fallbackDelay(consecutiveFailures - 1));
      } else if (consecutiveFailures >= options.failureThreshold) {
        openUntil = clock() +
          fallbackDelay(consecutiveFailures - options.failureThreshold);
      }
      if (cached) return { value: cached.value, stale: true };
      throw error;
    } finally {
      inFlight = null;
    }
  }

  return {
    get(): Promise<{ value: T; stale: boolean }> {
      const current = clock();
      if (cached && cached.expiresAt > current) return Promise.resolve({ value: cached.value, stale: false });
      if (cached && openUntil > current) return Promise.resolve({ value: cached.value, stale: true });
      if (!cached && openUntil > current) return Promise.reject(lastError);
      if (inFlight) return inFlight;
      inFlight = loadValue();
      return inFlight;
    },
  };
}
