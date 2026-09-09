import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  communityEngagementRepository,
  getEngagement,
  recordPostView,
  setPostRecommendation,
  CommunityEngagementError,
  type CommunityEngagementRepository,
} from '@/lib/community/engagement-service';
import type { CommunityActor } from '@/lib/community/types';

const { getServerSupabaseMock } = vi.hoisted(() => ({
  getServerSupabaseMock: vi.fn(),
}));
vi.mock('@/lib/community/supabase', () => ({
  getServerSupabase: getServerSupabaseMock,
}));

const ACTOR: CommunityActor = {
  id: '10000000-0000-4000-8000-000000000001',
  isAnonymous: true,
  email: null,
};
const POST_ID = '30000000-0000-4000-8000-000000000001';
const ABUSE_KEY = 'a'.repeat(64);

afterEach(() => getServerSupabaseMock.mockReset());

function repository(
  overrides: Partial<CommunityEngagementRepository> = {},
): CommunityEngagementRepository {
  return {
    getEngagement: async () => ({
      viewCount: 12,
      recommendationCount: 3,
      recommended: false,
      canRecommend: true,
    }),
    consumeRateLimit: async () => ({
      allowed: true,
      retryAfterSeconds: 0,
      retryAt: null,
    }),
    recordView: async () => ({
      viewCount: 13,
      recommendationCount: 3,
      recommended: false,
      canRecommend: true,
    }),
    setRecommendation: async () => ({
      viewCount: 12,
      recommendationCount: 4,
      recommended: true,
      canRecommend: true,
    }),
    ...overrides,
  };
}

describe('getEngagement', () => {
  it('returns public counts without an actor recommendation state', async () => {
    const repo = repository({
      getEngagement: async (postId, actorId) => {
        expect(postId).toBe(POST_ID);
        expect(actorId).toBeNull();
        return {
          viewCount: 12,
          recommendationCount: 3,
          recommended: false,
          canRecommend: false,
        };
      },
    });

    await expect(getEngagement(POST_ID, null, repo)).resolves.toEqual({
      viewCount: 12,
      recommendationCount: 3,
      recommended: false,
      canRecommend: false,
    });
  });
});

describe('communityEngagementRepository RPC boundary', () => {
  it('sends only post and verified actor IDs when recording a view', async () => {
    const calls: unknown[] = [];
    getServerSupabaseMock.mockReturnValue({
      rpc: async (name: string, parameters: unknown) => {
        calls.push({ name, parameters });
        return {
          data: {
            viewCount: 13,
            recommendationCount: 3,
            recommended: false,
            canRecommend: true,
          },
          error: null,
        };
      },
    });

    await communityEngagementRepository.recordView(POST_ID, ACTOR.id);

    expect(calls).toEqual([
      {
        name: 'record_community_post_view',
        parameters: { p_post_id: POST_ID, p_actor_id: ACTOR.id },
      },
    ]);
  });

  it.each([true, false])(
    'sends the exact desired recommendation state: %s',
    async (recommended) => {
      const calls: unknown[] = [];
      getServerSupabaseMock.mockReturnValue({
        rpc: async (name: string, parameters: unknown) => {
          calls.push({ name, parameters });
          return {
            data: {
              viewCount: 12,
              recommendationCount: recommended ? 4 : 3,
              recommended,
              canRecommend: true,
            },
            error: null,
          };
        },
      });

      await communityEngagementRepository.setRecommendation(
        POST_ID,
        ACTOR.id,
        recommended,
      );

      expect(calls).toEqual([
        {
          name: 'set_community_post_recommendation',
          parameters: {
            p_post_id: POST_ID,
            p_actor_id: ACTOR.id,
            p_recommended: recommended,
          },
        },
      ]);
    },
  );
});

describe('recordPostView', () => {
  it('consumes the separate 60 per minute view quota before recording', async () => {
    const events: string[] = [];
    const repo = repository({
      consumeRateLimit: async (request) => {
        events.push(
          `${request.action}:${request.limit}:${request.windowSeconds}:${request.actorId}:${request.abuseKey}`,
        );
        return { allowed: true, retryAfterSeconds: 0, retryAt: null };
      },
      recordView: async (postId, actorId) => {
        events.push(`view:${postId}:${actorId}`);
        return {
          viewCount: 13,
          recommendationCount: 3,
          recommended: false,
          canRecommend: true,
        };
      },
    });

    await recordPostView(ACTOR, POST_ID, { abuseKey: ABUSE_KEY }, repo);

    expect(events).toEqual([
      `view:60:60:${ACTOR.id}:${ABUSE_KEY}`,
      `view:${POST_ID}:${ACTOR.id}`,
    ]);
  });
});

describe('setPostRecommendation', () => {
  it.each([true, false])(
    'sends the desired %s state after consuming the shared recommendation quota',
    async (recommended) => {
      const events: string[] = [];
      const repo = repository({
        consumeRateLimit: async (request) => {
          events.push(
            `${request.action}:${request.limit}:${request.windowSeconds}`,
          );
          return { allowed: true, retryAfterSeconds: 0, retryAt: null };
        },
        setRecommendation: async (postId, actorId, desired) => {
          events.push(`${postId}:${actorId}:${desired}`);
          return {
            viewCount: 12,
            recommendationCount: desired ? 4 : 3,
            recommended: desired,
            canRecommend: true,
          };
        },
      });

      const result = await setPostRecommendation(
        ACTOR,
        POST_ID,
        recommended,
        { abuseKey: ABUSE_KEY },
        repo,
      );

      expect(events).toEqual([
        'recommend:20:60',
        `${POST_ID}:${ACTOR.id}:${recommended}`,
      ]);
      expect(result.recommended).toBe(recommended);
    },
  );

  it('returns truthful retry metadata when the recommendation quota is exhausted', async () => {
    const repo = repository({
      consumeRateLimit: async () => ({
        allowed: false,
        retryAfterSeconds: 8,
        retryAt: '2026-09-08T08:00:08.000Z',
      }),
      setRecommendation: async () => {
        throw new Error('rate-limited requests must not mutate');
      },
    });

    await expect(
      setPostRecommendation(
        ACTOR,
        POST_ID,
        true,
        { abuseKey: ABUSE_KEY },
        repo,
      ),
    ).rejects.toMatchObject({
      status: 429,
      code: 'community_engagement_rate_limited',
      retryAfterSeconds: 8,
      retryAt: '2026-09-08T08:00:08.000Z',
    });
  });

  it('rejects malformed provider counters instead of inventing a state', async () => {
    const repo = repository({
      setRecommendation: async () =>
        ({
          viewCount: 12,
          recommendationCount: -1,
          recommended: true,
          canRecommend: true,
        }) as never,
    });

    await expect(
      setPostRecommendation(
        ACTOR,
        POST_ID,
        true,
        { abuseKey: ABUSE_KEY },
        repo,
      ),
    ).rejects.toBeInstanceOf(CommunityEngagementError);
  });
});
