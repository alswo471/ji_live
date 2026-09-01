export type AssetClass = 'kr-stock' | 'us-stock' | 'crypto' | 'index' | 'fx' | 'metal';
export type MarketSession = 'day' | 'pre' | 'regular' | 'after' | 'closed' | 'always-open';
export type QuoteQuality = 'realtime' | 'delayed' | 'estimated' | 'stale' | 'unavailable';
export type Confidence = 'high' | 'medium' | 'low';
export type MarketProvider = 'toss' | 'binance' | 'bithumb';
export type Currency = 'KRW' | 'USD';

export type MarketQuote = {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  price: number | null;
  currency: Currency;
  changeRate: number | null;
  tradingAmount: number | null;
  asOf: string | null;
  session: MarketSession;
  quality: QuoteQuality;
  provider: MarketProvider | null;
  confidence: Confidence | null;
  estimateInputs: string[];
};

export type Instrument = {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  currency: Currency;
  provider: MarketProvider;
  providerSymbol: string;
};

export type DashboardResponse = {
  quotes: MarketQuote[];
  fetchedAt: string;
  notices: string[];
};
