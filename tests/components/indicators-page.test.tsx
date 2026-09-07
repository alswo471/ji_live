import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import IndicatorsPage from '@/app/indicators/page';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('시장 지표 구분', () => {
  it('미연동 국내 지수를 일별 영역으로 구분하고 임의 숫자를 표시하지 않는다', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    render(<IndicatorsPage />);
    const indices = screen.getByRole('region', { name: '국내 주가지수 · 일별' });
    expect(within(indices).getByText('코스피')).toBeVisible();
    expect(within(indices).getAllByText(/불러오는 중/).length).toBeGreaterThan(0);
    expect(within(indices).getByText(/실시간 시세가 아닙니다/)).toBeVisible();
    expect(within(indices).queryByText(/%/)).not.toBeInTheDocument();
  });

  it('BTC 지수는 유지하며 한국·미국 주식용 가짜 게이지를 만들지 않는다', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (input === '/api/market/sentiment') return Response.json({ value: 33, classification: 'Fear', asOf: '2026-09-07T00:00:00Z', stale: false });
      return new Promise(() => {});
    });
    render(<IndicatorsPage />);
    expect(await screen.findByRole('img', { name: '공포 33점, 100점 만점' })).toBeVisible();
    const sentiment = screen.getByRole('region', { name: '시장별 공포·탐욕' });
    expect(within(sentiment).getAllByRole('img')).toHaveLength(1);
    expect(within(sentiment).getByText(/한국·미국 주식 심리 지표는 데이터 미연동/)).toBeVisible();
    expect(within(sentiment).getByRole('link', { name: /Alternative.me/ })).toBeVisible();
  });
});
