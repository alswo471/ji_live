import { describe, expect, it } from 'vitest';
import { INSTRUMENTS } from '@/lib/market/catalog';

describe('INSTRUMENTS', () => {
  it('누락된 자산군이 생기면 실패한다', () => {
    expect(INSTRUMENTS.filter((item) => item.assetClass === 'kr-stock')).toHaveLength(10);
    expect(INSTRUMENTS.filter((item) => item.assetClass === 'us-stock')).toHaveLength(10);
    expect(INSTRUMENTS.filter((item) => item.assetClass === 'crypto')).toHaveLength(5);
    expect(INSTRUMENTS.filter((item) => ['index', 'fx', 'metal'].includes(item.assetClass))).toHaveLength(4);
  });

  it('중복 심볼로 시세가 덮어써지는 것을 막는다', () => {
    expect(new Set(INSTRUMENTS.map((item) => item.symbol)).size).toBe(INSTRUMENTS.length);
  });
});
