# OO라이브 멀티자산 대시보드 1차 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 개인 계좌와 관심종목을 제거하고 한국·미국 주식, 암호화폐와 시장 지표를 실제 시세·참고 추정 상태와 함께 제공하는 공개 대시보드를 만든다.

**Architecture:** Toss, Binance와 Bithumb 응답을 공급자 adapter에서 공통 `MarketQuote`로 변환한다. 공급자별 cache와 장애 격리를 거친 실제 시세를 우선 사용하며, 거래 세션 밖에서만 설명 가능한 프록시 가중평균으로 참고 추정가를 생성한다.

**Tech Stack:** React 19, TypeScript 5.9, Vinext, Vite 8, Tailwind CSS 4, Vitest, Testing Library, TradingView Lightweight Charts, Toss Invest Open API, Binance Public REST API, Bithumb Public REST API

**Spec:** `docs/superpowers/specs/2026-09-01-market-dashboard-v1-design.md`

## Global Constraints

- 공개판에는 로그인, 관심종목, 계좌, 보유종목, 평단가와 수익률을 포함하지 않는다.
- 실제 시세는 언제나 추정가보다 우선한다.
- 추정가에는 `참고 추정`, 기준 시각, 입력 출처와 신뢰도를 표시한다.
- 상승은 빨강, 하락은 파랑, 보합은 회색과 부호·텍스트를 함께 사용한다.
- 가격 변경 효과는 400ms로 제한하고 `prefers-reduced-motion`에서 제거한다.
- 375px, 768px, 1024px와 1440px에서 검증한다.
- 기본 polling은 5초이며 숨겨진 탭에서는 중지한다.
- 금은 1차에서 Binance `PAXGUSDT`를 `금 연동(PAXG)`으로 명시한다.
- NASDAQ 관련 지표는 Toss의 QQQ 실제 시세를 `NASDAQ 100 연동(QQQ)`으로 명시하며 NASDAQ 지수처럼 표시하지 않는다.
- QQQ와 PAXG는 실제 상품 시세이고, 한국 주식 장 마감 후 참고 추정가를 계산할 때 실제 변동률을 입력으로 사용할 수 있다.

---

## File Map

- `lib/market/types.ts`: 공통 시세와 dashboard DTO
- `lib/market/catalog.ts`: 주식 20, 코인 5, 지표 4개 카탈로그
- `lib/market/session.ts`: 시장 세션 판정
- `lib/market/cache.ts`: TTL, in-flight 병합, circuit breaker
- `lib/market/providers/*.ts`: Toss, Binance, Bithumb adapter
- `lib/market/estimate.ts`: 프록시 가중평균 추정가
- `lib/market/dashboard.ts`: 공급자 orchestration
- `components/market/*`: 상태 바, 지표, 종목 표, 상세와 차트
- `hooks/use-market-dashboard.ts`: polling과 요청 상태
- `tests/market/*`, `tests/components/*`: 단위·컴포넌트 검증

