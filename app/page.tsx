'use client';

import { useMemo, useState } from 'react';
import { Activity, RefreshCw, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IndicatorGrid } from '@/components/market/indicator-grid';
import { MarketStatusBar } from '@/components/market/market-status-bar';
import { QuoteTable } from '@/components/market/quote-table';
import { useMarketDashboard } from '@/hooks/use-market-dashboard';
import type { AssetClass } from '@/lib/market/types';

type MarketTab = 'kr-stock' | 'us-stock' | 'crypto';
const TABS: { value: MarketTab; label: string }[] = [
  { value: 'kr-stock', label: '한국 주식' }, { value: 'us-stock', label: '미국 주식' }, { value: 'crypto', label: '암호화폐' },
];
const INDICATOR_CLASSES: AssetClass[] = ['index', 'fx', 'metal'];

export default function Home() {
  const [tab, setTab] = useState<MarketTab>('kr-stock');
  const { data, state, refresh } = useMarketDashboard();
  const indicators = useMemo(() => data?.quotes.filter((quote) => INDICATOR_CLASSES.includes(quote.assetClass)) ?? [], [data]);
  const quotes = useMemo(() => data?.quotes.filter((quote) => quote.assetClass === tab) ?? [], [data, tab]);

  return <main className="dark min-h-screen bg-background text-foreground">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,oklch(0.35_0.12_260/.35),transparent_32%),radial-gradient(circle_at_90%_35%,oklch(0.28_0.09_205/.22),transparent_30%)]" />
    <div className="relative mx-auto min-h-screen w-full max-w-[1440px] border-x border-white/5 bg-background/80">
      <header className="sticky top-0 z-20 border-b border-white/8 bg-background/85 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"><TrendingUp className="size-5" /></span><div><p className="text-[10px] font-bold tracking-[.2em] text-primary">MARKET COCKPIT</p><h1 className="text-lg font-black tracking-[-.04em]">OO라이브</h1></div></div><Button variant="outline" size="icon" className="size-11 rounded-xl bg-card/50" onClick={() => void refresh()} aria-label="시장 데이터 새로고침"><RefreshCw className={state === 'loading' ? 'animate-spin' : ''} /></Button></div>
        <MarketStatusBar state={state} fetchedAt={data?.fetchedAt} />
      </header>
      <div className="px-4 pb-12 pt-8 sm:px-6 lg:px-8">
        <section><div className="mb-5"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-primary"><Activity className="size-4" />Live market pulse</p><h2 className="mt-2 text-3xl font-black tracking-[-.055em] sm:text-5xl">시장의 지금을 한 화면에.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">한국·미국 주식과 암호화폐의 실제 시세를 세션 상태와 함께 확인합니다. 장 마감 후 참고 추정가는 실제 시세와 명확히 구분합니다.</p></div><IndicatorGrid quotes={indicators} /></section>
        <section className="mt-10"><div className="mb-4 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold text-muted-foreground">PUBLIC MARKET BOARD</p><h2 className="mt-1 text-2xl font-black tracking-tight">주요 자산</h2></div><div className="flex min-h-11 rounded-xl border bg-card/60 p-1" role="tablist" aria-label="자산 시장 선택">{TABS.map((item) => <button key={item.value} type="button" role="tab" aria-selected={tab === item.value} onClick={() => setTab(item.value)} className={`min-h-11 rounded-lg px-4 text-sm font-bold transition-colors ${tab === item.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{item.label}</button>)}</div></div>{state === 'loading' && !data ? <div className="rounded-2xl border bg-card/50 px-6 py-16 text-center text-sm text-muted-foreground">실제 시세를 연결하고 있습니다…</div> : <QuoteTable quotes={quotes} />}</section>
        {!!data?.notices.length && <aside className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100"><strong>데이터 안내</strong><ul className="mt-2 space-y-1 text-xs text-amber-100/70">{data.notices.map((notice) => <li key={notice}>· {notice}</li>)}</ul></aside>}
        <footer className="mt-10 border-t border-white/8 py-6 text-xs leading-5 text-muted-foreground">표시 정보는 투자 참고용이며 투자 판단의 근거로 사용할 수 없습니다. QQQ와 PAXG는 각각 해당 상품의 실제 가격이며 지수·현물 금 가격이 아닙니다.</footer>
      </div>
    </div>
  </main>;
}
