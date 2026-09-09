import { describe, expect, it, vi } from 'vitest';
import {
  handleGetEngagementRequest,
  handlePostEngagementRequest,
  type CommunityEngagementRouteDependencies,
} from '@/app/api/community/posts/[id]/engagement/route';
import { CommunityAuthError } from '@/lib/community/auth';
import { CommunityEngagementError } from '@/lib/community/engagement-service';
import type { CommunityActor } from '@/lib/community/types';

const POST_ID = '30000000-0000-4000-8000-000000000001';
const ACTOR: CommunityActor = {
  id: '10000000-0000-4000-8000-000000000001',
  isAnonymous: true,
  email: null,
};
const ENGAGEMENT = {
  viewCount: 12,
  recommendationCount: 3,
  recommended: false,
  canRecommend: true,
};

function dependencies(
  overrides: Partial<CommunityEngagementRouteDependencies> = {},
): CommunityEngagementRouteDependencies {
  return {
    enabled: () => true,
    authenticate: async () => ACTOR,
    resolveOptionalActor: async () => ACTOR.id,
    resolveClientIp: (request) => request.headers.get('cf-connecting-ip') ?? '',
    verifyHuman: async () => true,
    createAbuseKey: async () => 'a'.repeat(64),
    getEngagement: async () => ENGAGEMENT,
    recordPostView: async () => ({ ...ENGAGEMENT, viewCount: 13 }),
    setPostRecommendation: async (_actor, _postId, recommended) => ({
      ...ENGAGEMENT,
      recommendationCount: recommended ? 4 : 3,
      recommended,
    }),
    ...overrides,
  };
}

function request(
  method: 'GET' | 'POST',
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const init: RequestInit = {
    method,
    headers: {
      authorization: 'Bearer token',
      'content-type': 'application/json',
      'x-turnstile-token': 'turnstile-token',
      'cf-connecting-ip': '203.0.113.10',
      ...headers,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(
    `http://localhost/api/community/posts/${POST_ID}/engagement`,
    init,
  );
}

describe('community engagement GET route', () => {
  it('returns counts and optional verified actor state without caching', async () => {
    const getEngagement = vi.fn().mockResolvedValue(ENGAGEMENT);
    const response = await handleGetEngagementRequest(
      request('GET'),
      POST_ID,
      dependencies({ getEngagement }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual(ENGAGEMENT);
    expect(getEngagement).toHaveBeenCalledWith(POST_ID, ACTOR.id);
  });

  it('rejects a malformed post ID before reading engagement', async () => {
    const getEngagement = vi.fn();
    const response = await handleGetEngagementRequest(
      request('GET'),
      'not-a-uuid',
      dependencies({ getEngagement }),
    );

    expect(response.status).toBe(400);
    expect(getEngagement).not.toHaveBeenCalled();
  });

  it('returns a fixed 503 without provider details when counters are unavailable', async () => {
    const response = await handleGetEngagementRequest(
      request('GET'),
      POST_ID,
      dependencies({
        getEngagement: async () => {
          throw new Error('relation community_post_views does not exist');
        },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: 'community_engagement_unavailable',
      error: '집계 정보를 불러오지 못했습니다.',
    });
  });
});

describe('community engagement POST route', () => {
  it.each([
    [{ action: 'toggle' }],
    [{ action: 'recommend' }],
    [{ action: 'recommend', recommended: 'yes' }],
    [{ action: 'view', recommended: true }],
  ])(
    'rejects malformed action input before authentication: %j',
    async (body) => {
      const authenticate = vi.fn();
      const response = await handlePostEngagementRequest(
        request('POST', body),
        POST_ID,
        dependencies({ authenticate }),
      );

      expect(response.status).toBe(400);
      expect(authenticate).not.toHaveBeenCalled();
    },
  );

  it('requires an authenticated actor before view mutation', async () => {
    const response = await handlePostEngagementRequest(
      request('POST', { action: 'view' }),
      POST_ID,
      dependencies({
        authenticate: async () => {
          throw new CommunityAuthError(
            401,
            'community_auth_required',
            '커뮤니티 인증이 필요합니다.',
          );
        },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: 'community_auth_required',
    });
  });

  it('fails closed before mutation when Turnstile is rejected', async () => {
    const recordPostView = vi.fn();
    const response = await handlePostEngagementRequest(
      request('POST', { action: 'view' }),
      POST_ID,
      dependencies({ verifyHuman: async () => false, recordPostView }),
    );

    expect(response.status).toBe(403);
    expect(recordPostView).not.toHaveBeenCalled();
  });

  it('uses only the verified actor and server-derived abuse key for a view', async () => {
    const recordPostView = vi
      .fn()
      .mockResolvedValue({ ...ENGAGEMENT, viewCount: 13 });
    const response = await handlePostEngagementRequest(
      request('POST', {
        action: 'view',
        actorId: 'attacker',
        viewCount: 999999,
      }),
      POST_ID,
      dependencies({ recordPostView }),
    );

    expect(response.status).toBe(200);
    expect(recordPostView).toHaveBeenCalledWith(ACTOR, POST_ID, {
      abuseKey: 'a'.repeat(64),
    });
  });

  it.each([true, false])(
    'passes the exact desired recommendation state: %s',
    async (recommended) => {
      const setPostRecommendation = vi
        .fn()
        .mockResolvedValue({ ...ENGAGEMENT, recommended });
      const response = await handlePostEngagementRequest(
        request('POST', { action: 'recommend', recommended }),
        POST_ID,
        dependencies({ setPostRecommendation }),
      );

      expect(response.status).toBe(200);
      expect(setPostRecommendation).toHaveBeenCalledWith(
        ACTOR,
        POST_ID,
        recommended,
        { abuseKey: 'a'.repeat(64) },
      );
    },
  );

  it('returns safe retry metadata for rate limiting', async () => {
    const response = await handlePostEngagementRequest(
      request('POST', { action: 'recommend', recommended: true }),
      POST_ID,
      dependencies({
        setPostRecommendation: async () => {
          throw new CommunityEngagementError(
            429,
            'community_engagement_rate_limited',
            '요청이 너무 많습니다.',
            7,
            '2026-09-08T08:00:07.000Z',
          );
        },
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('7');
    await expect(response.json()).resolves.toMatchObject({
      code: 'community_engagement_rate_limited',
      retryAt: '2026-09-08T08:00:07.000Z',
    });
  });
});
