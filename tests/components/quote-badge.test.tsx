import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { QuoteBadge } from '@/components/market/quote-badge';
import type { MarketQuote } from '@/lib/market/types';

const quote: MarketQuote = {
  symbol: '005930', name: '삼성전자', assetClass: 'kr-stock', price: 84200, currency: 'KRW',
  changeRate: 0.01, previousClose: null, changeRateSource: null, tradingAmount: 1000, asOf: '2026-09-01T10:00:00+09:00', session: 'closed',
  quality: 'estimated', provider: 'hyperliquid', confidence: null, estimateInputs: ['xyz:SMSN', 'KRW-USDT'],
  priceKind: 'derived-estimate', comparisonBasis: 'provider-24h', sourceLabel: 'Hyperliquid 파생상품',
};

afterEach(cleanup);

describe('QuoteBadge', () => {
  it('파생 추정가의 가격 성격과 비교 기준을 표시한다', () => {
    render(<QuoteBadge quote={quote} />);
    expect(screen.getByText('24시간 추정가')).toBeVisible();
    expect(screen.getByText('해외 파생상품 기준 · 24시간 전 대비')).toBeVisible();
  });

  it('정규장 시간이어도 파생 추정가를 실제 시세로 바꾸지 않는다', () => {
    render(<QuoteBadge quote={{ ...quote, quality: 'realtime', session: 'regular' }} />);
    expect(screen.getByText('24시간 추정가')).toBeVisible();
    expect(screen.queryByText(/실시간|정규장 ·/)).not.toBeInTheDocument();
  });

  it('실제 거래상품의 공급자와 갱신 지연을 텍스트로 표시한다', () => {
    render(<QuoteBadge quote={{ ...quote, quality: 'stale', priceKind: 'actual-product', sourceLabel: 'Binance 현물' }} />);
    expect(screen.getByText('실제 거래상품')).toBeVisible();
    expect(screen.getByText('Binance 현물')).toBeVisible();
    expect(screen.getByText('갱신 지연')).toBeVisible();
  });

  it('사용할 수 없는 가격은 연동 준비 중으로 표시한다', () => {
    render(<QuoteBadge quote={{ ...quote, quality: 'unavailable', priceKind: 'unavailable' }} />);
    expect(screen.getByText('연동 준비 중')).toBeVisible();
  });

  it('품질이 unavailable이면 가격 성격과 무관하게 안전한 상태를 표시한다', () => {
    render(<QuoteBadge quote={{ ...quote, quality: 'unavailable', priceKind: 'actual-product' }} />);
    expect(screen.getByText('연동 준비 중')).toBeVisible();
    expect(screen.queryByText('실제 거래상품')).not.toBeInTheDocument();
  });

  it.each([undefined, 'legacy'])('알 수 없는 가격 성격 %s을 실제 거래상품으로 표시하지 않는다', (priceKind) => {
    render(<QuoteBadge quote={{ ...quote, priceKind: priceKind as MarketQuote['priceKind'] }} />);
    expect(screen.getByText('연동 준비 중')).toBeVisible();
    expect(screen.queryByText('실제 거래상품')).not.toBeInTheDocument();
  });
});
