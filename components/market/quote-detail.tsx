'use client';

import Link from 'next/link';
import { ArrowLeft, BarChart3, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { DisplayControls } from './display-controls';
import { MarketChart } from './market-chart';
import { PriceChange } from './price-change';
import { QuoteBadge } from './quote-badge';
import { useDisplayPreferences } from '@/hooks/use-display-preferences';
import { useMarketCandles } from '@/hooks/use-market-candles';
import { useMarketDashboard } from '@/hooks/use-market-dashboard';
import type { CandlePoint, CandleRange, MarketQuote } from '@/lib/market/types';

const RANGES: { value: CandleRange; label: string }[] = [
  { value: '1d', label: '1일' },
  { value: '1w', label: '1주' },
  { value: '1mo', label: '1개월' },
];

function formatNumber(value: number | null, currency: MarketQuote['currency']) {
  if (value === null || !Number.isFinite(value)) return '집계 중…';
  if (currency === 'KRW') return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(value)}원`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

function formatVolume(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '집계 중…';
  return new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-muted/25 p-4"><dt className="text-xs font-semibold text-muted-foreground">{label}</dt><dd className="mt-2 font-mono text-sm font-bold tabular-nums sm:text-base">{value}</dd></div>;
}

export function QuoteDetail({ initialQuote }: { initialQuote: MarketQuote }) {
  const [range, setRange] = useState<CandleRange>('1d');
  const preferences = useDisplayPreferences();
  const dashboard = useMarketDashboard();
  const quote = dashboard.data?.quotes.find((item) => item.symbol === initialQuote.symbol) ?? initialQuote;
  const { candles, state, message } = useMarketCandles(quote.symbol, range);
  const latest: CandlePoint | undefined = candles.at(-1);
  const displayName = preferences.nameLocale === 'en' ? quote.nameEn ?? quote.name : quote.nameKo ?? quote.name;
  const previousClose = quote.previousClose ?? (
    quote.price !== null && quote.changeRate !== null && 1 + quote.changeRate > 0
      ? quote.price / (1 + quote.changeRate)
      : null
  );

  return <main className="min-h-screen bg-background text-foreground">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,var(--brand-soft),transparent_32%)] opacity-60" />
    <div className="relative mx-auto min-h-screen w-full max-w-[1440px] border-x border-border bg-background/80">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-xl">
        <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft aria-hidden="true" className="size-4" />시장으로</Link>
          <DisplayControls {...preferences} />
        </div>
      </header>
      <div className="px-4 pb-12 pt-8 sm:px-6 lg:px-8">
        <section className="flex flex-col justify-between gap-6 border-b pb-8 sm:flex-row sm:items-end">
          <div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-primary"><TrendingUp aria-hidden="true" className="size-4" />MARKET DETAIL</p><h1 className="mt-3 text-3xl font-black tracking-[-.05em] sm:text-5xl">{displayName}</h1><p className="mt-2 font-mono text-sm text-muted-foreground">{quote.symbol}</p><div className="mt-4"><QuoteBadge quote={quote} /></div></div>
          <div className="sm:text-right"><p className="font-mono text-3xl font-black tabular-nums sm:text-5xl">{formatNumber(quote.price, quote.currency)}</p><PriceChange value={quote.changeRate} className="mt-2 text-base sm:justify-end" /></div>
        </section>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <DataPoint label="시가" value={formatNumber(latest?.open ?? null, quote.currency)} />
          <DataPoint label="고가" value={formatNumber(latest?.high ?? null, quote.currency)} />
          <DataPoint label="저가" value={formatNumber(latest?.low ?? null, quote.currency)} />
          <DataPoint label="종가" value={formatNumber(latest?.close ?? quote.price, quote.currency)} />
          <DataPoint label="전일 종가" value={formatNumber(previousClose, quote.currency)} />
          <DataPoint label="거래량" value={formatVolume(latest?.volume ?? null)} />
        </dl>

        <section className="mt-8" aria-labelledby="price-chart-heading">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4"><div><p className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><BarChart3 aria-hidden="true" className="size-4" />PRICE &amp; VOLUME</p><h2 id="price-chart-heading" className="mt-1 text-xl font-black">가격·거래량 차트</h2></div><div className="flex rounded-xl border bg-card/60 p-1" role="tablist" aria-label="차트 기간 선택">{RANGES.map((item) => <button key={item.value} type="button" role="tab" aria-selected={range === item.value} onClick={() => setRange(item.value)} className={`min-h-11 min-w-14 rounded-lg px-3 text-sm font-bold transition-colors ${range === item.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{item.label}</button>)}</div></div>
          <MarketChart candles={candles} label={`${displayName} 가격 차트`} theme={preferences.theme} state={state} message={message} />
          <p className="mt-3 text-xs leading-5 text-muted-foreground">상승 캔들은 빨강, 하락 캔들은 파랑으로 표시합니다. 색상과 함께 상단 OHLC 수치를 확인하세요.</p>
        </section>
      </div>
    </div>
  </main>;
}
