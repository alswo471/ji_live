import { afterEach, describe, expect, it } from 'vitest';
import { createDailyAbuseKey } from '@/lib/community/abuse-key';

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

describe('createDailyAbuseKey', () => {
  it('is stable for the normalized IP on the same UTC day', async () => {
    configureHmacSecret();

    await expect(
      Promise.all([
        createDailyAbuseKey(
          ' 203.0.113.010 ',
          new Date('2026-09-03T00:00:00.000Z'),
        ),
        createDailyAbuseKey(
          '203.0.113.10',
          new Date('2026-09-03T23:59:59.000Z'),
        ),
      ]),
    ).resolves.toEqual([expect.any(String), expect.any(String)]);

    const first = await createDailyAbuseKey(
      ' 203.0.113.010 ',
      new Date('2026-09-03T00:00:00.000Z'),
    );
    const second = await createDailyAbuseKey(
      '203.0.113.10',
      new Date('2026-09-03T23:59:59.000Z'),
    );
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rotates on the next UTC day and never contains the raw IP', async () => {
    configureHmacSecret();
    const ip = '203.0.113.10';
    const first = await createDailyAbuseKey(
      ip,
      new Date('2026-09-03T23:59:59.000Z'),
    );
    const next = await createDailyAbuseKey(
      ip,
      new Date('2026-09-04T00:00:00.000Z'),
    );

    expect(next).not.toBe(first);
    expect(first).not.toContain(ip);
    expect(next).not.toContain(ip);
  });

  it('rejects a value that is not a trusted client IP', async () => {
    configureHmacSecret();
    await expect(createDailyAbuseKey('not-an-ip')).rejects.toMatchObject({
      code: 'invalid_client_ip',
    });
  });
});
