import { describe, expect, it } from 'vitest';
import { applyEstimates, estimateQuote } from '@/lib/market/estimate';
import type { MarketQuote } from '@/lib/market/types';

const base: MarketQuote = {
  symbol: '005930', name: '삼성전자', assetClass: 'kr-stock', price: 84200, currency: 'KRW',
  changeRate: 0, tradingAmount: 1000, asOf: '2026-08-31T20:00:00+09:00', session: 'closed',
  quality: 'stale', provider: 'toss', confidence: null, estimateInputs: [],
};

describe('estimateQuote', () => {
  it('프록시 실제 변동률의 가중평균으로 참고 추정가를 계산한다', () => {
    const estimated = estimateQuote(base, [
      { symbol: 'QQQ', changeRate: 0.02, weight: 0.6 },
      { symbol: 'USDKRW', changeRate: -0.01, weight: 0.4 },
    ], { minimumWeight: 0.6 });

    expect(estimated?.price).toBeCloseTo(84200 * 1.008);
    expect(estimated).toMatchObject({ quality: 'estimated', changeRate: 0.008, confidence: 'medium', estimateInputs: ['QQQ', 'USDKRW'] });
  });

  it('유효 입력 가중치가 부족하면 추정값을 만들지 않는다', () => {
    expect(estimateQuote(base, [{ symbol: 'QQQ', changeRate: 0.02, weight: 0.4 }], { minimumWeight: 0.6 })).toBeNull();
  });
});

describe('applyEstimates', () => {
  it('정규장 실제 시세를 추정값으로 덮어쓰지 않는다', () => {
    const realtime = { ...base, session: 'regular' as const, quality: 'realtime' as const };
    expect(applyEstimates([realtime, { ...base, symbol: 'QQQ', changeRate: 0.02 }])[0]).toEqual(realtime);
  });

  it('매핑된 장 마감 종목에만 유효한 프록시를 적용한다', () => {
    const quotes = applyEstimates([
      base,
      { ...base, symbol: 'QQQ', name: 'NASDAQ 100 연동(QQQ)', assetClass: 'index', currency: 'USD', changeRate: 0.02, session: 'regular', quality: 'realtime' },
      { ...base, symbol: 'NVDA', name: 'NVIDIA', assetClass: 'us-stock', currency: 'USD', changeRate: 0.03, session: 'regular', quality: 'realtime' },
    ]);

    expect(quotes.find((quote) => quote.symbol === '005930')).toMatchObject({ quality: 'estimated', confidence: 'medium', estimateInputs: ['QQQ', 'NVDA'] });
  });
});
