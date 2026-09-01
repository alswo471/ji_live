import { QuoteBadge } from './quote-badge';
import { PriceChange } from './price-change';
import type { MarketQuote } from '@/lib/market/types';
import type { NameLocale } from '@/hooks/use-display-preferences';

export function IndicatorGrid({ quotes, nameLocale = 'ko' }: { quotes: MarketQuote[]; nameLocale?: NameLocale }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{quotes.map((quote) => <article key={quote.symbol} className="rounded-2xl border bg-card/70 p-4 shadow-lg shadow-black/5">
    <div className="flex items-start justify-between gap-2"><p className="text-xs font-bold text-muted-foreground">{nameLocale === 'en' ? quote.nameEn ?? quote.name : quote.nameKo ?? quote.name}</p><QuoteBadge quote={quote} /></div>
    <div className="mt-5 flex items-end justify-between gap-3"><strong className="font-mono text-xl tracking-tight">{quote.price === null ? '연결 중…' : new Intl.NumberFormat(quote.currency === 'KRW' ? 'ko-KR' : 'en-US', { maximumFractionDigits: 2 }).format(quote.price)}</strong><PriceChange value={quote.changeRate} direction={quote.changeDirection} className="text-xs" /></div>
  </article>)}</div>;
}
