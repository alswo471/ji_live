import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SiteFooter } from '@/components/site/site-footer';

describe('데이터 출처 안내', () => {
  it('하단에서 출처를 열고 닫으며 평소에는 긴 안내를 숨긴다', async () => {
    render(<SiteFooter />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: '데이터 출처·산정 기준' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'ECB' })).toHaveAttribute(
      'href',
      'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',
    );
    expect(
      within(dialog).getByText(/KRW 기준값 ÷ 해당 통화 기준값/),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
