import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CommunityDetailPage from '@/app/community/[id]/page';

vi.mock('@/hooks/use-community-session', () => ({
  useCommunitySession: () => ({
    status: 'ready',
    accessToken: 'anonymous-token',
    error: null,
    ensureSession: vi.fn().mockResolvedValue('anonymous-token'),
    getAccessToken: vi.fn().mockResolvedValue('anonymous-token'),
    invalidateSession: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/components/community/turnstile-challenge', () => ({
  TurnstileChallenge: () => <div aria-label="사용자 확인" />,
}));

const POST_ID = '30000000-0000-4000-8000-000000000001';

const post = {
  id: POST_ID,
  authorName: '차분한-고양이-0001',
  title: '댓글 페이지 검증',
  body: '댓글 전체 개수와 다음 페이지를 확인합니다.',
  linkUrl: null,
  commentCount: 42,
  createdAt: '2026-09-04T05:00:00.000Z',
  canDelete: false,
};

const firstComment = {
  id: '40000000-0000-4000-8000-000000000001',
  postId: POST_ID,
  authorName: '푸른-고래-0001',
  body: '첫 페이지 댓글',
  createdAt: '2026-09-04T05:01:00.000Z',
  canDelete: false,
};

function urlOf(input: RequestInfo | URL) {
  return typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

describe('CommunityDetailPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the total comment count and consumes every next cursor', async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = urlOf(input);
        requested.push(url);
        if (url.endsWith(`/posts/${POST_ID}`)) {
          return Promise.resolve(Response.json(post));
        }
        if (url.includes('cursor=next-page')) {
          return Promise.resolve(
            Response.json({
              items: [
                {
                  ...firstComment,
                  id: '40000000-0000-4000-8000-000000000002',
                  body: '두 번째 페이지 댓글',
                },
              ],
              nextCursor: null,
            }),
          );
        }
        return Promise.resolve(
          Response.json({ items: [firstComment], nextCursor: 'next-page' }),
        );
      }),
    );

    await act(async () => {
      render(<CommunityDetailPage params={Promise.resolve({ id: POST_ID })} />);
    });

    expect(await screen.findByRole('heading', { name: '댓글 42' })).toBeVisible();
    expect(screen.getByText('첫 페이지 댓글')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '댓글 더 보기' }));

    expect(await screen.findByText('두 번째 페이지 댓글')).toBeVisible();
    expect(screen.getByText('첫 페이지 댓글')).toBeVisible();
    expect(screen.queryByRole('button', { name: '댓글 더 보기' })).toBeNull();
    expect(requested).toContain(
      `/api/community/posts/${POST_ID}/comments?cursor=next-page`,
    );
  });

  it('keeps loaded comments and offers retry feedback when a later page fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = urlOf(input);
        if (url.endsWith(`/posts/${POST_ID}`)) {
          return Promise.resolve(Response.json(post));
        }
        if (url.includes('cursor=')) {
          return Promise.resolve(new Response(null, { status: 503 }));
        }
        return Promise.resolve(
          Response.json({ items: [firstComment], nextCursor: 'retry-page' }),
        );
      }),
    );

    await act(async () => {
      render(<CommunityDetailPage params={Promise.resolve({ id: POST_ID })} />);
    });
    expect(await screen.findByText('첫 페이지 댓글')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '댓글 더 보기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '댓글을 더 불러오지 못했습니다',
    );
    expect(screen.getByText('첫 페이지 댓글')).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '댓글 더 보기' })).toBeEnabled(),
    );
  });
});
