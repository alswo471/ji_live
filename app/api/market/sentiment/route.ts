import { getSentiment } from '@/lib/market/sentiment';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(await getSentiment(), {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
    });
  } catch {
    return Response.json(
      { error: '심리 지수를 불러오지 못했습니다.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