### Task 1: 테스트 기반과 공통 시세 계약

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`, `vite.config.ts`
- Create: `tests/setup.ts`, `lib/market/types.ts`, `lib/market/catalog.ts`, `tests/market/catalog.test.ts`

**Interfaces:**
- Produces: `MarketQuote`, `MarketSession`, `QuoteQuality`, `DashboardResponse`, `Instrument`, `INSTRUMENTS`
- Consumes: none

- [ ] **Step 1: 테스트 도구를 설치한다.**

Run: `pnpm add -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event`

`package.json`에 `"test": "vitest run"`, `"test:watch": "vitest"`를 추가하고 Vite test 환경을 `jsdom`, setup을 `tests/setup.ts`로 설정한다.

- [ ] **Step 2: 카탈로그 실패 테스트를 작성한다.**

```ts
expect(INSTRUMENTS.filter((x) => x.assetClass === 'kr-stock')).toHaveLength(10)
expect(INSTRUMENTS.filter((x) => x.assetClass === 'us-stock')).toHaveLength(10)
expect(INSTRUMENTS.filter((x) => x.assetClass === 'crypto')).toHaveLength(5)
expect(new Set(INSTRUMENTS.map((x) => x.symbol)).size).toBe(INSTRUMENTS.length)
```

- [ ] **Step 3: 실패를 확인한다.**

Run: `pnpm test -- tests/market/catalog.test.ts`
Expected: FAIL with missing `lib/market/catalog`

- [ ] **Step 4: 공통 타입과 카탈로그를 구현한다.**

```ts
export type MarketSession = 'day' | 'pre' | 'regular' | 'after' | 'closed' | 'always-open'
export type QuoteQuality = 'realtime' | 'delayed' | 'estimated' | 'stale' | 'unavailable'
export type MarketQuote = {
  symbol: string; name: string; assetClass: 'kr-stock' | 'us-stock' | 'crypto' | 'index' | 'fx' | 'metal'
  price: number | null; currency: 'KRW' | 'USD'; changeRate: number | null; tradingAmount: number | null
  asOf: string | null; session: MarketSession; quality: QuoteQuality
  provider: 'toss' | 'binance' | 'bithumb' | null
  confidence: 'high' | 'medium' | 'low' | null; estimateInputs: string[]
}
```

KR 심볼은 `005930, 000660, 042700, 207940, 373220, 005380, 000270, 068270, 012450, 034020`, US는 `NVDA, AAPL, TSLA, MSFT, AMZN, GOOGL, META, AVGO, AMD, NFLX`, crypto는 `BTC, ETH, SOL, XRP, DOGE`, 지표는 `KOSPI, QQQ, USDKRW, PAXG`로 고정한다. QQQ는 주식 10종목과 별개의 지표 프록시 항목이다.

- [ ] **Step 5: 검증하고 커밋한다.**

Run: `pnpm test -- tests/market/catalog.test.ts && pnpm lint`
Expected: PASS

```bash
git add package.json pnpm-lock.yaml vite.config.ts tests/setup.ts tests/market/catalog.test.ts lib/market/types.ts lib/market/catalog.ts
git commit -m "feat(market): 멀티자산 시세 공통 계약 추가"
```

### Task 2: 시장 세션과 Toss 공개 시세 adapter

**Files:**
- Create: `lib/market/session.ts`, `lib/market/providers/toss.ts`
- Create: `tests/market/session.test.ts`, `tests/market/toss-provider.test.ts`
- Modify: `lib/toss-invest.ts`

**Interfaces:**
- Consumes: `MarketQuote`, `MarketSession`, stock catalog
- Produces: `resolveSession(now, calendar): MarketSession`, `fetchTossMarketSnapshot(now): Promise<MarketQuote[]>`

- [ ] **Step 1: 세션 실패 테스트를 작성한다.**

```ts
expect(resolveSession(new Date('2026-09-01T18:00:00+09:00'), calendar)).toBe('pre')
expect(resolveSession(new Date('2026-09-01T23:00:00+09:00'), calendar)).toBe('regular')
expect(resolveSession(new Date('2026-09-02T06:00:00+09:00'), calendar)).toBe('after')
expect(resolveSession(new Date('2026-09-02T08:00:00+09:00'), calendar)).toBe('closed')
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `pnpm test -- tests/market/session.test.ts tests/market/toss-provider.test.ts`
Expected: FAIL with missing session/provider modules

- [ ] **Step 3: 세션과 adapter를 구현한다.**

Toss의 `/api/v1/prices`, `/api/v1/market-indicators/prices?symbols=KOSPI`, `/api/v1/exchange-rate?baseCurrency=USD&quoteCurrency=KRW`, `/api/v1/market-calendar/KR`, `/api/v1/market-calendar/US`만 사용한다. 계좌와 holdings endpoint는 호출하지 않는다. 429 분류를 위해 `MarketProviderError`에 `status`와 `retryAfterMs`를 둔다.

- [ ] **Step 4: mock fetch 검증 후 커밋한다.**

Run: `pnpm test -- tests/market/session.test.ts tests/market/toss-provider.test.ts`
Expected: PASS; price, KOSPI, USD/KRW와 session이 공통 타입으로 변환됨

```bash
git add lib/toss-invest.ts lib/market/session.ts lib/market/providers/toss.ts tests/market/session.test.ts tests/market/toss-provider.test.ts
git commit -m "feat(toss): 주식 세션과 공개 시세 변환 추가"
```

### Task 3: Binance와 Bithumb adapter

**Files:**
- Create: `lib/market/providers/binance.ts`, `lib/market/providers/bithumb.ts`
- Create: `tests/market/binance-provider.test.ts`, `tests/market/bithumb-provider.test.ts`

**Interfaces:**
- Produces: `fetchBinanceQuotes(): Promise<MarketQuote[]>`, `fetchBithumbQuotes(): Promise<MarketQuote[]>`
- Consumes: crypto catalog and `MarketQuote`

- [ ] **Step 1: 응답 변환 실패 테스트를 작성한다.**

