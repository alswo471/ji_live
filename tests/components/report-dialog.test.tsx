import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReportDialog } from '@/components/community/report-dialog';

describe('ReportDialog', () => {
  it('shows the operations link instead of a report form for an administrator', () => {
    render(<ReportDialog targetType="post" targetId="post-id" onSubmit={vi.fn()} isAdmin />);
    expect(screen.queryByRole('button', { name: '신고' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /운영 콘솔/ })).toHaveAttribute('href', '/admin/community');
  });
  it('requires a reason and announces successful submission', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(
      <ReportDialog targetType="post" targetId="post-id" onSubmit={submit} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '신고' }));
    fireEvent.click(await screen.findByRole('button', { name: '신고하기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('신고 사유');
    fireEvent.change(screen.getByLabelText('신고 사유'), {
      target: { value: 'spam' },
    });
    fireEvent.click(screen.getByRole('button', { name: '신고하기' }));
    expect(await screen.findByText('신고가 접수됐습니다.')).toBeInTheDocument();
  });
});
