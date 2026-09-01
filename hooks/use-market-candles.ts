'use client';

import { useEffect, useState } from 'react';
import type { CandlePoint, CandleRange, CandleResponse } from '@/lib/market/types';

type CandleState = 'loading' | 'ready' | 'unavailable' | 'error';

export function useMarketCandles(symbol: string, range: CandleRange): {
  candles: CandlePoint[];
  state: CandleState;
  message: string | null;
} {
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const [state, setState] = useState<CandleState>('loading');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let controller: AbortController | null = null;

    const load = async () => {
      if (document.visibilityState === 'hidden') return;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch(`/api/market/${encodeURIComponent(symbol)}/candles?range=${range}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`candles ${response.status}`);
        const next = await response.json() as CandleResponse;
        setCandles(next.candles);
        setMessage(next.message ?? null);
        setState(next.unavailable ? 'unavailable' : 'ready');
      } catch {
        if (controller.signal.aborted) return;
        setState('error');
        setMessage('차트 데이터 연결을 재시도하고 있습니다.');
      }
    };

    void load();
    const interval = window.setInterval(load, 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      controller?.abort();
    };
  }, [range, symbol]);

  return { candles, state, message };
}
