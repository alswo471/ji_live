import { describe, expect, it } from 'vitest';
import { composeKrwDerivedCandles } from '@/lib/market/krw-derived-candles';

const derivative = {
  time: 100,
  open: 60,
  high: 61,
  low: 59,
  close: 60.5,
  volume: 1_000,
};
const fx = {
  time: 100,
  open: 1_380,
  high: 1_382,
  low: 1_368,
  close: 1_381,
  volume: 10,
};

describe('composeKrwDerivedCandles', () => {
  it('동일 bucket의 파생 OHLC와 환율 OHLC를 원화 candle로 합성한다', () => {
    expect(composeKrwDerivedCandles([derivative], [fx], '1m')).toEqual([{
      time: 100,
      open: 82_800,
      high: 84_302,
      low: 80_712,
      close: 83_551,
      volume: 1_000,
    }]);
  });

  it('미래 환율로 과거 파생 candle을 채우지 않는다', () => {
    expect(composeKrwDerivedCandles(
      [{ ...derivative, time: 99 }],
      [{ ...fx, time: 100 }],
      '1m',
    )).toEqual([]);
  });

  it('허용 시간 안의 가장 가까운 과거 환율만 사용한다', () => {
    expect(composeKrwDerivedCandles(
      [{ ...derivative, time: 130 }],
      [{ ...fx, time: 100 }],
      '1m',
    )).toHaveLength(1);
    expect(composeKrwDerivedCandles(
      [{ ...derivative, time: 161 }],
      [{ ...fx, time: 100 }],
      '1m',
    )).toEqual([]);
  });

  it('비정상 OHLC는 숫자를 만들지 않고 제외한다', () => {
    expect(composeKrwDerivedCandles(
      [{ ...derivative, high: Number.NaN }],
      [fx],
      '1m',
    )).toEqual([]);
  });
});
