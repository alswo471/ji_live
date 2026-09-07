import { getReferenceFx } from '@/lib/market/reference-fx';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return Response.json(await getReferenceFx(), {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
    });
  } catch (error) {
    console.warn(
      'Reference FX unavailable:',
      error instanceof Error ? error.message : 'Unknown provider error',
    );
    return Response.json(
      { error: '기준환율을 가져오지 못했습니다.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
