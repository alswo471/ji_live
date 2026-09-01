import { describe, expect, it, vi } from 'vitest';
import { createCachedProvider } from '@/lib/market/cache';

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
});
