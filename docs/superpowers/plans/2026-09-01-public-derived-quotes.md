# 지투라이브 공개용 24시간 파생 추정가 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 배포판의 Toss 의존성을 제거하고 Hyperliquid·Binance 파생상품과 Bithumb 합성환율을 이용한 24시간 참고 추정가를 제공한다.

**Architecture:** 외부 파생상품 응답은 `DerivativeTicker`로 정규화하고 `composeDerivedQuotes`가 종목 catalog와 Bithumb `KRW-USDT`를 결합해 `MarketQuote`를 만든다. dashboard 서비스는 네 공급자를 독립 cache하고, UI는 가격 성격·비교 기준·출처를 공통 필드로만 표시한다.

**Tech Stack:** React 19, TypeScript 5.9, Vinext, Vitest, Testing Library, Lightweight Charts, Hyperliquid Public API, Binance Public API, Bithumb Public API

**Spec:** `docs/superpowers/specs/2026-09-01-public-derived-quotes-design.md`

## Global Constraints

- 공개 배포판은 Toss Invest API를 호출하거나 Toss 자격증명을 요구하지 않는다.
- 한국·미국 주식 파생 가격은 모든 시장 세션에서 `derived-estimate`이며 `실시간 주가`로 표기하지 않는다.
- 한국 주식은 삼성전자·SK하이닉스·현대차·삼성전기·NAVER·한미반도체·LG전자만 1차 제공한다.
- 미국 주식은 Tesla·NVIDIA·Apple·Alphabet A만 1차 제공한다.
- 한국 주식 파생 가격은 Bithumb `KRW-USDT`로 환산하고 등락률은 `24시간 전 대비`로 표시한다.
- 검증되지 않은 종목·가격·등락률을 생성하지 않는다.
- 공급자별 시세 cache TTL은 5초이며 동일 cache miss 요청을 병합한다.
- 버전은 `0.4.0`으로 갱신한다.
- TradingView 고급 위젯과 그리기 도구는 이 계획에서 변경하지 않는다.

---

### Task 1: 공통 가격 계약과 파생 종목 catalog

**Files:**
- Modify: `lib/market/types.ts`
- Modify: `lib/market/catalog.ts`
- Modify: `tests/market/catalog.test.ts`
- Create: `lib/market/derived-quotes.ts`
- Create: `tests/market/derived-quotes.test.ts`

**Interfaces:**
- Produces: `MarketProvider`, `PriceKind`, `ComparisonBasis`, `DerivativeTicker`
- Produces: `composeDerivedQuotes(tickers: DerivativeTicker[], krwPerUsdt: number | null): MarketQuote[]`
- Consumes: `INSTRUMENTS`의 `provider`와 `providerSymbol`

- [ ] **Step 1: 공통 타입과 catalog 기대값 테스트 작성**

```ts
it('공개 catalog는 검증된 파생 주식만 포함한다', () => {
  expect(instrumentsByAssetClass('kr-stock').map((item) => item.symbol)).toEqual([
    '005930', '000660', '005380', '009150', '035420', '042700', '066570',
  ]);
  expect(instrumentsByAssetClass('us-stock').map((item) => item.symbol)).toEqual([
    'TSLA', 'NVDA', 'AAPL', 'GOOGL',
  ]);
  expect(INSTRUMENTS.find((item) => item.symbol === '005930')).toMatchObject({
    provider: 'hyperliquid', providerSymbol: 'xyz:SMSN',
  });
});
```

- [ ] **Step 2: catalog 테스트 실패 확인**

Run: `pnpm test -- tests/market/catalog.test.ts`

Expected: 기존 Toss catalog와 종목 수가 달라 FAIL

- [ ] **Step 3: 파생 추정가 조합 테스트 작성**

```ts
it('한국 파생 가격을 합성환율로 원화 환산한다', () => {
  const quotes = composeDerivedQuotes([{
    provider: 'hyperliquid', providerSymbol: 'xyz:SMSN', price: 60,
    changeRate: 0.012, tradingAmount: 1_000_000, asOf: '2026-09-01T10:00:00.000Z',
  }], 1_380);

  expect(quotes.find((quote) => quote.symbol === '005930')).toMatchObject({
    price: 82_800, currency: 'KRW', changeRate: 0.012,
    priceKind: 'derived-estimate', comparisonBasis: 'provider-24h',
    quality: 'estimated', provider: 'hyperliquid',
    sourceLabel: 'Hyperliquid 파생상품',
    estimateInputs: ['xyz:SMSN', 'KRW-USDT'],
  });
});

it('합성환율이나 ticker가 없으면 임의 가격을 만들지 않는다', () => {
  const quote = composeDerivedQuotes([], null).find((item) => item.symbol === '005930');
  expect(quote).toMatchObject({ price: null, quality: 'unavailable', priceKind: 'unavailable' });
});
```

