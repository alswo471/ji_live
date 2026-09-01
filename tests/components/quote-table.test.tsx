import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { QuoteTable } from '@/components/market/quote-table';
import type { MarketQuote } from '@/lib/market/types';

const quote: MarketQuote = {
  symbol: '005930', name: '삼성전자', nameKo: '삼성전자', nameEn: 'Samsung Electronics', assetClass: 'kr-stock', price: 84000,
  currency: 'KRW', changeRate: 0.0124, previousClose: 82970, changeRateSource: 'provider', tradingAmount: 184_200_000_000,
  asOf: '2026-09-01T10:00:00+09:00', session: 'always-open', quality: 'estimated',
  provider: 'hyperliquid', confidence: null, estimateInputs: ['xyz:SMSN', 'KRW-USDT'],
  priceKind: 'derived-estimate', comparisonBasis: 'provider-24h', sourceLabel: 'Hyperliquid 파생상품',
};

afterEach(cleanup);

describe('QuoteTable', () => {
  it('현재가와 등락률, 시세 상태를 함께 표시한다', () => {
    render(<QuoteTable quotes={[quote]} />);

    expect(screen.getByRole('link', { name: /삼성전자 상세 보기/ })).toHaveAttribute('href', '/market/005930');
    expect(screen.getByText('삼성전자')).toBeInTheDocument();
    expect(screen.getByText('84,000원')).toBeInTheDocument();
    expect(screen.getAllByText('+1.24%')).toHaveLength(2);
    expect(screen.getByText('24시간 추정가')).toBeInTheDocument();
    expect(screen.getByText('해외 파생상품 기준 · 24시간 전 대비')).toBeInTheDocument();
  });

  it('영문명 표기에서도 종목 코드를 유지한다', () => {
    const view = render(<QuoteTable quotes={[quote]} nameLocale="en" />);

    expect(view.container).toHaveTextContent('Samsung Electronics');
    expect(view.container).toHaveTextContent('005930');
  });

  it('개인화 UI를 노출하지 않는다', () => {
    render(<QuoteTable quotes={[quote]} />);

    expect(screen.queryByText(/관심종목/)).not.toBeInTheDocument();
    expect(screen.queryByText(/보유자산/)).not.toBeInTheDocument();
  });
});
