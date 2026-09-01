import type { Instrument } from './types';

export const INSTRUMENTS: Instrument[] = [
  { symbol: '005930', name: '삼성전자', assetClass: 'kr-stock', currency: 'KRW', provider: 'toss', providerSymbol: '005930' },
  { symbol: '000660', name: 'SK하이닉스', assetClass: 'kr-stock', currency: 'KRW', provider: 'toss', providerSymbol: '000660' },
  { symbol: '042700', name: '한미반도체', assetClass: 'kr-stock', currency: 'KRW', provider: 'toss', providerSymbol: '042700' },
  { symbol: '207940', name: '삼성바이오로직스', assetClass: 'kr-stock', currency: 'KRW', provider: 'toss', providerSymbol: '207940' },
  { symbol: '373220', name: 'LG에너지솔루션', assetClass: 'kr-stock', currency: 'KRW', provider: 'toss', providerSymbol: '373220' },
  { symbol: '005380', name: '현대차', assetClass: 'kr-stock', currency: 'KRW', provider: 'toss', providerSymbol: '005380' },
  { symbol: '000270', name: '기아', assetClass: 'kr-stock', currency: 'KRW', provider: 'toss', providerSymbol: '000270' },
  { symbol: '068270', name: '셀트리온', assetClass: 'kr-stock', currency: 'KRW', provider: 'toss', providerSymbol: '068270' },
  { symbol: '012450', name: '한화에어로스페이스', assetClass: 'kr-stock', currency: 'KRW', provider: 'toss', providerSymbol: '012450' },
  { symbol: '034020', name: '두산에너빌리티', assetClass: 'kr-stock', currency: 'KRW', provider: 'toss', providerSymbol: '034020' },
  { symbol: 'NVDA', name: 'NVIDIA', assetClass: 'us-stock', currency: 'USD', provider: 'toss', providerSymbol: 'NVDA' },
  { symbol: 'AAPL', name: 'Apple', assetClass: 'us-stock', currency: 'USD', provider: 'toss', providerSymbol: 'AAPL' },
  { symbol: 'TSLA', name: 'Tesla', assetClass: 'us-stock', currency: 'USD', provider: 'toss', providerSymbol: 'TSLA' },
  { symbol: 'MSFT', name: 'Microsoft', assetClass: 'us-stock', currency: 'USD', provider: 'toss', providerSymbol: 'MSFT' },
  { symbol: 'AMZN', name: 'Amazon', assetClass: 'us-stock', currency: 'USD', provider: 'toss', providerSymbol: 'AMZN' },
  { symbol: 'GOOGL', name: 'Alphabet', assetClass: 'us-stock', currency: 'USD', provider: 'toss', providerSymbol: 'GOOGL' },
  { symbol: 'META', name: 'Meta', assetClass: 'us-stock', currency: 'USD', provider: 'toss', providerSymbol: 'META' },
  { symbol: 'AVGO', name: 'Broadcom', assetClass: 'us-stock', currency: 'USD', provider: 'toss', providerSymbol: 'AVGO' },
  { symbol: 'AMD', name: 'AMD', assetClass: 'us-stock', currency: 'USD', provider: 'toss', providerSymbol: 'AMD' },
  { symbol: 'NFLX', name: 'Netflix', assetClass: 'us-stock', currency: 'USD', provider: 'toss', providerSymbol: 'NFLX' },
  { symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', currency: 'KRW', provider: 'bithumb', providerSymbol: 'KRW-BTC' },
  { symbol: 'ETH', name: 'Ethereum', assetClass: 'crypto', currency: 'KRW', provider: 'bithumb', providerSymbol: 'KRW-ETH' },
  { symbol: 'SOL', name: 'Solana', assetClass: 'crypto', currency: 'KRW', provider: 'bithumb', providerSymbol: 'KRW-SOL' },
  { symbol: 'XRP', name: 'XRP', assetClass: 'crypto', currency: 'KRW', provider: 'bithumb', providerSymbol: 'KRW-XRP' },
  { symbol: 'DOGE', name: 'Dogecoin', assetClass: 'crypto', currency: 'KRW', provider: 'bithumb', providerSymbol: 'KRW-DOGE' },
  { symbol: 'KOSPI', name: 'KOSPI', assetClass: 'index', currency: 'KRW', provider: 'toss', providerSymbol: 'KOSPI' },
  { symbol: 'QQQ', name: 'NASDAQ 100 연동(QQQ)', assetClass: 'index', currency: 'USD', provider: 'toss', providerSymbol: 'QQQ' },
  { symbol: 'USDKRW', name: 'USD/KRW', assetClass: 'fx', currency: 'KRW', provider: 'toss', providerSymbol: 'USD/KRW' },
  { symbol: 'PAXG', name: '금 연동(PAXG)', assetClass: 'metal', currency: 'USD', provider: 'binance', providerSymbol: 'PAXGUSDT' },
];

export function instrumentsByAssetClass(assetClass: Instrument['assetClass']) {
  return INSTRUMENTS.filter((instrument) => instrument.assetClass === assetClass);
}
