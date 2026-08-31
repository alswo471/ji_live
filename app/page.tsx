'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Moon, RefreshCw, Search, ShieldCheck, Star, Sun, TrendingUp, WalletCards } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Market = 'kr' | 'us';
type StockView = 'top' | 'favorites';
type Stock = { market: Market; name: string; symbol: string; fallbackPrice: string; change: number; volume: string; accent: string };
type LivePrice = { symbol: string; timestamp: string; lastPrice: string; currency: string; changeRate?: string | null; tradingAmount?: string };
type Holding = { symbol: string; name: string; marketCountry: string; currency: string; quantity: string; lastPrice: string; averagePurchasePrice: string; profitLoss: string; profitRate: string };
type LoadState = 'loading' | 'ready' | 'error';

const stocks: Stock[] = [
  { market: 'kr', name: '삼성전자', symbol: '005930', fallbackPrice: '84,200원', change: 1.45, volume: '1,842억원', accent: 'SE' },
  { market: 'kr', name: 'SK하이닉스', symbol: '000660', fallbackPrice: '201,500원', change: -0.74, volume: '2,430억원', accent: 'SK' },
  { market: 'kr', name: '삼성바이오로직스', symbol: '207940', fallbackPrice: '', change: 0, volume: '', accent: 'SB' },
  { market: 'kr', name: 'LG에너지솔루션', symbol: '373220', fallbackPrice: '', change: 0, volume: '', accent: 'LG' },
  { market: 'kr', name: '현대차', symbol: '005380', fallbackPrice: '247,000원', change: 2.28, volume: '638억원', accent: 'HY' },
  { market: 'kr', name: '기아', symbol: '000270', fallbackPrice: '', change: 0, volume: '', accent: 'KA' },
  { market: 'kr', name: 'KB금융', symbol: '105560', fallbackPrice: '', change: 0, volume: '', accent: 'KB' },
  { market: 'kr', name: '셀트리온', symbol: '068270', fallbackPrice: '', change: 0, volume: '', accent: 'CT' },
  { market: 'kr', name: '한화에어로스페이스', symbol: '012450', fallbackPrice: '', change: 0, volume: '', accent: 'HA' },
  { market: 'kr', name: '두산에너빌리티', symbol: '034020', fallbackPrice: '', change: 0, volume: '', accent: 'DE' },
  { market: 'us', name: 'NVIDIA', symbol: 'NVDA', fallbackPrice: '$138.85', change: 2.61, volume: '18.4조원', accent: 'NV' },
  { market: 'us', name: 'Apple', symbol: 'AAPL', fallbackPrice: '$227.16', change: -0.31, volume: '9.7조원', accent: 'AP' },
  { market: 'us', name: 'Tesla', symbol: 'TSLA', fallbackPrice: '$352.56', change: 1.92, volume: '12.3조원', accent: 'TS' },
  { market: 'us', name: 'Microsoft', symbol: 'MSFT', fallbackPrice: '$509.28', change: 0.43, volume: '6.1조원', accent: 'MS' },
];

const indices = [
  { label: 'KOSPI', value: '연동 예정', note: '시장 지표' },
  { label: 'NASDAQ', value: '연동 예정', note: '시장 지표' },
  { label: 'USD/KRW', value: '연동 예정', note: '환율' },
];

function formatPrice(value: string, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  if (currency === 'KRW') return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(amount)}원`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(amount);
}

function formatRate(value?: string | null) {
  if (value === undefined || value === null || !Number.isFinite(Number(value))) return '집계 중…';
  const percent = Number(value) * 100;
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
}

function formatTradingAmount(value?: string, currency = 'KRW') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '집계 중…';
  if (currency === 'KRW') {
    if (amount >= 1_000_000_000_000) return `${(amount / 1_000_000_000_000).toFixed(1)}조원`;
    return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(amount / 100_000_000)}억원`;
  }
  return new Intl.NumberFormat('en-US', { notation: 'compact', style: 'currency', currency: 'USD', maximumFractionDigits: 1 }).format(amount);
}

