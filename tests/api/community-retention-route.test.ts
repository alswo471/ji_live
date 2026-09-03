import { describe, expect, it } from 'vitest';
import {
  handleCommunityRetentionRequest,
  type CommunityRetentionDependencies,
} from '@/app/api/internal/community-retention/route';

function dependencies(
  overrides: Partial<CommunityRetentionDependencies> = {},
): CommunityRetentionDependencies {
  return {
    enabled: () => true,
    secret: () => 'retention-secret-at-least-32-characters',
    runRetention: async () => ({
      rateEvents: 2,
      posts: 1,
      comments: 3,
      reports: 4,
      moderationActions: 5,
      anonymousUsers: 6,
    }),
    ...overrides,
  };
}

describe('community retention route', () => {
  it('fails closed before opening a repository when disabled', async () => {
    const response = await handleCommunityRetentionRequest(
      new Request('http://localhost/api/internal/community-retention', {
        method: 'POST',
      }),
      dependencies({
        enabled: () => false,
        runRetention: async () => {
          throw new Error('disabled route must not access database');
        },
      }),
    );

    expect(response.status).toBe(404);
  });

  it.each([null, 'wrong-secret'])(
    'rejects an invalid scheduler secret',
    async (token) => {
      const response = await handleCommunityRetentionRequest(
        new Request('http://localhost/api/internal/community-retention', {
          method: 'POST',
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
        }),
        dependencies(),
      );

      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain('retention-secret');
    },
  );

  it('returns deletion counts only for an authorized scheduler', async () => {
    const response = await handleCommunityRetentionRequest(
      new Request('http://localhost/api/internal/community-retention', {
        method: 'POST',
        headers: {
          authorization: 'Bearer retention-secret-at-least-32-characters',
        },
      }),
      dependencies(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      rateEvents: 2,
      posts: 1,
      comments: 3,
      reports: 4,
      moderationActions: 5,
      anonymousUsers: 6,
    });
  });
});