- [ ] **Step 4: 조합 테스트 실패 확인**

Run: `pnpm test -- tests/market/derived-quotes.test.ts`

Expected: `derived-quotes` 모듈이 없어 FAIL

- [ ] **Step 5: 타입·catalog·최소 조합기 구현**

```ts
export type MarketProvider = 'hyperliquid' | 'binance-futures' | 'binance-spot' | 'bithumb';
export type PriceKind = 'actual-product' | 'derived-estimate' | 'unavailable';
export type ComparisonBasis = 'provider-24h' | 'previous-close' | null;

export type DerivativeTicker = {
  provider: 'hyperliquid' | 'binance-futures';
  providerSymbol: string;
  price: number | null;
  changeRate: number | null;
  tradingAmount: number | null;
  asOf: string;
};
```

`MarketQuote`에는 다음 필드를 필수로 추가한다.

```ts
priceKind: PriceKind;
comparisonBasis: ComparisonBasis;
sourceLabel: string | null;
```

`composeDerivedQuotes`는 `INSTRUMENTS` 중 `kr-stock | us-stock`만 순회한다. 한국 주식은 `ticker.price * krwPerUsdt`, 미국 주식은 `ticker.price`를 사용하고, 정상 입력이 없으면 동일 종목의 `unavailable` quote를 반환한다.

- [ ] **Step 6: Task 1 테스트 통과 확인**

Run: `pnpm test -- tests/market/catalog.test.ts tests/market/derived-quotes.test.ts`

Expected: PASS

- [ ] **Step 7: Task 1 커밋**

```bash
git add lib/market/types.ts lib/market/catalog.ts lib/market/derived-quotes.ts tests/market/catalog.test.ts tests/market/derived-quotes.test.ts
git commit -m "feat(market): 파생 추정가 공통 계약과 종목 mapping 추가"
```

---

### Task 2: Hyperliquid 파생상품 adapter

**Files:**
- Create: `lib/market/providers/hyperliquid.ts`
- Create: `tests/market/hyperliquid-provider.test.ts`

**Interfaces:**
- Consumes: `DerivativeTicker`
- Produces: `fetchHyperliquidTickers(fetcher?: typeof fetch, now?: () => Date, symbols?: string[]): Promise<DerivativeTicker[]>`
- Default symbols: `['xyz:SMSN', 'xyz:SKHX', 'xyz:HYUNDAI']`

- [ ] **Step 1: 정상 응답 정규화 테스트 작성**

```ts
it('universe와 context의 같은 index를 파생 ticker로 변환한다', async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify([
    { universe: [{ name: 'xyz:SMSN' }, { name: 'xyz:SKHX' }] },
    [
      { markPx: '60', prevDayPx: '59', dayNtlVlm: '1200000' },
      { markPx: '130', prevDayPx: '125', dayNtlVlm: '900000' },
    ],
  ]));

  const tickers = await fetchHyperliquidTickers(
    fetcher,
    () => new Date('2026-09-01T10:00:00.000Z'),
    ['xyz:SMSN', 'xyz:SKHX'],
  );

  expect(tickers[0]).toEqual({
    provider: 'hyperliquid', providerSymbol: 'xyz:SMSN', price: 60,
    changeRate: 60 / 59 - 1, tradingAmount: 1_200_000,
    asOf: '2026-09-01T10:00:00.000Z',
  });
});
```

- [ ] **Step 2: 잘못된 종목 격리 테스트 작성**

