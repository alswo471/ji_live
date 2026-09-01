import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketStatusBar } from '@/components/market/market-status-bar';

describe('MarketStatusBar', () => {
  it('degraded 응답을 정상 연결 상태와 구분한다', () => {
    render(<MarketStatusBar state="degraded" />);

    expect(screen.getByText('일부 시장 데이터 지연·미제공')).toBeVisible();
    expect(screen.queryByText('시장 데이터 연결됨')).not.toBeInTheDocument();
  });
});
