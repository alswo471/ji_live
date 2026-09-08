'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { MarketSummary } from '@/components/market/market-summary';
import Link from 'next/link';
import { MarketStatusBar } from '@/components/market/market-status-bar';
import { QuoteTable } from '@/components/market/quote-table';
import { OfficialDailyPanel } from '@/components/market/official-daily-panel';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { useMarketDashboard } from '@/hooks/use-market-dashboard';
import { useDisplayPreferences } from '@/hooks/use-display-preferences';
import {
  MARKET_SECTIONS,
  parseMarketSection,
  type MarketSection,
} from '@/lib/market/navigation';

export default function Home() {
  const [section, setSection] = useState<MarketSection>('kr-stock');
  const [query, setQuery] = useState('');
  const { data, state, refresh } = useMarketDashboard();
  const preferences = useDisplayPreferences();
  useEffect(() => {
    const sync = () =>
      setSection(
        parseMarketSection(
          new URLSearchParams(window.location.search).get('market'),
        ),
      );
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const marketQuotes = useMemo(
    () => data?.quotes.filter((quote) => quote.assetClass === section) ?? [],
    [data, section],
  );
  const quotes = marketQuotes.filter((quote) =>
    [quote.symbol, quote.name, quote.nameKo, quote.nameEn].some((name) =>
      name?.toLowerCase().includes(query.trim().toLowerCase()),
    ),
  );
  const label = MARKET_SECTIONS.find((item) => item.value === section)!.label;
  const pending = section === 'etf' || section === 'news';

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto min-h-screen w-full max-w-[1440px] border-x border-border">
        <MarketSummary quotes={data?.quotes ?? []} />
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-xl">
          <SiteHeader
            current="market"
            marketSection={section}
            refreshing={state === 'loading'}
            onRefresh={() => void refresh()}
          />
        </header>
        {!pending && <MarketStatusBar state={state} fetchedAt={data?.fetchedAt} />}
        <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
          <div>
            <section className="min-w-0" aria-label={label + ' 목록'}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-baseline gap-2">
                  <h1 className="text-2xl font-bold tracking-tight">{label}</h1>
                  {!pending && (
                    <span className="text-sm text-muted-foreground">
                      {marketQuotes.length}종목
                    </span>
                  )}
                </div>
                {!pending && (
                  <label className="flex min-h-11 w-full items-center gap-2 rounded-lg border bg-card px-3 sm:w-64">
                    <Search
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="sr-only">종목 검색</span>
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      type="search"
                      placeholder="종목명 또는 심볼 검색"
                      className="min-w-0 w-full bg-transparent py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                )}
              </div>
              {section === 'etf' ? <OfficialDailyPanel kind="etf" /> : pending ? (
                <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border bg-card px-6 py-12 text-center">
                  <span className="mb-4 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                    준비 중
                  </span>
                  <h2 className="text-lg font-bold">
                    {label}를 준비하고 있어요
                  </h2>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                    {section === 'news'
                      ? '시장에 영향을 주는 뉴스와 원문 링크를 이곳에서 확인할 수 있도록 준비 중입니다.'
                      : 'ETF 상품과 가격 정보를 확인할 수 있도록 준비 중입니다.'}
                  </p>
                  <Link
                    href="/?market=kr-stock"
                    onClick={() => setSection('kr-stock')}
                    className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
                  >
                    한국 주식 보기
                  </Link>
                </div>
              ) : state === 'loading' && !data ? (
                <output className="block rounded-2xl border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
                  종목 데이터를 불러오고 있습니다…
                </output>
              ) : query.trim() && !quotes.length ? (
                <section
                  aria-label="검색 결과 없음"
                  className="rounded-2xl border bg-card px-6 py-16 text-center"
                >
                  <p className="font-semibold">검색 결과가 없습니다</p>
                  <button
                    onClick={() => setQuery('')}
                    className="mt-3 min-h-11 rounded-lg px-4 text-sm font-semibold text-primary hover:bg-muted"
                  >
                    검색 초기화
                  </button>
                </section>
              ) : (
                <QuoteTable
                  quotes={quotes}
                  nameLocale={preferences.nameLocale}
                />
              )}
            </section>
          </div>
          {!!data?.notices.length && (
            <details className="rounded-xl border bg-card p-4 text-sm">
              <summary className="cursor-pointer font-semibold">
                데이터 안내 · {data.notices.length}건
              </summary>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
                {data.notices.map((notice) => (
                  <li key={notice}>{notice}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}
