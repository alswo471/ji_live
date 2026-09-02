import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMarketCandles } from '@/hooks/use-market-candles';
import type { CandleInterval } from '@/lib/market/types';

describe('useMarketCandles', () => {
  afterEach(() => vi.restoreAllMocks());

  it('선택한 종목과 봉 단위의 캔들을 불러온다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      candles: [{ time: 1788226800, open: 100, high: 110, low: 90, close: 105, volume: 10 }],
      unavailable: false,
    }), { status: 200 }));

    const { result, unmount } = renderHook(() => useMarketCandles('005930', '1d'));

    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.candles[0].close).toBe(105);
    expect(fetch).toHaveBeenCalledWith('/api/market/005930/candles?interval=1d', expect.objectContaining({ cache: 'default' }));
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

  it('늦게 끝난 이전 봉 요청이 현재 선택 결과를 덮어쓰지 않는다', async () => {
    let resolveMinute!: (response: Response) => void;
    let resolveQuarter!: (response: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return new Promise<Response>((resolve) => {
        if (url.includes('interval=1m')) resolveMinute = resolve;
        else resolveQuarter = resolve;
      });
    });
    const { result, rerender, unmount } = renderHook(
      ({ interval }: { interval: CandleInterval }) => useMarketCandles('005930', interval),
      { initialProps: { interval: '1m' as CandleInterval } },
    );

    rerender({ interval: '15m' });
    await act(async () => resolveQuarter(new Response(JSON.stringify({
      candles: [{ time: 2, open: 2, high: 2, low: 2, close: 15, volume: 2 }], unavailable: false,
    }), { status: 200 })));
    await waitFor(() => expect(result.current.candles[0]?.close).toBe(15));

    await act(async () => resolveMinute(new Response(JSON.stringify({
      candles: [{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }], unavailable: false,
    }), { status: 200 })));
    expect(result.current.candles[0]?.close).toBe(15);
    unmount();
  });

  it('긴 봉은 해당 cache 주기에 맞춰 다시 조회한다', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ candles: [], unavailable: false }), { status: 200 }));
    const intervalSpy = vi.spyOn(window, 'setInterval');

    const { unmount } = renderHook(() => useMarketCandles('005930', '1d'));

    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 21_600_000);
    unmount();
  });

  it('같은 봉의 이전 polling 응답이 최신 결과를 덮어쓰지 않는다', async () => {
    vi.useFakeTimers();
    let resolveFirst!: (response: Response) => void;
    let resolveSecond!: (response: Response) => void;
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => new Promise<Response>((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(async () => new Promise<Response>((resolve) => { resolveSecond = resolve; }));

    const { result, unmount } = renderHook(() => useMarketCandles('005930', '1m'));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    await act(async () => resolveSecond(new Response(JSON.stringify({
      candles: [{ time: 2, open: 2, high: 2, low: 2, close: 200, volume: 2 }], unavailable: false,
    }), { status: 200 })));
    await act(async () => Promise.resolve());
    expect(result.current.candles[0]?.close).toBe(200);

    await act(async () => resolveFirst(new Response(JSON.stringify({
      candles: [{ time: 1, open: 1, high: 1, low: 1, close: 100, volume: 1 }], unavailable: false,
    }), { status: 200 })));
    await act(async () => Promise.resolve());

    expect(result.current.candles[0]?.close).toBe(200);
    unmount();
    vi.useRealTimers();
  });
});