```ts
it('잘못된 markPx는 해당 종목만 unavailable ticker로 만든다', async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify([
    { universe: [{ name: 'xyz:SMSN' }, { name: 'xyz:SKHX' }] },
    [{ markPx: 'invalid', prevDayPx: '59' }, { markPx: '130', prevDayPx: '125' }],
  ]));
  const tickers = await fetchHyperliquidTickers(fetcher, () => new Date(0), ['xyz:SMSN', 'xyz:SKHX']);
  expect(tickers.find((item) => item.providerSymbol === 'xyz:SMSN')?.price).toBeNull();
  expect(tickers.find((item) => item.providerSymbol === 'xyz:SKHX')?.price).toBe(130);
});
```

- [ ] **Step 3: provider 테스트 실패 확인**

Run: `pnpm test -- tests/market/hyperliquid-provider.test.ts`

Expected: 모듈이 없어 FAIL

- [ ] **Step 4: Hyperliquid adapter 구현**

요청은 다음 계약을 사용한다.

```ts
await fetcher('https://api.hyperliquid.xyz/info', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'metaAndAssetCtxs', dex: 'xyz' }),
  cache: 'no-store',
  signal: AbortSignal.timeout(3_000),
});
```

`markPx`, `prevDayPx`, `dayNtlVlm`은 유한한 양수만 허용한다. `prevDayPx`가 유효할 때 `markPx / prevDayPx - 1`을 계산하고, 요청 실패는 함수 전체를 reject해 dashboard의 공급자 장애 격리가 처리하게 한다.

- [ ] **Step 5: Hyperliquid 테스트 통과 확인**

Run: `pnpm test -- tests/market/hyperliquid-provider.test.ts`

Expected: PASS

- [ ] **Step 6: Task 2 커밋**

```bash
git add lib/market/providers/hyperliquid.ts tests/market/hyperliquid-provider.test.ts
git commit -m "feat(hyperliquid): 한국 주식 파생 ticker adapter 추가"
```

---

### Task 3: Binance 현물·선물 공급자 분리

**Files:**
- Modify: `lib/market/providers/binance.ts`
- Create: `lib/market/providers/binance-futures.ts`
- Modify: `tests/market/binance-provider.test.ts`
- Create: `tests/market/binance-futures-provider.test.ts`

**Interfaces:**
- Renames: `fetchBinanceQuotes` → `fetchBinanceSpotQuotes`
- Produces: `fetchBinanceFuturesTickers(fetcher?: typeof fetch, now?: () => Date, symbols?: string[]): Promise<DerivativeTicker[]>`
- Default futures symbols: `SAMSUNGEMUSDT`, `NAVERUSDT`, `HANMIUSDT`, `LGELECTRONICSUSDT`, `TSLAUSDT`, `NVDAUSDT`, `AAPLUSDT`, `GOOGLUSDT`

- [ ] **Step 1: 선물 ticker 정규화 테스트 작성**

```ts
it('필요한 Binance 선물만 DerivativeTicker로 변환한다', async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify([
    { symbol: 'TSLAUSDT', lastPrice: '366.48', priceChangePercent: '4.939', quoteVolume: '1000000', closeTime: 1788249315837 },
    { symbol: 'BTCUSDT', lastPrice: '100000', priceChangePercent: '1', quoteVolume: '999', closeTime: 1788249315837 },
  ]));

  const result = await fetchBinanceFuturesTickers(fetcher, () => new Date(0), ['TSLAUSDT']);
  expect(result).toEqual([{
    provider: 'binance-futures', providerSymbol: 'TSLAUSDT', price: 366.48,
    changeRate: 0.04939, tradingAmount: 1_000_000,
    asOf: new Date(1788249315837).toISOString(),
  }]);
});
```

- [ ] **Step 2: 기존 현물 공급자 계약 변경 테스트 작성**

기존 테스트 import를 `fetchBinanceSpotQuotes`로 바꾸고 다음 필드를 기대한다.

```ts
expect(paxg).toMatchObject({
  provider: 'binance-spot', priceKind: 'actual-product',
  comparisonBasis: 'provider-24h', sourceLabel: 'Binance 현물',
});
```

- [ ] **Step 3: Binance 테스트 실패 확인**

Run: `pnpm test -- tests/market/binance-provider.test.ts tests/market/binance-futures-provider.test.ts`

Expected: 새 함수와 provider가 없어 FAIL

- [ ] **Step 4: 현물 adapter 갱신과 선물 adapter 구현**

