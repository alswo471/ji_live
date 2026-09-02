import type { DataFreshness } from './types';

export type FreshnessPolicy = {
  maxAgeMs: number;
  futureToleranceMs: number;
};

export const MARKET_TICKER_FRESHNESS: FreshnessPolicy = {
  maxAgeMs: 5 * 60_000,
  futureToleranceMs: 60_000,
};

export function assessTimestampFreshness(
  timestamp: unknown,
  nowMs: number,
  policy: FreshnessPolicy = MARKET_TICKER_FRESHNESS,
  inactive = false,
): { asOf: string | null; freshness: DataFreshness } {
  if (typeof timestamp !== 'number')
    return { asOf: null, freshness: 'unavailable' };

  const date = new Date(timestamp);
  const timestampMs = date.getTime();
  if (
    !Number.isFinite(timestampMs) ||
    timestampMs > nowMs + policy.futureToleranceMs
  ) {
    return { asOf: null, freshness: 'unavailable' };
  }

  return {
    asOf: date.toISOString(),
    freshness:
      inactive || nowMs - timestampMs > policy.maxAgeMs ? 'stale' : 'fresh',
  };
}
