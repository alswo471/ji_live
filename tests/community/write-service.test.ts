import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  communityWriteRepository,
  createComment,
  createPost,
  deleteComment,
  deletePost,
  reportContent,
  CommunityWriteError,
} from '@/lib/community/write-service';
import type { CommunityPostRecord } from '@/lib/community/repository';
import type { CommunityWriteRepository } from '@/lib/community/write-service';
import type {
  CommentInput,
  CommunityActor,
  PostInput,
  ReportInput,
} from '@/lib/community/types';

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
const OTHER_ACTOR_ID = '20000000-0000-4000-8000-000000000001';
const POST_ID = '30000000-0000-4000-8000-000000000001';
const COMMENT_ID = '40000000-0000-4000-8000-000000000001';
const ABUSE_KEY = 'a'.repeat(64);
const IDEMPOTENCY_KEY = '50000000-0000-4000-8000-000000000001';

const POST_INPUT: PostInput = {
  title: '시장 질문',
  body: '오늘 시장 흐름이 궁금합니다.',
  linkUrl: null,
  idempotencyKey: IDEMPOTENCY_KEY,
};
const COMMENT_INPUT: CommentInput = {
  body: '의견을 남깁니다.',
  idempotencyKey: IDEMPOTENCY_KEY,
};
const REPORT_INPUT: ReportInput = {
  targetType: 'post',
  targetId: POST_ID,
  reason: 'spam',
  detail: '',
};

afterEach(() => {
  getServerSupabaseMock.mockReset();
});

function postRecord(
  overrides: Partial<CommunityPostRecord> = {},
): CommunityPostRecord {
  return {
    id: POST_ID,
    authorId: ACTOR.id,
    authorName: '차분한-고양이-0001',
    title: POST_INPUT.title,
    body: POST_INPUT.body,
    linkUrl: null,
    status: 'visible',
    createdAt: '2026-09-03T01:00:00.000Z',
    commentCount: 0,
    ...overrides,
  };
}

function repository(
  overrides: Partial<CommunityWriteRepository> = {},
): CommunityWriteRepository {
  return {
    isRestricted: async () => false,
    findPostByIdempotency: async () => null,
    findCommentByIdempotency: async () => null,
    consumeRateLimit: async () => ({
      allowed: true,
      retryAfterSeconds: 0,
      retryAt: null,
    }),
    getOrCreateProfileName: async (_actorId, proposedName) => proposedName,
    insertPost: async () => postRecord(),
    insertComment: async ({ actorId, authorName, postId, input }) => ({
      id: COMMENT_ID,
      postId,
      authorId: actorId,
      authorName,
      body: input.body,
      status: 'visible',
      parentStatus: 'visible',
      createdAt: '2026-09-03T01:10:00.000Z',
    }),
    findPostOwnership: async () => null,
    findCommentOwnership: async () => null,
    softDeletePost: async () => undefined,
    softDeleteComment: async () => undefined,
    submitReport: async () => ({ accepted: true, temporarilyHidden: false }),
    ...overrides,
  };
}

