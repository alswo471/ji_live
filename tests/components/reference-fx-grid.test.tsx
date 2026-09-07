import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReferenceFxGrid } from '@/components/market/reference-fx-grid';

afterEach(() => vi.unstubAllGlobals());
describe('ReferenceFxGrid', () => {
  it('발표일·100엔 단위·등락률·출처를 표시한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          date: '2026-09-04',
          previousDate: '2026-09-03',
          stale: false,
          rates: [
            {
              currency: 'USD',
              unit: 1,
              price: 1250,
              previousPrice: 1200,
              changeRate: 1 / 24,
            },
            {
              currency: 'JPY',
              unit: 100,
              price: 1000,
              previousPrice: 1000,
              changeRate: 0,
            },
            {
              currency: 'THB',
              unit: 1,
              price: 37.5,
              previousPrice: null,
              changeRate: null,
            },
          ],
        }),
      ),
    );
    render(<ReferenceFxGrid />);
    expect(await screen.findByText('1,000.00원')).toBeInTheDocument();
    expect(screen.getByText('엔화 · 100 JPY')).toBeInTheDocument();
    expect(screen.getByLabelText('상승 +4.17%')).toBeInTheDocument();
    expect(screen.getByText('비교값 미제공')).toBeInTheDocument();
    expect(screen.getByText(/2026-09-03 발표값 대비/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /출처: European Central Bank/ }),
    ).toBeInTheDocument();
  });
  it('장애에는 임시 환율 대신 실패 상태를 표시한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 503 })),
    );
    render(<ReferenceFxGrid />);
    await screen.findByText(/기준환율을 가져오지 못했습니다/);
    expect(screen.queryByText('1,000.00원')).not.toBeInTheDocument();
  });
});
