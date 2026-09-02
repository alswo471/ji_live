import { getDashboard } from '@/lib/market/dashboard';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(await getDashboard(), {
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=5, stale-while-revalidate=30' },
    });
  } catch (error) {
    console.error('Dashboard request failed:', error instanceof Error ? error.message : String(error));
    return Response.json({ error: '시세를 불러오지 못했습니다.' }, { status: 502 });
  }
}
