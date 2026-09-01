import type { Instrument } from './types';

const LOCALIZED_NAMES: Record<string, { nameKo: string; nameEn: string }> = {
  '005930': { nameKo: '삼성전자', nameEn: 'Samsung Electronics' },
  '000660': { nameKo: 'SK하이닉스', nameEn: 'SK hynix' },
  '009150': { nameKo: '삼성전기', nameEn: 'Samsung Electro-Mechanics' },
  '042700': { nameKo: '한미반도체', nameEn: 'Hanmi Semiconductor' },
  '005380': { nameKo: '현대차', nameEn: 'Hyundai Motor' },
  '035420': { nameKo: 'NAVER', nameEn: 'NAVER' },
  '066570': { nameKo: 'LG전자', nameEn: 'LG Electronics' },
  NVDA: { nameKo: '엔비디아', nameEn: 'NVIDIA' },
  AAPL: { nameKo: '애플', nameEn: 'Apple' },
  TSLA: { nameKo: '테슬라', nameEn: 'Tesla' },
  GOOGL: { nameKo: '알파벳', nameEn: 'Alphabet' },
  BTC: { nameKo: '비트코인', nameEn: 'Bitcoin' },
  ETH: { nameKo: '이더리움', nameEn: 'Ethereum' },
  SOL: { nameKo: '솔라나', nameEn: 'Solana' },
  XRP: { nameKo: '리플', nameEn: 'XRP' },
  DOGE: { nameKo: '도지코인', nameEn: 'Dogecoin' },
  PAXG: { nameKo: '금 연동(PAXG)', nameEn: 'Gold Proxy (PAXG)' },
};

const BASE_INSTRUMENTS: Instrument[] = [
  { symbol: '005930', name: '삼성전자', assetClass: 'kr-stock', currency: 'KRW', provider: 'hyperliquid', providerSymbol: 'xyz:SMSN' },
  { symbol: '000660', name: 'SK하이닉스', assetClass: 'kr-stock', currency: 'KRW', provider: 'hyperliquid', providerSymbol: 'xyz:SKHX' },
  { symbol: '005380', name: '현대차', assetClass: 'kr-stock', currency: 'KRW', provider: 'hyperliquid', providerSymbol: 'xyz:HYUNDAI' },
  { symbol: '009150', name: '삼성전기', assetClass: 'kr-stock', currency: 'KRW', provider: 'binance-futures', providerSymbol: 'SAMSUNGEMUSDT' },
  { symbol: '035420', name: 'NAVER', assetClass: 'kr-stock', currency: 'KRW', provider: 'binance-futures', providerSymbol: 'NAVERUSDT' },
  { symbol: '042700', name: '한미반도체', assetClass: 'kr-stock', currency: 'KRW', provider: 'binance-futures', providerSymbol: 'HANMIUSDT' },
  { symbol: '066570', name: 'LG전자', assetClass: 'kr-stock', currency: 'KRW', provider: 'binance-futures', providerSymbol: 'LGELECTRONICSUSDT' },
  { symbol: 'TSLA', name: 'Tesla', assetClass: 'us-stock', currency: 'USD', provider: 'binance-futures', providerSymbol: 'TSLAUSDT' },
  { symbol: 'NVDA', name: 'NVIDIA', assetClass: 'us-stock', currency: 'USD', provider: 'binance-futures', providerSymbol: 'NVDAUSDT' },
  { symbol: 'AAPL', name: 'Apple', assetClass: 'us-stock', currency: 'USD', provider: 'binance-futures', providerSymbol: 'AAPLUSDT' },
  { symbol: 'GOOGL', name: 'Alphabet', assetClass: 'us-stock', currency: 'USD', provider: 'binance-futures', providerSymbol: 'GOOGLUSDT' },
  { symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', currency: 'KRW', provider: 'bithumb', providerSymbol: 'KRW-BTC' },
  { symbol: 'ETH', name: 'Ethereum', assetClass: 'crypto', currency: 'KRW', provider: 'bithumb', providerSymbol: 'KRW-ETH' },
  { symbol: 'SOL', name: 'Solana', assetClass: 'crypto', currency: 'KRW', provider: 'bithumb', providerSymbol: 'KRW-SOL' },
  { symbol: 'XRP', name: 'XRP', assetClass: 'crypto', currency: 'KRW', provider: 'bithumb', providerSymbol: 'KRW-XRP' },
  { symbol: 'DOGE', name: 'Dogecoin', assetClass: 'crypto', currency: 'KRW', provider: 'bithumb', providerSymbol: 'KRW-DOGE' },
  { symbol: 'PAXG', name: '금 연동(PAXG)', assetClass: 'metal', currency: 'USD', provider: 'binance-spot', providerSymbol: 'PAXGUSDT' },
];

export const INSTRUMENTS: Instrument[] = BASE_INSTRUMENTS.map((instrument) => ({
  ...instrument,
  ...LOCALIZED_NAMES[instrument.symbol],
}));

export function instrumentsByAssetClass(assetClass: Instrument['assetClass']) {
  return INSTRUMENTS.filter((instrument) => instrument.assetClass === assetClass);
}
