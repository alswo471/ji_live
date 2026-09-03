import { afterEach, describe, expect, it } from 'vitest';
import {
  getCommunityPublicConfig,
  getCommunityServerConfig,
  isCommunityEnabled,
} from '@/lib/community/config';
import { getBrowserSupabase, getServerSupabase } from '@/lib/community/supabase';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('community config', () => {
  it('returns validated public config', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site-key';
    expect(getCommunityPublicConfig()).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabasePublishableKey: 'sb_publishable_test',
      turnstileSiteKey: 'site-key',
    });
  });

  it('never accepts a missing server secret', () => {
    delete process.env.SUPABASE_SECRET_KEY;
    expect(() => getCommunityServerConfig()).toThrow('SUPABASE_SECRET_KEY');
  });

  it('rejects an invalid public Supabase URL', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'not-a-url';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site-key';

    expect(() => getCommunityPublicConfig()).toThrow('NEXT_PUBLIC_SUPABASE_URL');
  });

  it('returns the required server-only configuration', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
    process.env.TURNSTILE_SECRET_KEY = 'turnstile-secret';
    process.env.COMMUNITY_HMAC_SECRET = 'community-hmac';

    expect(getCommunityServerConfig()).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabaseSecretKey: 'sb_secret_test',
      turnstileSecretKey: 'turnstile-secret',
      communityHmacSecret: 'community-hmac',
    });
  });

  it.each([
    ['true', true],
    ['false', false],
    ['TRUE', false],
    [undefined, false],
  ])('enables the community only for the literal true flag', (value, expected) => {
    if (value === undefined) delete process.env.NEXT_PUBLIC_COMMUNITY_ENABLED;
    else process.env.NEXT_PUBLIC_COMMUNITY_ENABLED = value;

    expect(isCommunityEnabled()).toBe(expected);
  });

  it('keeps browser and server Supabase clients isolated', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site-key';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
    process.env.TURNSTILE_SECRET_KEY = 'turnstile-secret';
    process.env.COMMUNITY_HMAC_SECRET = 'community-hmac';

    const browserClient = getBrowserSupabase();

    expect(getBrowserSupabase()).toBe(browserClient);
    expect(getServerSupabase()).not.toBe(browserClient);
  });
});
