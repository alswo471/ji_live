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

  async function loadValue() {
    try {
      const value = await options.load();
      cached = { value, expiresAt: clock() + options.ttlMs };
      consecutiveFailures = 0;
      openUntil = 0;
      return { value, stale: false };
    } catch (error) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= options.failureThreshold) openUntil = clock() + options.cooldownMs;
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
      if (inFlight) return inFlight;
      inFlight = loadValue();
      return inFlight;
    },
  };
}
