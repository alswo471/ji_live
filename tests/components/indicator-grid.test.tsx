import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IndicatorGrid } from '@/components/market/indicator-grid';
import type { MarketQuote } from '@/lib/market/types';

const paxg: MarketQuote = {
  symbol: 'PAXG',
  name: '금 연동(PAXG)',
  assetClass: 'metal',
  price: 3_472.18,
  currency: 'USDT',
  changeRate: 0.0031,
  previousClose: null,
  changeRateSource: 'provider',
  tradingAmount: 14_000_000,
  tradingAmountCurrency: 'USDT',
  asOf: '2026-09-01T10:00:00+09:00',
  session: 'always-open',
  quality: 'realtime',
  provider: 'binance-spot',
  providerSymbol: 'PAXGUSDT',
  confidence: null,
  estimateInputs: [],
  priceKind: 'actual-product',
  comparisonBasis: 'provider-24h',
  sourceLabel: 'Binance 현물',
};

describe('IndicatorGrid', () => {
  it('PAXG 가격에 USDT 단위를 명시한다', () => {
    render(<IndicatorGrid quotes={[paxg]} />);

    expect(screen.getByText('3,472.18 USDT')).toBeVisible();
    expect(screen.queryByText('$3,472.18')).not.toBeInTheDocument();
  });
});