현물은 `https://api.binance.com/api/v3/ticker/24hr`를 유지한다. 선물은 한 번의 `https://fapi.binance.com/fapi/v1/ticker/24hr` 호출 결과에서 allowlist만 선택한다. 두 adapter 모두 잘못된 숫자는 해당 항목만 `null`로 정규화한다.

- [ ] **Step 5: Binance 테스트 통과 확인**

Run: `pnpm test -- tests/market/binance-provider.test.ts tests/market/binance-futures-provider.test.ts`

Expected: PASS

- [ ] **Step 6: Task 3 커밋**

```bash
git add lib/market/providers/binance.ts lib/market/providers/binance-futures.ts tests/market/binance-provider.test.ts tests/market/binance-futures-provider.test.ts
git commit -m "feat(binance): 주식 파생상품과 현물 시세 공급자 분리"
```

---

### Task 4: Bithumb 합성환율과 dashboard 조합

**Files:**
- Modify: `lib/market/providers/bithumb.ts`
- Modify: `lib/market/dashboard.ts`
- Modify: `tests/market/bithumb-provider.test.ts`
- Modify: `tests/market/dashboard.test.ts`
- Delete: `lib/market/estimate.ts`
- Delete: `lib/market/proxy-map.ts`
- Delete: `tests/market/estimate.test.ts`

**Interfaces:**
- Produces: `BithumbSnapshot = { quotes: MarketQuote[]; krwPerUsdt: number | null; fxQuote: MarketQuote }`
- Renames: `fetchBithumbQuotes` → `fetchBithumbSnapshot`
- Consumes: `composeDerivedQuotes`, `fetchHyperliquidTickers`, `fetchBinanceFuturesTickers`, `fetchBinanceSpotQuotes`
- Produces: `createDashboardService(loaders: DashboardLoaders)`

- [ ] **Step 1: Bithumb 합성환율 테스트 작성**

```ts
it('KRW-USDT를 합성 원달러 환산값으로 분리한다', async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify([
    { market: 'KRW-BTC', trade_price: 149850000, signed_change_rate: 0.028, acc_trade_price_24h: 184200000000, timestamp: 1788226800000 },
    { market: 'KRW-USDT', trade_price: 1380, signed_change_rate: 0.001, acc_trade_price_24h: 1000000, timestamp: 1788226800000 },
  ]));
  const snapshot = await fetchBithumbSnapshot(fetcher, ['KRW-BTC', 'KRW-USDT']);
  expect(snapshot.krwPerUsdt).toBe(1380);
  expect(snapshot.fxQuote).toMatchObject({
    symbol: 'USDTKRW', price: 1380, assetClass: 'fx',
    priceKind: 'derived-estimate', sourceLabel: 'Bithumb KRW-USDT',
  });
  expect(snapshot.quotes.map((quote) => quote.symbol)).toEqual(['BTC']);
});
```

- [ ] **Step 2: dashboard 병렬 조합과 장애 테스트 작성**

```ts
const derivative = (overrides: Partial<DerivativeTicker>): DerivativeTicker => ({
  provider: 'binance-futures', providerSymbol: 'TSLAUSDT', price: 100,
  changeRate: 0.01, tradingAmount: 1_000_000, asOf: '2026-09-01T10:00:00.000Z',
  ...overrides,
});

const quote = (overrides: Partial<MarketQuote>): MarketQuote => ({
  symbol: 'BTC', name: '비트코인', assetClass: 'crypto', price: 100,
  currency: 'KRW', changeRate: 0.01, previousClose: null,
  changeRateSource: 'provider', tradingAmount: 1_000, asOf: '2026-09-01T10:00:00.000Z',
  session: 'always-open', quality: 'realtime', provider: 'bithumb', confidence: null,
  estimateInputs: [], priceKind: 'actual-product', comparisonBasis: 'provider-24h',
  sourceLabel: 'Bithumb', ...overrides,
});

it('파생 ticker와 Bithumb 합성환율로 공개 dashboard를 만든다', async () => {
  const service = createDashboardService({
    hyperliquid: async () => [derivative({ provider: 'hyperliquid', providerSymbol: 'xyz:SMSN', price: 60 })],
    binanceFutures: async () => [derivative({ provider: 'binance-futures', providerSymbol: 'TSLAUSDT', price: 366 })],
    binanceSpot: async () => [quote({ symbol: 'PAXG', provider: 'binance-spot', priceKind: 'actual-product' })],
    bithumb: async () => ({ quotes: [quote({ symbol: 'BTC', provider: 'bithumb' })], krwPerUsdt: 1380, fxQuote: quote({ symbol: 'USDTKRW', assetClass: 'fx' }) }),
  });
  const dashboard = await service.getDashboard();
  expect(dashboard.quotes.find((item) => item.symbol === '005930')?.price).toBe(82800);
  expect(dashboard.quotes.find((item) => item.symbol === 'TSLA')?.price).toBe(366);
  expect(dashboard.quotes.some((item) => item.provider === 'toss')).toBe(false);
});

it('Bithumb 장애 시 미국 추정가는 유지하고 한국 추정가는 unavailable로 둔다', async () => {
  const service = createDashboardService({
    hyperliquid: async () => [derivative({ provider: 'hyperliquid', providerSymbol: 'xyz:SMSN', price: 60 })],
    binanceFutures: async () => [derivative({ providerSymbol: 'TSLAUSDT', price: 366 })],
    binanceSpot: async () => [],
    bithumb: async () => { throw new Error('timeout'); },
  });
  const dashboard = await service.getDashboard();
  expect(dashboard.quotes.find((item) => item.symbol === 'TSLA')?.price).toBe(366);
  expect(dashboard.quotes.find((item) => item.symbol === '005930')).toMatchObject({
    price: null, quality: 'unavailable', priceKind: 'unavailable',
  });
  expect(dashboard.notices).toContain('Bithumb 시세를 불러오지 못했습니다.');
});
```

