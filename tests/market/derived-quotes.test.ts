import { describe, expect, it } from 'vitest';
import { composeDerivedQuotes } from '@/lib/market/derived-quotes';
import type { DerivativeTicker, FxConversionInput } from '@/lib/market/types';

const derivative = (
  overrides: Partial<DerivativeTicker> = {},
): DerivativeTicker => ({
  provider: 'hyperliquid',
  providerSymbol: 'xyz:SMSN',
  price: 60,
  changeRate: 0.012,
  tradingAmount: 1_000_000,
  tradingAmountCurrency: 'USD',
  asOf: '2026-09-01T10:00:00.000Z',
  freshness: 'fresh',
  ...overrides,
});

const fx = (overrides: Partial<FxConversionInput> = {}): FxConversionInput => ({
  rate: 1_380,
  provider: 'bithumb',
  providerSymbol: 'KRW-USDT',
  asOf: '2026-09-01T09:59:00.000Z',
  freshness: 'fresh',
  ...overrides,
});

describe('composeDerivedQuotes', () => {
  it('한국 파생 가격과 거래대금을 합성환율로 원화 환산한다', () => {
    const quotes = composeDerivedQuotes([derivative()], fx());

    expect(quotes.find((quote) => quote.symbol === '005930')).toMatchObject({
      price: 82_800,
      currency: 'KRW',
      changeRate: 0.012,
      tradingAmount: 1_380_000_000,
      tradingAmountCurrency: 'KRW',
      asOf: '2026-09-01T09:59:00.000Z',
      priceKind: 'derived-estimate',
      comparisonBasis: 'provider-24h',
      quality: 'estimated',
      provider: 'hyperliquid',
      providerSymbol: 'xyz:SMSN',
      sourceLabel: 'Hyperliquid 파생상품',
      estimateInputs: ['xyz:SMSN', 'KRW-USDT'],
    });
  });

  it('Binance USDT 파생 거래대금도 같은 합성환율로 KRW에 맞춘다', () => {
    const quote = composeDerivedQuotes([
      derivative({
        provider: 'binance-futures',
        providerSymbol: 'SAMSUNGEMUSDT',
        price: 50,
        tradingAmount: 2_000_000,
        tradingAmountCurrency: 'USDT',
      }),
    ], fx()).find((item) => item.symbol === '009150');

    expect(quote).toMatchObject({
      price: 69_000,
      tradingAmount: 2_760_000_000,
      tradingAmountCurrency: 'KRW',
    });
  });

  it('FX 입력이 더 오래됐거나 stale이면 합성 시각과 품질에 전파한다', () => {
    const quote = composeDerivedQuotes([
      derivative({ asOf: '2026-09-01T10:00:00.000Z' }),
    ], fx({
      asOf: '2026-09-01T09:54:59.000Z',
      freshness: 'stale',
    })).find((item) => item.symbol === '005930');

    expect(quote).toMatchObject({
      price: 82_800,
      asOf: '2026-09-01T09:54:59.000Z',
      quality: 'stale',
    });
  });

  it('합성환율이나 ticker가 없으면 임의 가격을 만들지 않는다', () => {
    const quote = composeDerivedQuotes([], null).find((item) => item.symbol === '005930');

    expect(quote).toMatchObject({
      price: null,
      quality: 'unavailable',
      priceKind: 'unavailable',
    });
  });

  it.each([
    ['파생 가격', derivative({ price: 1_000_000 }), fx()],
    ['KRW-USDT 환율', derivative(), fx({ rate: 10_000 })],
  ])('%s operational sanity bound를 벗어나면 clamp하지 않고 unavailable로 둔다', (_label, ticker, inputFx) => {
    const quote = composeDerivedQuotes([ticker], inputFx).find((item) => item.symbol === '005930');

    expect(quote).toMatchObject({
      price: null,
      quality: 'unavailable',
      priceKind: 'unavailable',
    });
  });
});
