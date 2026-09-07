'use client';

import { useReferenceFx } from '@/hooks/use-reference-fx';
import { PriceChange } from './price-change';

const LABELS = {
  USD: '달러 · 1 USD',
  JPY: '엔화 · 100 JPY',
  THB: '바트 · 1 THB',
};
export function ReferenceFxGrid({ compact = false }: { compact?: boolean }) {
  const { data, failed } = useReferenceFx();
  return (
    <section
      aria-label="일별 기준환율"
      className={
        compact ? 'min-w-0 p-4' : 'rounded-xl border bg-card p-4 sm:p-5'
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold">
          환율{' '}
          <span className="ml-2 rounded bg-muted px-2 py-1 text-xs font-normal text-muted-foreground">
            일별 기준값
          </span>
        </h2>
        {data && (
          <p className="text-xs text-muted-foreground">
            {data.stale ? '갱신 지연 · ' : ''}
            <time dateTime={data.date}>{data.date}</time> 발표
          </p>
        )}
      </div>
      {data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {data.rates.map((rate) => (
            <article
              key={rate.currency}
              className={
                compact ? 'min-w-0' : 'min-w-0 rounded-lg bg-muted/35 p-4'
              }
            >
              <h3 className="text-xs font-semibold text-muted-foreground">
                {LABELS[rate.currency]}
              </h3>
              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
                <strong
                  className={
                    compact
                      ? 'text-base font-bold tabular-nums'
                      : 'text-xl font-bold tabular-nums'
                  }
                >
                  {new Intl.NumberFormat('ko-KR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }).format(rate.price)}
                  원
                </strong>
                {rate.changeRate === null ? (
                  <span className="text-xs text-muted-foreground">
                    비교값 미제공
                  </span>
                ) : (
                  <PriceChange value={rate.changeRate} className="text-xs" />
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <output className="block py-6 text-sm text-muted-foreground">
          {failed
            ? '기준환율을 가져오지 못했습니다. 다음 갱신에 재시도합니다.'
            : '기준환율을 불러오는 중…'}
        </output>
      )}
      {!compact && (
        <div className="mt-3 text-xs leading-5 text-muted-foreground">
          <p>
            {data?.previousDate
              ? `${data.previousDate} 발표값 대비`
              : '직전 발표값 대비'}{' '}
            · 실시간 거래 환율이 아닙니다.
          </p>
        </div>
      )}
    </section>
  );
}