Binance `/api/v3/ticker/24hr`의 `lastPrice`, `priceChangePercent`, `quoteVolume`, `closeTime`과 Bithumb `/v1/ticker`의 `trade_price`, `signed_change_rate`, `acc_trade_price_24h`, `timestamp`를 fixture로 사용한다. `PAXGUSDT`가 `assetClass: 'metal'`, `name: '금 연동(PAXG)'`인지 확인한다.

- [ ] **Step 2: 실패를 확인한다.**

Run: `pnpm test -- tests/market/binance-provider.test.ts tests/market/bithumb-provider.test.ts`
Expected: FAIL with missing provider modules

- [ ] **Step 3: 3초 timeout과 항목별 숫자 검증을 포함해 구현한다.**

```ts
export async function fetchBinanceQuotes(fetcher: typeof fetch = fetch): Promise<MarketQuote[]>
export async function fetchBithumbQuotes(fetcher: typeof fetch = fetch): Promise<MarketQuote[]>
```

필수 가격이 잘못된 한 종목만 `unavailable`로 변환하고 다른 종목은 유지한다.

- [ ] **Step 4: 검증하고 커밋한다.**

Run: `pnpm test -- tests/market/binance-provider.test.ts tests/market/bithumb-provider.test.ts`
Expected: PASS

```bash
git add lib/market/providers/binance.ts lib/market/providers/bithumb.ts tests/market/binance-provider.test.ts tests/market/bithumb-provider.test.ts
git commit -m "feat(crypto): Binance·Bithumb 시세 adapter 추가"
```

### Task 4: Cache, 장애 격리와 공개 dashboard API

**Files:**
- Create: `lib/market/cache.ts`, `lib/market/dashboard.ts`
- Create: `tests/market/cache.test.ts`, `tests/market/dashboard.test.ts`
- Replace: `app/api/dashboard/route.ts`

**Interfaces:**
- Produces: `createCachedProvider`, `getDashboard(now): Promise<DashboardResponse>`, `GET()`
- Consumes: three provider functions

- [ ] **Step 1: TTL, in-flight 병합과 circuit breaker 실패 테스트를 작성한다.**

```ts
const cached = createCachedProvider({ ttlMs: 5_000, failureThreshold: 2, cooldownMs: 30_000, load })
await Promise.all([cached.get(), cached.get()])
expect(load).toHaveBeenCalledTimes(1)
```

연속 2회 실패 후 30초 동안 새 호출을 막고 마지막 정상값을 `stale`로 유지하는 경우도 검증한다.

- [ ] **Step 2: 실패를 확인한다.**

Run: `pnpm test -- tests/market/cache.test.ts tests/market/dashboard.test.ts`
Expected: FAIL with missing cache/dashboard modules

- [ ] **Step 3: orchestration을 구현한다.**

Toss 주식 5초, 환율 60초, calendar 10분, Binance·Bithumb 5초 TTL을 적용한다. `Promise.allSettled`로 공급자 장애를 격리하고 사용자용 짧은 상태를 `notices`에 넣는다.

- [ ] **Step 4: route에서 계좌 코드를 제거하고 공개 cache header를 적용한다.**

```ts
return Response.json(await getDashboard(), {
  headers: { 'Cache-Control': 'public, max-age=0, s-maxage=5, stale-while-revalidate=30' },
})
```

- [ ] **Step 5: 검증하고 커밋한다.**

Run: `pnpm test -- tests/market/cache.test.ts tests/market/dashboard.test.ts`
Expected: PASS; mocked paths contain no `/accounts` or `/holdings`

```bash
git add lib/market/cache.ts lib/market/dashboard.ts tests/market/cache.test.ts tests/market/dashboard.test.ts app/api/dashboard/route.ts
git commit -m "feat(api): 공개 멀티자산 dashboard API 전환"
```

### Task 5: 참고 추정가 엔진

**Files:**
- Create: `lib/market/estimate.ts`, `lib/market/proxy-map.ts`, `tests/market/estimate.test.ts`
- Modify: `lib/market/dashboard.ts`

**Interfaces:**
- Produces: `estimateQuote(base, inputs, rule)`, `applyEstimates(quotes, now)`
- Consumes: `MarketQuote[]`, session and proxy rules

- [ ] **Step 1: 실제 시세 우선과 가중평균 실패 테스트를 작성한다.**

