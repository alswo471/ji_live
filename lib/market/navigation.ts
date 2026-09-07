export const MARKET_SECTIONS = [
  { value: 'kr-stock', label: '한국 주식' },
  { value: 'us-stock', label: '미국 주식' },
  { value: 'crypto', label: '암호화폐' },
  { value: 'etf', label: 'ETF' },
  { value: 'news', label: '뉴스' },
] as const;

export type MarketSection = (typeof MARKET_SECTIONS)[number]['value'];

export function parseMarketSection(value: string | null): MarketSection {
  return (
    MARKET_SECTIONS.find((section) => section.value === value)?.value ??
    'kr-stock'
  );
}
