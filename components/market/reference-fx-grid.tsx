'use client';

import { useEffect, useState } from 'react';
import type { ReferenceFx } from '@/lib/market/reference-fx';
import { PriceChange } from './price-change';

const LABELS = {
  USD: '달러 · 1 USD',
  JPY: '엔화 · 100 JPY',
  THB: '바트 · 1 THB',
};
export function ReferenceFxGrid() {
  const [data, setData] = useState<(ReferenceFx & { stale: boolean }) | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch('/api/market/reference-fx', {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Unavailable');
        const result = (await response.json()) as ReferenceFx & {
          stale: boolean;
        };
        if (
          !result ||
          !/^\d{4}-\d{2}-\d{2}$/.test(result.date) ||
          typeof result.stale !== 'boolean' ||
          !Array.isArray(result.rates) ||
          result.rates.length !== 3 ||
          !result.rates.every(
            (rate, i) =>
              rate.currency === ['USD', 'JPY', 'THB'][i] &&
              Number.isFinite(rate.price) &&
              rate.price > 0 &&
              (rate.changeRate === null || Number.isFinite(rate.changeRate)),
          )
        )
          throw new Error('Invalid reference rates');
        if (!controller.signal.aborted) {
          setData(result);
          setFailed(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setData(null);
          setFailed(true);
        }
      } finally {
        pending = false;
      }
    }
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 300_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);
  return (
    <section
      aria-label="일별 기준환율"
      className="rounded-xl border bg-card p-4 sm:p-5"
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
        <div className="grid gap-4 sm:grid-cols-3">
          {data.rates.map((rate) => (
            <article
              key={rate.currency}
              className="min-w-0 rounded-lg bg-muted/35 p-4"
            >
              <h3 className="text-xs font-semibold text-muted-foreground">
                {LABELS[rate.currency]}
              </h3>
              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-xl font-bold tabular-nums">
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
      <div className="mt-3 text-xs leading-5 text-muted-foreground">
        {data?.via === 'frankfurter' && (
          <p>데이터 전달: Frankfurter · ECB 단일 공급자</p>
        )}
        <p>
          ECB 기준 교차계산 ·{' '}
          {data?.previousDate
            ? `${data.previousDate} 발표값 대비`
            : '직전 발표값 대비'}{' '}
          · 실시간 거래 환율이 아닙니다.
        </p>
        <p>
          주말·휴일에는 마지막 발표값을 유지합니다. USDT/KRW 합성환율과는 다른
          지표입니다.
        </p>
        <a
          href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html"
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center font-semibold text-primary underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          출처: European Central Bank (ECB)
        </a>
      </div>
    </section>
  );
}
