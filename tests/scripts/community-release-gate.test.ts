import { describe, expect, it, vi } from 'vitest';
import {
  REQUIRED_RELEASE_ENV,
  assertCommunityReleaseConfig,
  verifyCommunityAdminConfigured,
  verifyCommunityProjectRegion,
} from '../../scripts/check-community-release.mjs';

const VALID_ENV = Object.fromEntries(
  REQUIRED_RELEASE_ENV.map((name: string) => [
    name,
    `${name.toLowerCase()}-value`,
  ]),
);

Object.assign(VALID_ENV, {
  NEXT_PUBLIC_COMMUNITY_ENABLED: 'true',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_RIGHTS_CONTACT_URL: 'https://open.kakao.com/o/example',
  COMMUNITY_PROCESSOR_COUNTRY: 'verified-country',
  COMMUNITY_PROCESSOR_LEGAL_NAME: 'verified-legal-name',
  COMMUNITY_PROCESSING_PURPOSE: 'verified-purpose',
  COMMUNITY_OVERSEAS_TRANSFER_METHOD: 'verified-method',
  COMMUNITY_PROCESSING_RETENTION: 'verified-retention',
  COMMUNITY_RETENTION_SECRET: 'retention-secret-at-least-32-characters',
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

  it('requires the retention scheduler confirmation', () => {
    expect(() =>
      assertCommunityReleaseConfig({
        ...VALID_ENV,
        COMMUNITY_RETENTION_SCHEDULE_CONFIRMED: 'false',
      }),
    ).toThrow('COMMUNITY_RETENTION_SCHEDULE_CONFIRMED');
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
