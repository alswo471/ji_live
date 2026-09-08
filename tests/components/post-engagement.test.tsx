import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostEngagement } from '@/components/community/post-engagement';

const { communityWriteMock, sessionState } = vi.hoisted(() => ({
  communityWriteMock: vi.fn(),
  sessionState: { accessToken: 'token' as string | null },
}));

vi.mock('@/lib/community/browser-api', () => ({
  communityWrite: communityWriteMock,
}));
vi.mock('@/hooks/use-community-session', () => ({
  useCommunitySession: () => ({
    status: 'ready',
    accessToken: sessionState.accessToken,
    error: null,
    getAccessToken: vi.fn(),
    ensureSession: vi.fn(),
    invalidateSession: vi.fn(),
  }),
}));
vi.mock('@/components/community/turnstile-challenge', () => ({
  TurnstileChallenge: forwardRef(function Challenge(_props, ref) {
    useImperativeHandle(ref, () => ({ execute: async () => 'captcha' }));
    return null;
  }),
}));

const POST_ID = '30000000-0000-4000-8000-000000000001';
const ENGAGEMENT = {
  viewCount: 12,
  recommendationCount: 3,
  recommended: false,
  canRecommend: true,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('PostEngagement', () => {
  beforeEach(() => {
    communityWriteMock.mockReset();
    sessionState.accessToken = 'token';
    vi.unstubAllGlobals();
  });

  it('does not submit another view when the mounted session token refreshes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json(ENGAGEMENT)),
    );
    communityWriteMock.mockResolvedValue({ ...ENGAGEMENT, viewCount: 13 });
    const { rerender } = render(
      <PostEngagement
        postId={POST_ID}
        initialViewCount={12}
        initialRecommendationCount={3}
      />,
    );
    await screen.findByText('조회 13');

    sessionState.accessToken = 'refreshed-token';
    rerender(
      <PostEngagement
        postId={POST_ID}
        initialViewCount={12}
        initialRecommendationCount={3}
      />,
    );

    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(communityWriteMock).toHaveBeenCalledTimes(1);
  });

  it('loads actor state and records one view for a mounted post', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(ENGAGEMENT));
    vi.stubGlobal('fetch', fetchMock);
    communityWriteMock.mockResolvedValue({ ...ENGAGEMENT, viewCount: 13 });

    render(
      <PostEngagement
        postId={POST_ID}
        initialViewCount={12}
        initialRecommendationCount={3}
      />,
    );

    expect(await screen.findByText('조회 13')).toBeInTheDocument();
    expect(communityWriteMock).toHaveBeenCalledTimes(1);
    expect(communityWriteMock).toHaveBeenCalledWith(
      `/api/community/posts/${POST_ID}/engagement`,
      'POST',
      { action: 'view' },
      expect.any(Object),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serializes recommendations behind the automatic view response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json(ENGAGEMENT)),
    );
    const viewResponse = deferred<typeof ENGAGEMENT>();
    communityWriteMock
      .mockImplementationOnce(() => viewResponse.promise)
      .mockResolvedValueOnce({
        ...ENGAGEMENT,
        viewCount: 13,
        recommendationCount: 4,
        recommended: true,
      })
      .mockResolvedValueOnce({
        ...ENGAGEMENT,
        viewCount: 13,
      });

    render(
      <PostEngagement
        postId={POST_ID}
        initialViewCount={12}
        initialRecommendationCount={3}
      />,
    );

    const button = await screen.findByRole('button', { name: '추천 3' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(communityWriteMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      viewResponse.resolve({ ...ENGAGEMENT, viewCount: 13 });
      await viewResponse.promise;
    });
    await waitFor(() => expect(button).toBeEnabled());

    fireEvent.click(button);
    const cancelButton = await screen.findByRole('button', {
      name: '추천 취소 4',
    });
    fireEvent.click(cancelButton);
    expect(
      await screen.findByRole('button', { name: '추천 3' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      communityWriteMock.mock.calls.slice(1).map((call) => call[2]),
    ).toEqual([
      { action: 'recommend', recommended: true },
      { action: 'recommend', recommended: false },
    ]);
  });

  it('keeps recommendations disabled while a retried load records its view', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json(ENGAGEMENT));
    vi.stubGlobal('fetch', fetchMock);
    const viewResponse = deferred<typeof ENGAGEMENT>();
    communityWriteMock
      .mockImplementationOnce(() => viewResponse.promise)
      .mockResolvedValueOnce({
        ...ENGAGEMENT,
        viewCount: 13,
        recommendationCount: 4,
        recommended: true,
      });

    render(
      <PostEngagement
        postId={POST_ID}
        initialViewCount={null}
        initialRecommendationCount={null}
      />,
    );

    await screen.findByText('추천 수를 불러오지 못했습니다.');
    fireEvent.click(screen.getByRole('button', { name: '집계 다시 불러오기' }));
    const button = await screen.findByRole('button', { name: '추천 3' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(communityWriteMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      viewResponse.resolve({ ...ENGAGEMENT, viewCount: 13 });
      await viewResponse.promise;
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    expect(
      await screen.findByRole('button', { name: '추천 취소 4' }),
    ).toBeEnabled();
    expect(communityWriteMock.mock.calls[1]?.[2]).toEqual({
      action: 'recommend',
      recommended: true,
    });
  });

  it('blocks view retry reentrancy while a recommendation is pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json(ENGAGEMENT)),
    );
    const recommendResponse = deferred<typeof ENGAGEMENT>();
    communityWriteMock.mockRejectedValueOnce(new Error('view failed'));

    render(
      <PostEngagement
        postId={POST_ID}
        initialViewCount={12}
        initialRecommendationCount={3}
      />,
    );

    await screen.findByText('조회를 반영하지 못했습니다.');
    const viewRetry = screen.getByRole('button', {
      name: '조회 다시 반영하기',
    });
    communityWriteMock
      .mockImplementationOnce(() => {
        fireEvent.click(viewRetry);
        return recommendResponse.promise;
      })
      .mockResolvedValueOnce({ ...ENGAGEMENT, viewCount: 12 });
    fireEvent.click(screen.getByRole('button', { name: '추천 3' }));
    expect(viewRetry).toBeDisabled();
    expect(communityWriteMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      recommendResponse.resolve({
        ...ENGAGEMENT,
        recommendationCount: 4,
        recommended: true,
      });
      await recommendResponse.promise;
    });
    const cancelButton = await screen.findByRole('button', {
      name: '추천 취소 4',
    });
    fireEvent.click(cancelButton);

    expect(
      await screen.findByRole('button', { name: '추천 3' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(communityWriteMock.mock.calls.map((call) => call[2])).toEqual([
      { action: 'view' },
      { action: 'recommend', recommended: true },
      { action: 'recommend', recommended: false },
    ]);
  });

  it('blocks recommendation reentrancy while a view retry is pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json(ENGAGEMENT)),
    );
    communityWriteMock.mockRejectedValueOnce(new Error('view failed'));
    render(
      <PostEngagement
        postId={POST_ID}
        initialViewCount={12}
        initialRecommendationCount={3}
      />,
    );

    await screen.findByText('조회를 반영하지 못했습니다.');
    const recommendButton = screen.getByRole('button', { name: '추천 3' });
    const viewRetry = screen.getByRole('button', {
      name: '조회 다시 반영하기',
    });
    const viewResponse = deferred<typeof ENGAGEMENT>();
    communityWriteMock
      .mockImplementationOnce(() => {
        fireEvent.click(recommendButton);
        return viewResponse.promise;
      })
      .mockResolvedValueOnce({
        ...ENGAGEMENT,
        recommendationCount: 4,
        recommended: true,
      });

    fireEvent.click(viewRetry);
    expect(recommendButton).toBeDisabled();
    expect(communityWriteMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      viewResponse.resolve({ ...ENGAGEMENT, viewCount: 13 });
      await viewResponse.promise;
    });
    await waitFor(() => expect(recommendButton).toBeEnabled());
    fireEvent.click(recommendButton);

    expect(
      await screen.findByRole('button', { name: '추천 취소 4' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(communityWriteMock.mock.calls.map((call) => call[2])).toEqual([
      { action: 'view' },
      { action: 'view' },
      { action: 'recommend', recommended: true },
    ]);
  });

  it('retries the same desired recommendation state after failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json(ENGAGEMENT)),
    );
    communityWriteMock
      .mockResolvedValueOnce({ ...ENGAGEMENT, viewCount: 13 })
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({
        ...ENGAGEMENT,
        viewCount: 13,
        recommendationCount: 4,
        recommended: true,
      });
    render(
      <PostEngagement
        postId={POST_ID}
        initialViewCount={12}
        initialRecommendationCount={3}
      />,
    );
    const button = await screen.findByRole('button', { name: '추천 3' });

    fireEvent.click(button);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: '추천 3' }));

    expect(
      await screen.findByRole('button', { name: '추천 취소 4' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      communityWriteMock.mock.calls.slice(1).map((call) => call[2]),
    ).toEqual([
      { action: 'recommend', recommended: true },
      { action: 'recommend', recommended: true },
    ]);
  });

  it('keeps honest counters visible when engagement loading fails and offers retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <PostEngagement
        postId={POST_ID}
        initialViewCount={null}
        initialRecommendationCount={null}
      />,
    );

    expect(await screen.findByText('조회 —')).toBeInTheDocument();
    expect(
      screen.getByText('추천 수를 불러오지 못했습니다.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '집계 다시 불러오기' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
