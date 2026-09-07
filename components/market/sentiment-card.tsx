'use client';

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- SVG gauge paths require an SVG with an accessible image role, not an img element. */

import { useEffect, useState } from 'react';
import type { BitcoinSentiment } from '@/lib/market/sentiment';

const LABELS: Record<string, string> = {
  'Extreme Fear': '극심한 공포',
  Fear: '공포',
  Neutral: '중립',
  Greed: '탐욕',
  'Extreme Greed': '극심한 탐욕',
};

export function SentimentCard({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<
    (BitcoinSentiment & { stale: boolean }) | null
  >(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/market/sentiment', {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Unavailable');
        const payload: unknown = await response.json();
        if (!payload || typeof payload !== 'object')
          throw new Error('Invalid sentiment');
        const result = payload as Partial<
          BitcoinSentiment & { stale: boolean }
        >;
        if (
          typeof result.value !== 'number' ||
          !Number.isInteger(result.value) ||
          result.value < 0 ||
          result.value > 100 ||
          typeof result.classification !== 'string' ||
          !LABELS[result.classification] ||
          typeof result.asOf !== 'string' ||
          typeof result.stale !== 'boolean' ||
          !Number.isFinite(Date.parse(result.asOf))
        )
          throw new Error('Invalid sentiment');
        if (!controller.signal.aborted) {
          setData({
            value: result.value,
            classification: result.classification,
            asOf: result.asOf,
            stale: result.stale,
          });
          setFailed(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setData(null);
          setFailed(true);
        }
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
      className={compact ? 'min-w-0 p-4' : 'rounded-xl border bg-card p-5'}
      aria-label="비트코인 공포·탐욕 지수"
    >
      <h2 className="text-sm font-bold">공포·탐욕 지수</h2>
      <p className="mt-1 text-xs text-muted-foreground">비트코인 · 일별 지표</p>
      {data ? (
        <>
          {!compact && (
            <svg
              viewBox="0 0 200 120"
              className="mt-4 w-full"
              role="img"
              aria-label={`${LABELS[data.classification]} ${data.value}점, 100점 만점`}
            >
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke="currentColor"
                strokeWidth="16"
                className="text-muted"
              />
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke="currentColor"
                strokeWidth="16"
                pathLength="100"
                strokeDasharray={`${data.value} 100`}
                className="text-primary"
              />
              <line
                x1="100"
                y1="100"
                x2="35"
                y2="100"
                stroke="currentColor"
                strokeWidth="3"
                transform={`rotate(${data.value * 1.8} 100 100)`}
              />
              <circle cx="100" cy="100" r="5" fill="currentColor" />
            </svg>
          )}
          <div className="flex items-baseline justify-between gap-2">
            <strong
              className={
                compact
                  ? 'text-lg font-bold tabular-nums'
                  : 'text-3xl font-bold tabular-nums'
              }
            >
              {data.value}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                / 100
              </span>
            </strong>
            <span className="text-sm font-semibold">
              {LABELS[data.classification]}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {data.stale ? '갱신 지연 · ' : ''}
            <time dateTime={data.asOf}>
              {new Intl.DateTimeFormat('ko-KR', {
                timeZone: 'UTC',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              }).format(new Date(data.asOf))}
            </time>{' '}
            기준 (UTC)
          </p>
        </>
      ) : (
        <output className="block py-8 text-sm text-muted-foreground">
          {failed
            ? '지수 미제공 · 다음 갱신에 재시도합니다.'
            : '심리 지수를 불러오는 중…'}
        </output>
      )}
      <a
        href="https://alternative.me/crypto/fear-and-greed-index/"
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold text-primary underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        ⓘ Alternative.me
      </a>
      {!compact && (
        <p className="text-xs leading-5 text-muted-foreground">
          한국·미국 주식의 심리 지수가 아닙니다.
        </p>
      )}
    </section>
  );
}
