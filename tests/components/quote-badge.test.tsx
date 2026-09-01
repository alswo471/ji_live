import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuoteBadge } from '@/components/market/quote-badge';
import type { MarketQuote } from '@/lib/market/types';

const quote: MarketQuote = {
  symbol: '005930', name: '삼성전자', assetClass: 'kr-stock', price: 84200, currency: 'KRW',
  changeRate: 0.01, previousClose: null, changeRateSource: null, tradingAmount: 1000, asOf: '2026-09-01T10:00:00+09:00', session: 'closed',
  quality: 'estimated', provider: 'toss', confidence: 'medium', estimateInputs: ['QQQ', 'NVDA'],
};

describe('QuoteBadge', () => {
  it('추정 시세를 실제 시세와 구분하고 신뢰도를 텍스트로 표시한다', () => {
    render(<QuoteBadge quote={quote} />);
    expect(screen.getByText('참고 추정')).toBeVisible();
    expect(screen.getByText('신뢰도 보통')).toBeVisible();
  });

  it('정규장 실제 시세의 세션과 공급자를 표시한다', () => {
    render(<QuoteBadge quote={{ ...quote, quality: 'realtime', session: 'regular', confidence: null }} />);
    expect(screen.getByText('정규장 · Toss')).toBeVisible();
  });
});