```ts
expect(estimateQuote(base, [{ changeRate: 0.02, weight: 0.6 }, { changeRate: -0.01, weight: 0.4 }], rule)?.price)
  .toBeCloseTo(base.price! * 1.008)
expect(applyEstimates([{ ...base, quality: 'realtime', session: 'regular' }], now)[0].quality).toBe('realtime')
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `pnpm test -- tests/market/estimate.test.ts`
Expected: FAIL with missing estimate module

- [ ] **Step 3: 최소 추정 엔진을 구현한다.**

초기 매핑은 삼성전자, SK하이닉스와 한미반도체에만 적용한다. 가중치 합이 0.6 미만이거나 매핑이 없으면 추정하지 않고 마지막 실제 값을 `stale`로 둔다. 신선한 입력 3개는 `high`, 2개는 `medium`, 1개는 `low`로 분류한다.

- [ ] **Step 4: 장 마감 종목에만 적용되는지 검증하고 커밋한다.**

Run: `pnpm test -- tests/market/estimate.test.ts tests/market/dashboard.test.ts`
Expected: PASS; regular remains realtime, closed with valid inputs becomes estimated

```bash
git add lib/market/estimate.ts lib/market/proxy-map.ts lib/market/dashboard.ts tests/market/estimate.test.ts tests/market/dashboard.test.ts
git commit -m "feat(estimate): 주요 반도체 참고 추정가 추가"
```

### Task 6: Polling hook과 시세 상태 UI

**Files:**
- Create: `hooks/use-market-dashboard.ts`
- Create: `components/market/quote-badge.tsx`, `components/market/price-change.tsx`
- Create: `tests/components/quote-badge.test.tsx`, `tests/components/price-change.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `useMarketDashboard()`, `QuoteBadge`, `PriceChange`
- Consumes: `DashboardResponse`, `MarketQuote`

- [ ] **Step 1: 표시 실패 테스트를 작성한다.**

```tsx
render(<PriceChange value={0.0124} />)
expect(screen.getByText('+1.24%')).toHaveClass('text-rise')
render(<QuoteBadge quote={{ ...quote, quality: 'estimated', confidence: 'medium' }} />)
expect(screen.getByText('참고 추정')).toBeVisible()
expect(screen.getByText('신뢰도 보통')).toBeVisible()
```

- [ ] **Step 2: 실패를 확인하고 최소 컴포넌트를 구현한다.**

Run: `pnpm test -- tests/components/quote-badge.test.tsx tests/components/price-change.test.tsx`
Expected before implementation: FAIL with missing components

`PriceChange`는 빨강 `text-rise`, 파랑 `text-fall`, 회색 neutral과 부호를 함께 사용한다. 400ms flash와 reduced-motion 해제를 CSS에 정의한다.

- [ ] **Step 3: polling hook을 구현한다.**

```ts
export function useMarketDashboard(): {
  data: DashboardResponse | null
  state: 'loading' | 'ready' | 'stale' | 'error'
  refresh(): Promise<void>
}
```

5초 timer, `visibilitychange`, `AbortController`, in-flight 방지를 포함한다.

- [ ] **Step 4: 검증하고 커밋한다.**

Run: `pnpm test -- tests/components/quote-badge.test.tsx tests/components/price-change.test.tsx && pnpm lint`
Expected: PASS

```bash
git add hooks/use-market-dashboard.ts components/market/quote-badge.tsx components/market/price-change.tsx tests/components app/globals.css
git commit -m "feat(ui): 시세 상태와 5초 갱신 기반 추가"
```

### Task 7: 하이브리드 마켓 콕핏과 개인 기능 제거

**Files:**
- Create: `components/market/market-status-bar.tsx`, `indicator-grid.tsx`, `asset-tabs.tsx`, `quote-table.tsx`
- Create: `tests/components/quote-table.test.tsx`
- Replace: `app/page.tsx`
- Modify: `app/globals.css`, `app/layout.tsx`

**Interfaces:**
- Produces: responsive public dashboard and selected-symbol state
- Consumes: `useMarketDashboard`, status components

- [ ] **Step 1: 개인 기능 부재와 핵심 열 실패 테스트를 작성한다.**

```tsx
expect(screen.getByText('현재가')).toBeVisible()
expect(screen.queryByRole('button', { name: /관심종목/ })).not.toBeInTheDocument()
expect(screen.queryByText('내 토스증권 보유자산')).not.toBeInTheDocument()
```

- [ ] **Step 2: 기존 UI에서 실패를 확인한다.**

Run: `pnpm test -- tests/components/quote-table.test.tsx`
Expected: FAIL because personal UI exists or components are missing

- [ ] **Step 3: 승인된 C 시안을 구현한다.**

다크 기본, 높은 대비, 밀도 8/10, 모션 3/10을 적용한다. 세션 상태 바, KOSPI·NASDAQ 100 연동(QQQ)·USD/KRW·금 연동(PAXG), 자산 탭, 종목 표, 공급자 notice 순서로 배치한다. 375px에서는 거래대금을 접고 종목명·현재가·등락률·품질 배지만 유지한다.

