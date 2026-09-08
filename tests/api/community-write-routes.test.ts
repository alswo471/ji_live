import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  handleCreatePostRequest,
  type CommunityWriteRouteDependencies,
} from '@/app/api/community/posts/route';
import {
  handleDeletePostRequest,
  type CommunityDeletePostRouteDependencies,
} from '@/app/api/community/posts/[id]/route';
import {
  handleCreateCommentRequest,
  type CommunityCommentWriteRouteDependencies,
} from '@/app/api/community/posts/[id]/comments/route';
import {
  handleDeleteCommentRequest,
  type CommunityDeleteCommentRouteDependencies,
} from '@/app/api/community/comments/[id]/route';
import {
  handleReportRequest,
  type CommunityReportRouteDependencies,
} from '@/app/api/community/reports/route';
import { CommunityAuthError } from '@/lib/community/auth';
import { getTrustedClientIp } from '@/lib/community/abuse-key';
import { CommunityWriteError } from '@/lib/community/write-service';
import type { CommunityActor } from '@/lib/community/types';

const ACTOR: CommunityActor = {
  id: '10000000-0000-4000-8000-000000000001',
  isAnonymous: true,
  email: null,
};
const IDEMPOTENCY_KEY = '50000000-0000-4000-8000-000000000001';
const POST_ID = '30000000-0000-4000-8000-000000000001';
const COMMENT_ID = '40000000-0000-4000-8000-000000000001';

function dependencies(
  overrides: Partial<CommunityWriteRouteDependencies> = {},
): CommunityWriteRouteDependencies {
  return {
    enabled: () => true,
    authenticate: async () => ACTOR,
    resolveClientIp: (request) => request.headers.get('cf-connecting-ip') ?? '',
    verifyHuman: async () => true,
    createAbuseKey: async () => 'a'.repeat(64),
    createPost: async (actor, input) => ({
      id: '30000000-0000-4000-8000-000000000001',
      authorName: '차분한-고양이-0001',
      title: input.title,
      body: input.body,
      linkUrl: input.linkUrl,
      commentCount: 0,
      viewCount: null,
      recommendationCount: null,
      createdAt: '2026-09-03T01:00:00.000Z',
      canDelete: actor.id === ACTOR.id,
    }),
    ...overrides,
  };
}

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/community/posts', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer token',
      'x-turnstile-token': 'turnstile-token',
      'cf-connecting-ip': '203.0.113.10',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  title: '시장 질문',
  body: '오늘 시장 흐름이 궁금합니다.',
  linkUrl: null,
  idempotencyKey: IDEMPOTENCY_KEY,
};

