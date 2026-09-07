import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Home from '@/app/page';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});
it('ETF 메뉴에서 추정 종목 표 대신 공식 일별 ETF 순위를 불러온다', async () => {
  window.history.replaceState({}, '', '/?market=etf');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (
      (url instanceof Request ? url.url : url.toString()).includes(
        'official-daily',
      )
    )
      return Response.json({ kind: 'etf', date: null, rows: [], stale: false });
    return new Promise(() => {});
  });
  render(<Home />);
  expect(
    await screen.findByRole('heading', { name: '국내 ETF · 거래량 TOP 10' }),
  ).toBeVisible();
  expect(await screen.findByText('제공 데이터 없음')).toBeVisible();
  expect(screen.queryByText(/5초.*갱신/)).not.toBeInTheDocument();
  expect(screen.queryByText('ETF를 준비하고 있어요')).not.toBeInTheDocument();
});
