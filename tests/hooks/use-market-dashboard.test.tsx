import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMarketDashboard } from '@/hooks/use-market-dashboard';

describe('useMarketDashboard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('공개 dashboard 응답을 불러와 ready 상태로 전환한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ quotes: [], fetchedAt: '2026-09-01T10:00:00+09:00', notices: [] }), { status: 200 }));

    const { result, unmount } = renderHook(() => useMarketDashboard());

    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.data?.fetchedAt).toBe('2026-09-01T10:00:00+09:00');
    unmount();
  });

  it('이전 데이터가 있는 재요청 실패는 stale 상태로 유지한다', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ quotes: [], fetchedAt: '2026-09-01T10:00:00+09:00', notices: [] }), { status: 200 }))
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