describe('community post write route', () => {
  it('returns 404 before authentication when community is disabled', async () => {
    const response = await handleCreatePostRequest(
      postRequest(VALID_BODY),
      dependencies({
        enabled: () => false,
        authenticate: async () => {
          throw new Error('disabled route must not authenticate');
        },
      }),
    );

    expect(response.status).toBe(404);
  });

  it('returns a safe 401 for missing or invalid authentication', async () => {
    const response = await handleCreatePostRequest(
      postRequest(VALID_BODY),
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
    await expect(response.json()).resolves.toEqual({
      code: 'community_auth_required',
      error: '커뮤니티 인증이 필요합니다.',
    });
  });

  it('fails closed before writing when Turnstile is rejected', async () => {
    const response = await handleCreatePostRequest(
      postRequest(VALID_BODY),
      dependencies({
        verifyHuman: async () => false,
        createPost: async () => {
          throw new Error('rejected Turnstile must not write');
        },
      }),
    );

    expect(response.status).toBe(403);
  });

  it('returns 400 for rejected plain-text input', async () => {
    const response = await handleCreatePostRequest(
      postRequest({ ...VALID_BODY, body: '<script>alert(1)</script>' }),
      dependencies(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'html_not_allowed',
    });
  });

  it('ignores an untrusted body author and writes with the verified actor', async () => {
    const response = await handleCreatePostRequest(
      postRequest({ ...VALID_BODY, authorId: 'malicious-user' }),
      dependencies({
        createPost: async (actor, input, context) => {
          if (actor.id !== ACTOR.id || context.abuseKey !== 'a'.repeat(64)) {
            throw new Error('verified write context was not used');
          }
          if ('authorId' in input)
            throw new Error('untrusted author was not removed');
          return {
            id: '30000000-0000-4000-8000-000000000001',
            authorName: '차분한-고양이-0001',
            title: input.title,
            body: input.body,
            linkUrl: input.linkUrl,
            commentCount: 0,
            viewCount: null,
            recommendationCount: null,
            createdAt: '2026-09-03T01:00:00.000Z',
            canDelete: true,
          };
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({ canDelete: true });
  });
});

function commentDependencies(
  overrides: Partial<CommunityCommentWriteRouteDependencies> = {},
): CommunityCommentWriteRouteDependencies {
  return {
    enabled: () => true,
    authenticate: async () => ACTOR,
    resolveClientIp: (request) => request.headers.get('cf-connecting-ip') ?? '',
    verifyHuman: async () => true,
    createAbuseKey: async () => 'a'.repeat(64),
    createComment: async (actor, postId, input) => ({
      id: COMMENT_ID,
      postId,
      authorName: '차분한-고양이-0001',
      body: input.body,
      createdAt: '2026-09-03T01:10:00.000Z',
      canDelete: actor.id === ACTOR.id,
    }),
    ...overrides,
  };
}

function deletePostDependencies(
  overrides: Partial<CommunityDeletePostRouteDependencies> = {},
): CommunityDeletePostRouteDependencies {
  return {
    enabled: () => true,
    authenticate: async () => ACTOR,
    resolveClientIp: (request) => request.headers.get('cf-connecting-ip') ?? '',
    verifyHuman: async () => true,
    createAbuseKey: async () => 'a'.repeat(64),
    deletePost: async () => undefined,
    ...overrides,
  };
}

function deleteCommentDependencies(
  overrides: Partial<CommunityDeleteCommentRouteDependencies> = {},
): CommunityDeleteCommentRouteDependencies {
  return {
    enabled: () => true,
    authenticate: async () => ACTOR,
    resolveClientIp: (request) => request.headers.get('cf-connecting-ip') ?? '',
    verifyHuman: async () => true,
    createAbuseKey: async () => 'a'.repeat(64),
    deleteComment: async () => undefined,
    ...overrides,
  };
}

function reportDependencies(
  overrides: Partial<CommunityReportRouteDependencies> = {},
): CommunityReportRouteDependencies {
  return {
    enabled: () => true,
    authenticate: async () => ACTOR,
    resolveClientIp: (request) => request.headers.get('cf-connecting-ip') ?? '',
    verifyHuman: async () => true,
    createAbuseKey: async () => 'a'.repeat(64),
    reportContent: async () => ({ accepted: true, temporarilyHidden: false }),
    ...overrides,
  };
}

describe('remaining community write routes', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('rejects a spoofed direct-origin IP before deriving an abuse key', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COMMUNITY_TRUSTED_PROXY_MODE', 'cloudflare');
    vi.stubEnv(
      'COMMUNITY_TRUSTED_PROXY_SECRET',
      'trusted-proxy-secret-at-least-32-characters',
    );
    const createAbuseKey = vi.fn().mockResolvedValue('a'.repeat(64));
    const createPost = vi.fn();

    const response = await handleCreatePostRequest(
      postRequest(VALID_BODY),
      dependencies({
        resolveClientIp: getTrustedClientIp,
        createAbuseKey,
        createPost,
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'untrusted_proxy',
    });
    expect(createAbuseKey).not.toHaveBeenCalled();
    expect(createPost).not.toHaveBeenCalled();
  });

  it.each(['post', 'comment', 'report'] as const)(
    'returns a safe 400 for malformed %s JSON',
    async (target) => {
      const request = new Request(
        target === 'post'
          ? 'http://localhost/api/community/posts'
          : target === 'comment'
            ? `http://localhost/api/community/posts/${POST_ID}/comments`
            : 'http://localhost/api/community/reports',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer token',
            'x-turnstile-token': 'turnstile-token',
            'cf-connecting-ip': '203.0.113.10',
          },
          body: '{',
        },
      );
      const response =
        target === 'post'
          ? await handleCreatePostRequest(request, dependencies())
          : target === 'comment'
            ? await handleCreateCommentRequest(
                request,
                POST_ID,
                commentDependencies(),
              )
            : await handleReportRequest(request, reportDependencies());

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        code: 'invalid_json',
        error: '요청 내용을 확인해 주세요.',
      });
    },
  );

  it('creates a comment with validated input and a verified actor', async () => {
    const request = new Request(
      `http://localhost/api/community/posts/${POST_ID}/comments`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer token',
          'x-turnstile-token': 'turnstile-token',
          'cf-connecting-ip': '203.0.113.10',
        },
        body: JSON.stringify({
          body: '동의합니다.',
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
      },
    );

    const response = await handleCreateCommentRequest(
      request,
      POST_ID,
      commentDependencies(),
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: COMMENT_ID,
      canDelete: true,
    });
  });

  it('rejects an invalid post ID before creating a comment', async () => {
    const response = await handleCreateCommentRequest(
      postRequest({ body: '동의합니다.', idempotencyKey: IDEMPOTENCY_KEY }),
      'invalid',
      commentDependencies(),
    );
    expect(response.status).toBe(400);
  });

  it('deletes a post only through the authenticated service', async () => {
    let actorId = '';
    const response = await handleDeletePostRequest(
      new Request(`http://localhost/api/community/posts/${POST_ID}`, {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer token',
          'x-turnstile-token': 'turnstile-token',
          'cf-connecting-ip': '203.0.113.10',
        },
      }),
      POST_ID,
      deletePostDependencies({
        deletePost: async (actor) => {
          actorId = actor.id;
        },
      }),
    );
    expect(response.status).toBe(204);
    expect(actorId).toBe(ACTOR.id);
  });

  it('deletes a comment only through the authenticated service', async () => {
    const response = await handleDeleteCommentRequest(
      new Request(`http://localhost/api/community/comments/${COMMENT_ID}`, {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer token',
          'x-turnstile-token': 'turnstile-token',
          'cf-connecting-ip': '203.0.113.10',
        },
      }),
      COMMENT_ID,
      deleteCommentDependencies(),
    );
    expect(response.status).toBe(204);
  });

  it.each(['post', 'comment'] as const)(
    'rejects %s deletion before rate consumption when Turnstile is missing',
    async (target) => {
      const createAbuseKey = vi.fn().mockResolvedValue('a'.repeat(64));
      const remove = vi.fn().mockResolvedValue(undefined);
      const request = new Request(
        target === 'post'
          ? `http://localhost/api/community/posts/${POST_ID}`
          : `http://localhost/api/community/comments/${COMMENT_ID}`,
        { method: 'DELETE', headers: { authorization: 'Bearer token' } },
      );
      const response =
        target === 'post'
          ? await handleDeletePostRequest(
              request,
              POST_ID,
              deletePostDependencies({
                verifyHuman: async (token) => token !== '',
                createAbuseKey,
                deletePost: remove,
              }),
            )
          : await handleDeleteCommentRequest(
              request,
              COMMENT_ID,
              deleteCommentDependencies({
                verifyHuman: async (token) => token !== '',
                createAbuseKey,
                deleteComment: remove,
              }),
            );

      expect(response.status).toBe(403);
      expect(createAbuseKey).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it('returns a truthful retry header and timestamp for rate limiting', async () => {
    const retryAt = '2026-09-04T05:01:00.000Z';
    const response = await handleDeletePostRequest(
      new Request(`http://localhost/api/community/posts/${POST_ID}`, {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer token',
          'x-turnstile-token': 'turnstile-token',
          'cf-connecting-ip': '203.0.113.10',
        },
      }),
      POST_ID,
      deletePostDependencies({
        deletePost: async () => {
          throw new CommunityWriteError(
            429,
            'community_rate_limited',
            '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
            47,
            retryAt,
          );
        },
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('47');
    await expect(response.json()).resolves.toMatchObject({ retryAt });
  });

  it('reports content through Turnstile and abuse-key verification', async () => {
    const request = new Request('http://localhost/api/community/reports', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer token',
        'x-turnstile-token': 'turnstile-token',
        'cf-connecting-ip': '203.0.113.10',
      },
      body: JSON.stringify({
        targetType: 'post',
        targetId: POST_ID,
        reason: 'spam',
        detail: '',
      }),
    });
    const response = await handleReportRequest(request, reportDependencies());
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      temporarilyHidden: false,
    });
  });

  it('never returns a provider error message', async () => {
    const response = await handleDeletePostRequest(
      new Request(`http://localhost/api/community/posts/${POST_ID}`, {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer token',
          'x-turnstile-token': 'turnstile-token',
          'cf-connecting-ip': '203.0.113.10',
        },
      }),
      POST_ID,
      deletePostDependencies({
        deletePost: async () => {
          throw new Error('secret provider table detail');
        },
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('secret provider');
  });
});
