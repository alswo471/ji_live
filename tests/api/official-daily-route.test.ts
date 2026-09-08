import { afterEach, expect, it, vi } from 'vitest';
const provider = vi.hoisted(() => vi.fn());
vi.mock('@/lib/market/official-daily', () => ({ getOfficialDaily: provider }));
afterEach(() => vi.resetAllMocks());
it('키 미설정은 안전한 503과 no-store로 응답한다', async () => {
  provider.mockRejectedValue(new Error('NOT_CONFIGURED'));
  const { GET } = await import('@/app/api/market/official-daily/route');
  const res = await GET(
    new Request('http://localhost/api/market/official-daily?kind=etf'),
  );
  expect(res.status).toBe(503);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await res.json()).toEqual({ code: 'NOT_CONFIGURED' });
});
it('잘못된 요청은 공급자 호출 전에 거부한다', async () => {
  const { GET } = await import('@/app/api/market/official-daily/route');
  const res = await GET(
    new Request('http://localhost/api/market/official-daily?kind=unknown'),
  );
  expect(res.status).toBe(400);
  expect(provider).not.toHaveBeenCalled();
});
it('외부 오류에 포함된 인증 URL을 응답에 노출하지 않는다', async () => {
  provider.mockRejectedValue(new Error('https://private/?serviceKey=secret'));
  const { GET } = await import('@/app/api/market/official-daily/route');
  const res = await GET(
    new Request('http://localhost/api/market/official-daily?kind=etf'),
  );
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ code: 'UNAVAILABLE' });
});