- [ ] **Step 3: dashboard 관련 테스트 실패 확인**

Run: `pnpm test -- tests/market/bithumb-provider.test.ts tests/market/dashboard.test.ts`

Expected: 기존 loader 계약과 달라 FAIL

- [ ] **Step 4: Bithumb snapshot과 dashboard service 구현**

dashboard cache key와 TTL은 다음과 같이 고정한다.

```ts
const providers = {
  hyperliquid: createCachedProvider({ ttlMs: 5_000, failureThreshold: 2, cooldownMs: 30_000, load: loaders.hyperliquid }),
  binanceFutures: createCachedProvider({ ttlMs: 5_000, failureThreshold: 2, cooldownMs: 30_000, load: loaders.binanceFutures }),
  binanceSpot: createCachedProvider({ ttlMs: 5_000, failureThreshold: 2, cooldownMs: 30_000, load: loaders.binanceSpot }),
  bithumb: createCachedProvider({ ttlMs: 5_000, failureThreshold: 2, cooldownMs: 30_000, load: loaders.bithumb }),
};
```

성공한 공급자 결과만 합치고, Bithumb 실패 시 `krwPerUsdt = null`로 조합해 한국 종목을 `unavailable`로 만든다. 미국 파생 종목과 Binance PAXG는 유지한다. 기존 가중평균 `applyEstimates` 경로는 제거한다.

- [ ] **Step 5: Task 4 테스트 통과 확인**

Run: `pnpm test -- tests/market/bithumb-provider.test.ts tests/market/dashboard.test.ts tests/market/cache.test.ts`

Expected: PASS

- [ ] **Step 6: Task 4 커밋**

```bash
git add lib/market/providers/bithumb.ts lib/market/dashboard.ts lib/market/estimate.ts lib/market/proxy-map.ts tests/market/bithumb-provider.test.ts tests/market/dashboard.test.ts tests/market/estimate.test.ts
git commit -m "feat(dashboard): 공개 파생 시세와 합성환율 조합으로 전환"
```

---

### Task 5: Binance 파생상품 candle routing

**Files:**
- Modify: `lib/market/providers/binance-candles.ts`
- Modify: `lib/market/candles.ts`
- Modify: `tests/market/candles.test.ts`
- Delete: `lib/market/providers/toss-candles.ts`

**Interfaces:**
- `fetchBinanceCandles`는 `instrument.provider === 'binance-futures'`일 때 futures klines, `binance-spot`일 때 spot klines 사용
- `getCandles`는 한국 파생 종목에 명시적 미지원 메시지 반환

- [ ] **Step 1: candle routing 테스트 갱신**

