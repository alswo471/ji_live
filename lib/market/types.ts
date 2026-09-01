export type AssetClass = 'kr-stock' | 'us-stock' | 'crypto' | 'index' | 'fx' | 'metal';
export type MarketSession = 'day' | 'pre' | 'regular' | 'after' | 'closed' | 'always-open';
export type QuoteQuality = 'realtime' | 'delayed' | 'estimated' | 'stale' | 'unavailable';
export type Confidence = 'high' | 'medium' | 'low';
export type MarketProvider = 'hyperliquid' | 'binance-futures' | 'binance-spot' | 'bithumb';
export type PriceKind = 'actual-product' | 'derived-estimate' | 'unavailable';
export type ComparisonBasis = 'provider-24h' | 'previous-close' | null;
export type Currency = 'KRW' | 'USD';
export type ChangeDirection = 'up' | 'down' | 'flat';
export type ChangeRateSource = 'provider' | 'previous-close' | 'provider-direction' | null;
export type CandleInterval = '1m' | '15m' | '1h' | '4h' | '1d' | '1w' | '1M';

export type CandlePoint = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type CandleResponse = {
  candles: CandlePoint[];
  unavailable: boolean;
  message?: string;
};

export type MarketQuote = {
  symbol: string;
  name: string;
  nameKo?: string;
  nameEn?: string;
  assetClass: AssetClass;
  price: number | null;
  currency: Currency;
  changeRate: number | null;
  changeDirection?: ChangeDirection | null;
  previousClose: number | null;
  changeRateSource: ChangeRateSource;
  tradingAmount: number | null;
  asOf: string | null;
  session: MarketSession;
  quality: QuoteQuality;
  provider: MarketProvider | null;
  confidence: Confidence | null;
  estimateInputs: string[];
  priceKind: PriceKind;
  comparisonBasis: ComparisonBasis;
  sourceLabel: string | null;
};

export type Instrument = {
  symbol: string;
  name: string;
  nameKo?: string;
  nameEn?: string;
  assetClass: AssetClass;
  currency: Currency;
  provider: MarketProvider;
  providerSymbol: string;
};

export type DerivativeTicker = {
  provider: 'hyperliquid' | 'binance-futures';
  providerSymbol: string;
  price: number | null;
  changeRate: number | null;
  tradingAmount: number | null;
  asOf: string;
};

export type DashboardResponse = {
  quotes: MarketQuote[];
  fetchedAt: string;
  notices: string[];
};
