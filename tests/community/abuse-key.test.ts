import { afterEach, describe, expect, it } from 'vitest';
import {
  createDailyAbuseKey,
  getTrustedClientIp,
} from '@/lib/community/abuse-key';

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

describe('getTrustedClientIp', () => {
  it('rejects spoofed direct-origin Cloudflare headers without the origin secret', () => {
    const env = {
      NODE_ENV: 'production',
      COMMUNITY_TRUSTED_PROXY_MODE: 'cloudflare',
      COMMUNITY_TRUSTED_PROXY_SECRET:
        'trusted-proxy-secret-at-least-32-characters',
    };
    const direct = new Request('https://origin.example/community', {
      headers: { 'cf-connecting-ip': '203.0.113.10' },
    });
    const spoofed = new Request('https://origin.example/community', {
      headers: {
        'cf-connecting-ip': '198.51.100.20',
        'x-community-proxy-secret': 'wrong-secret',
      },
    });

    expect(() => getTrustedClientIp(direct, env)).toThrow(
      expect.objectContaining({ code: 'untrusted_proxy' }),
    );
    expect(() => getTrustedClientIp(spoofed, env)).toThrow(
      expect.objectContaining({ code: 'untrusted_proxy' }),
    );
  });

  it('accepts only the proxy-overwritten origin secret in production', () => {
    const secret = 'trusted-proxy-secret-at-least-32-characters';
    const request = new Request('https://origin.example/community', {
      headers: {
        'cf-connecting-ip': '203.0.113.010',
        'x-community-proxy-secret': secret,
      },
    });

    expect(
      getTrustedClientIp(request, {
        NODE_ENV: 'production',
        COMMUNITY_TRUSTED_PROXY_MODE: 'cloudflare',
        COMMUNITY_TRUSTED_PROXY_SECRET: secret,
      }),
    ).toBe('203.0.113.10');
  });

  it('allows explicit local mode outside production but fails it closed in production', () => {
    const request = new Request('http://localhost/community', {
      headers: { 'cf-connecting-ip': '127.0.0.1' },
    });
    expect(
      getTrustedClientIp(request, {
        NODE_ENV: 'test',
        COMMUNITY_TRUSTED_PROXY_MODE: 'local',
      }),
    ).toBe('127.0.0.1');
    expect(() =>
      getTrustedClientIp(request, {
        NODE_ENV: 'production',
        COMMUNITY_TRUSTED_PROXY_MODE: 'local',
      }),
    ).toThrow(expect.objectContaining({ code: 'untrusted_proxy' }));
  });
});
