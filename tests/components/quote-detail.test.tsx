import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuoteDetail } from '@/components/market/quote-detail';
import { MarketChart } from '@/components/market/market-chart';
import type { MarketQuote } from '@/lib/market/types';

const chartMocks = vi.hoisted(() => ({ setData: vi.fn() }));

vi.mock('lightweight-charts', () => ({
  CandlestickSeries: {},
  ColorType: { Solid: 'solid' },
  HistogramSeries: {},
  createChart: () => ({
    addSeries: () => ({ setData: chartMocks.setData }),
    applyOptions: vi.fn(),
    priceScale: () => ({ applyOptions: vi.fn() }),
    remove: vi.fn(),
    timeScale: () => ({ fitContent: vi.fn() }),
  }),
}));

const quote: MarketQuote = {
  symbol: '005930', name: '삼성전자', nameKo: '삼성전자', nameEn: 'Samsung Electronics', assetClass: 'kr-stock', price: 84000,
  currency: 'KRW', changeRate: 0.0124, previousClose: null, changeRateSource: 'provider', tradingAmount: 184_200_000_000,
  asOf: '2026-09-01T10:00:00+09:00', session: 'regular', quality: 'realtime',
  provider: 'toss', confidence: null, estimateInputs: [],
};

describe('QuoteDetail', () => {
  afterEach(() => vi.restoreAllMocks());

  it('현재가·전일 종가와 접근 가능한 기간 탭·차트를 표시한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === '/api/dashboard') return new Response(JSON.stringify({ quotes: [quote], fetchedAt: quote.asOf, notices: [] }), { status: 200 });
      return new Response(JSON.stringify({
        candles: [{ time: 1788226800, open: 83000, high: 84500, low: 82800, close: 84000, volume: 1000 }],
        unavailable: false,
      }), { status: 200 });
    });

    render(<QuoteDetail initialQuote={quote} />);

    expect(screen.getByText('전일 종가')).toBeVisible();
    expect(screen.getByText('82,971원')).toBeVisible();
    expect(screen.getByRole('tab', { name: '1일' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('삼성전자 가격 차트')).toBeVisible();
    await waitFor(() => expect(screen.getByText('고가')).toBeVisible());

    chartMocks.setData.mockClear();
    await userEvent.click(screen.getByRole('button', { name: '다크 모드로 전환' }));
    await waitFor(() => expect(chartMocks.setData.mock.calls.length).toBeGreaterThanOrEqual(2));

    await userEvent.click(screen.getByRole('tab', { name: '1주' }));
    expect(screen.getByRole('tab', { name: '1주' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('MarketChart', () => {
  it('테마가 바뀌어 차트를 재생성해도 기존 candle 데이터를 다시 적용한다', () => {
    const candles = [{ time: 1788226800, open: 100, high: 110, low: 90, close: 105, volume: 10 }];
    const view = render(<MarketChart candles={candles} label="가격 차트" theme="light" state="ready" message={null} />);
    chartMocks.setData.mockClear();

    view.rerender(<MarketChart candles={candles} label="가격 차트" theme="dark" state="ready" message={null} />);

    expect(chartMocks.setData).toHaveBeenCalledTimes(2);
  });
});
