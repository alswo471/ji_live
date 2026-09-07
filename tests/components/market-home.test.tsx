import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Home from '@/app/page';
import type { MarketQuote } from '@/lib/market/types';

const samsung: MarketQuote = {
  symbol: '005930',
  name: '삼성전자',
  nameKo: '삼성전자',
  nameEn: 'Samsung Electronics',
  assetClass: 'kr-stock',
  price: 84000,
  currency: 'KRW',
  changeRate: 0.01,
  previousClose: null,
  changeRateSource: 'provider',
  tradingAmount: null,
  tradingAmountCurrency: null,
  volumeKind: 'derivative-notional',
  asOf: '2026-09-07T00:00:00Z',
  session: 'always-open',
  quality: 'estimated',
  provider: 'hyperliquid',
  providerSymbol: 'xyz:SMSN',
  confidence: null,
  estimateInputs: [],
  priceKind: 'derived-estimate',
  comparisonBasis: 'provider-24h',
  sourceLabel: 'Hyperliquid 파생상품',
};
beforeEach(() => {
  window.history.replaceState({}, '', '/');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) =>
      url === '/api/market/sentiment'
        ? new Response('{}', { status: 503 })
        : new Response(
            JSON.stringify({
              quotes: [
                samsung,
                {
                  ...samsung,
                  symbol: 'USDTKRW',
                  name: 'USDT/KRW',
                  nameKo: 'USDT/KRW',
                  assetClass: 'fx',
                  price: 1400,
                },
                {
                  ...samsung,
                  symbol: 'PAXG',
                  name: '금',
                  nameKo: '금',
                  assetClass: 'metal',
                  currency: 'USDT',
                  price: 4000,
                },
                {
                  ...samsung,
                  symbol: 'TSLA',
                  name: '테슬라',
                  nameKo: '테슬라',
                  nameEn: 'Tesla',
                  assetClass: 'us-stock',
                },
              ],
              fetchedAt: '2026-09-07T00:00:00Z',
              notices: [],
            }),
          ),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('마켓 탐색', () => {
  it('전광판은 별도 조작 버튼 없이 지표 상세 링크를 제공한다', async () => {
    render(<Home />);
    await screen.findByRole('link', { name: /삼성전자 상세 보기/ });
    expect(screen.getByRole('link', { name: '시장 지표' })).toHaveAttribute(
      'href',
      '/indicators',
    );
    const summary = screen.getByRole('region', { name: '시장 요약' });
    expect(summary.textContent).toContain('4,000 USDT');
    expect(
      summary.querySelector('[aria-label="비트코인 공포·탐욕 지수"]'),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /전광판/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByTitle('시장 지표 상세 보기')).toHaveAttribute(
      'href',
      '/indicators',
    );
    expect(summary.textContent).not.toContain('USDT/KRW');
  });
  it('URL에서 선택한 시장만 보여준다', async () => {
    window.history.replaceState({}, '', '/?market=us-stock');
    render(<Home />);
    expect(
      await screen.findByRole('link', { name: /테슬라 상세 보기/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /삼성전자 상세 보기/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '미국 주식' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
  it('잘못된 시장은 한국 주식으로 돌아가며 이름·심볼로 검색하고 초기화한다', async () => {
    window.history.replaceState({}, '', '/?market=unknown');
    render(<Home />);
    await screen.findByRole('link', { name: /삼성전자 상세 보기/ });
    const input = screen.getByRole('searchbox', { name: '종목 검색' });
    for (const value of ['삼성', 'SAMSUNG', '005930']) {
      fireEvent.change(input, { target: { value } });
      expect(
        screen.getByRole('link', { name: /삼성전자 상세 보기/ }),
      ).toBeInTheDocument();
    }
    fireEvent.change(input, { target: { value: '없는종목' } });
    expect(
      screen.queryByRole('link', { name: /삼성전자 상세 보기/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '검색 초기화' }));
    expect(
      screen.getByRole('link', { name: /삼성전자 상세 보기/ }),
    ).toBeInTheDocument();
  });
  it.each(['news'])(
    '미연결 %s 메뉴에 종목을 섞어 표시하지 않는다',
    async (section) => {
      window.history.replaceState({}, '', '/?market=' + section);
      render(<Home />);
      await waitFor(() =>
        expect(
          screen.getByRole('link', { name: '한국 주식 보기' }),
        ).toBeInTheDocument(),
      );
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: /삼성전자 상세 보기/ }),
      ).not.toBeInTheDocument();
    },
  );
});
