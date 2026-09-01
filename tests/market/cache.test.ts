import { describe, expect, it, vi } from 'vitest';
import { createCachedProvider } from '@/lib/market/cache';
import {
  MAX_RETRY_AFTER_MS,
  parseRetryAfter,
  ProviderRequestError,
} from '@/lib/market/provider-error';

describe('createCachedProvider', () => {
  it('동시에 들어온 요청을 한 번의 공급자 호출로 합친다', async () => {
    const load = vi.fn(async () => ['quote']);
    const cached = createCachedProvider({ ttlMs: 5_000, failureThreshold: 2, cooldownMs: 30_000, load });

    const [first, second] = await Promise.all([cached.get(), cached.get()]);

    expect(first).toEqual({ value: ['quote'], stale: false });
    expect(second).toEqual(first);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('연속 실패 뒤 cooldown 동안 마지막 정상값을 stale로 유지한다', async () => {
    let now = 0;
    let shouldFail = false;
    const load = vi.fn(async () => {
      if (shouldFail) throw new Error('429');
      return ['latest'];
    });
    const cached = createCachedProvider({ ttlMs: 10, failureThreshold: 2, cooldownMs: 30_000, load, now: () => now });
    await cached.get();
    shouldFail = true;
    now = 11;
    expect(await cached.get()).toEqual({ value: ['latest'], stale: true });
    now = 12;
    expect(await cached.get()).toEqual({ value: ['latest'], stale: true });
    now = 13;
    expect(await cached.get()).toEqual({ value: ['latest'], stale: true });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('정상 캐시가 없어도 실패 임계값 뒤에는 공급자를 다시 호출하지 않는다', async () => {
    let now = 0;
    const load = vi.fn(async () => {
      throw new Error('upstream unavailable');
    });
    const cached = createCachedProvider({
      ttlMs: 5_000,
      failureThreshold: 2,
      cooldownMs: 30_000,
      load,
      now: () => now,
    });

    await expect(cached.get()).rejects.toThrow('upstream unavailable');
    now = 1;
    await expect(cached.get()).rejects.toThrow('upstream unavailable');
    now = 2;
    await expect(cached.get()).rejects.toThrow('upstream unavailable');

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('429 Retry-After를 임계값보다 우선해 즉시 적용한다', async () => {
    let now = 1_000;
    const load = vi.fn(async () => {
      throw new ProviderRequestError('rate limited', 429, 2_000);
    });
    const cached = createCachedProvider({
      ttlMs: 5_000,
      failureThreshold: 3,
      cooldownMs: 30_000,
      load,
      now: () => now,
    });

    await expect(cached.get()).rejects.toThrow('rate limited');
    now = 2_999;
    await expect(cached.get()).rejects.toThrow('rate limited');
    expect(load).toHaveBeenCalledTimes(1);

    now = 3_000;
    await expect(cached.get()).rejects.toThrow('rate limited');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('Retry-After가 없는 429에는 지수 backoff를 적용한다', async () => {
    let now = 0;
    const load = vi.fn(async () => {
      throw new ProviderRequestError('rate limited', 429, null);
    });
    const cached = createCachedProvider({
      ttlMs: 5_000,
      failureThreshold: 3,
      cooldownMs: 100,
      load,
      now: () => now,
    });

    await expect(cached.get()).rejects.toThrow('rate limited');
    now = 99;
    await expect(cached.get()).rejects.toThrow('rate limited');
    expect(load).toHaveBeenCalledTimes(1);

    now = 100;
    await expect(cached.get()).rejects.toThrow('rate limited');
    now = 299;
    await expect(cached.get()).rejects.toThrow('rate limited');
    expect(load).toHaveBeenCalledTimes(2);

    now = 300;
    await expect(cached.get()).rejects.toThrow('rate limited');
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('Retry-After 운영 상한 경계까지는 공급자 대기 시간을 유지한다', async () => {
    let now = 0;
    const load = vi.fn(async () => {
      throw new ProviderRequestError('rate limited', 429, MAX_RETRY_AFTER_MS);
    });
    const cached = createCachedProvider({
      ttlMs: 5_000,
      failureThreshold: 3,
      cooldownMs: 100,
      load,
      now: () => now,
    });

    await expect(cached.get()).rejects.toThrow('rate limited');
    now = MAX_RETRY_AFTER_MS - 1;
    await expect(cached.get()).rejects.toThrow('rate limited');
    expect(load).toHaveBeenCalledTimes(1);

    now = MAX_RETRY_AFTER_MS;
    await expect(cached.get()).rejects.toThrow('rate limited');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it.each([Infinity, MAX_RETRY_AFTER_MS + 1])(
    'cache 경계에서 과도한 Retry-After %s를 지수 backoff로 대체한다',
    async (retryAfterMs) => {
      let now = 0;
      const load = vi.fn(async () => {
        throw new ProviderRequestError('rate limited', 429, retryAfterMs);
      });
      const cached = createCachedProvider({
        ttlMs: 5_000,
        failureThreshold: 3,
        cooldownMs: 100,
        load,
        now: () => now,
      });

      await expect(cached.get()).rejects.toThrow('rate limited');
      now = 99;
      await expect(cached.get()).rejects.toThrow('rate limited');
      expect(load).toHaveBeenCalledTimes(1);

      now = 100;
      await expect(cached.get()).rejects.toThrow('rate limited');
      expect(load).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['-1', '+3', ' -1 ', ' +3 '])(
    '잘못된 Retry-After %s를 0ms 회로 차단 대신 지수 backoff로 처리한다',
    async (header) => {
      let now = 0;
      const load = vi.fn(async () => {
        throw new ProviderRequestError(
          'rate limited',
          429,
          parseRetryAfter(header, Date.parse('2026-09-01T00:00:00.000Z')),
        );
      });
      const cached = createCachedProvider({
        ttlMs: 5_000,
        failureThreshold: 3,
        cooldownMs: 100,
        load,
        now: () => now,
      });

      await expect(cached.get()).rejects.toThrow('rate limited');
      now = 99;
      await expect(cached.get()).rejects.toThrow('rate limited');
      expect(load).toHaveBeenCalledTimes(1);

      now = 100;
      await expect(cached.get()).rejects.toThrow('rate limited');
      expect(load).toHaveBeenCalledTimes(2);
    },
  );
});
