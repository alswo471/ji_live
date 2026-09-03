import { afterEach, describe, expect, it } from 'vitest';
import { createAnonymousName } from '@/lib/community/nickname';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function configureHmacSecret() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'supabase-secret';
  process.env.TURNSTILE_SECRET_KEY = 'turnstile-secret';
  process.env.COMMUNITY_HMAC_SECRET = 'community-hmac-secret-for-tests';
}

describe('createAnonymousName', () => {
  it('creates a stable Korean name without exposing UUID fragments', async () => {
    configureHmacSecret();
    const actorId = '10000000-0000-4000-8000-123456789abc';

    const first = await createAnonymousName(actorId);
    const second = await createAnonymousName(actorId);

    expect(first).toBe(second);
    expect(first).toMatch(/^[가-힣]+-[가-힣]+-[0-9]{4}$/);
    for (const fragment of actorId.split('-'))
      expect(first).not.toContain(fragment);
  });

  it('rejects an invalid actor UUID', async () => {
    configureHmacSecret();
    await expect(createAnonymousName('not-a-uuid')).rejects.toMatchObject({
      code: 'invalid_actor_id',
    });
  });
});
