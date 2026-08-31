'use client';

import { useMemo, useState } from 'react';
import { Bell, ChevronRight, Moon, Search, Sparkles, Star, Sun, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Market = 'kr' | 'us';
type Stock = { market: Market; name: string; symbol: string; price: string; change: number; volume: string; accent: string };

const stocks: Stock[] = [
  { market: 'kr', name: '삼성전자', symbol: '005930', price: '84,200원', change: 1.45, volume: '1,842억원', accent: 'SE' },
  { market: 'kr', name: 'SK하이닉스', symbol: '000660', price: '201,500원', change: -0.74, volume: '2,430억원', accent: 'SK' },
  { market: 'kr', name: '현대차', symbol: '005380', price: '247,000원', change: 2.28, volume: '638억원', accent: 'HY' },
  { market: 'kr', name: 'NAVER', symbol: '035420', price: '221,500원', change: 0.68, volume: '412억원', accent: 'NA' },
  { market: 'us', name: 'NVIDIA', symbol: 'NVDA', price: '$138.85', change: 2.61, volume: '18.4조원', accent: 'NV' },
  { market: 'us', name: 'Apple', symbol: 'AAPL', price: '$227.16', change: -0.31, volume: '9.7조원', accent: 'AP' },
  { market: 'us', name: 'Tesla', symbol: 'TSLA', price: '$352.56', change: 1.92, volume: '12.3조원', accent: 'TS' },
  { market: 'us', name: 'Microsoft', symbol: 'MSFT', price: '$509.28', change: 0.43, volume: '6.1조원', accent: 'MS' },
];

const indices = [
  { label: 'KOSPI', value: '2,718.12', change: '+0.82%' },
  { label: 'NASDAQ', value: '20,954.18', change: '+1.14%' },
  { label: 'USD/KRW', value: '1,386.40', change: '-0.21%' },
];

export default function Home() {
  const [market, setMarket] = useState<Market>('kr');
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>(['005930', 'NVDA']);
  const [dark, setDark] = useState(false);
  const visibleStocks = useMemo(() => {
    const value = query.trim().toLowerCase();
    return stocks.filter((stock) => stock.market === market && (!value || stock.name.toLowerCase().includes(value) || stock.symbol.toLowerCase().includes(value)));
  }, [market, query]);
  const toggleFavorite = (symbol: string) => setFavorites((current) => current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol]);

  return (
    <div className={dark ? 'dark' : ''}>
      <main className="min-h-screen bg-background text-foreground transition-colors">
        <div className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
          <header className="sticky top-0 z-20 -mx-4 flex h-16 items-center justify-between border-b border-border/70 bg-background/88 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="flex items-center gap-2.5">
              <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><TrendingUp className="size-5" /></div>
              <div><p className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground">MARKET NOW</p><h1 className="text-lg font-black tracking-[-0.04em]">OO라이브</h1></div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="icon" aria-label="알림"><Bell /></Button>
              <Button variant="ghost" size="icon" aria-label={dark ? '라이트 모드로 전환' : '다크 모드로 전환'} onClick={() => setDark((value) => !value)}>{dark ? <Sun /> : <Moon />}</Button>
            </div>
          </header>

          <section className="pt-6 sm:pt-9">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-500" /><span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">시장 데이터 데모</span></div>
                <h2 className="text-2xl font-black tracking-[-0.045em] sm:text-4xl">지금, 시장의 흐름</h2>
                <p className="mt-2 text-sm text-muted-foreground sm:text-base">한국과 미국의 주요 종목을 한눈에 확인하세요.</p>
              </div>
              <Badge variant="outline" className="h-7 border-amber-300 bg-amber-50 px-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">실제 시세 연동 전 · 샘플 데이터</Badge>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {indices.map((item) => <div key={item.label} className="rounded-2xl border bg-card p-4"><p className="text-xs font-bold text-muted-foreground">{item.label}</p><div className="mt-2 flex items-end justify-between"><strong className="font-mono text-lg">{item.value}</strong><span className={item.change.startsWith('+') ? 'text-sm font-bold text-rise' : 'text-sm font-bold text-fall'}>{item.change}</span></div></div>)}
            </div>
          </section>

          <section className="mt-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex w-fit rounded-xl bg-muted p-1" aria-label="시장 선택">
                <Button className="h-9 rounded-lg px-5" variant={market === 'kr' ? 'default' : 'ghost'} onClick={() => setMarket('kr')}>한국 주식</Button>
                <Button className="h-9 rounded-lg px-5" variant={market === 'us' ? 'default' : 'ghost'} onClick={() => setMarket('us')}>미국 주식</Button>
              </div>
              <div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="종목명 또는 티커 검색" aria-label="종목 검색" className="h-10 rounded-xl bg-card pl-9" /></div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="hidden grid-cols-[1.5fr_1fr_0.8fr_1fr_44px] border-b bg-muted/55 px-5 py-3 text-[11px] font-bold text-muted-foreground sm:grid"><span>종목</span><span>현재가</span><span>등락률</span><span>거래대금</span><span /></div>
              {visibleStocks.length ? visibleStocks.map((stock) => {
                const positive = stock.change >= 0;
                const favorite = favorites.includes(stock.symbol);
                return <article key={stock.symbol} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b px-4 py-4 last:border-0 hover:bg-muted/35 sm:grid-cols-[1.5fr_1fr_0.8fr_1fr_44px] sm:px-5">
                  <div className="flex min-w-0 items-center gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-xs font-black text-primary">{stock.accent}</div><div className="min-w-0"><h3 className="truncate font-bold">{stock.name}</h3><p className="text-xs text-muted-foreground">{stock.symbol}</p></div></div>
                  <div className="text-right sm:text-left"><strong className="font-mono text-sm sm:text-base">{stock.price}</strong><p className={`mt-1 text-xs font-bold sm:hidden ${positive ? 'text-rise' : 'text-fall'}`}>{positive ? '+' : ''}{stock.change.toFixed(2)}%</p></div>
                  <span className={`hidden text-sm font-bold sm:block ${positive ? 'text-rise' : 'text-fall'}`}>{positive ? '+' : ''}{stock.change.toFixed(2)}%</span><span className="hidden text-sm text-muted-foreground sm:block">{stock.volume}</span>
                  <Button variant="ghost" size="icon" aria-label={`${stock.name} ${favorite ? '관심종목 해제' : '관심종목 추가'}`} onClick={() => toggleFavorite(stock.symbol)}><Star className={favorite ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'} /></Button>
                </article>;
              }) : <div className="px-6 py-14 text-center"><Search className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 font-bold">검색 결과가 없습니다</p><p className="text-sm text-muted-foreground">다른 종목명이나 티커를 입력해보세요.</p></div>}
            </div>
          </section>

          <section className="mt-6 grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
            <article className="rounded-2xl border bg-card p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Sparkles className="size-4 text-violet-500" /><h2 className="font-black">오늘의 시장 한 줄</h2></div><Button variant="ghost" size="sm">더보기 <ChevronRight /></Button></div><p className="mt-4 text-lg font-bold">반도체 강세에 한국·미국 기술주가 함께 상승하고 있어요.</p><p className="mt-2 text-sm text-muted-foreground">실제 뉴스와 AI 요약은 데이터 연동 단계에서 추가됩니다.</p></article>
            <article className="rounded-2xl bg-primary p-5 text-primary-foreground"><p className="text-xs font-bold tracking-wide opacity-65">MY WATCHLIST</p><p className="mt-3 text-2xl font-black">관심종목 {favorites.length}개</p><p className="mt-1 text-sm opacity-70">별표를 눌러 나만의 시장을 구성하세요.</p></article>
          </section>
          <footer className="mt-10 border-t py-7 text-xs text-muted-foreground">현재 표시되는 가격과 등락률은 화면 검증용 샘플이며 투자 판단에 사용할 수 없습니다.</footer>
        </div>
      </main>
    </div>
  );
}
