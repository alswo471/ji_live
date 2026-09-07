import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { OfficialDailyPanel } from '@/components/market/official-daily-panel';
const day = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const row = {
  symbol: '005930',
  name: '삼성전자',
  date: day,
  close: 100,
  changeRate: 0,
  open: 90,
  high: 110,
  low: 80,
  volume: 0,
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('갱신 실패 시 하나의 지수라도 기준일이 만료되면 숫자 표시를 중단한다', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-17T06:00:00Z'));
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      Response.json({
        kind: 'indices',
        date: '2026-09-04',
        rows: [
          { ...row, symbol: '코스피', name: '코스피', date: '2026-09-03' },
          { ...row, symbol: '코스닥', name: '코스닥', date: '2026-09-04' },
        ],
        stale: false,
      }),
    )
    .mockRejectedValue(new Error('network'));
  render(<OfficialDailyPanel kind="indices" />);
  expect(await screen.findByText('2026-09-03 기준')).toBeVisible();
  vi.setSystemTime(new Date('2026-09-18T06:00:00Z'));
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
  await waitFor(() =>
    expect(screen.queryByText('2026-09-03 기준')).not.toBeInTheDocument(),
  );
});
it('공식 종가와 기준일을 표시하고 과거 기록을 펼칠 수 있다', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({ kind: 'stock', date: day, rows: [row], stale: false }),
  );
  render(<OfficialDailyPanel kind="stock" symbol="005930" />);
  expect(screen.getByText(/불러오는 중/)).toBeVisible();
  expect(await screen.findByText('100원')).toBeVisible();
  expect(screen.getByText(/실시간 시세가 아닙니다/)).toBeVisible();
  expect(screen.getByText('0.00%')).toBeVisible();
  expect(screen.getByText(`${day} 기준 · 일별`)).toBeVisible();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '과거 기록 보기' }));
  expect(
    screen.getByRole('table', { name: '공식 일별 과거 기록' }),
  ).toBeVisible();
});
it('실패한 조회를 재시도하고 데이터 없음을 구분한다', async () => {
  const request = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      Response.json({ code: 'UNAVAILABLE' }, { status: 503 }),
    )
    .mockResolvedValueOnce(
      Response.json({ kind: 'etf', date: null, rows: [], stale: false }),
    );
  render(<OfficialDailyPanel kind="etf" />);
  expect(await screen.findByText(/불러오지 못했습니다/)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
  expect(await screen.findByText('제공 데이터 없음')).toBeVisible();
  expect(request).toHaveBeenCalledTimes(2);
});
it('다른 종목으로 바뀌면 이전 종목 데이터를 남기지 않는다', async () => {
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      Response.json({ kind: 'stock', date: day, rows: [row], stale: false }),
    )
    .mockImplementation(() => new Promise(() => {}));
  const view = render(<OfficialDailyPanel kind="stock" symbol="005930" />);
  await screen.findByText('100원');
  view.rerender(<OfficialDailyPanel kind="stock" symbol="000660" />);
  await waitFor(() =>
    expect(screen.queryByText('100원')).not.toBeInTheDocument(),
  );
});
