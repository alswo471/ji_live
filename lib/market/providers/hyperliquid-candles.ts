import { getCandleViewport } from '../candle-intervals';
import { createProviderRequestError } from '../provider-error';
import type { CandleInterval, CandlePoint, Instrument } from '../types';

const ENDPOINT = 'https://api.hyperliquid.xyz/info';

type HyperliquidCandle = {
  t?: unknown;
  o?: unknown;
  h?: unknown;
  l?: unknown;
  c?: unknown;
  v?: unknown;
};

function normalizeCandle(value: HyperliquidCandle): CandlePoint | null {
  const time = Number(value.t) / 1_000;
  const open = Number(value.o);
  const high = Number(value.h);
  const low = Number(value.l);
  const close = Number(value.c);
  const volume = Number(value.v);
  if (
    ![time, open, high, low, close, volume].every(Number.isFinite) ||
    open <= 0 ||
    high <= 0 ||
    low <= 0 ||
    close <= 0 ||
    volume < 0 ||
    high < Math.max(open, close) ||
    low > Math.min(open, close)
  ) {
    return null;
  }
  return { time, open, high, low, close, volume };
}

export async function fetchHyperliquidCandles(
  instrument: Instrument,
  interval: CandleInterval,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<CandlePoint[]> {
  const endTime = now();
  const startTime = Math.max(0, endTime - getCandleViewport(interval).visibleSeconds * 1_000);
  const response = await fetcher(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'candleSnapshot',
      req: {
        coin: instrument.providerSymbol,
        interval,
        startTime,
        endTime,
      },
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok)
    throw createProviderRequestError('Hyperliquid', response, endTime);

  const candles = (await response.json()) as HyperliquidCandle[];
  if (!Array.isArray(candles)) return [];
  return candles
    .flatMap((value) => {
      const candle = normalizeCandle(value);
      return candle ? [candle] : [];
    })
    .sort((a, b) => a.time - b.time);
}
