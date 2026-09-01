import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMarketCandles } from '@/hooks/use-market-candles';

describe('useMarketCandles', () => {
  afterEach(() => vi.restoreAllMocks());

  it('선택한 종목과 기간의 캔들을 불러온다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      candles: [{ time: 1788226800, open: 100, high: 110, low: 90, close: 105, volume: 10 }],
      unavailable: false,
    }), { status: 200 }));

    const { result, unmount } = renderHook(() => useMarketCandles('005930', '1d'));

    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.candles[0].close).toBe(105);
    expect(fetch).toHaveBeenCalledWith('/api/market/005930/candles?range=1d', expect.objectContaining({ cache: 'no-store' }));
    unmount();
  });

  it('공급자 미지원 응답을 unavailable 상태로 유지한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      candles: [], unavailable: true, message: '차트 데이터를 잠시 불러오지 못했습니다.',
    }), { status: 200 }));

    const { result, unmount } = renderHook(() => useMarketCandles('005930', '1w'));

    await waitFor(() => expect(result.current.state).toBe('unavailable'));
    expect(result.current.message).toContain('잠시');
    unmount();
  });
});
