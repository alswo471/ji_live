import { fetchToss } from '@/lib/toss-invest';

export const dynamic = 'force-dynamic';

const SYMBOLS = ['005930', '000660', '005380', '035420', 'NVDA', 'AAPL', 'TSLA', 'MSFT'];

type PriceResponse = {
  result: Array<{
    symbol: string;
    timestamp: string;
    lastPrice: string;
    currency: string;
  }>;
};

export async function GET() {
  try {
    const symbols = encodeURIComponent(SYMBOLS.join(','));
    const data = await fetchToss<PriceResponse>(`/api/v1/prices?symbols=${symbols}`);

    return Response.json({ prices: data.result, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Market price request failed', error);
    return Response.json({ error: '시세를 불러오지 못했습니다.' }, { status: 502 });
  }
}
