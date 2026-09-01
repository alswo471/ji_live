import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMarketDashboard } from '@/hooks/use-market-dashboard';

function response(overrides: Record<string, unknown> = {}) {
  return {
    quotes: [{ quality: 'realtime' }],
    fetchedAt: '2026-09-01T10:00:00+09:00',
    notices: [],
    ...overrides,
  };
}

describe('useMarketDashboard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('공개 dashboard 응답을 불러와 ready 상태로 전환한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(response()), { status: 200 }));

    const { result, unmount } = renderHook(() => useMarketDashboard());

    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.data?.fetchedAt).toBe('2026-09-01T10:00:00+09:00');
    unmount();
  });

  it.each([
    ['공급자 공지', response({ notices: ['Bithumb unavailable'] })],
    ['전체 unavailable', response({ quotes: [{ quality: 'unavailable' }] })],
    ['일부 unavailable', response({ quotes: [{ quality: 'realtime' }, { quality: 'unavailable' }] })],
    ['stale 시세', response({ quotes: [{ quality: 'stale' }] })],
  ])('%s가 있으면 degraded 상태로 표시한다', async (_, payload) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    );

    const { result, unmount } = renderHook(() => useMarketDashboard());

    await waitFor(() => expect(result.current.state).toBe('degraded'));
    unmount();
  });

  it('이전 데이터가 있는 재요청 실패는 stale 상태로 유지한다', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(response()), { status: 200 }))
      .mockRejectedValueOnce(new Error('network'));
    const { result, unmount } = renderHook(() => useMarketDashboard());
    await waitFor(() => expect(result.current.state).toBe('ready'));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.state).toBe('stale');
    expect(result.current.data).not.toBeNull();
    unmount();
  });
});
