'use client';

import { SiteHeader } from '@/components/site/site-header';
import { SiteFooter } from '@/components/site/site-footer';
import { ReferenceFxGrid } from '@/components/market/reference-fx-grid';
import { SentimentCard } from '@/components/market/sentiment-card';
import { IndicatorGrid } from '@/components/market/indicator-grid';
import { OfficialDailyPanel } from '@/components/market/official-daily-panel';
import { useMarketDashboard } from '@/hooks/use-market-dashboard';
import { useDisplayPreferences } from '@/hooks/use-display-preferences';

export default function IndicatorsPage() {
  const { data, state, refresh } = useMarketDashboard();
  const { nameLocale } = useDisplayPreferences();
  const gold =
    data?.quotes.filter((quote) => quote.assetClass === 'metal') ?? [];
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto min-h-screen max-w-[1440px] border-x border-border">
        <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-xl">
          <SiteHeader
            current="indicators"
            refreshing={state === 'loading'}
            onRefresh={() => void refresh()}
          />
        </header>
        <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-2xl font-bold">시장 지표</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              주가지수, 환율, 금과 시장 심리를 종류별로 확인하세요.
            </p>
          </div>
          <OfficialDailyPanel kind="indices" />
          <ReferenceFxGrid />
          <section aria-label="금 연동 상품">
            <h2 className="mb-3 text-lg font-bold">금 · PAXG</h2>
            {gold.length ? (
              <IndicatorGrid quotes={gold} nameLocale={nameLocale} />
            ) : (
              <output className="block rounded-xl border p-5 text-sm text-muted-foreground">
                {state === 'loading'
                  ? '금 연동 상품을 불러오는 중…'
                  : '금 연동 상품 시세 미제공'}
              </output>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              금 현물 고시가격이 아닌 PAXG/USDT 거래가격입니다.
            </p>
          </section>
          <section aria-label="시장별 공포·탐욕">
            <h2 className="mb-3 text-lg font-bold">공포·탐욕 지수</h2>
            <div className="max-w-sm">
              <SentimentCard />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">한국·미국 주식 심리 지표는 데이터 미연동입니다. 비트코인 지수로 대체하지 않습니다.</p>
          </section>
          <p className="text-sm text-muted-foreground">나스닥 지수는 데이터 미연동입니다. ETF·파생상품을 실제 지수로 표시하지 않습니다.</p>
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}
