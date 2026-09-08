import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CommunityDetailPage from '@/app/community/[id]/page';

const sessionMock = vi.hoisted(() => ({
  invalidateSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/use-community-session', () => ({
  useCommunitySession: () => ({
    status: 'ready',
    accessToken: 'anonymous-token',
    error: null,
    ensureSession: vi.fn().mockResolvedValue('anonymous-token'),
    getAccessToken: vi.fn().mockResolvedValue('anonymous-token'),
    invalidateSession: sessionMock.invalidateSession,
  }),
}));

vi.mock('@/components/community/turnstile-challenge', async () => {
  const React = await import('react');
  return {
    TurnstileChallenge: React.forwardRef((_props, ref) => {
      React.useImperativeHandle(ref, () => ({
        execute: vi.fn().mockResolvedValue('turnstile-token'),
      }));
      return <div aria-label="사용자 확인" />;
    }),
  };
});

const POST_ID = '30000000-0000-4000-8000-000000000001';
const SECOND_POST_ID = '30000000-0000-4000-8000-000000000002';

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
    sessionMock.invalidateSession.mockClear();
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

    expect(
      await screen.findByRole('heading', { name: '댓글 42' }),
    ).toBeVisible();
    expect(screen.getByText('첫 페이지 댓글')).toBeVisible();
    expect(
      screen
        .getByText('첫 페이지 댓글')
        .compareDocumentPosition(
          screen.getByRole('textbox', { name: '댓글' }),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
      expect(
        screen.getByRole('button', { name: '댓글 더 보기' }),
      ).toBeEnabled(),
    );
  });

  it('clears stale load-more progress when a post reload wins the race', async () => {
    let resolveStalePage!: (response: Response) => void;
    const stalePage = new Promise<Response>((resolve) => {
      resolveStalePage = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = urlOf(input);
        if (url.includes('cursor=stale-page')) return stalePage;
        if (url.endsWith(`/posts/${SECOND_POST_ID}`)) {
          return Promise.resolve(
            Response.json({ ...post, id: SECOND_POST_ID }),
          );
        }
        if (url.endsWith(`/posts/${POST_ID}`)) {
          return Promise.resolve(Response.json(post));
        }
        return Promise.resolve(
          Response.json({ items: [firstComment], nextCursor: 'stale-page' }),
        );
      }),
    );

    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(
        <CommunityDetailPage params={Promise.resolve({ id: POST_ID })} />,
      );
    });
    expect(await screen.findByText('첫 페이지 댓글')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '댓글 더 보기' }));
    expect(
      screen.getByRole('button', { name: '댓글 불러오는 중…' }),
    ).toBeDisabled();

    await act(async () => {
      view.rerender(
        <CommunityDetailPage
          params={Promise.resolve({ id: SECOND_POST_ID })}
        />,
      );
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '댓글 더 보기' }),
      ).toBeEnabled(),
    );

    resolveStalePage(Response.json({ items: [], nextCursor: null }));
  });

  it('shows recovery guidance when an expired session rejects post deletion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = urlOf(input);
        if (init?.method === 'DELETE') {
          return Promise.resolve(new Response(null, { status: 401 }));
        }
        if (url.endsWith(`/posts/${POST_ID}`)) {
          return Promise.resolve(Response.json({ ...post, canDelete: true }));
        }
        return Promise.resolve(
          Response.json({ items: [firstComment], nextCursor: null }),
        );
      }),
    );

    await act(async () => {
      render(<CommunityDetailPage params={Promise.resolve({ id: POST_ID })} />);
    });
    fireEvent.click(await screen.findByRole('button', { name: '삭제' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '익명 세션이 만료되었습니다. 다시 시도해 주세요.',
    );
    expect(sessionMock.invalidateSession).toHaveBeenCalledOnce();
  });

  it('shows recovery guidance when an expired session rejects comment deletion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = urlOf(input);
        if (init?.method === 'DELETE') {
          return Promise.resolve(new Response(null, { status: 401 }));
        }
        if (url.endsWith(`/posts/${POST_ID}`)) {
          return Promise.resolve(Response.json(post));
        }
        return Promise.resolve(
          Response.json({
            items: [{ ...firstComment, canDelete: true }],
            nextCursor: null,
          }),
        );
      }),
    );

    await act(async () => {
      render(<CommunityDetailPage params={Promise.resolve({ id: POST_ID })} />);
    });
    fireEvent.click(await screen.findByRole('button', { name: '삭제' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '익명 세션이 만료되었습니다. 다시 시도해 주세요.',
    );
    expect(sessionMock.invalidateSession).toHaveBeenCalledOnce();
  });
});
