import { describe, expect, it } from 'vitest';
import {
  authenticateCommunityUser,
  CommunityAuthError,
  type CommunityUserLookup,
} from '@/lib/community/auth';

const ACCESS_TOKEN = 'private-bearer-token';

function createRequest(authorization?: string) {
  return new Request('https://example.com/api/community/posts', {
    headers: authorization ? { authorization } : undefined,
  });
}

describe('authenticateCommunityUser', () => {
  it.each([undefined, '', 'Basic abc', 'Bearer', 'Bearer one two'])(
    'rejects a missing or malformed bearer header: %s',
    async (authorization) => {
      await expect(
        authenticateCommunityUser(createRequest(authorization), async () => {
          throw new Error('사용자 조회가 호출되면 안 됩니다.');
        }),
      ).rejects.toMatchObject({
        status: 401,
        code: 'community_auth_required',
      });
    },
  );

  it('returns only the verified anonymous actor fields', async () => {
    const lookup: CommunityUserLookup = async (token) => {
      if (token !== ACCESS_TOKEN) throw new Error('잘못된 테스트 token');
      return {
        data: {
          user: {
            id: '10000000-0000-4000-8000-000000000001',
            email: null,
            is_anonymous: true,
            app_metadata: {},
            user_metadata: { untrusted: 'drop-me' },
            aud: 'authenticated',
            created_at: '2026-09-03T00:00:00.000Z',
          },
        },
        error: null,
      };
    };

    await expect(
      authenticateCommunityUser(
        createRequest(`Bearer ${ACCESS_TOKEN}`),
        lookup,
      ),
    ).resolves.toEqual({
      id: '10000000-0000-4000-8000-000000000001',
      isAnonymous: true,
      email: null,
    });
  });

  it('rejects a permanent user from public community write', async () => {
    const lookup: CommunityUserLookup = async () => ({
      data: {
        user: {
          id: '10000000-0000-4000-8000-000000000002',
          email: 'owner@example.com',
          is_anonymous: false,
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: '2026-09-03T00:00:00.000Z',
        },
      },
      error: null,
    });

    await expect(
      authenticateCommunityUser(
        createRequest(`Bearer ${ACCESS_TOKEN}`),
        lookup,
      ),
    ).rejects.toMatchObject({
      status: 403,
      code: 'anonymous_user_required',
    });
  });

  it('does not expose the bearer token or provider error in a safe error', async () => {
    const providerMessage = 'provider detail that must remain private';
    const lookup: CommunityUserLookup = async () => ({
      data: { user: null },
      error: { message: providerMessage },
    });

    try {
      await authenticateCommunityUser(
        createRequest(`Bearer ${ACCESS_TOKEN}`),
        lookup,
      );
      throw new Error('인증 오류가 발생해야 합니다.');
    } catch (error) {
      expect(error).toBeInstanceOf(CommunityAuthError);
      expect(String(error)).not.toContain(ACCESS_TOKEN);
      expect(String(error)).not.toContain(providerMessage);
    }
  });
});
