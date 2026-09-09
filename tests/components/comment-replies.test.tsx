import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CommentList } from '@/components/community/comment-list';
import type { CommunityComment, CommentInput } from '@/lib/community/types';

const root: CommunityComment = {
  id: '20000000-0000-4000-8000-000000000001',
  postId: '10000000-0000-4000-8000-000000000001',
  authorName: '원댓글 작성자',
  body: '원댓글',
  createdAt: '2026-09-09T01:00:00Z',
  canDelete: true,
  replyCount: 2,
};
afterEach(() => vi.unstubAllGlobals());

it('never offers actions on an unavailable root or reveals its supplied text', () => {
  render(
    <CommentList
      comments={[{ ...root, unavailable: true }]}
      onDelete={() => {}}
      onReport={async () => {}}
    />,
  );
  expect(screen.getByText('삭제·숨김 처리된 댓글입니다.')).toBeInTheDocument();
  expect(screen.queryByText(root.authorName)).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: '삭제' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: '신고' }),
  ).not.toBeInTheDocument();
});

it('loads replies only when opened, sends parent and emoji, retains text after submit failure', async () => {
  const { CommentReplies } =
    await import('@/components/community/comment-replies');
  const request = vi
    .fn()
    .mockResolvedValue(
      Response.json({ items: [], nextCursor: null, repliesEnabled: true }),
    );
  vi.stubGlobal('fetch', request);
  const received: CommentInput[] = [];
  render(
    <CommentReplies
      comment={root}
      onSubmit={async (input) => {
        received.push(input);
        throw new Error();
      }}
      onDelete={async () => {}}
      onReport={async () => {}}
    />,
  );
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '답글 쓰기' }));
  const field = await screen.findByRole('textbox', { name: '답글' });
  fireEvent.change(field, { target: { value: '답글 😀' } });
  fireEvent.click(screen.getByRole('button', { name: '답글 올리기' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '올리지 못했습니다',
  );
  expect(field).toHaveValue('답글 😀');
  expect(received).toEqual([
    {
      body: '답글 😀',
      idempotencyKey: expect.any(String),
      parentCommentId: root.id,
    },
  ]);
  expect(request.mock.calls[0][0]).toContain(`parentCommentId=${root.id}`);
});

it('retains loaded replies after a failed next page and ignores a late page when parent changes', async () => {
  const { CommentReplies } =
    await import('@/components/community/comment-replies');
  let late!: (value: Response) => void;
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        items: [{ ...root, id: 'reply', body: '먼저 불러온 답글' }],
        nextCursor: 'next',
        repliesEnabled: true,
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          late = resolve;
        }),
    );
  vi.stubGlobal('fetch', request);
  const props = {
    onSubmit: async () => {},
    onDelete: async () => {},
    onReport: async () => {},
  };
  const view = render(<CommentReplies comment={root} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '답글 2개 보기' }));
  await screen.findByText('먼저 불러온 답글');
  fireEvent.click(screen.getByRole('button', { name: '답글 더 보기' }));
  await screen.findByRole('alert');
  expect(screen.getByText('먼저 불러온 답글')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '답글 더 보기' }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  view.rerender(
    <CommentReplies comment={{ ...root, id: 'new-parent' }} {...props} />,
  );
  await act(async () =>
    late(
      Response.json({
        items: [{ ...root, body: '늦은 답글' }],
        nextCursor: null,
        repliesEnabled: true,
      }),
    ),
  );
  expect(screen.queryByText('늦은 답글')).not.toBeInTheDocument();
  expect(screen.queryByText('먼저 불러온 답글')).not.toBeInTheDocument();
});

it('ignores replies arriving after token changes and does not duplicate a pending page request', async () => {
  const { CommentReplies } =
    await import('@/components/community/comment-replies');
  let finish!: (response: Response) => void;
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        items: [{ ...root, id: 'first-reply', body: '이전 세션 답글' }],
        nextCursor: 'next',
        repliesEnabled: true,
      }),
    )
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
  vi.stubGlobal('fetch', request);
  const props = {
    comment: root,
    onSubmit: async () => {},
    onDelete: async () => {},
    onReport: async () => {},
  };
  const view = render(<CommentReplies {...props} accessToken="first" />);
  fireEvent.click(screen.getByRole('button', { name: '답글 2개 보기' }));
  await screen.findByText('이전 세션 답글');
  const more = screen.getByRole('button', { name: '답글 더 보기' });
  fireEvent.click(more);
  fireEvent.click(more);
  expect(request).toHaveBeenCalledTimes(2);
  view.rerender(<CommentReplies {...props} accessToken="second" />);
  await act(async () =>
    finish(
      Response.json({
        items: [{ ...root, body: '이전 토큰의 늦은 답글' }],
        nextCursor: null,
        repliesEnabled: true,
      }),
    ),
  );
  expect(screen.queryByText('이전 토큰의 늦은 답글')).not.toBeInTheDocument();
  expect(screen.queryByText('이전 세션 답글')).not.toBeInTheDocument();
});

it('allows reading replies under an unavailable root without exposing a reply form', async () => {
  const { CommentReplies } =
    await import('@/components/community/comment-replies');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({
          items: [{ ...root, body: '남은 공개 답글' }],
          nextCursor: null,
          repliesEnabled: true,
        }),
      ),
  );
  render(
    <CommentReplies
      comment={{ ...root, unavailable: true }}
      onSubmit={async () => {
        throw new Error('cannot reply');
      }}
      onDelete={async () => {}}
      onReport={async () => {}}
    />,
  );
  expect(
    screen.queryByRole('button', { name: '답글 쓰기' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '답글 2개 보기' }));
  await screen.findByText('남은 공개 답글');
  expect(
    screen.queryByRole('textbox', { name: '답글' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '신고' })).toBeInTheDocument();
});
