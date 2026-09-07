'use client';

import Link from 'next/link';
import type { MarketQuote } from '@/lib/market/types';
import { useReferenceFx } from '@/hooks/use-reference-fx';
import { PriceChange } from './price-change';

export function MarketSummary({ quotes }: { quotes: MarketQuote[] }) {
  const gold = quotes.find((quote) => quote.symbol === 'PAXG');
  const { data, failed } = useReferenceFx();
  return (
    <section
      aria-label="시장 요약"
      className="market-ticker flex min-w-0 items-center border-b bg-muted/40 text-xs"
    >
      <Link
        href="/indicators"
        title="시장 지표 상세 보기"
        className="market-ticker-window min-w-0 flex-1 overflow-hidden focus-visible:outline-2 focus-visible:outline-ring"
      >
        <div className="market-ticker-track">
          {[false, true].map((copy) => (
            <div
              key={String(copy)}
              aria-hidden={copy || undefined}
              className={
                copy
                  ? 'market-ticker-group market-ticker-copy'
                  : 'market-ticker-group'
              }
            >
              <span className="inline-flex items-center gap-2">
                <b>금 · PAXG</b>
                <span className="text-muted-foreground">금 연동</span>
                <strong className="tabular-nums">
                  {gold?.price != null
                    ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(gold.price)} USDT`
                    : '시세 미제공'}
                </strong>
                {gold?.price != null && (
                  <PriceChange value={gold.changeRate} className="text-xs" />
                )}
                <span className="text-muted-foreground">
                  24시간 대비{gold?.quality === 'stale' ? ' · 갱신 지연' : ''}
                </span>
              </span>
              {data ? (
                data.rates.map((rate) => (
                  <span
                    key={rate.currency}
                    className="inline-flex items-center gap-2"
                  >
                    <b>
                      {rate.currency === 'USD'
                        ? '달러'
                        : rate.currency === 'JPY'
                          ? '100엔'
                          : '바트'}
                    </b>
                    <strong className="tabular-nums">
                      {new Intl.NumberFormat('ko-KR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }).format(rate.price)}
                      원
                    </strong>
                    {rate.changeRate === null ? (
                      <span>비교값 미제공</span>
                    ) : (
                      <PriceChange
                        value={rate.changeRate}
                        className="text-xs"
                      />
                    )}
                    <span className="text-muted-foreground">
                      일별 · {data.date}
                      {data.stale ? ' · 갱신 지연' : ''}
                    </span>
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground">
                  {failed
                    ? '기준환율 미제공 · 재시도 대기'
                    : '기준환율 연결 중…'}
                </span>
              )}
            </div>
          ))}
        </div>
      </Link>
    </section>
  );
}
