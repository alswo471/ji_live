import type { Instrument } from './types';

const LOCALIZED_NAMES: Record<string, { nameKo: string; nameEn: string }> = {
  '005930': { nameKo: '삼성전자', nameEn: 'Samsung Electronics' },
  '000660': { nameKo: 'SK하이닉스', nameEn: 'SK hynix' },
  '042700': { nameKo: '한미반도체', nameEn: 'Hanmi Semiconductor' },
  '207940': { nameKo: '삼성바이오로직스', nameEn: 'Samsung Biologics' },
  '373220': { nameKo: 'LG에너지솔루션', nameEn: 'LG Energy Solution' },
  '005380': { nameKo: '현대차', nameEn: 'Hyundai Motor' },
  '000270': { nameKo: '기아', nameEn: 'Kia' },
  '068270': { nameKo: '셀트리온', nameEn: 'Celltrion' },
  '012450': { nameKo: '한화에어로스페이스', nameEn: 'Hanwha Aerospace' },
  '034020': { nameKo: '두산에너빌리티', nameEn: 'Doosan Enerbility' },
  NVDA: { nameKo: '엔비디아', nameEn: 'NVIDIA' },
  AAPL: { nameKo: '애플', nameEn: 'Apple' },
  TSLA: { nameKo: '테슬라', nameEn: 'Tesla' },
  MSFT: { nameKo: '마이크로소프트', nameEn: 'Microsoft' },
  AMZN: { nameKo: '아마존', nameEn: 'Amazon' },
  GOOGL: { nameKo: '알파벳', nameEn: 'Alphabet' },
  META: { nameKo: '메타', nameEn: 'Meta' },
  AVGO: { nameKo: '브로드컴', nameEn: 'Broadcom' },
  AMD: { nameKo: 'AMD', nameEn: 'AMD' },
  NFLX: { nameKo: '넷플릭스', nameEn: 'Netflix' },
  BTC: { nameKo: '비트코인', nameEn: 'Bitcoin' },
  ETH: { nameKo: '이더리움', nameEn: 'Ethereum' },
  SOL: { nameKo: '솔라나', nameEn: 'Solana' },
  XRP: { nameKo: '리플', nameEn: 'XRP' },
  DOGE: { nameKo: '도지코인', nameEn: 'Dogecoin' },
  KOSPI: { nameKo: '코스피', nameEn: 'KOSPI' },
  QQQ: { nameKo: '나스닥 100 연동(QQQ)', nameEn: 'NASDAQ 100 Proxy (QQQ)' },
  USDKRW: { nameKo: '원·달러 환율', nameEn: 'USD/KRW' },
  PAXG: { nameKo: '금 연동(PAXG)', nameEn: 'Gold Proxy (PAXG)' },
};

const BASE_INSTRUMENTS: Instrument[] = [
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

export const INSTRUMENTS: Instrument[] = BASE_INSTRUMENTS.map((instrument) => ({
  ...instrument,
  ...LOCALIZED_NAMES[instrument.symbol],
}));

export function instrumentsByAssetClass(assetClass: Instrument['assetClass']) {
  return INSTRUMENTS.filter((instrument) => instrument.assetClass === assetClass);
}
