import { Badge } from '@/components/ui/badge';
import type { MarketQuote } from '@/lib/market/types';

const COMPARISON_LABEL = {
  'provider-24h': '해외 파생상품 기준 · 24시간 전 대비',
  'previous-close': '해외 파생상품 기준 · 전일 종가 대비',
} as const;

function UnavailableBadge() {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      연동 준비 중
    </Badge>
  );
}

function DataStatus({ quote }: { quote: MarketQuote }) {
  if (quote.quality === 'stale') {
    return (
      <span className="whitespace-nowrap text-[11px] text-amber-700 dark:text-amber-300">
        갱신 지연
      </span>
    );
  }
  if (quote.quality === 'delayed') {
    return (
      <span className="whitespace-nowrap text-[11px] text-muted-foreground">
        지연 시세
      </span>
    );
  }
  return null;
}

export function QuoteBadge({ quote }: { quote: MarketQuote }) {
  if (quote.quality === 'unavailable' || quote.priceKind === 'unavailable') {
    return <UnavailableBadge />;
  }

  if (quote.priceKind === 'derived-estimate') {
    return (
      <span className="inline-flex max-w-full flex-wrap items-center gap-1.5">
        <Badge className="border-amber-500/40 bg-amber-500/12 text-amber-800 dark:text-amber-200">
          24시간 추정가
        </Badge>
        {quote.comparisonBasis && (
          <span className="whitespace-nowrap text-[11px] text-muted-foreground">
            {COMPARISON_LABEL[quote.comparisonBasis]}
          </span>
        )}
        <DataStatus quote={quote} />
      </span>
    );
  }

  if (quote.priceKind === 'actual-product')
    return (
      <span className="inline-flex max-w-full flex-wrap items-center gap-1.5">
        <Badge
          variant="outline"
          className="border-emerald-500/35 text-emerald-700 dark:text-emerald-300"
        >
          실제 거래상품
        </Badge>
        <span className="whitespace-nowrap text-[11px] text-muted-foreground">
          {quote.sourceLabel ?? '출처 확인 중'}
        </span>
        <DataStatus quote={quote} />
      </span>
    );

  return <UnavailableBadge />;
}
