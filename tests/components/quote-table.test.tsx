import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuoteTable } from '@/components/market/quote-table';
import type { MarketQuote } from '@/lib/market/types';

const quote: MarketQuote = {
  symbol: '005930', name: '삼성전자', assetClass: 'kr-stock', price: 84000,
  currency: 'KRW', changeRate: 0.0124, tradingAmount: 184_200_000_000,
  asOf: '2026-09-01T10:00:00+09:00', session: 'regular', quality: 'realtime',
  provider: 'toss', confidence: null, estimateInputs: [],
};

describe('QuoteTable', () => {
  it('현재가와 등락률, 시세 상태를 함께 표시한다', () => {
    render(<QuoteTable quotes={[quote]} />);

    expect(screen.getByText('삼성전자')).toBeInTheDocument();
    expect(screen.getByText('84,000원')).toBeInTheDocument();
    expect(screen.getAllByText('+1.24%')).toHaveLength(2);
    expect(screen.getByText(/정규장/)).toBeInTheDocument();
  });

  it('개인화 UI를 노출하지 않는다', () => {
    render(<QuoteTable quotes={[quote]} />);

    expect(screen.queryByText(/관심종목/)).not.toBeInTheDocument();
    expect(screen.queryByText(/보유자산/)).not.toBeInTheDocument();
  });
});
