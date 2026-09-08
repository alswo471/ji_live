import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const row = {
  basDt: '20260904',
  srtnCd: '005930',
  itmsNm: '삼성전자',
  clpr: '100',
  fltRt: '.17',
  mkp: '95',
  hipr: '105',
  lopr: '90',
  trqu: '0',
};
function page(
  items: unknown[],
  totalCount = items.length,
  pageNo = 1,
  numOfRows = 1000,
) {
  return Response.json({
    response: {
      header: { resultCode: '00' },
      body: { totalCount, pageNo, numOfRows, items: { item: items } },
    },
  });
}
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-07T06:00:00Z'));
  vi.stubEnv('DATA_GO_KR_SERVICE_KEY', 'test%2Bkey%3D');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('공식 일별 공급자', () => {
  it('키를 한 번만 인코딩하고 같은 종목의 동시 요청·재요청을 캐시한다', async () => {
    const request = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) => {
        const parsed = new URL(url instanceof Request ? url.url : url);
        expect(parsed.searchParams.get('serviceKey')).toBe('test+key=');
        expect(parsed.searchParams.get('likeSrtnCd')).toBe('005930');
        return page([row]);
      });
    const { getOfficialDaily } = await import('@/lib/market/official-daily');
    const [a, b] = await Promise.all([
      getOfficialDaily('stock', '005930'),
      getOfficialDaily('stock', '005930'),
    ]);
    expect(a.rows[0]).toMatchObject({
      symbol: '005930',
      date: '2026-09-04',
      close: 100,
      volume: 0,
    });
    expect(a.rows[0].changeRate).toBeCloseTo(0.0017, 10);
    expect(b).toEqual(a);
    await getOfficialDaily('stock', '005930');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    { basDt: '20260230' },
    { basDt: '20260908' },
    { clpr: '' },
    { clpr: 'NaN' },
    { trqu: '-1' },
    { srtnCd: '000660' },
  ])('잘못된 데이터 %j를 거부한다', async (override) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      page([{ ...row, ...override }]),
    );
    const { getOfficialDaily } = await import('@/lib/market/official-daily');
    await expect(getOfficialDaily('stock', '005930')).rejects.toThrow();
  });

  it('거래 정지의 0 OHLC는 미제공으로 두며 0 거래량은 유지한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      page([{ ...row, mkp: '0', hipr: '0', lopr: '0' }]),
    );
    const { getOfficialDaily } = await import('@/lib/market/official-daily');
    expect((await getOfficialDaily('stock', '005930')).rows[0]).toMatchObject({
      open: null,
      high: null,
      low: null,
      volume: 0,
    });
  });

  it('ETF 전 페이지를 모은 뒤 최신 날짜의 거래량으로만 순위를 매긴다', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const n = Number(
        new URL(url instanceof Request ? url.url : url).searchParams.get(
          'pageNo',
        ),
      );
      return n === 1
        ? page(
            [
              { ...row, srtnCd: '0000D0', trqu: '5' },
              { ...row, basDt: '20260903', srtnCd: '000002', trqu: '999' },
            ],
            3,
            1,
            2,
          )
        : page([{ ...row, srtnCd: '000003', trqu: '10' }], 3, 2, 2);
    });
    const { getOfficialDaily } = await import('@/lib/market/official-daily');
    const result = await getOfficialDaily('etf');
    expect(result.date).toBe('2026-09-04');
    expect(result.rows.map((r) => r.symbol)).toEqual(['000003', '0000D0']);
  });

  it('일부 페이지 누락 또는 중복이면 불완전한 ETF 순위를 반환하지 않는다', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      page([row], 2, 1, 1),
    );
    const { getOfficialDaily } = await import('@/lib/market/official-daily');
    await expect(getOfficialDaily('etf')).rejects.toThrow();
  });

  it('빈 응답은 오류나 가짜 숫자가 아닌 미제공 상태로 반환한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => page([]));
    const { getOfficialDaily } = await import('@/lib/market/official-daily');
    expect(await getOfficialDaily('stock', '005930')).toMatchObject({
      date: null,
      rows: [],
      stale: false,
    });
  });

  it('갱신 실패 시 이전 값에 stale을 붙이고 원본 날짜가 너무 오래되면 거부한다', async () => {
    const request = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => page([row]));
    const { getOfficialDaily } = await import('@/lib/market/official-daily');
    await getOfficialDaily('stock', '005930');
    vi.setSystemTime(new Date('2026-09-07T08:00:00Z'));
    request.mockRejectedValue(new Error('secret URL must not escape'));
    expect(await getOfficialDaily('stock', '005930')).toMatchObject({
      stale: true,
      date: '2026-09-04',
    });
    vi.setSystemTime(new Date('2026-09-20T08:00:00Z'));
    await expect(getOfficialDaily('stock', '005930')).rejects.toThrow(
      '공식 일별 데이터',
    );
  });

  it('키 미설정과 임의 종목은 외부 요청 전에 거부한다', async () => {
    const request = vi.spyOn(globalThis, 'fetch');
    vi.stubEnv('DATA_GO_KR_SERVICE_KEY', '');
    const { getOfficialDaily } = await import('@/lib/market/official-daily');
    await expect(getOfficialDaily('stock', '005930')).rejects.toThrow(
      'NOT_CONFIGURED',
    );
    await expect(getOfficialDaily('stock', 'INVALID')).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