describe('community write rate limits', () => {
  it('parses the atomic rate decision and retry window from the database', async () => {
    getServerSupabaseMock.mockReturnValue({
      rpc: async () => ({
        data: {
          allowed: false,
          retryAfterSeconds: 12,
          retryAt: '2026-09-04T05:01:00.000Z',
        },
        error: null,
      }),
    });

    await expect(
      communityWriteRepository.consumeRateLimit({
        actorId: ACTOR.id,
        abuseKey: ABUSE_KEY,
        action: 'delete',
        limit: 10,
        windowSeconds: 600,
      }),
    ).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 12,
      retryAt: '2026-09-04T05:01:00.000Z',
    });
  });

  it.each([
    ['post', 3, 600],
    ['comment', 10, 600],
    ['report', 10, 3600],
  ] as const)(
    '%s consumes the configured atomic rate limit',
    async (action, limit, windowSeconds) => {
      const repo = repository({
        consumeRateLimit: async (request) => ({
          allowed:
            request.action === action &&
            request.actorId === ACTOR.id &&
            request.abuseKey === ABUSE_KEY &&
            request.limit === limit &&
            request.windowSeconds === windowSeconds,
          retryAfterSeconds: 0,
          retryAt: null,
        }),
      });
      const nameFactory = async () => '차분한-고양이-0001';

      if (action === 'post') {
        await expect(
          createPost(
            ACTOR,
            POST_INPUT,
            { abuseKey: ABUSE_KEY },
            repo,
            nameFactory,
          ),
        ).resolves.toMatchObject({ id: POST_ID });
      } else if (action === 'comment') {
        await expect(
          createComment(
            ACTOR,
            POST_ID,
            COMMENT_INPUT,
            { abuseKey: ABUSE_KEY },
            repo,
            nameFactory,
          ),
        ).resolves.toMatchObject({ id: COMMENT_ID });
      } else {
        await expect(
          reportContent(ACTOR, REPORT_INPUT, { abuseKey: ABUSE_KEY }, repo),
        ).resolves.toEqual({ accepted: true, temporarilyHidden: false });
      }
    },
  );
});

describe('createPost', () => {
  it('rejects an actively restricted author before consuming rate quota', async () => {
    const repo = repository({
      isRestricted: async () => true,
      consumeRateLimit: async () => {
        throw new Error('restricted actor must not consume rate quota');
      },
    });

    await expect(
      createPost(ACTOR, POST_INPUT, { abuseKey: ABUSE_KEY }, repo),
    ).rejects.toMatchObject({
      status: 403,
      code: 'community_write_restricted',
    });
  });

  it('returns the actor-owned existing row for an idempotent retry without another rate event', async () => {
    const existing = postRecord();
    const repo = repository({
      findPostByIdempotency: async (actorId, key) =>
        actorId === ACTOR.id && key === IDEMPOTENCY_KEY ? existing : null,
      consumeRateLimit: async () => {
        throw new Error('idempotent retry must not consume another rate event');
      },
    });

    await expect(
      createPost(ACTOR, POST_INPUT, { abuseKey: ABUSE_KEY }, repo),
    ).resolves.toMatchObject({
      id: POST_ID,
      body: POST_INPUT.body,
      canDelete: true,
    });
  });

  it('uses the verified actor ID instead of an untrusted author value', async () => {
    const repo = repository({
      insertPost: async ({ actorId, authorName }) => {
        if (actorId !== ACTOR.id)
          throw new Error('untrusted actor reached repository');
        return postRecord({ authorId: actorId, authorName });
      },
    });

    await expect(
      createPost(
        ACTOR,
        POST_INPUT,
        { abuseKey: ABUSE_KEY },
        repo,
        async () => '차분한-고양이-0001',
      ),
    ).resolves.toMatchObject({ canDelete: true });
  });
});

