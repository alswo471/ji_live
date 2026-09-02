import { getCandles } from '@/lib/market/candles';
import { CANDLE_INTERVALS, getCandleViewport } from '@/lib/market/candle-intervals';
import { INSTRUMENTS } from '@/lib/market/catalog';
import type { CandleInterval, CandleResponse } from '@/lib/market/types';

export const dynamic = 'force-dynamic';

type CandleGetter = (symbol: string, interval: CandleInterval) => Promise<CandleResponse>;
const INTERVALS = new Set<CandleInterval>(CANDLE_INTERVALS);

export async function handleCandleRequest(
  request: Request,
  rawSymbol: string,
  load: CandleGetter = getCandles,
) {
  const interval = new URL(request.url).searchParams.get('interval') ?? '1m';
  if (!INTERVALS.has(interval as CandleInterval)) {
    return Response.json({ error: '지원하지 않는 차트 주기입니다.' }, { status: 400 });
  }
  const symbol = rawSymbol.toUpperCase();
  if (!INSTRUMENTS.some((instrument) => instrument.symbol === symbol)) {
    return Response.json({ error: '지원하지 않는 종목입니다.' }, { status: 404 });
  }
  const selectedInterval = interval as CandleInterval;
  const ttlSeconds = getCandleViewport(selectedInterval).cacheTtlMs / 1_000;
  const result = await load(symbol, selectedInterval);
  return Response.json(result, {
    headers: {
      'Cache-Control': result.unavailable
        ? 'no-store'
        : `public, max-age=0, s-maxage=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 2}`,
    },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ symbol: string }> | { symbol: string } },
) {
  const { symbol } = await context.params;
  return handleCandleRequest(request, symbol);
}