```ts
it('한국 파생 추정가의 원화 환산 이력이 없으면 오해 없는 미지원 응답을 반환한다', async () => {
  await expect(service.getCandles('005930', '1m')).resolves.toEqual({
    candles: [], unavailable: true,
    message: '원화 환산 추정 차트는 준비 중입니다.',
  });
});

it('미국 Binance 파생 종목은 futures klines를 사용한다', async () => {
  const tesla = INSTRUMENTS.find((item) => item.symbol === 'TSLA')!;
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([
    [1788226800000, '360', '370', '355', '366', '100', 1788226859999],
  ])));
  await fetchBinanceCandles(tesla, '15m', fetcher);
  expect(fetcher.mock.calls[0][0]).toContain('https://fapi.binance.com/fapi/v1/klines');
});
```

- [ ] **Step 2: candle 테스트 실패 확인**

Run: `pnpm test -- tests/market/candles.test.ts`

Expected: Binance futures routing과 한국 파생 차트 차단이 없어 FAIL

- [ ] **Step 3: candle routing 구현**

`fetchBinanceCandles`는 provider에 따라 base URL을 선택한다.

```ts
const baseUrl = instrument.provider === 'binance-futures'
  ? 'https://fapi.binance.com/fapi/v1'
  : 'https://api.binance.com/api/v3';
```

한국 주식은 historical KRW 환율을 합성하지 않으므로 `createCandleService`에서 provider 호출 전 `원화 환산 추정 차트는 준비 중입니다.` 응답을 반환한다. loader 타입은 `Partial<Record<MarketProvider, CandleLoader>>`로 바꾸고 등록되지 않은 provider는 `차트 데이터를 제공하지 않는 종목입니다.`를 반환한다.

- [ ] **Step 4: candle 테스트 통과 확인**

Run: `pnpm test -- tests/market/candles.test.ts tests/api/candles-route.test.ts`

Expected: PASS

- [ ] **Step 5: Task 5 커밋**

```bash
git add lib/market/providers/binance-candles.ts lib/market/providers/toss-candles.ts lib/market/candles.ts tests/market/candles.test.ts tests/api/candles-route.test.ts
git commit -m "feat(chart): 파생상품 candle 공급자와 안전한 routing 추가"
```

---

### Task 6: 24시간 추정가 UI와 상세 근거 표시

**Files:**
- Modify: `components/market/quote-badge.tsx`
- Modify: `components/market/quote-table.tsx`
- Modify: `components/market/quote-detail.tsx`
- Modify: `app/page.tsx`
- Modify: `tests/components/quote-badge.test.tsx`
- Modify: `tests/components/quote-table.test.tsx`
- Modify: `tests/components/quote-detail.test.tsx`

**Interfaces:**
- Consumes: `priceKind`, `comparisonBasis`, `sourceLabel`, `asOf`, `estimateInputs`
- Produces: 사용자 문구 `24시간 추정가`, `24시간 전 대비`, `실제 거래상품`, `갱신 지연`

- [ ] **Step 1: badge와 목록 문구 테스트 작성**

```tsx
it('파생 추정가의 가격 성격과 비교 기준을 표시한다', () => {
  render(<QuoteBadge quote={{
    ...quote, priceKind: 'derived-estimate', comparisonBasis: 'provider-24h',
    sourceLabel: 'Hyperliquid 파생상품', quality: 'estimated',
  }} />);
  expect(screen.getByText('24시간 추정가')).toBeVisible();
  expect(screen.getByText('24시간 전 대비')).toBeVisible();
});

it('정규장 시간이어도 파생 추정가를 실제 시세로 바꾸지 않는다', () => {
  render(<QuoteBadge quote={{ ...quote, session: 'regular', priceKind: 'derived-estimate' }} />);
  expect(screen.queryByText(/실시간|정규장 ·/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 상세 근거와 면책 테스트 작성**

```tsx
expect(screen.getByText('Hyperliquid 파생상품')).toBeVisible();
expect(screen.getByText('USDT/KRW 환산')).toBeVisible();
expect(screen.getByText(/실제 주식 가격이 아닌 해외 파생상품 기반 참고 추정가/)).toBeVisible();
```

- [ ] **Step 3: UI 테스트 실패 확인**

Run: `pnpm test -- tests/components/quote-badge.test.tsx tests/components/quote-table.test.tsx tests/components/quote-detail.test.tsx`

Expected: 기존 `참고 추정`, 세션·Toss 문구 때문에 FAIL

- [ ] **Step 4: UI 최소 변경 구현**

`QuoteBadge`는 `priceKind`를 최우선으로 분기한다. `derived-estimate`는 amber badge와 비교 기준을, `actual-product`는 공급자 label을, `unavailable`은 `연동 준비 중`을 표시한다. `QuoteDetail`의 `전일 종가`는 `comparisonBasis === 'previous-close'`일 때만 표시하고, 그렇지 않으면 `비교 기준` 카드에 `24시간 전`을 표시한다.

홈 설명과 footer는 다음 문구로 변경한다.

```text
해외 파생상품으로 한국·미국 주식의 24시간 참고 추정가를 확인합니다. 암호화폐와 PAXG는 표시된 거래상품의 실제 가격입니다.

