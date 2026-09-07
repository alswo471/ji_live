import { describe, expect, it } from 'vitest';
import {
  CommunityAdminAuthError,
  requireCommunityAdmin,
  type CommunityAdminMembershipLookup,
  type CommunityAdminUserLookup,
} from '@/lib/community/admin-auth';

const ADMIN_ID = '10000000-0000-4000-8000-000000000001';
const ACCESS_TOKEN = 'private-admin-token';

function request(authorization?: string) {
  return new Request('https://example.com/api/admin/community/reports', {
    headers: authorization ? { authorization } : undefined,
  });
}

const permanentUser: CommunityAdminUserLookup = async () => ({
  data: {
    user: {
      id: ADMIN_ID,
      email: 'owner@example.com',
      is_anonymous: false,
    },
  },
  error: null,
});

describe('requireCommunityAdmin', () => {
  it('rejects a missing bearer token before provider lookup', async () => {
    await expect(
      requireCommunityAdmin(
        request(),
        async () => {
          throw new Error('lookup must not run');
        },
        async () => true,
      ),
    ).rejects.toMatchObject({ status: 401, code: 'admin_auth_required' });
  });

  it('rejects an anonymous community account', async () => {
    const lookup: CommunityAdminUserLookup = async () => ({
      data: {
        user: { id: ADMIN_ID, email: null, is_anonymous: true },
      },
      error: null,
    });

    await expect(
      requireCommunityAdmin(
        request(`Bearer ${ACCESS_TOKEN}`),
        lookup,
        async () => {
          throw new Error('anonymous user must not reach membership lookup');
        },
      ),
    ).rejects.toMatchObject({ status: 403, code: 'admin_access_denied' });
  });

  it('rejects a permanent user without an admin row', async () => {
    await expect(
      requireCommunityAdmin(
        request(`Bearer ${ACCESS_TOKEN}`),
        permanentUser,
        async () => false,
      ),
    ).rejects.toMatchObject({ status: 403, code: 'admin_access_denied' });
  });

  it('returns only the configured admin ID', async () => {
    const membership: CommunityAdminMembershipLookup = async (userId) =>
      userId === ADMIN_ID;

    await expect(
      requireCommunityAdmin(
        request(`Bearer ${ACCESS_TOKEN}`),
        permanentUser,
        membership,
      ),
    ).resolves.toEqual({ id: ADMIN_ID });
  });

  it('does not expose token, email or provider detail in an auth error', async () => {
    const providerDetail = 'private provider response';
    const lookup: CommunityAdminUserLookup = async () => ({
      data: { user: null },
      error: { message: providerDetail },
    });

    try {
      await requireCommunityAdmin(
        request(`Bearer ${ACCESS_TOKEN}`),
        lookup,
        async () => false,
      );
      throw new Error('admin auth must fail');
    } catch (error) {
      expect(error).toBeInstanceOf(CommunityAdminAuthError);
      expect(String(error)).not.toContain(ACCESS_TOKEN);
      expect(String(error)).not.toContain('owner@example.com');
      expect(String(error)).not.toContain(providerDetail);
    }
  });
});
