import { describe, expect, it } from 'vitest';
import { composeDerivedQuotes } from '@/lib/market/derived-quotes';

describe('composeDerivedQuotes', () => {
  it('한국 파생 가격을 합성환율로 원화 환산한다', () => {
    const quotes = composeDerivedQuotes([{
      provider: 'hyperliquid', providerSymbol: 'xyz:SMSN', price: 60,
      changeRate: 0.012, tradingAmount: 1_000_000, asOf: '2026-09-01T10:00:00.000Z',
    }], 1_380);

    expect(quotes.find((quote) => quote.symbol === '005930')).toMatchObject({
      price: 82_800, currency: 'KRW', changeRate: 0.012,
      priceKind: 'derived-estimate', comparisonBasis: 'provider-24h',
      quality: 'estimated', provider: 'hyperliquid',
      sourceLabel: 'Hyperliquid 파생상품',
      estimateInputs: ['xyz:SMSN', 'KRW-USDT'],
    });
  });

  it('합성환율이나 ticker가 없으면 임의 가격을 만들지 않는다', () => {
    const quote = composeDerivedQuotes([], null).find((item) => item.symbol === '005930');

    expect(quote).toMatchObject({ price: null, quality: 'unavailable', priceKind: 'unavailable' });
  });
});