describe('deletePost', () => {
  it('consumes the guarded delete quota before ownership lookup', async () => {
    const events: string[] = [];
    const repo = repository({
      consumeRateLimit: async (request) => {
        events.push(`rate:${request.action}:${request.limit}:${request.windowSeconds}`);
        return { allowed: true, retryAfterSeconds: 0, retryAt: null };
      },
      findPostOwnership: async () => {
        events.push('ownership');
        return { id: POST_ID, authorId: ACTOR.id, status: 'visible' };
      },
      softDeletePost: async () => {
        events.push('delete');
      },
    });

    await deletePost(ACTOR, POST_ID, { abuseKey: ABUSE_KEY }, repo);
    expect(events).toEqual(['rate:delete:10:600', 'ownership', 'delete']);
  });

  it('returns truthful retry metadata when the quota is exhausted', async () => {
    const retryAt = '2026-09-04T05:01:00.000Z';
    const repo = repository({
      consumeRateLimit: async () => ({
        allowed: false,
        retryAfterSeconds: 47,
        retryAt,
      }),
    });

    await expect(
      deletePost(ACTOR, POST_ID, { abuseKey: ABUSE_KEY }, repo),
    ).rejects.toMatchObject({
      status: 429,
      code: 'community_rate_limited',
      retryAfterSeconds: 47,
      retryAt,
    });
  });

  it('rejects deletion by a non-owner', async () => {
    const repo = repository({
      findPostOwnership: async () => ({
        id: POST_ID,
        authorId: OTHER_ACTOR_ID,
        status: 'visible',
      }),
    });

    await expect(
      deletePost(ACTOR, POST_ID, { abuseKey: ABUSE_KEY }, repo),
    ).rejects.toMatchObject({
      status: 403,
      code: 'community_not_owner',
    });
  });

  it('soft-deletes an owner post', async () => {
    let received: unknown;
    const repo = repository({
      findPostOwnership: async () => ({
        id: POST_ID,
        authorId: ACTOR.id,
        status: 'visible',
      }),
      softDeletePost: async (actorId, targetId) => {
        received = { actorId, targetId };
      },
    });

    await deletePost(ACTOR, POST_ID, { abuseKey: ABUSE_KEY }, repo);
    expect(received).toEqual({ actorId: ACTOR.id, targetId: POST_ID });
  });
});

describe('communityWriteRepository author deletion', () => {
  it.each([
    ['post', POST_ID, 'softDeletePost'],
    ['comment', COMMENT_ID, 'softDeleteComment'],
  ] as const)(
    'calls the author-delete RPC for a %s with the actor and target only',
    async (targetType, targetId, method) => {
      const rpcCalls: Array<{ name: string; parameters: unknown }> = [];
      getServerSupabaseMock.mockReturnValue({
        rpc: async (name: string, parameters: unknown) => {
          rpcCalls.push({ name, parameters });
          return { error: null };
        },
      });

      await communityWriteRepository[method](ACTOR.id, targetId);

      expect(rpcCalls).toEqual([
        {
          name: 'delete_community_content_by_author',
          parameters: {
            p_actor_id: ACTOR.id,
            p_target_type: targetType,
            p_target_id: targetId,
          },
        },
      ]);
    },
  );
});

describe('deleteComment', () => {
  it('soft-deletes an owner comment', async () => {
    let received: unknown;
    const repo = repository({
      findCommentOwnership: async () => ({
        id: COMMENT_ID,
        authorId: ACTOR.id,
        status: 'visible',
      }),
      softDeleteComment: async (actorId, targetId) => {
        received = { actorId, targetId };
      },
    });

    await deleteComment(ACTOR, COMMENT_ID, { abuseKey: ABUSE_KEY }, repo);
    expect(received).toEqual({ actorId: ACTOR.id, targetId: COMMENT_ID });
  });
});

describe('reportContent', () => {
  it('maps a duplicate report to a safe conflict', async () => {
    const repo = repository({
      submitReport: async () => {
        throw new CommunityWriteError(
          409,
          'duplicate_report',
          '이미 신고한 콘텐츠입니다.',
        );
      },
    });

    await expect(
      reportContent(ACTOR, REPORT_INPUT, { abuseKey: ABUSE_KEY }, repo),
    ).rejects.toMatchObject({ status: 409, code: 'duplicate_report' });
  });

  it.each([false, true])(
    'returns only the accepted and hidden result: %s',
    async (hidden) => {
      const repo = repository({
        submitReport: async () => ({
          accepted: true,
          temporarilyHidden: hidden,
        }),
      });

      await expect(
        reportContent(ACTOR, REPORT_INPUT, { abuseKey: ABUSE_KEY }, repo),
      ).resolves.toEqual({ accepted: true, temporarilyHidden: hidden });
    },
  );
});
