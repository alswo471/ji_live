'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardResponse } from '@/lib/market/types';

type DashboardState = 'loading' | 'ready' | 'stale' | 'error';

export function useMarketDashboard(): {
  data: DashboardResponse | null;
  state: DashboardState;
  refresh(): Promise<void>;
} {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [state, setState] = useState<DashboardState>('loading');
  const dataRef = useRef<DashboardResponse | null>(null);
  const requestRef = useRef<Promise<void> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (requestRef.current) return requestRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    const request = (async () => {
      try {
        const response = await fetch('/api/dashboard', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`dashboard ${response.status}`);
        const next = await response.json() as DashboardResponse;
        dataRef.current = next;
        setData(next);
        setState('ready');
      } catch {
        if (controller.signal.aborted) return;
        setState(dataRef.current ? 'stale' : 'error');
      } finally {
        if (controllerRef.current === controller) requestRef.current = null;
      }
    })();
    requestRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    void refresh();
    const interval = window.setInterval(refreshWhenVisible, 5_000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      controllerRef.current?.abort();
    };
  }, [refresh]);

  return { data, state, refresh };
}
