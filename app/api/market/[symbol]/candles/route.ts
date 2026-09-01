import { getCandles } from '@/lib/market/candles';
import { INSTRUMENTS } from '@/lib/market/catalog';
import type { CandleRange, CandleResponse } from '@/lib/market/types';

export const dynamic = 'force-dynamic';

type CandleGetter = (symbol: string, range: CandleRange) => Promise<CandleResponse>;
const RANGES = new Set<CandleRange>(['1d', '1w', '1mo']);

export async function handleCandleRequest(
  request: Request,
  rawSymbol: string,
  load: CandleGetter = getCandles,
) {
  const range = new URL(request.url).searchParams.get('range') ?? '1d';
  if (!RANGES.has(range as CandleRange)) {
    return Response.json({ error: '지원하지 않는 차트 기간입니다.' }, { status: 400 });
  }
  const symbol = rawSymbol.toUpperCase();
  if (!INSTRUMENTS.some((instrument) => instrument.symbol === symbol)) {
    return Response.json({ error: '지원하지 않는 종목입니다.' }, { status: 404 });
  }
  return Response.json(await load(symbol, range as CandleRange), {
    headers: {
      'Cache-Control': range === '1d'
        ? 'public, max-age=0, s-maxage=60, stale-while-revalidate=120'
        : 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400',
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
