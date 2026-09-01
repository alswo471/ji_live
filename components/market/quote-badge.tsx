import { Badge } from '@/components/ui/badge';
import type { MarketQuote } from '@/lib/market/types';

const SESSION_LABEL = { day: '데이마켓', pre: '프리장', regular: '정규장', after: '애프터장', closed: '장 마감', 'always-open': '24시간' } as const;
const PROVIDER_LABEL = { toss: 'Toss', binance: 'Binance', bithumb: 'Bithumb' } as const;
const CONFIDENCE_LABEL = { high: '높음', medium: '보통', low: '낮음' } as const;

export function QuoteBadge({ quote }: { quote: MarketQuote }) {
  if (quote.quality === 'estimated') {
    return <span className="inline-flex flex-wrap items-center gap-1.5"><Badge className="border-amber-500/35 bg-amber-500/12 text-amber-300">참고 추정</Badge>{quote.confidence && <span className="text-[11px] text-muted-foreground">신뢰도 {CONFIDENCE_LABEL[quote.confidence]}</span>}</span>;
  }
  if (quote.quality === 'unavailable') return <Badge variant="outline" className="text-muted-foreground">시세 연결 중</Badge>;
  if (quote.quality === 'stale') return <Badge variant="outline" className="text-muted-foreground">마지막 수신 · {quote.provider ? PROVIDER_LABEL[quote.provider] : '출처 확인 중'}</Badge>;
  if (quote.quality === 'delayed') return <Badge variant="outline">지연 시세</Badge>;
  return <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">{SESSION_LABEL[quote.session]} · {quote.provider ? PROVIDER_LABEL[quote.provider] : '연결 중'}</Badge>;
}