주식 가격은 KRX·미국 거래소의 실제 체결가가 아닌 해외 파생상품 기반 참고 추정가입니다. 투자 판단 전 공식 거래소·증권사 가격을 확인하세요.
```

- [ ] **Step 5: UI 테스트 통과 확인**

Run: `pnpm test -- tests/components/quote-badge.test.tsx tests/components/quote-table.test.tsx tests/components/quote-detail.test.tsx`

Expected: PASS

- [ ] **Step 6: UI/UX 규칙 점검**

Run:

```bash
python /Users/jiminjae/.codex/skills/ui-ux-pro-max/scripts/search.py "derived quote badge accessibility" --domain ux
python /Users/jiminjae/.codex/skills/ui-ux-pro-max/scripts/search.py "financial data badge nowrap" --stack react
```

확인: 배지가 색에만 의존하지 않고, 375px에서 문구가 가격을 밀어내지 않으며, 상세 근거가 키보드 탐색을 방해하지 않는다.

- [ ] **Step 7: Task 6 커밋**

```bash
git add components/market/quote-badge.tsx components/market/quote-table.tsx components/market/quote-detail.tsx app/page.tsx tests/components/quote-badge.test.tsx tests/components/quote-table.test.tsx tests/components/quote-detail.test.tsx
git commit -m "feat(ui): 24시간 파생 추정가와 데이터 근거 표시"
```

---

### Task 7: Toss 제거와 0.4.0 문서 동기화

**Files:**
- Delete: `lib/market/providers/toss.ts`
- Delete: `lib/toss-invest.ts`
- Delete: `tests/market/toss-provider.test.ts`
- Delete: `tests/market/previous-close.test.ts`
- Delete: `tests/market/session.test.ts`
- Delete: `lib/market/previous-close.ts`
- Delete: `lib/market/session.ts`
- Delete: `.env.example`
- Modify: `README.md`
- Modify: `docs/product/PROJECT_BRIEF.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`

**Interfaces:**
- Removes: Toss 자격증명, session calendar, previous-close loader와 Toss provider
- Produces: 현재 공개 구조와 일치하는 설치·실행·데이터 출처·면책 문서

- [ ] **Step 1: Toss 잔존 참조 검사 실패 확인**

Run:

```bash
rg -n "TOSS_INVEST|Toss Invest|fetchToss|provider: 'toss'|토스증권" app components hooks lib tests README.md docs/product/PROJECT_BRIEF.md .env.example
```

Expected: 현재 Toss 코드와 문서 참조가 출력됨

- [ ] **Step 2: Toss 코드와 테스트 제거**

`apply_patch`로 지정된 Toss·session·previous-close 파일을 삭제하고 남은 import를 제거한다. `.env.example`은 더 필요한 공개 API 자격증명이 없으므로 삭제한다.

- [ ] **Step 3: README와 제품 문서 갱신**

README에는 다음 내용을 반영한다.

```text
Data: Hyperliquid Public API, Binance Public API, Bithumb Public API
환경변수: 필수 환경변수 없음
한국·미국 주식: 해외 파생상품 기반 24시간 추정가
원화 환산: Bithumb KRW-USDT 합성환율
한국 주식 원화 환산 상세 차트: 0.4.0에서 미지원
```

`PROJECT_BRIEF.md`의 제품 정의를 `실시간 주식 대시보드`에서 `24시간 시장 참고 대시보드`로 고치고 실제값·추정가 혼동 금지 원칙을 유지한다.

- [ ] **Step 4: CHANGELOG와 버전 갱신**

`CHANGELOG.md`의 Unreleased에 다음을 기록한다.

```markdown
### 추가
- Hyperliquid·Binance 파생상품 기반 한국·미국 주식 24시간 추정가 추가
- Bithumb KRW-USDT 기반 합성환율과 가격 근거 표시 추가

