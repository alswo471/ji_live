'use client';

import { useEffect, useState } from 'react';
import type { ReferenceFx } from '@/lib/market/reference-fx';

export function useReferenceFx() {
  const [data, setData] = useState<(ReferenceFx & { stale: boolean }) | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch('/api/market/reference-fx', {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Unavailable');
        const result = (await response.json()) as ReferenceFx & {
          stale: boolean;
        };
        if (
          !result ||
          !/^\d{4}-\d{2}-\d{2}$/.test(result.date) ||
          typeof result.stale !== 'boolean' ||
          !Array.isArray(result.rates) ||
          result.rates.length !== 3 ||
          !result.rates.every(
            (rate, i) =>
              rate.currency === ['USD', 'JPY', 'THB'][i] &&
              Number.isFinite(rate.price) &&
              rate.price > 0 &&
              (rate.changeRate === null || Number.isFinite(rate.changeRate)),
          )
        )
          throw new Error('Invalid reference rates');
        if (!controller.signal.aborted) {
          setData(result);
          setFailed(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setData(null);
          setFailed(true);
        }
      } finally {
        pending = false;
      }
    }
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 300_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);
  return { data, failed };
}