export default function Home() {
  const [market, setMarket] = useState<Market>('kr');
  const [stockView, setStockView] = useState<StockView>('top');
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>(['005930', 'NVDA']);
  const [dark, setDark] = useState(false);
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});
  const [marketState, setMarketState] = useState<LoadState>('loading');
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [holdingsState, setHoldingsState] = useState<LoadState>('loading');
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const favoritesLoaded = useRef(false);

  const loadData = async () => {
    try {
      const response = await fetch('/api/dashboard', { cache: 'no-store' });
      if (!response.ok) throw new Error('dashboard');
      const data = await response.json() as { prices: LivePrice[]; holdings: Holding[]; holdingsAvailable: boolean; fetchedAt: string };
      setPrices(Object.fromEntries(data.prices.map((item) => [item.symbol, item])));
      setHoldings(data.holdings);
      if (!favoritesLoaded.current && data.holdings.length) {
        const saved = window.localStorage.getItem('oo-live-watchlist');
        try {
          setFavorites(saved ? JSON.parse(saved) as string[] : data.holdings.map((item) => item.symbol));
        } catch {
          setFavorites(data.holdings.map((item) => item.symbol));
        }
        favoritesLoaded.current = true;
      }
      setFetchedAt(data.fetchedAt);
      setMarketState('ready');
      setHoldingsState(data.holdingsAvailable ? 'ready' : 'error');
    } catch {
      setMarketState('error');
      setHoldingsState('error');
    }
  };

  useEffect(() => {
    let stopped = false;
    let nextRefresh = 0;
    const refresh = async () => {
      await loadData();
      if (!stopped) nextRefresh = window.setTimeout(() => void refresh(), 5_000);
    };
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    return () => {
      stopped = true;
      window.clearTimeout(initialLoad);
      window.clearTimeout(nextRefresh);
    };
  }, []);

  const availableStocks = useMemo(() => {
    const holdingStocks: Stock[] = holdings.filter((item) => !stocks.some((stock) => stock.symbol === item.symbol)).map((item) => ({
      market: item.marketCountry === 'KR' ? 'kr' : 'us',
      name: item.name,
      symbol: item.symbol,
      fallbackPrice: formatPrice(item.lastPrice, item.currency),
      change: Number(item.profitRate),
      volume: '보유종목',
      accent: item.name.slice(0, 2).toUpperCase(),
    }));
    return [...stocks, ...holdingStocks];
  }, [holdings]);
  const visibleStocks = useMemo(() => {
    const value = query.trim().toLowerCase();
    return availableStocks.filter((stock) => (stockView === 'top' || favorites.includes(stock.symbol)) && stock.market === market && (!value || stock.name.toLowerCase().includes(value) || stock.symbol.toLowerCase().includes(value)));
  }, [availableStocks, favorites, market, query, stockView]);
  const toggleFavorite = (symbol: string) => setFavorites((current) => {
    const next = current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol];
    window.localStorage.setItem('oo-live-watchlist', JSON.stringify(next));
    return next;
  });

  return (
    <div className={dark ? 'dark' : ''}>
      <main className="min-h-screen bg-background text-foreground transition-colors">
        <div className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
          <header className="sticky top-0 z-20 -mx-4 flex h-16 items-center justify-between border-b border-border/70 bg-background/88 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><TrendingUp className="size-5" /></div><div><p className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground">MARKET NOW</p><h1 className="text-lg font-black tracking-[-0.04em]">OO라이브</h1></div></div>
            <div className="flex items-center gap-1.5"><Button variant="ghost" size="icon" aria-label="데이터 새로고침" onClick={() => void loadData()}><RefreshCw /></Button><Button variant="ghost" size="icon" aria-label="알림"><Bell /></Button><Button variant="ghost" size="icon" aria-label={dark ? '라이트 모드로 전환' : '다크 모드로 전환'} onClick={() => setDark((value) => !value)}>{dark ? <Sun /> : <Moon />}</Button></div>
          </header>

          <section className="pt-6 sm:pt-9">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div><div className="mb-2 flex items-center gap-2"><span className={`size-2 rounded-full ${marketState === 'ready' ? 'bg-emerald-500' : marketState === 'error' ? 'bg-red-500' : 'bg-amber-500'}`} /><span className="text-xs font-bold text-muted-foreground">{marketState === 'ready' ? '토스증권 API 연결됨' : marketState === 'error' ? '시세 연결 확인 필요' : '시세 불러오는 중'}</span></div><h2 className="text-2xl font-black tracking-[-0.045em] sm:text-4xl">지금, 시장의 흐름</h2><p className="mt-2 text-sm text-muted-foreground sm:text-base">한국과 미국의 주요 종목을 한눈에 확인하세요.</p></div>
              <Badge variant="outline" className="h-7 px-3">{fetchedAt ? `5초 갱신 · ${new Date(fetchedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : '5초마다 자동 갱신'}</Badge>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">{indices.map((item) => <div key={item.label} className="rounded-2xl border bg-card p-4"><p className="text-xs font-bold text-muted-foreground">{item.label}</p><div className="mt-2 flex items-end justify-between"><strong className="text-sm">{item.value}</strong><span className="text-xs font-bold text-muted-foreground">{item.note}</span></div></div>)}</div>
          </section>

          <section className="mt-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-2 inline-flex rounded-lg bg-muted p-1" aria-label="종목 목록 선택"><Button className="h-8 rounded-md px-4" variant={stockView === 'top' ? 'secondary' : 'ghost'} onClick={() => setStockView('top')}>주요 종목</Button><Button className="h-8 rounded-md px-4" variant={stockView === 'favorites' ? 'secondary' : 'ghost'} onClick={() => setStockView('favorites')}>관심 종목 {favorites.length}</Button></div><div className="flex w-fit rounded-xl bg-muted p-1" aria-label="시장 선택"><Button className="h-9 rounded-lg px-5" variant={market === 'kr' ? 'default' : 'ghost'} onClick={() => setMarket('kr')}>한국 주식</Button><Button className="h-9 rounded-lg px-5" variant={market === 'us' ? 'default' : 'ghost'} onClick={() => setMarket('us')}>미국 주식</Button></div></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="종목명 또는 티커 검색" aria-label="종목 검색" className="h-10 rounded-xl bg-card pl-9" /></div></div>
            <div className="mt-4 overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="hidden grid-cols-[1.5fr_1fr_0.8fr_1fr_44px] border-b bg-muted/55 px-5 py-3 text-[11px] font-bold text-muted-foreground sm:grid"><span>종목</span><span>현재가</span><span>등락률</span><span>거래대금</span><span /></div>
              {visibleStocks.length ? visibleStocks.map((stock) => {
                const live = prices[stock.symbol];
                const favorite = favorites.includes(stock.symbol);
                const waiting = marketState === 'error' ? '연결 재시도 중…' : '연동 중…';
                const rate = live?.changeRate === undefined || live.changeRate === null ? null : Number(live.changeRate);
                return <article key={stock.symbol} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b px-4 py-4 last:border-0 hover:bg-muted/35 sm:grid-cols-[1.5fr_1fr_0.8fr_1fr_44px] sm:px-5"><div className="flex min-w-0 items-center gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-xs font-black text-primary">{stock.accent}</div><div className="min-w-0"><h3 className="truncate font-bold">{stock.name}</h3><p className="text-xs text-muted-foreground">{stock.symbol}</p></div></div><div className="text-right sm:text-left"><strong className="font-mono text-sm sm:text-base">{live ? formatPrice(live.lastPrice, live.currency) : waiting}</strong><p className={`mt-1 text-xs font-bold sm:hidden ${rate !== null && rate >= 0 ? 'text-rise' : 'text-fall'}`}>{live ? formatRate(live.changeRate) : '실제 시세 확인 중'}</p></div><span className={`hidden text-sm font-bold sm:block ${rate !== null && rate >= 0 ? 'text-rise' : 'text-fall'}`}>{live ? formatRate(live.changeRate) : waiting}</span><span className="hidden text-sm text-muted-foreground sm:block">{live ? formatTradingAmount(live.tradingAmount, live.currency) : waiting}</span><Button variant="ghost" size="icon" aria-label={`${stock.name} ${favorite ? '관심종목 해제' : '관심종목 추가'}`} onClick={() => toggleFavorite(stock.symbol)}><Star className={favorite ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'} /></Button></article>;
              }) : <div className="px-6 py-14 text-center"><Search className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 font-bold">검색 결과가 없습니다</p><p className="text-sm text-muted-foreground">다른 종목명이나 티커를 입력해보세요.</p></div>}
            </div>
          </section>

          <section className="mt-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><div className="flex items-center gap-2"><WalletCards className="size-5 text-primary" /><h2 className="text-xl font-black">내 토스증권 보유자산</h2></div><p className="mt-1 text-sm text-muted-foreground">계좌번호를 제외한 읽기 전용 요약입니다.</p></div><Badge variant="secondary"><ShieldCheck className="mr-1 size-3.5" /> 개인 정보</Badge></div>
            {holdingsState === 'loading' ? <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">보유종목을 불러오는 중입니다.</div> : holdingsState === 'error' ? <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300">보유종목 연결을 잠시 확인 중입니다. 시세 화면은 계속 사용할 수 있습니다.</div> : holdings.length ? <div className="overflow-hidden rounded-2xl border bg-card"><div className="grid grid-cols-[1fr_auto] border-b bg-muted/55 px-5 py-3 text-[11px] font-bold text-muted-foreground"><span>보유종목</span><span>수익률</span></div>{holdings.map((item) => <article key={`${item.marketCountry}-${item.symbol}`} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b px-5 py-4 last:border-0"><div><strong>{item.name}</strong><p className="text-xs text-muted-foreground">{item.symbol} · 평단 {formatPrice(item.averagePurchasePrice, item.currency)} · 현재가 {formatPrice(item.lastPrice, item.currency)}</p></div><div className={`text-right font-mono text-base font-black ${Number(item.profitLoss) >= 0 ? 'text-rise' : 'text-fall'}`}>{formatRate(item.profitRate)}</div></article>)}</div> : <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">조회 가능한 보유종목이 없습니다.</div>}
          </section>

          <section className="mt-6 grid gap-4 lg:grid-cols-2"><article className="rounded-2xl border bg-card p-5"><h2 className="font-black">다음 데이터 연결</h2><p className="mt-3 text-lg font-bold">환율·금·비트코인과 시장 지표를 추가합니다.</p><p className="mt-2 text-sm text-muted-foreground">주말 데이터는 실제 시세와 구분해 참고 추정가로 표시할 예정입니다.</p></article><article className="rounded-2xl bg-primary p-5 text-primary-foreground"><p className="text-xs font-bold tracking-wide opacity-65">MY WATCHLIST</p><p className="mt-3 text-2xl font-black">관심종목 {favorites.length}개</p><p className="mt-1 text-sm opacity-70">별표를 눌러 나만의 시장을 구성하세요.</p></article></section>
          <footer className="mt-10 border-t py-7 text-xs text-muted-foreground">조회 시세는 지연될 수 있으며 투자 판단의 근거로 사용할 수 없습니다. 등락률과 거래대금은 토스증권 시장 집계 기준입니다.</footer>
        </div>
      </main>
    </div>
  );
}
