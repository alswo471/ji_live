import Link from 'next/link';
import { QuoteDetail } from '@/components/market/quote-detail';
import { INSTRUMENTS } from '@/lib/market/catalog';
import type { MarketQuote } from '@/lib/market/types';

export const dynamic = 'force-dynamic';

export default async function MarketDetailPage({ params }: { params: Promise<{ symbol: string }> | { symbol: string } }) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase();
  const instrument = INSTRUMENTS.find((item) => item.symbol === symbol);
  if (!instrument) {
    return <main className="grid min-h-screen place-items-center bg-background px-6 text-center text-foreground"><div><h1 className="text-2xl font-black">종목을 찾을 수 없습니다.</h1><Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 font-bold text-primary-foreground">시장으로 돌아가기</Link></div></main>;
  }
  const initialQuote: MarketQuote = {
    symbol: instrument.symbol,
    name: instrument.name,
    nameKo: instrument.nameKo,
    nameEn: instrument.nameEn,
    assetClass: instrument.assetClass,
    price: null,
    currency: instrument.currency,
    changeRate: null,
    previousClose: null,
    changeRateSource: null,
    tradingAmount: null,
    asOf: null,
    session: instrument.assetClass === 'crypto' || instrument.assetClass === 'metal' || instrument.assetClass === 'fx' ? 'always-open' : 'closed',
    quality: 'unavailable',
    provider: instrument.provider,
    confidence: null,
    estimateInputs: [],
    priceKind: 'unavailable',
    comparisonBasis: null,
    sourceLabel: null,
  };
  return <QuoteDetail initialQuote={initialQuote} />;
}
