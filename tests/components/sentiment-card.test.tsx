import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SentimentCard } from '@/components/market/sentiment-card';

afterEach(() => vi.unstubAllGlobals());
describe('SentimentCard', () => {
  it('실제 응답의 값·분류·출처를 함께 표시한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({
            value: 33,
            classification: 'Fear',
            asOf: '2026-09-07T00:00:00Z',
            stale: true,
          }),
        ),
    );
    render(<SentimentCard />);
    expect(
      await screen.findByRole('img', { name: '공포 33점, 100점 만점' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/갱신 지연/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '출처: Alternative.me' }),
    ).toHaveAttribute(
      'href',
      'https://alternative.me/crypto/fear-and-greed-index/',
    );
  });
  it('실패 응답에는 가짜 게이지를 만들지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 503 })),
    );
    render(<SentimentCard />);
    await screen.findByText(/지수 미제공/);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
