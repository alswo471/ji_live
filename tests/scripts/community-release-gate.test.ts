import { describe, expect, it, vi } from 'vitest';
import {
  REQUIRED_RELEASE_ENV,
  assertCommunityReleaseConfig,
  verifyCommunityAdminConfigured,
  verifyCommunityProjectRegion,
  verifyCommunityRetentionScheduler,
} from '../../scripts/check-community-release.mjs';

const VALID_ENV = Object.fromEntries(
  REQUIRED_RELEASE_ENV.map((name: string) => [
    name,
    `${name.toLowerCase()}-value`,
  ]),
);

Object.assign(VALID_ENV, {
  NEXT_PUBLIC_COMMUNITY_ENABLED: 'true',
  NEXT_PUBLIC_SUPABASE_URL: 'https://release-project-ref.supabase.co',
  SUPABASE_PROJECT_REF: 'release-project-ref',
  NEXT_PUBLIC_RIGHTS_CONTACT_URL: 'https://open.kakao.com/o/example',
  COMMUNITY_PROCESSOR_COUNTRY: 'verified-country',
  COMMUNITY_PROCESSOR_LEGAL_NAME: 'verified-legal-name',
  COMMUNITY_PROCESSING_PURPOSE: 'verified-purpose',
  COMMUNITY_OVERSEAS_TRANSFER_METHOD: 'verified-method',
  COMMUNITY_PROCESSING_RETENTION: 'verified-retention',
  COMMUNITY_RETENTION_DAYS: '365',
  COMMUNITY_RETENTION_SECRET: 'retention-secret-at-least-32-characters',
  COMMUNITY_HMAC_SECRET: 'community-hmac-secret-at-least-32-characters',
  COMMUNITY_TRUSTED_PROXY_MODE: 'cloudflare',
  COMMUNITY_TRUSTED_PROXY_SECRET: 'trusted-proxy-secret-at-least-32-characters',
  COMMUNITY_RETENTION_SCHEDULE_CONFIRMED: 'true',
});

