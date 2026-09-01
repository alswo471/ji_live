'use client';

import { useEffect, useState } from 'react';
import { getCandleViewport } from '@/lib/market/candle-intervals';
import type { CandleInterval, CandlePoint, CandleResponse } from '@/lib/market/types';

type CandleState = 'loading' | 'ready' | 'unavailable' | 'error';

export function useMarketCandles(symbol: string, range: CandleInterval): {
  candles: CandlePoint[];
  state: CandleState;
  message: string | null;
} {
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const [state, setState] = useState<CandleState>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const requestKey = `${symbol}:${range}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    let controller: AbortController | null = null;
    let cancelled = false;
    let requestGeneration = 0;
    const activeKey = `${symbol}:${range}`;

    const load = async () => {
      if (document.visibilityState === 'hidden') return;
      const generation = ++requestGeneration;
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      try {
        const response = await fetch(`/api/market/${encodeURIComponent(symbol)}/candles?interval=${range}`, {
          cache: 'default',
          signal: requestController.signal,
        });
        if (!response.ok) throw new Error(`candles ${response.status}`);
        const next = await response.json() as CandleResponse;
        if (cancelled || generation !== requestGeneration) return;
        setCandles(next.candles);
        setMessage(next.message ?? null);
        setState(next.unavailable ? 'unavailable' : 'ready');
        setLoadedKey(activeKey);
      } catch {
        if (cancelled || generation !== requestGeneration || requestController.signal.aborted) return;
        setState('error');
        setMessage('차트 데이터 연결을 재시도하고 있습니다.');
        setLoadedKey(activeKey);
      }
    };

    void load();
    const interval = window.setInterval(load, getCandleViewport(range).cacheTtlMs);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      requestGeneration += 1;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      controller?.abort();
    };
  }, [range, symbol]);

  return loadedKey === requestKey
    ? { candles, state, message }
    : { candles: [], state: 'loading', message: null };
}
