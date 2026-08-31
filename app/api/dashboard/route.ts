import { fetchToss } from '@/lib/toss-invest';

export const dynamic = 'force-dynamic';

const SYMBOLS = ['005930', '000660', '207940', '373220', '005380', '000270', '105560', '068270', '012450', '034020', 'NVDA', 'AAPL', 'TSLA', 'MSFT'];
const ACCOUNT_CACHE_MS = 60 * 60 * 1000;
const HOLDINGS_CACHE_MS = 30 * 1000;
const MARKET_CACHE_MS = 5 * 1000;

type PriceResponse = { result: Array<{ symbol: string; timestamp: string; lastPrice: string; currency: string }> };
type RankingResponse = { result: { rankings: Array<{ symbol: string; price: { changeRate: string | null }; tradingAmount: string }> } };
type AccountsResponse = { result: Array<{ accountSeq: string; accountType: string }> };
type HoldingItem = {
  symbol: string;
  name: string;
  marketCountry: string;
  currency: string;
  quantity: string;
  lastPrice: string;
  averagePurchasePrice: string;
  profitLoss: { amount: string; rate: string };
};
type HoldingsResponse = { result: { items: HoldingItem[] } };
type MarketItem = PriceResponse['result'][number] & { changeRate?: string | null; tradingAmount?: string };
type TimedCache<T> = { value: T; expiresAt: number };

let accountCache: TimedCache<string | null> | null = null;
let accountRequest: Promise<string | null> | null = null;
let holdingsCache: TimedCache<HoldingItem[]> | null = null;
let holdingsRequest: Promise<HoldingItem[]> | null = null;
let marketCache: (TimedCache<MarketItem[]> & { key: string }) | null = null;
let marketRequest: { key: string; promise: Promise<MarketItem[]> } | null = null;

async function getAccountSeq() {
  if (accountCache && accountCache.expiresAt > Date.now()) return accountCache.value;
  if (accountRequest) return accountRequest;

  accountRequest = (async () => {
    const accounts = await fetchToss<AccountsResponse>('/api/v1/accounts');
    const account = accounts.result.find((item) => item.accountType === 'BROKERAGE') ?? accounts.result[0];
    const accountSeq = account?.accountSeq ?? null;
    accountCache = { value: accountSeq, expiresAt: Date.now() + ACCOUNT_CACHE_MS };
    return accountSeq;
  })();
  try {
    return await accountRequest;
  } finally {
    accountRequest = null;
  }
}

async function getHoldings() {
  if (holdingsCache && holdingsCache.expiresAt > Date.now()) return { items: holdingsCache.value, available: true };
  if (!holdingsRequest) {
    holdingsRequest = (async () => {
      const accountSeq = await getAccountSeq();
      if (!accountSeq) return [];
      const response = await fetchToss<HoldingsResponse>('/api/v1/holdings', { 'X-Tossinvest-Account': accountSeq });
      holdingsCache = { value: response.result.items, expiresAt: Date.now() + HOLDINGS_CACHE_MS };
      return response.result.items;
    })();
  }
  const request = holdingsRequest;
  try {
    return { items: await request, available: true };
  } catch (error) {
    console.error('Holdings request failed:', error instanceof Error ? error.message : String(error));
    return { items: holdingsCache?.value ?? [], available: Boolean(holdingsCache) };
  } finally {
    if (holdingsRequest === request) holdingsRequest = null;
  }
}

async function requestMarketData(requestedSymbols: string[]) {
  const symbols = encodeURIComponent(requestedSymbols.join(','));
  const [prices, ...rankings] = await Promise.all([
    fetchToss<PriceResponse>(`/api/v1/prices?symbols=${symbols}`),
    ...['KR', 'US'].map((marketCountry) => fetchToss<RankingResponse>(`/api/v1/rankings?type=MARKET_TRADING_AMOUNT&marketCountry=${marketCountry}&duration=realtime&count=100`)),
  ]);
  const metrics = new Map<string, { changeRate: string | null; tradingAmount: string }>();
  for (const ranking of rankings) {
    for (const item of ranking.result.rankings) metrics.set(item.symbol, { changeRate: item.price.changeRate, tradingAmount: item.tradingAmount });
  }
  return prices.result.map((item) => ({ ...item, ...metrics.get(item.symbol) }));
}

async function getMarketData(requestedSymbols: string[]) {
  const key = [...requestedSymbols].sort().join(',');
  if (marketCache?.key === key && marketCache.expiresAt > Date.now()) return marketCache.value;
  if (marketRequest?.key === key) return marketRequest.promise;

  const promise = requestMarketData(requestedSymbols)
    .then((value) => {
      marketCache = { key, value, expiresAt: Date.now() + MARKET_CACHE_MS };
      return value;
    })
    .catch((error) => {
      console.error('Market data request failed:', error instanceof Error ? error.message : String(error));
      if (marketCache?.key === key) return marketCache.value;
      throw error;
    })
    .finally(() => {
      if (marketRequest?.promise === promise) marketRequest = null;
    });
  marketRequest = { key, promise };
  return promise;
}

export async function GET() {
  try {
    const { items: holdings, available: holdingsAvailable } = await getHoldings();
    const requestedSymbols = [...new Set([...SYMBOLS, ...holdings.map((item) => item.symbol)])];
    const prices = await getMarketData(requestedSymbols);
    return Response.json({
      prices,
      holdings: holdings.map((item) => ({
        symbol: item.symbol,
        name: item.name,
        marketCountry: item.marketCountry,
        currency: item.currency,
        quantity: item.quantity,
        lastPrice: item.lastPrice,
        averagePurchasePrice: item.averagePurchasePrice,
        profitLoss: item.profitLoss.amount,
        profitRate: item.profitLoss.rate,
      })),
      holdingsAvailable,
      fetchedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Dashboard request failed:', error instanceof Error ? error.message : String(error));
    return Response.json({ error: '시세를 불러오지 못했습니다.' }, { status: 502 });
  }
}
