import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuoteDetail } from '@/components/market/quote-detail';
import { MarketChart } from '@/components/market/market-chart';
import type { MarketQuote } from '@/lib/market/types';

const chartMocks = vi.hoisted(() => ({
  setData: vi.fn(),
  applyOptions: vi.fn(),
  setVisibleRange: vi.fn(),
  setMarkers: vi.fn(),
  addSeries: vi.fn((..._args: unknown[]) => ({ setData: vi.fn(), applyOptions: vi.fn() })),
  createChart: vi.fn(),
}));

vi.mock('lightweight-charts', () => ({
  CandlestickSeries: {},
  ColorType: { Solid: 'solid' },
  HistogramSeries: {},
  LineSeries: {},
  TickMarkType: { Year: 0, Month: 1, DayOfMonth: 2, Time: 3, TimeWithSeconds: 4 },
  createSeriesMarkers: () => ({ setMarkers: chartMocks.setMarkers }),
  createChart: (...args: unknown[]) => {
    chartMocks.createChart(...args);
    return {
    addSeries: (...seriesArgs: unknown[]) => {
      const series = chartMocks.addSeries(...seriesArgs);
      return { ...series, setData: chartMocks.setData };
    },
    applyOptions: chartMocks.applyOptions,
    priceScale: () => ({ applyOptions: vi.fn() }),
    remove: vi.fn(),
    removeSeries: vi.fn(),
    subscribeCrosshairMove: vi.fn(),
    unsubscribeCrosshairMove: vi.fn(),
    timeScale: () => ({ fitContent: vi.fn(), setVisibleRange: chartMocks.setVisibleRange }),
  };
  },
}));

const quote: MarketQuote = {
  symbol: '005930', name: '삼성전자', nameKo: '삼성전자', nameEn: 'Samsung Electronics', assetClass: 'kr-stock', price: 84000,
  currency: 'KRW', changeRate: 0.0124, previousClose: null, changeRateSource: 'provider', tradingAmount: 184_200_000_000,
  tradingAmountCurrency: 'KRW',
  volumeKind: 'derivative-notional',
  asOf: '2026-09-01T10:00:00+09:00', session: 'always-open', quality: 'estimated',
  provider: 'hyperliquid', providerSymbol: 'xyz:SMSN', confidence: null, estimateInputs: ['xyz:SMSN', 'KRW-USDT'],
  priceKind: 'derived-estimate', comparisonBasis: 'provider-24h', sourceLabel: 'Hyperliquid 파생상품',
};

