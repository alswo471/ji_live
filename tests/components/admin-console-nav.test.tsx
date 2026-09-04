import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AdminConsoleNav } from '@/components/community/admin-console-nav';

describe('AdminConsoleNav', () => {
  it('renders deep-link tabs with a textual current state', () => {
    render(<AdminConsoleNav tab="hidden" />);

    const tablist = screen.getByRole('tablist', {
      name: 'Community 운영 메뉴',
    });
    expect(tablist).toHaveClass('grid-cols-2', 'sm:grid-cols-5', 'bg-card/60');
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.getByRole('tab', { name: '숨김 콘텐츠' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: '신고 대기' })).toHaveAttribute(
      'href',
      '/admin/community?tab=reports',
    );
    expect(screen.getByText('현재 화면: 숨김 콘텐츠')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '숨김 콘텐츠' })).toHaveClass(
      'bg-primary',
      'text-primary-foreground',
      'focus-visible:ring-3',
    );
    expect(screen.getByRole('tab', { name: '숨김 콘텐츠' })).toHaveAttribute(
      'aria-controls',
      'admin-panel-hidden',
    );
    expect(screen.getByRole('tab', { name: '신고 대기' })).not.toHaveAttribute(
      'aria-controls',
    );
  });

  it('moves keyboard focus through the complete tab set', async () => {
    const user = userEvent.setup();
    render(<AdminConsoleNav tab="hidden" />);

    const hiddenTab = screen.getByRole('tab', { name: '숨김 콘텐츠' });
    hiddenTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: '삭제 대기' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: '운영 로그' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: '신고 대기' })).toHaveFocus();
  });
});
