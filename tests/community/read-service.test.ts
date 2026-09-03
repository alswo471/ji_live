import { describe, expect, it } from 'vitest';
import {
  getPost,
  listComments,
  listPosts,
  CommunityReadInputError,
} from '@/lib/community/read-service';
import type {
  CommunityCommentRecord,
  CommunityPostRecord,
  CommunityReadRepository,
} from '@/lib/community/repository';

const POST_ID = '10000000-0000-4000-8000-000000000001';
const ACTOR_ID = '20000000-0000-4000-8000-000000000001';

function createPost(
  overrides: Partial<CommunityPostRecord> = {},
): CommunityPostRecord {
  return {
    id: POST_ID,
    authorId: ACTOR_ID,
    authorName: '차분한-고양이-0001',
    title: '시장 이야기',
    body: '오늘 시장에 대한 긴 본문입니다.',
    linkUrl: 'https://example.com/article',
    status: 'visible',
    createdAt: '2026-09-03T01:00:00.000Z',
    commentCount: 2,
    ...overrides,
  };
}

function createComment(
  overrides: Partial<CommunityCommentRecord> = {},
): CommunityCommentRecord {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    postId: POST_ID,
    authorId: ACTOR_ID,
    authorName: '신중한-수달-0002',
    body: '좋은 의견입니다.',
    status: 'visible',
    parentStatus: 'visible',
    createdAt: '2026-09-03T01:30:00.000Z',
    ...overrides,
  };
}

function createRepository(
  overrides: Partial<CommunityReadRepository> = {},
): CommunityReadRepository {
  return {
    findPosts: async () => [],
    findPost: async () => null,
    findComments: async () => [],
    ...overrides,
  };
}

describe('listPosts', () => {
  it('clamps the limit, sorts newest first and returns an opaque next cursor', async () => {
    const repository = createRepository({
      findPosts: async ({ limit }) => {
        if (limit !== 31)
          throw new Error(
            'service must request one row beyond the 30 item limit',
          );
        return Array.from({ length: 31 }, (_, index) =>
          createPost({
            id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
            createdAt: new Date(Date.UTC(2026, 8, 3, 0, index)).toISOString(),
          }),
        ).reverse();
      },
    });

    const page = await listPosts(null, 100, repository);

    expect(page.items).toHaveLength(30);
    expect(page.items[0].createdAt).toBe('2026-09-03T00:30:00.000Z');
    expect(page.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(page.nextCursor).not.toContain('2026-09-03');
  });

  it('never returns hidden, deleted or internal fields', async () => {
    const repository = createRepository({
      findPosts: async () => [
        createPost({ status: 'hidden' }),
        createPost({ status: 'deleted' }),
        createPost({ id: '10000000-0000-4000-8000-000000000003' }),
      ],
    });

    const page = await listPosts(null, 20, repository);

    expect(page.items).toEqual([
      {
        id: '10000000-0000-4000-8000-000000000003',
        authorName: '차분한-고양이-0001',
        title: '시장 이야기',
        excerpt: '오늘 시장에 대한 긴 본문입니다.',
        linkUrl: 'https://example.com/article',
        commentCount: 2,
        createdAt: '2026-09-03T01:00:00.000Z',
      },
    ]);
    expect(page.items[0]).not.toHaveProperty('authorId');
    expect(page.items[0]).not.toHaveProperty('status');
  });

  it('rejects a malformed opaque cursor before querying', async () => {
    const repository = createRepository({
      findPosts: async () => {
        throw new Error('invalid cursor must not reach the repository');
      },
    });

    await expect(
      listPosts('not-a-valid-cursor', 20, repository),
    ).rejects.toBeInstanceOf(CommunityReadInputError);
  });
});

describe('getPost', () => {
  it('returns body and ownership without exposing the owner UUID', async () => {
    const repository = createRepository({ findPost: async () => createPost() });

    const post = await getPost(POST_ID, ACTOR_ID, repository);

    expect(post).toMatchObject({
      id: POST_ID,
      body: '오늘 시장에 대한 긴 본문입니다.',
      canDelete: true,
    });
    expect(post).not.toHaveProperty('authorId');
    expect(post).not.toHaveProperty('status');
  });

  it('treats a hidden row as missing even if a repository returns it', async () => {
    const repository = createRepository({
      findPost: async () => createPost({ status: 'hidden' }),
    });

    await expect(getPost(POST_ID, null, repository)).resolves.toBeNull();
  });
});

describe('listComments', () => {
  it('omits comments hidden by their own or parent status and computes ownership', async () => {
    const repository = createRepository({
      findComments: async () => [
        createComment({ status: 'hidden' }),
        createComment({
          id: '30000000-0000-4000-8000-000000000002',
          parentStatus: 'hidden',
        }),
        createComment({ id: '30000000-0000-4000-8000-000000000003' }),
      ],
    });

    const page = await listComments(POST_ID, null, 30, ACTOR_ID, repository);

    expect(page.items).toEqual([
      {
        id: '30000000-0000-4000-8000-000000000003',
        postId: POST_ID,
        authorName: '신중한-수달-0002',
        body: '좋은 의견입니다.',
        createdAt: '2026-09-03T01:30:00.000Z',
        canDelete: true,
      },
    ]);
    expect(page.items[0]).not.toHaveProperty('authorId');
  });
});
