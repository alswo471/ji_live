import { fetchToss } from '@/lib/toss-invest';

export const dynamic = 'force-dynamic';

const SYMBOLS = ['005930', '000660', '207940', '373220', '005380', '000270', '105560', '068270', '012450', '034020', 'NVDA', 'AAPL', 'TSLA', 'MSFT'];

type PriceResponse = {
  result: Array<{ symbol: string; timestamp: string; lastPrice: string; currency: string }>;
};

type AccountsResponse = {
  result: Array<{ accountSeq: string; accountType: string }>;
};

type HoldingsResponse = {
  result: {
    items: Array<{
      symbol: string;
      name: string;
      marketCountry: string;
      currency: string;
      quantity: string;
      lastPrice: string;
      profitLoss: { amount: string; rate: string };
    }>;
  };
};

export async function GET() {
  try {
    let holdings: HoldingsResponse['result']['items'] = [];
    let holdingsAvailable = true;

    try {
      const accounts = await fetchToss<AccountsResponse>('/api/v1/accounts');
      const account = accounts.result.find((item) => item.accountType === 'BROKERAGE') ?? accounts.result[0];
      if (account) {
        const response = await fetchToss<HoldingsResponse>('/api/v1/holdings', {
          'X-Tossinvest-Account': account.accountSeq,
        });
        holdings = response.result.items;
      }
    } catch (error) {
      holdingsAvailable = false;
      console.error('Holdings request failed', error);
    }

    const requestedSymbols = [...new Set([...SYMBOLS, ...holdings.map((item) => item.symbol)])];
    const symbols = encodeURIComponent(requestedSymbols.join(','));
    const prices = await fetchToss<PriceResponse>(`/api/v1/prices?symbols=${symbols}`);

    return Response.json({
      prices: prices.result,
      holdings: holdings.map((item) => ({
        symbol: item.symbol,
        name: item.name,
        marketCountry: item.marketCountry,
        currency: item.currency,
        quantity: item.quantity,
        lastPrice: item.lastPrice,
        profitLoss: item.profitLoss.amount,
        profitRate: item.profitLoss.rate,
      })),
      holdingsAvailable,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Dashboard request failed', error);
    return Response.json({ error: '시세를 불러오지 못했습니다.' }, { status: 502 });
  }
}
