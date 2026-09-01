import { describe, expect, it } from 'vitest';
import { INSTRUMENTS, instrumentsByAssetClass } from '@/lib/market/catalog';

describe('INSTRUMENTS', () => {
  it('공개 catalog는 검증된 파생 주식만 포함한다', () => {
    expect(instrumentsByAssetClass('kr-stock').map((item) => item.symbol)).toEqual([
      '005930', '000660', '005380', '009150', '035420', '042700', '066570',
    ]);
    expect(instrumentsByAssetClass('us-stock').map((item) => item.symbol)).toEqual([
      'TSLA', 'NVDA', 'AAPL', 'GOOGL',
    ]);
    expect(instrumentsByAssetClass('us-stock').map((item) => item.currency)).toEqual([
      'USDT', 'USDT', 'USDT', 'USDT',
    ]);
    expect(INSTRUMENTS.find((item) => item.symbol === '005930')).toMatchObject({
      provider: 'hyperliquid', providerSymbol: 'xyz:SMSN',
      priceSanityBounds: { minExclusive: 0.01, maxExclusive: 100_000 },
    });
  });

  it('공개 거래상품만 비주식 catalog에 남긴다', () => {
    expect(INSTRUMENTS.filter((item) => item.assetClass === 'crypto')).toHaveLength(5);
    expect(INSTRUMENTS.filter((item) => item.assetClass === 'metal')).toEqual([
      expect.objectContaining({ symbol: 'PAXG', currency: 'USDT', provider: 'binance-spot', providerSymbol: 'PAXGUSDT' }),
    ]);
    expect(INSTRUMENTS.filter((item) => item.assetClass === 'fx')).toEqual([
      expect.objectContaining({ symbol: 'USDTKRW', provider: 'bithumb', providerSymbol: 'KRW-USDT' }),
    ]);
  });

  it('중복 심볼로 시세가 덮어써지는 것을 막는다', () => {
    expect(new Set(INSTRUMENTS.map((item) => item.symbol)).size).toBe(INSTRUMENTS.length);
  });
});
