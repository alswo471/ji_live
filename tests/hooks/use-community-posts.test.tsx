import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCommunityPosts } from '@/hooks/use-community-posts';
import type { CommunityFeedKind } from '@/lib/community/feed';

afterEach(() => vi.unstubAllGlobals());
const post = (id: string) => ({
  id,
  kind: 'normal',
  authorName: '작성자',
  title: id,
  excerpt: '',
  linkUrl: null,
  commentCount: 0,
  viewCount: 0,
  recommendationCount: 0,
  createdAt: '2026-09-09T00:00:00Z',
});

it('loads the chosen feed and ignores a previous feed load-more response', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ items: [post('old')], nextCursor: 'next' }),
    )
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(
      Response.json({ items: [post('popular')], nextCursor: null }),
    );
  vi.stubGlobal('fetch', fetcher);
  const { result, rerender } = renderHook(
    ({ feed }: { feed: CommunityFeedKind }) => useCommunityPosts(feed),
    { initialProps: { feed: 'all' as CommunityFeedKind } },
  );
  await waitFor(() => expect(result.current.state).toBe('ready'));
  let more!: Promise<void>;
  act(() => {
    more = result.current.loadMore();
  });
  rerender({ feed: 'popular' });
  await waitFor(() => expect(result.current.items[0]?.id).toBe('popular'));
  expect(fetcher.mock.calls[2][0]).toBe('/api/community/posts?feed=popular');
  await act(async () => {
    finish(Response.json({ items: [post('late')], nextCursor: 'stale' }));
    await more;
  });
  expect(result.current.items.map((item) => item.id)).toEqual(['popular']);
  expect(result.current.hasMore).toBe(false);
  expect(result.current.loadingMore).toBe(false);
});

it('preserves existing items and permits retry when load-more fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ items: [post('one')], nextCursor: 'next' }),
      )
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(
        Response.json({ items: [post('one'), post('two')], nextCursor: null }),
      ),
  );
  const { result } = renderHook(() => useCommunityPosts('popular'));
  await waitFor(() => expect(result.current.state).toBe('ready'));
  await act(async () => {
    await result.current.loadMore();
  });
  expect(result.current.items.map((item) => item.id)).toEqual(['one']);
  expect(result.current.loadMoreError).toBe(true);
  await act(async () => {
    await result.current.loadMore();
  });
  expect(result.current.items.map((item) => item.id)).toEqual(['one', 'two']);
  expect(result.current.loadMoreError).toBe(false);
});
