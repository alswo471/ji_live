import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { QuoteBadge } from '@/components/market/quote-badge';
import type { MarketQuote } from '@/lib/market/types';

const quote: MarketQuote = {
  symbol: '005930', name: '삼성전자', assetClass: 'kr-stock', price: 84200, currency: 'KRW',
  changeRate: 0.01, previousClose: null, changeRateSource: null, tradingAmount: 1000, asOf: '2026-09-01T10:00:00+09:00', session: 'closed',
  tradingAmountCurrency: 'KRW', quality: 'estimated', provider: 'hyperliquid', providerSymbol: 'xyz:SMSN', confidence: null, estimateInputs: ['xyz:SMSN', 'KRW-USDT'],
  volumeKind: 'derivative-notional',
  priceKind: 'derived-estimate', comparisonBasis: 'provider-24h', sourceLabel: 'Hyperliquid 파생상품',
};

afterEach(cleanup);

describe('QuoteBadge', () => {
  it('파생 추정가의 가격 성격과 비교 기준을 표시한다', () => {
    render(<QuoteBadge quote={quote} />);
    expect(screen.getByText('24시간 추정가')).toBeVisible();
    expect(screen.getByText('휴장 중 추정')).toBeVisible();
    expect(screen.getByText('해외 파생상품 기준 · 24시간 전 대비')).toBeVisible();
  });

  it.each([
    ['nxt-pre', '프리마켓 추정'],
    ['krx-nxt-overlap', '정규장 추정'],
    ['nxt-after', '애프터마켓 추정'],
  ] as const)('%s 세션을 %s 문구로 구분한다', (session, label) => {
    render(<QuoteBadge quote={{ ...quote, session }} />);
    expect(screen.getByText(label)).toBeVisible();
  });

  it('Bithumb 합성환율을 해외 파생상품으로 오인하지 않게 표시한다', () => {
    render(<QuoteBadge quote={{
      ...quote,
      symbol: 'USDTKRW',
      assetClass: 'fx',
      price: 1_380,
      previousClose: 1_378.62,
      changeRate: 0.001,
      changeRateSource: 'previous-close',
      provider: 'bithumb',
      estimateInputs: ['KRW-USDT'],
      comparisonBasis: 'previous-close',
      sourceLabel: 'Bithumb KRW-USDT',
    }} />);

    expect(screen.getByText('합성환율')).toBeVisible();
    expect(screen.getByText('Bithumb KRW-USDT 기준 · 전일 대비')).toBeVisible();
    expect(screen.queryByText(/해외 파생상품/)).not.toBeInTheDocument();
  });

  it('정규장 시간이어도 파생 추정가를 실제 시세로 바꾸지 않는다', () => {
    render(<QuoteBadge quote={{ ...quote, quality: 'realtime', session: 'regular' }} />);
    expect(screen.getByText('24시간 추정가')).toBeVisible();
    expect(screen.queryByText(/실시간|정규장 ·/)).not.toBeInTheDocument();
  });

  it('Bithumb 실제 상품은 파생 문구 없이 전일 종가 비교를 표시한다', () => {
    render(<QuoteBadge quote={{
      ...quote,
      symbol: 'BTC',
      assetClass: 'crypto',
      quality: 'realtime',
      priceKind: 'actual-product',
      provider: 'bithumb',
      sourceLabel: 'Bithumb',
      comparisonBasis: 'previous-close',
    }} />);

    expect(screen.getByText('실제 거래상품')).toBeVisible();
    expect(screen.getByText('전일 종가 대비')).toBeVisible();
    expect(screen.queryByText(/해외 파생상품/)).not.toBeInTheDocument();
  });

  it('PAXG 실제 상품은 파생 문구 없이 24시간 비교를 표시한다', () => {
    render(<QuoteBadge quote={{
      ...quote,
      symbol: 'PAXG',
      assetClass: 'metal',
      currency: 'USDT',
      quality: 'realtime',
      priceKind: 'actual-product',
      provider: 'binance-spot',
      sourceLabel: 'Binance 현물',
      comparisonBasis: 'provider-24h',
    }} />);

    expect(screen.getByText('실제 거래상품')).toBeVisible();
    expect(screen.getByText('24시간 전 대비')).toBeVisible();
    expect(screen.queryByText(/해외 파생상품/)).not.toBeInTheDocument();
  });

  it('stale 실제 거래상품에 마지막 공급자 기준 시각을 표시한다', () => {
    render(<QuoteBadge quote={{ ...quote, quality: 'stale', priceKind: 'actual-product', sourceLabel: 'Binance 현물' }} />);
    expect(screen.getByText('실제 거래상품')).toBeVisible();
    expect(screen.getByText('Binance 현물')).toBeVisible();
    expect(screen.getByText('갱신 지연 · 공급자 기준 10:00')).toBeVisible();
  });

  it('delayed 시세에도 마지막 공급자 기준 시각을 표시한다', () => {
    render(<QuoteBadge quote={{ ...quote, quality: 'delayed' }} />);

    expect(screen.getByText('갱신 지연 · 공급자 기준 10:00')).toBeVisible();
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