describe('QuoteDetail', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('24시간 파생 추정가의 비교 기준과 상세 근거를 표시한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === '/api/dashboard') return new Response(JSON.stringify({ quotes: [quote], fetchedAt: quote.asOf, notices: [] }), { status: 200 });
      return new Response(JSON.stringify({
        candles: [{ time: 1788226800, open: 83000, high: 84500, low: 82800, close: 84000, volume: 1000 }],
        unavailable: false,
        priceKind: 'derived-estimate',
        volumeKind: 'derivative-contracts',
        sourceLabel: 'Hyperliquid 파생상품 × Bithumb KRW-USDT',
        estimateInputs: ['xyz:SMSN', 'KRW-USDT'],
      }), { status: 200 });
    });

    render(<QuoteDetail initialQuote={quote} />);

    expect(screen.queryByText('전일 종가')).not.toBeInTheDocument();
    expect(screen.getByText('비교 기준')).toBeVisible();
    expect(screen.getByText('24시간 전')).toBeVisible();
    expect(screen.getByText('Hyperliquid 파생상품')).toBeVisible();
    expect(screen.getByText('USDT/KRW 환산')).toBeVisible();
    expect(screen.getByText('추종상품 거래량')).toBeVisible();
    expect(screen.getByText(/실제 KRX·NXT 거래량이 아닙니다/)).toBeVisible();
    expect(screen.getByText(/실제 주식 가격이 아닌 해외 파생상품 기반 참고 추정가/)).toBeVisible();
    expect(screen.getByText('기준 시각')).toBeVisible();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['1분', '15분', '1시간', '4시간', '일봉', '주봉', '월봉']);
    expect(screen.getByRole('tab', { name: '1분' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '1분' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: '15분' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByLabelText('삼성전자 가격 차트')).toBeVisible();
    expect(screen.queryByRole('toolbar', { name: '차트 선 그리기 도구' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '추세선 그리기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '보조지표 설정' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('고가')).toBeVisible());

    const summary = screen.getByRole('group', { name: '종목 시세 요약' });
    expect(within(summary).getByRole('heading', { name: '삼성전자' })).toBeVisible();
    expect(within(summary).getByText('84,000원')).toBeVisible();
    expect(within(summary).getByText('+1.24%')).toBeVisible();

    const chartOhlc = screen.getByRole('group', { name: '차트 OHLC' });
    expect(within(chartOhlc).getByText('시 83,000원')).toBeVisible();
    expect(within(chartOhlc).getByText('고 84,500원')).toBeVisible();
    expect(within(chartOhlc).getByText('저 82,800원')).toBeVisible();
    expect(within(chartOhlc).getByText('종 84,000원')).toBeVisible();

    screen.getByRole('tab', { name: '1분' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: '15분' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: '15분' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(screen.getByRole('button', { name: '다크 모드로 전환' }));

    await userEvent.click(screen.getByRole('tab', { name: '4시간' }));
    expect(screen.getByRole('tab', { name: '4시간' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/market/005930/candles?interval=4h', expect.anything()));
  });

  it('전일 종가 비교 시세에만 전일 종가를 표시한다', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));

    render(<QuoteDetail initialQuote={{
      ...quote,
      previousClose: 82_970,
      comparisonBasis: 'previous-close',
      priceKind: 'actual-product',
      quality: 'realtime',
      sourceLabel: 'Bithumb',
      estimateInputs: [],
    }} />);

    expect(screen.getByText('전일 종가')).toBeVisible();
    expect(screen.getByText('82,970원')).toBeVisible();
    expect(screen.queryByText('비교 기준')).not.toBeInTheDocument();
  });

  it('Bithumb 실제 상품은 제공된 전일 종가를 비교 기준으로 표시한다', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));

    render(<QuoteDetail initialQuote={{
      ...quote,
      symbol: 'BTC',
      name: '비트코인',
      assetClass: 'crypto',
      price: 149_850_000,
      previousClose: 145_770_000,
      changeRate: 0.028,
      changeRateSource: 'previous-close',
      comparisonBasis: 'previous-close',
      priceKind: 'actual-product',
      quality: 'realtime',
      provider: 'bithumb',
      sourceLabel: 'Bithumb',
      estimateInputs: [],
    }} />);

    expect(screen.getByText('전일 종가')).toBeVisible();
    expect(screen.getByText('145,770,000원')).toBeVisible();
    expect(screen.queryByText('24시간 전')).not.toBeInTheDocument();
  });

  it('PAXG 현재가와 candle 가격을 USDT 단위로 표시한다', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));

    render(<QuoteDetail initialQuote={{
      ...quote,
      symbol: 'PAXG',
      name: '금 연동(PAXG)',
      assetClass: 'metal',
      price: 3_472.18,
      currency: 'USDT',
      tradingAmountCurrency: 'USDT',
      comparisonBasis: 'provider-24h',
      priceKind: 'actual-product',
      quality: 'realtime',
      provider: 'binance-spot',
      providerSymbol: 'PAXGUSDT',
      sourceLabel: 'Binance 현물',
      estimateInputs: [],
    }} />);

    expect(screen.getAllByText('3,472.18 USDT').length).toBeGreaterThan(0);
    expect(screen.queryByText('$3,472.18')).not.toBeInTheDocument();
  });

  it('합성환율에는 주식 파생 면책 대신 FX 계산 근거를 표시한다', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));

    render(<QuoteDetail initialQuote={{
      ...quote,
      symbol: 'USDTKRW',
      name: 'USDT/KRW 합성환율',
      assetClass: 'fx',
      price: 1_380,
      previousClose: 1_378.62,
      changeRate: 0.001,
      changeRateSource: 'previous-close',
      provider: 'bithumb',
      providerSymbol: 'KRW-USDT',
      estimateInputs: ['KRW-USDT'],
      priceKind: 'derived-estimate',
      comparisonBasis: 'previous-close',
      sourceLabel: 'Bithumb KRW-USDT',
    }} />);

    expect(screen.getByText(/Bithumb KRW-USDT 거래상품을 기준으로 계산한 합성환율/)).toBeVisible();
    expect(screen.getByText(/은행 고시환율과 다를 수 있습니다/)).toBeVisible();
    expect(screen.queryByText(/실제 주식 가격이 아닌 해외 파생상품/)).not.toBeInTheDocument();
  });

  it('비교 기준이 없으면 24시간 전 비교로 오인하게 하지 않는다', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));

    render(<QuoteDetail initialQuote={{
      ...quote,
      comparisonBasis: null,
      priceKind: 'unavailable',
      quality: 'unavailable',
      sourceLabel: null,
      estimateInputs: [],
    }} />);

    expect(screen.getByText('비교 기준')).toBeVisible();
    expect(screen.getByText('제공되지 않음')).toBeVisible();
    expect(screen.queryByText('24시간 전')).not.toBeInTheDocument();
  });
});

describe('MarketChart', () => {
  it('테마가 바뀌어도 차트를 재생성하지 않고 candle과 viewport를 유지한다', () => {
    const candles = [{ time: 1788226800, open: 100, high: 110, low: 90, close: 105, volume: 10 }];
    const view = render(<MarketChart candles={candles} interval="1m" label="가격 차트" currency="KRW" theme="light" state="ready" message={null} />);
    expect(chartMocks.createChart).toHaveBeenCalledTimes(1);
    expect(chartMocks.setVisibleRange).toHaveBeenCalledWith({ from: 1788219600, to: 1788226800 });
    chartMocks.setData.mockClear();

    view.rerender(<MarketChart candles={candles} interval="1m" label="가격 차트" currency="KRW" theme="dark" state="ready" message={null} />);

    expect(chartMocks.createChart).toHaveBeenCalledTimes(1);
    expect(chartMocks.applyOptions).toHaveBeenCalledWith(expect.objectContaining({
      layout: expect.objectContaining({ textColor: '#a1a1aa' }),
    }));
    expect(chartMocks.setData).not.toHaveBeenCalled();
  });

  it('USDT candle 가격축에 달러 기호 대신 USDT 단위를 표시한다', () => {
    render(<MarketChart candles={[]} interval="1m" label="가격 차트" currency="USDT" theme="light" state="ready" message={null} />);

    const options = chartMocks.createChart.mock.calls.at(-1)![1] as {
      localization: { priceFormatter: (price: number) => string };
    };
    expect(options.localization.priceFormatter(366.48)).toBe('366.48 USDT');
    expect(options.localization.priceFormatter(366.48)).not.toContain('$');
  });

  it('거래량 마지막 값을 가격 통화로 오인하는 축 라벨을 표시하지 않는다', () => {
    render(<MarketChart candles={[]} interval="1m" label="가격 차트" currency="KRW" theme="light" state="ready" message={null} />);

    expect(chartMocks.addSeries.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      lastValueVisible: false,
      priceLineVisible: false,
    }));
  });
});