- [ ] **Step 4: 접근성과 반응형 규칙을 적용한다.**

아이콘 버튼에 `aria-label`, 조작 요소에 최소 44px, 동적 상태에 `aria-live="polite"`, 모든 focus ring을 유지한다.

- [ ] **Step 5: 검증하고 커밋한다.**

Run: `pnpm test -- tests/components/quote-table.test.tsx && pnpm lint`
Expected: PASS

```bash
git add app/page.tsx app/layout.tsx app/globals.css components/market tests/components/quote-table.test.tsx
git commit -m "feat(ui): 공개용 하이브리드 마켓 콕핏 전환"
```

### Task 8: Lightweight Charts 종목 상세

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`, `app/page.tsx`
- Create: `app/api/market/[symbol]/candles/route.ts`
- Create: `components/market/market-chart.tsx`, `quote-detail.tsx`
- Create: `tests/components/quote-detail.test.tsx`

**Interfaces:**
- Produces: normalized candle route, `MarketChart`, `QuoteDetail`
- Consumes: selected quote, Toss candles, Binance klines, Bithumb candles

- [ ] **Step 1: chart를 설치하고 상세 실패 테스트를 작성한다.**

Run: `pnpm add lightweight-charts`

```tsx
expect(screen.getByText('참고 추정')).toBeVisible()
expect(screen.getByText('QQQ · USD/KRW')).toBeVisible()
expect(screen.getByText('신뢰도 보통')).toBeVisible()
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `pnpm test -- tests/components/quote-detail.test.tsx`
Expected: FAIL with missing detail module

- [ ] **Step 3: candle route를 구현한다.**

각 공급자 OHLCV를 `{ time, open, high, low, close, volume }[]`로 변환한다. 기본은 5분봉 1일, 최대 500개다. 미지원 종목은 `{ candles: [], unavailable: true }`로 현재가 상세를 유지한다.

- [ ] **Step 4: client-only chart와 상세를 구현한다.**

`ResizeObserver`로 크기를 맞추고 OHLC tooltip, 거래량, 현재가·등락률의 텍스트 대체 정보를 제공한다. chart instance와 observer는 cleanup에서 해제한다.

- [ ] **Step 5: 검증하고 커밋한다.**

Run: `pnpm test -- tests/components/quote-detail.test.tsx && pnpm build`
Expected: PASS and build exit 0

```bash
git add package.json pnpm-lock.yaml app/api/market components/market app/page.tsx tests/components/quote-detail.test.tsx
git commit -m "feat(chart): 종목 가격·거래량 상세 차트 추가"
```

### Task 9: 문서 동기화와 최종 검증

**Files:**
- Modify: `README.md`, `CHANGELOG.md`
- Modify: `.env.example` only when an actual key name is introduced

**Interfaces:**
- Consumes: completed Tasks 1–8
- Produces: accurate usage and change documentation

- [ ] **Step 1: README를 실제 구현과 동기화한다.**

개인 보유종목·관심종목을 현재 기능에서 제거하고 Toss, Binance, Bithumb, Lightweight Charts, 공급자 cache, 추정가 주의문과 PAXG 제약을 기록한다.

- [ ] **Step 2: CHANGELOG `Unreleased`를 갱신한다.**

실제 완료된 추가·변경·제거·안정화만 기록하며 버전은 release 단계 전 임의로 올리지 않는다.

- [ ] **Step 3: 전체 자동 검증을 실행한다.**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all tests pass, lint exit 0, production build exit 0

- [ ] **Step 4: 375px, 768px, 1024px, 1440px에서 수동 검증한다.**

수평 스크롤, 대비, 키보드 탐색, 실시간·stale·추정·미제공 배지, 5초 갱신, 가격 flash와 개인 UI 부재를 확인한다.

- [ ] **Step 5: 문서를 커밋한다.**

```bash
git add README.md CHANGELOG.md .env.example
git commit -m "docs: 멀티자산 대시보드 사용법과 제약 정리"
```

## Review Gates

1. Tasks 1–4 후 API 응답, 개인 endpoint 부재와 공급자 호출량을 검토한다.
2. Task 5 후 실제 시세 우선순위와 추정가 설명 가능성을 검토한다.
3. Tasks 6–8 후 데스크톱·모바일 화면과 접근성을 검토한다.
4. Task 9 검증 전에는 push, merge, release와 배포를 수행하지 않는다.