describe('community release gate', () => {
  it.each(REQUIRED_RELEASE_ENV)(
    'rejects a missing %s without exposing values',
    (name) => {
      const env = { ...VALID_ENV };
      delete env[name];
      expect(() => assertCommunityReleaseConfig(env)).toThrow(name);
    },
  );

  it('requires an HTTPS rights contact URL', () => {
    expect(() =>
      assertCommunityReleaseConfig({
        ...VALID_ENV,
        NEXT_PUBLIC_RIGHTS_CONTACT_URL: 'http://example.com/contact',
      }),
    ).toThrow('NEXT_PUBLIC_RIGHTS_CONTACT_URL');
  });

  it('requires verified processor and overseas-processing facts', () => {
    expect(() =>
      assertCommunityReleaseConfig({
        ...VALID_ENV,
        COMMUNITY_PROCESSOR_LEGAL_NAME: '',
      }),
    ).toThrow('COMMUNITY_PROCESSOR_LEGAL_NAME');
  });

  it('requires the public processing-retention notice', () => {
    expect(() =>
      assertCommunityReleaseConfig({
        ...VALID_ENV,
        COMMUNITY_PROCESSING_RETENTION: '',
      }),
    ).toThrow('COMMUNITY_PROCESSING_RETENTION');
  });

  it('does not treat an operator confirmation flag as scheduler evidence', () => {
    expect(() =>
      assertCommunityReleaseConfig({
        ...VALID_ENV,
        COMMUNITY_RETENTION_SCHEDULE_CONFIRMED: 'false',
      }),
    ).not.toThrow();
  });

  it('verifies the installed retention cron job and its recent successful run', async () => {
    const request = vi.fn(async () =>
      Response.json({
        jobName: 'community-retention-every-minute',
        schedule: '* * * * *',
        active: true,
        lastStatus: 'succeeded',
        lastFinishedAt: '2026-09-07T03:59:00.000Z',
      }),
    );

    await expect(
      verifyCommunityRetentionScheduler(
        VALID_ENV,
        request,
        Date.parse('2026-09-07T04:00:00.000Z'),
      ),
    ).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('/rest/v1/rpc/get_community_retention_health'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it.each([
    [
      'inactive',
      {
        jobName: 'community-retention-every-minute',
        schedule: '* * * * *',
        active: false,
        lastStatus: 'succeeded',
        lastFinishedAt: '2026-09-07T03:59:00.000Z',
      },
    ],
    [
      'stale',
      {
        jobName: 'community-retention-every-minute',
        schedule: '* * * * *',
        active: true,
        lastStatus: 'succeeded',
        lastFinishedAt: '2026-09-07T03:50:00.000Z',
      },
    ],
  ])('rejects a %s retention scheduler', async (_case, health) => {
    await expect(
      verifyCommunityRetentionScheduler(
        VALID_ENV,
        async () => Response.json(health),
        Date.parse('2026-09-07T04:00:00.000Z'),
      ),
    ).rejects.toThrow('retention scheduler');
  });

  it('requires the exact one-year community retention policy without exposing values', () => {
    const invalidRetention = '30-sensitive-policy-value';
    expect(() =>
      assertCommunityReleaseConfig({
        ...VALID_ENV,
        COMMUNITY_RETENTION_DAYS: invalidRetention,
      }),
    ).toThrow('COMMUNITY_RETENTION_DAYS');

    try {
      assertCommunityReleaseConfig({
        ...VALID_ENV,
        COMMUNITY_RETENTION_DAYS: invalidRetention,
      });
    } catch (error) {
      expect(String(error)).not.toContain(invalidRetention);
    }
  });

  it.each([
    ['NEXT_PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA'],
    ['NEXT_PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000BB'],
    ['TURNSTILE_SECRET_KEY', '1x0000000000000000000000000000000AA'],
  ])('rejects Cloudflare always-pass key in %s', (name, key) => {
    expect(() =>
      assertCommunityReleaseConfig({ ...VALID_ENV, [name]: key }),
    ).toThrow('Turnstile test keys');
  });

  it('requires strong HMAC and trusted-origin secrets without exposing values', () => {
    for (const [name, value] of [
      ['COMMUNITY_HMAC_SECRET', 'short-hmac-value'],
      ['COMMUNITY_TRUSTED_PROXY_SECRET', 'short-proxy-value'],
    ]) {
      try {
        assertCommunityReleaseConfig({ ...VALID_ENV, [name]: value });
        throw new Error('expected release rejection');
      } catch (error) {
        expect(String(error)).toContain(name);
        expect(String(error)).not.toContain(value);
      }
    }
  });

  it('requires the Cloudflare trusted-proxy boundary for production release', () => {
    expect(() =>
      assertCommunityReleaseConfig({
        ...VALID_ENV,
        COMMUNITY_TRUSTED_PROXY_MODE: 'local',
      }),
    ).toThrow('COMMUNITY_TRUSTED_PROXY_MODE');
  });

  it('requires the Supabase URL host to match the protected project ref', () => {
    const mismatchedUrl = 'https://another-project.supabase.co';
    try {
      assertCommunityReleaseConfig({
        ...VALID_ENV,
        NEXT_PUBLIC_SUPABASE_URL: mismatchedUrl,
      });
      throw new Error('expected release rejection');
    } catch (error) {
      expect(String(error)).toContain('SUPABASE_PROJECT_REF');
      expect(String(error)).not.toContain(mismatchedUrl);
    }
  });

  it('accepts only the Seoul project region', async () => {
    const request = vi.fn(async () =>
      Response.json({ region: 'ap-northeast-2' }),
    );
    await expect(
      verifyCommunityProjectRegion(VALID_ENV, request),
    ).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('/v1/projects/'),
      expect.objectContaining({
        headers: { Authorization: expect.stringMatching(/^Bearer /) },
      }),
    );
  });

  it('rejects a generic APAC region', async () => {
    await expect(
      verifyCommunityProjectRegion(VALID_ENV, async () =>
        Response.json({ region: 'ap-southeast-1' }),
      ),
    ).rejects.toThrow('ap-northeast-2');
  });

  it('requires at least one configured community admin', async () => {
    await expect(
      verifyCommunityAdminConfigured(VALID_ENV, async () => Response.json([])),
    ).rejects.toThrow('community admin');

    await expect(
      verifyCommunityAdminConfigured(VALID_ENV, async () =>
        Response.json([{ user_id: '10000000-0000-4000-8000-000000000001' }]),
      ),
    ).resolves.toBeUndefined();
  });
});
