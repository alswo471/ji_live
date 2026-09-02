import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketStatusBar } from '@/components/market/market-status-bar';

describe('MarketStatusBar', () => {
  it('degraded 응답을 정상 연결 상태와 구분한다', () => {
    render(<MarketStatusBar state="degraded" />);

    expect(screen.getByText('일부 시장 데이터 지연·미제공')).toBeVisible();
    expect(screen.queryByText('시장 데이터 연결됨')).not.toBeInTheDocument();
  });

  it('fetchedAt을 공급자 시각이 아닌 대시보드 확인 시각으로 명시한다', () => {
    render(
      <MarketStatusBar
        state="ready"
        fetchedAt="2026-09-01T10:00:00+09:00"
      />,
    );

    expect(screen.getByText('대시보드 확인 10:00 · 5초 갱신')).toBeVisible();
  });
});
