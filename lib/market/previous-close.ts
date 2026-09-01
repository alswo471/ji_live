export type PreviousCloseTarget = { symbol: string; asOf: string | null };
export type PreviousCloseLoader = (targets: PreviousCloseTarget[]) => Promise<Map<string, number>>;
export type PreviousCloseRequester = (path: string) => Promise<unknown>;

type DailyCandle = { timestamp: string; closePrice: string };
type CandleResponse = { result: { candles: DailyCandle[] } };

function finiteNumber(value: string | number | null | undefined) {
  const parsed = Number(value);
  return value !== null && value !== undefined && Number.isFinite(parsed) ? parsed : null;
}

export function calculateChangeRate(price: number | null, previousClose: number | null) {
  if (price === null || previousClose === null || previousClose <= 0) return null;
  return price / previousClose - 1;
}

export function selectPreviousClose(candles: DailyCandle[], currentTimestamp: string | null) {
  if (!candles.length) return null;
  const currentDate = currentTimestamp?.slice(0, 10);
  const previous = currentDate && candles[0]?.timestamp.slice(0, 10) === currentDate ? candles[1] : candles[0];
  return finiteNumber(previous?.closePrice);
}

export function createPreviousCloseLoader(
  request: PreviousCloseRequester,
  pathFor: (target: PreviousCloseTarget) => string = (target) => `/api/v1/candles?symbol=${encodeURIComponent(target.symbol)}&interval=1d&count=2`,
): PreviousCloseLoader {
  const cache = new Map<string, number>();
  const inFlight = new Map<string, Promise<number | null>>();

  async function loadOne(target: PreviousCloseTarget) {
    const cacheKey = `${target.symbol}:${target.asOf?.slice(0, 10) ?? 'latest'}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached;
    const active = inFlight.get(cacheKey);
    if (active) return active;
    const promise = (async () => {
      try {
        const response = await request(pathFor(target)) as CandleResponse;
        const previousClose = selectPreviousClose(response.result.candles, target.asOf);
        if (previousClose !== null) cache.set(cacheKey, previousClose);
        return previousClose;
      } finally {
        inFlight.delete(cacheKey);
      }
    })();
    inFlight.set(cacheKey, promise);
    return promise;
  }

  return async (targets) => {
    const result = new Map<string, number>();
    for (let index = 0; index < targets.length; index += 5) {
      const batch = targets.slice(index, index + 5);
      const settled = await Promise.allSettled(batch.map((target) => loadOne(target)));
      settled.forEach((item, itemIndex) => {
        if (item.status === 'fulfilled' && item.value !== null) result.set(batch[itemIndex].symbol, item.value);
      });
    }
    return result;
  };
}
