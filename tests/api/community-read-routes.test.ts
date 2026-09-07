import { describe, expect, it } from 'vitest';
import { handleListPostsRequest } from '@/app/api/community/posts/route';
import { handleGetPostRequest } from '@/app/api/community/posts/[id]/route';
import { handleListCommentsRequest } from '@/app/api/community/posts/[id]/comments/route';
import { CommunityRepositoryError } from '@/lib/community/repository';

const POST_ID = '10000000-0000-4000-8000-000000000001';

describe('community read routes', () => {
  it('returns 404 before opening a data source when community is disabled', async () => {
    const response = await handleListPostsRequest(
      new Request('http://localhost/api/community/posts'),
      async () => {
        throw new Error('disabled route must not load data');
      },
      () => false,
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 400 for an invalid cursor', async () => {
    const response = await handleListPostsRequest(
      new Request(
        'http://localhost/api/community/posts?cursor=invalid&limit=20',
      ),
      async () => {
        throw new Error('invalid cursor must not load data');
      },
      () => true,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: '페이지 정보를 확인할 수 없습니다.',
    });
  });

  it('returns a no-store post page', async () => {
    const response = await handleListPostsRequest(
      new Request('http://localhost/api/community/posts?limit=20'),
      async () => ({ items: [], nextCursor: null }),
      () => true,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('returns 400 for an invalid post ID', async () => {
    const response = await handleGetPostRequest(
      new Request('http://localhost/api/community/posts/not-a-uuid'),
      'not-a-uuid',
      async () => {
        throw new Error('invalid ID must not load data');
      },
      async () => null,
      () => true,
    );

    expect(response.status).toBe(400);
  });

  it('returns 404 when a visible post does not exist', async () => {
    const response = await handleGetPostRequest(
      new Request(`http://localhost/api/community/posts/${POST_ID}`),
      POST_ID,
      async () => null,
      async () => null,
      () => true,
    );

    expect(response.status).toBe(404);
  });

  it('passes only a resolved optional actor to the post loader', async () => {
    const response = await handleGetPostRequest(
      new Request(`http://localhost/api/community/posts/${POST_ID}`, {
        headers: { authorization: 'Bearer valid-token' },
      }),
      POST_ID,
      async (_id, actorId) => ({
        id: POST_ID,
        authorName: '차분한-고양이-0001',
        title: '시장 이야기',
        body: '본문',
        linkUrl: null,
        commentCount: 0,
        createdAt: '2026-09-03T01:00:00.000Z',
        canDelete: actorId === 'actor-id',
      }),
      async () => 'actor-id',
      () => true,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ canDelete: true });
  });

  it('returns a generic 503 without provider details', async () => {
    const providerDetail = 'database host and query must stay private';
    const response = await handleListCommentsRequest(
      new Request(`http://localhost/api/community/posts/${POST_ID}/comments`),
      POST_ID,
      async () => {
        throw new CommunityRepositoryError(providerDetail);
      },
      async () => null,
      () => true,
    );

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(providerDetail);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
