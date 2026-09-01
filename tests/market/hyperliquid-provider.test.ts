import { describe, expect, it, vi } from 'vitest';
import { fetchHyperliquidTickers } from '@/lib/market/providers/hyperliquid';

describe('fetchHyperliquidTickers', () => {
  it('universe와 context의 같은 index를 파생 ticker로 변환한다', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          { universe: [{ name: 'xyz:SMSN' }, { name: 'xyz:SKHX' }] },
          [
            { markPx: '60', prevDayPx: '59', dayNtlVlm: '1200000' },
            { markPx: '130', prevDayPx: '125', dayNtlVlm: '900000' },
          ],
        ]),
      );

    const tickers = await fetchHyperliquidTickers(
      fetcher,
      () => new Date('2026-09-01T10:00:00.000Z'),
      ['xyz:SMSN', 'xyz:SKHX'],
    );

    expect(tickers[0]).toEqual({
      provider: 'hyperliquid',
      providerSymbol: 'xyz:SMSN',
      price: 60,
      changeRate: 60 / 59 - 1,
      tradingAmount: 1_200_000,
      asOf: '2026-09-01T10:00:00.000Z',
    });
    expect(tickers[1]).toEqual({
      provider: 'hyperliquid',
      providerSymbol: 'xyz:SKHX',
      price: 130,
      changeRate: 130 / 125 - 1,
      tradingAmount: 900_000,
      asOf: '2026-09-01T10:00:00.000Z',
    });
  });

  it('잘못된 markPx는 해당 종목만 unavailable ticker로 만든다', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          { universe: [{ name: 'xyz:SMSN' }, { name: 'xyz:SKHX' }] },
          [
            { markPx: 'invalid', prevDayPx: '59' },
            { markPx: '130', prevDayPx: '125' },
          ],
        ]),
      );

    const tickers = await fetchHyperliquidTickers(fetcher, () => new Date(0), [
      'xyz:SMSN',
      'xyz:SKHX',
    ]);

    expect(tickers.find((item) => item.providerSymbol === 'xyz:SMSN')).toEqual({
      provider: 'hyperliquid',
      providerSymbol: 'xyz:SMSN',
      price: null,
      changeRate: null,
      tradingAmount: null,
      asOf: '1970-01-01T00:00:00.000Z',
    });
    expect(
      tickers.find((item) => item.providerSymbol === 'xyz:SKHX')?.price,
    ).toBe(130);
  });

  it('유한한 양수가 아닌 markPx, prevDayPx, dayNtlVlm을 null로 정규화한다', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          { universe: [{ name: 'xyz:SMSN' }] },
          [{ markPx: 'Infinity', prevDayPx: '0', dayNtlVlm: '-1' }],
        ]),
      );

    const [ticker] = await fetchHyperliquidTickers(fetcher, () => new Date(0), [
      'xyz:SMSN',
    ]);

    expect(ticker).toEqual({
      provider: 'hyperliquid',
      providerSymbol: 'xyz:SMSN',
      price: null,
      changeRate: null,
      tradingAmount: null,
      asOf: '1970-01-01T00:00:00.000Z',
    });
  });

  it('기본 종목을 사용하고 metaAndAssetCtxs POST 계약을 보낸다', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(input).toBe('https://api.hyperliquid.xyz/info');
      expect(init).toMatchObject({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs', dex: 'xyz' }),
        cache: 'no-store',
      });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(
        JSON.stringify([
          {
            universe: [
              { name: 'xyz:SMSN' },
              { name: 'xyz:SKHX' },
              { name: 'xyz:HYUNDAI' },
            ],
          },
          [{ markPx: '1' }, { markPx: '2' }, { markPx: '3' }],
        ]),
      );
    });

    const tickers = await fetchHyperliquidTickers(fetcher, () => new Date(0));

    expect(tickers.map((ticker) => ticker.providerSymbol)).toEqual([
      'xyz:SMSN',
      'xyz:SKHX',
      'xyz:HYUNDAI',
    ]);
  });

  it('응답이 실패하면 요청 오류를 함수 전체에서 reject한다', async () => {
    const error = new Error('network down');
    const fetcher: typeof fetch = vi.fn(async () => {
      throw error;
    });

    await expect(fetchHyperliquidTickers(fetcher)).rejects.toBe(error);
  });
});
