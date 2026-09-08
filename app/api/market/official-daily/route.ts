import { getOfficialDaily } from '@/lib/market/official-daily';
import type { OfficialDailyKind } from '@/lib/market/official-daily-types';

export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const kind = params.get('kind');
  const symbol = params.get('symbol') ?? undefined;
  if (!kind || !['stock', 'indices', 'etf'].includes(kind))
    return Response.json(
      { code: 'INVALID_REQUEST' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  try {
    const result = await getOfficialDaily(kind as OfficialDailyKind, symbol);
    return Response.json(result, {
      headers: {
        'Cache-Control': result.stale
          ? 'no-store'
          : 'public, max-age=60, s-maxage=300',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const code = ['NOT_CONFIGURED', 'INVALID_REQUEST'].includes(message)
      ? message
      : 'UNAVAILABLE';
    return Response.json(
      { code },
      {
        status: code === 'INVALID_REQUEST' ? 400 : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
