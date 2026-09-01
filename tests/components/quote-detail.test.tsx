import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuoteDetail } from '@/components/market/quote-detail';
import { MarketChart } from '@/components/market/market-chart';
import type { MarketQuote } from '@/lib/market/types';

const chartMocks = vi.hoisted(() => ({
  setData: vi.fn(),
  applyOptions: vi.fn(),
  setVisibleRange: vi.fn(),
  createChart: vi.fn(),
}));

vi.mock('lightweight-charts', () => ({
  CandlestickSeries: {},
  ColorType: { Solid: 'solid' },
  HistogramSeries: {},
  createChart: (...args: unknown[]) => {
    chartMocks.createChart(...args);
    return {
    addSeries: () => ({ setData: chartMocks.setData }),
    applyOptions: chartMocks.applyOptions,
    priceScale: () => ({ applyOptions: vi.fn() }),
    remove: vi.fn(),
    timeScale: () => ({ fitContent: vi.fn(), setVisibleRange: chartMocks.setVisibleRange }),
  };
  },
}));

const quote: MarketQuote = {
  symbol: '005930', name: '삼성전자', nameKo: '삼성전자', nameEn: 'Samsung Electronics', assetClass: 'kr-stock', price: 84000,
  currency: 'KRW', changeRate: 0.0124, previousClose: null, changeRateSource: 'provider', tradingAmount: 184_200_000_000,
  asOf: '2026-09-01T10:00:00+09:00', session: 'always-open', quality: 'estimated',
  provider: 'hyperliquid', confidence: null, estimateInputs: ['xyz:SMSN', 'KRW-USDT'],
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
      }), { status: 200 });
    });

    render(<QuoteDetail initialQuote={quote} />);

    expect(screen.queryByText('전일 종가')).not.toBeInTheDocument();
    expect(screen.getByText('비교 기준')).toBeVisible();
    expect(screen.getByText('24시간 전')).toBeVisible();
    expect(screen.getByText('Hyperliquid 파생상품')).toBeVisible();
    expect(screen.getByText('USDT/KRW 환산')).toBeVisible();
    expect(screen.getByText(/실제 주식 가격이 아닌 해외 파생상품 기반 참고 추정가/)).toBeVisible();
    expect(screen.getByText('기준 시각')).toBeVisible();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['1분', '15분', '1시간', '4시간', '일봉', '주봉', '월봉']);
    expect(screen.getByRole('tab', { name: '1분' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '1분' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: '15분' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByLabelText('삼성전자 가격 차트')).toBeVisible();
    await waitFor(() => expect(screen.getByText('고가')).toBeVisible());

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
});

describe('MarketChart', () => {
  it('테마가 바뀌어도 차트를 재생성하지 않고 candle과 viewport를 유지한다', () => {
    const candles = [{ time: 1788226800, open: 100, high: 110, low: 90, close: 105, volume: 10 }];
    const view = render(<MarketChart candles={candles} interval="1m" label="가격 차트" theme="light" state="ready" message={null} />);
    expect(chartMocks.createChart).toHaveBeenCalledTimes(1);
    expect(chartMocks.setVisibleRange).toHaveBeenCalledWith({ from: 1788219600, to: 1788226800 });
    chartMocks.setData.mockClear();

    view.rerender(<MarketChart candles={candles} interval="1m" label="가격 차트" theme="dark" state="ready" message={null} />);

    expect(chartMocks.createChart).toHaveBeenCalledTimes(1);
    expect(chartMocks.applyOptions).toHaveBeenCalledWith(expect.objectContaining({
      layout: expect.objectContaining({ textColor: '#a1a1aa' }),
    }));
    expect(chartMocks.setData).not.toHaveBeenCalled();
  });
});
