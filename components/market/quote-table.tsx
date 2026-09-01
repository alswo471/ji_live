import Link from 'next/link';
import { PriceChange } from './price-change';
import { QuoteBadge } from './quote-badge';
import type { MarketQuote } from '@/lib/market/types';
import type { NameLocale } from '@/hooks/use-display-preferences';

function formatPrice(quote: MarketQuote) {
  if (quote.price === null) return '시세 연결 중…';
  if (quote.currency === 'KRW') return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(quote.price)}원`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(quote.price);
}

function formatTradingAmount(value: number | null, currency: MarketQuote['currency']) {
  if (value === null) return '집계 중';
  return new Intl.NumberFormat(currency === 'KRW' ? 'ko-KR' : 'en-US', {
    notation: 'compact', maximumFractionDigits: 1,
    ...(currency === 'USD' ? { style: 'currency', currency: 'USD' } : {}),
  }).format(value) + (currency === 'KRW' ? '원' : '');
}

export function QuoteTable({ quotes, nameLocale = 'ko' }: { quotes: MarketQuote[]; nameLocale?: NameLocale }) {
  if (!quotes.length) return <div className="rounded-2xl border border-dashed bg-card/40 px-6 py-16 text-center text-sm text-muted-foreground">표시할 시세가 없습니다.</div>;
  return <div className="overflow-hidden rounded-2xl border bg-card/75 shadow-2xl shadow-black/10 backdrop-blur">
    <div className="hidden grid-cols-[1.4fr_1fr_.8fr_1fr_1.2fr] border-b bg-muted/35 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground md:grid"><span>자산</span><span>현재가</span><span>등락률</span><span>거래대금</span><span>상태</span></div>
    {quotes.map((quote) => {
      const displayName = nameLocale === 'en' ? quote.nameEn ?? quote.name : quote.nameKo ?? quote.name;
      return <Link key={`${quote.assetClass}-${quote.symbol}`} href={`/market/${quote.symbol}`} aria-label={`${displayName} 상세 보기`} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b px-4 py-4 transition-colors last:border-0 hover:bg-muted/35 focus-visible:z-10 focus-visible:bg-muted/35 md:grid-cols-[1.4fr_1fr_.8fr_1fr_1.2fr] md:px-5">
      <div className="min-w-0"><h3 className="truncate font-bold">{displayName}</h3><p className="mt-0.5 font-mono text-xs text-muted-foreground">{quote.symbol}</p></div>
      <div className="text-right md:text-left"><strong className="font-mono text-base tabular-nums">{formatPrice(quote)}</strong><PriceChange value={quote.changeRate} className="mt-1 flex justify-end text-xs md:hidden" /></div>
      <PriceChange value={quote.changeRate} className="hidden text-sm md:inline-flex" />
      <span className="hidden font-mono text-sm text-muted-foreground md:block">{formatTradingAmount(quote.tradingAmount, quote.currency)}</span>
      <div className="col-span-2 min-w-0 md:col-span-1"><QuoteBadge quote={quote} /></div>
    </Link>;})}
  </div>;
}
