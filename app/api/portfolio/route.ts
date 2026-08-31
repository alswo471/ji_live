import { fetchToss } from '@/lib/toss-invest';

export const dynamic = 'force-dynamic';

type AccountsResponse = {
  result: Array<{ accountSeq: string; accountType: string }>;
};

type Money = { krw: string; usd: string };

type HoldingsResponse = {
  result: {
    totalPurchaseAmount: Money;
    marketValue: { amount: Money; amountAfterCost: Money };
    profitLoss: { amount: Money; amountAfterCost: Money; rate: string; rateAfterCost: string };
    items: Array<{
      symbol: string;
      name: string;
      marketCountry: string;
      currency: string;
      quantity: string;
      lastPrice: string;
      averagePurchasePrice: string;
      marketValue: { amount: string; amountAfterCost: string };
      profitLoss: { amount: string; amountAfterCost: string; rate: string; rateAfterCost: string };
    }>;
  };
};

export async function GET() {
  try {
    const accounts = await fetchToss<AccountsResponse>('/api/v1/accounts');
    const account = accounts.result.find((item) => item.accountType === 'BROKERAGE') ?? accounts.result[0];

    if (!account) {
      return Response.json({ portfolio: null, message: '조회 가능한 계좌가 없습니다.' });
    }

    const holdings = await fetchToss<HoldingsResponse>('/api/v1/holdings', {
      'X-Tossinvest-Account': account.accountSeq,
    });

    return Response.json({
      portfolio: {
        totalPurchaseAmount: holdings.result.totalPurchaseAmount,
        marketValue: holdings.result.marketValue.amount,
        profitLoss: holdings.result.profitLoss.amount,
        profitRate: holdings.result.profitLoss.rate,
        items: holdings.result.items.map((item) => ({
          symbol: item.symbol,
          name: item.name,
          marketCountry: item.marketCountry,
          currency: item.currency,
          quantity: item.quantity,
          lastPrice: item.lastPrice,
          averagePurchasePrice: item.averagePurchasePrice,
          marketValue: item.marketValue.amount,
          profitLoss: item.profitLoss.amount,
          profitRate: item.profitLoss.rate,
        })),
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Portfolio request failed', error);
    return Response.json({ error: '보유자산을 불러오지 못했습니다.' }, { status: 502 });
  }
}