### 변경
- 주식 가격을 실제 거래소 시세가 아닌 24시간 파생 추정가로 명확히 구분
- 공개 데이터 공급 구조를 Toss에서 Hyperliquid·Binance·Bithumb로 전환

### 제거
- 공개 배포판의 Toss Invest 자격증명·시세·차트 의존성 제거
```

`package.json`의 `version`을 `0.4.0`으로 변경한다.

- [ ] **Step 5: Toss 참조 제거 확인**

Run:

```bash
rg -n "TOSS_INVEST|fetchToss|provider: 'toss'" app components hooks lib tests README.md docs/product/PROJECT_BRIEF.md
```

Expected: exit code 1, 출력 없음

- [ ] **Step 6: 전체 검증**

Run:

```bash
pnpm test
pnpm lint
pnpm build
git diff --check
```

Expected: 모든 명령 PASS

- [ ] **Step 7: 공개 API smoke 검증**

Run:

```bash
curl -fsSL -X POST https://api.hyperliquid.xyz/info -H 'Content-Type: application/json' --data '{"type":"metaAndAssetCtxs","dex":"xyz"}' | jq -e '.[0].universe | any(.name == "xyz:SMSN")'
curl -fsSL https://fapi.binance.com/fapi/v1/ticker/24hr | jq -e 'any(.symbol == "TSLAUSDT")'
curl -fsSL 'https://api.bithumb.com/v1/ticker?markets=KRW-USDT' | jq -e '.[0].trade_price > 0'
```

Expected: 세 명령 모두 `true`

- [ ] **Step 8: Task 7 커밋**

```bash
git add README.md docs/product/PROJECT_BRIEF.md CHANGELOG.md package.json lib/market/providers/toss.ts lib/toss-invest.ts lib/market/previous-close.ts lib/market/session.ts tests/market/toss-provider.test.ts tests/market/previous-close.test.ts tests/market/session.test.ts .env.example
git commit -m "chore(data): Toss 제거와 v0.4.0 공개 구조 문서화"
```

---

### Task 8: 최종 회귀 검증과 브랜치 검토

**Files:**
- Modify only if validation finds an in-scope defect

**Interfaces:**
- Consumes: Tasks 1–7의 전체 결과
- Produces: 병합 가능한 `feature/market-dashboard-v1` 브랜치

- [ ] **Step 1: 전체 품질 검사 재실행**

Run:

```bash
pnpm test
pnpm lint
pnpm build
```

Expected: 모든 명령 PASS

- [ ] **Step 2: 변경 범위와 비밀정보 검사**

Run:

```bash
git status --short --branch
git diff origin/feature/market-dashboard-v1...HEAD --stat
git diff origin/feature/market-dashboard-v1...HEAD -- . ':!pnpm-lock.yaml' | rg -n "client_secret|api[_-]?key|Bearer [A-Za-z0-9]"
```

Expected: 계획된 파일만 변경되고 비밀정보 패턴 출력 없음

- [ ] **Step 3: 데이터 표시 수동 검증**

Run: `pnpm exec vinext dev --hostname 0.0.0.0`

확인 항목:

- 한국·미국 주식에 `24시간 추정가`와 `24시간 전 대비` 표시
- 암호화폐·PAXG에는 실제 거래상품 공급자 표시
- 한국 주식 상세 차트에는 원화 환산 차트 미지원 이유 표시
- 데이터 출처와 실제 주식 가격이 아니라는 면책 표시
- 라이트·다크 전환 후 가격·배지·차트 상태 유지

- [ ] **Step 4: 코드 리뷰 요청**

`requesting-code-review` 스킬로 설계 충족, 데이터 오인 가능성, 장애 격리와 테스트 누락을 검토한다. 발견된 결함은 범위 안에서 수정하고 관련 테스트를 재실행한다.

- [ ] **Step 5: 병합 준비 상태 확인**

Run:

```bash
git status --short --branch
git log --oneline --decorate origin/feature/market-dashboard-v1..HEAD
```

Expected: worktree가 clean이고 Task별 한국어 Conventional Commit이 순서대로 표시됨
