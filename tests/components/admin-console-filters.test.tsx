import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminConsoleFilters } from '@/components/community/admin-console-filters';
import type { AdminConsoleFilters as FilterValues } from '@/hooks/use-community-admin';

const filters: FilterValues = {
  targetType: 'all',
  deletionSource: 'all',
  sanctionState: 'active',
  action: 'all',
  from: '',
  to: '',
  query: '',
};

describe('AdminConsoleFilters', () => {
  it('shows only the controls used by each content tab', () => {
    const { rerender } = render(
      <AdminConsoleFilters tab="hidden" filters={filters} onChange={vi.fn()} />,
    );

    expect(screen.getByLabelText('대상 유형')).toBeInTheDocument();
    expect(screen.getByLabelText('숨김 콘텐츠 검색')).toBeInTheDocument();
    expect(screen.queryByLabelText('삭제 주체')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('제재 상태')).not.toBeInTheDocument();

    rerender(
      <AdminConsoleFilters tab="trash" filters={filters} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('대상 유형')).toBeInTheDocument();
    expect(screen.getByLabelText('삭제 주체')).toBeInTheDocument();
    expect(screen.getByLabelText('삭제 대기 검색')).toBeInTheDocument();
  });

  it('shows status for sanctions and action, target and search for audit', () => {
    const { rerender } = render(
      <AdminConsoleFilters
        tab="sanctions"
        filters={filters}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('제재 상태')).toBeInTheDocument();
    expect(screen.queryByLabelText(/검색/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('대상 유형')).not.toBeInTheDocument();

    rerender(
      <AdminConsoleFilters tab="audit" filters={filters} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('조치 유형')).toBeInTheDocument();
    expect(screen.getByLabelText('대상 유형')).toBeInTheDocument();
    expect(screen.getByLabelText('조회 시작일')).toHaveAttribute(
      'type',
      'date',
    );
    expect(screen.getByLabelText('조회 종료일')).toHaveAttribute(
      'type',
      'date',
    );
    expect(screen.getByLabelText('운영 로그 검색')).toBeInTheDocument();
    expect(screen.getByLabelText('삭제 주체')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '사용자' })).toHaveValue('user');
    expect(screen.getByRole('option', { name: '신고 기각' })).toHaveValue(
      'dismiss',
    );
  });

  it('limits search to 100 characters and requests a cursor reset', () => {
    const onChange = vi.fn();
    render(
      <AdminConsoleFilters
        tab="hidden"
        filters={filters}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('숨김 콘텐츠 검색'), {
      target: { value: '가'.repeat(101) },
    });

    expect(onChange).toHaveBeenCalledWith(
      { ...filters, query: '가'.repeat(100) },
      { resetCursor: true },
    );
  });

  it('emits filter changes and keeps each control keyboard reachable', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AdminConsoleFilters tab="trash" filters={filters} onChange={onChange} />,
    );

    await user.tab();
    expect(screen.getByLabelText('대상 유형')).toHaveFocus();
    await user.selectOptions(screen.getByLabelText('삭제 주체'), 'author');

    expect(onChange).toHaveBeenCalledWith(
      { ...filters, deletionSource: 'author' },
      { resetCursor: true },
    );
  });

  it('emits accessible audit date changes and constrains the paired dates', () => {
    const onChange = vi.fn();
    render(
      <AdminConsoleFilters
        tab="audit"
        filters={{ ...filters, to: '2026-09-04' }}
        onChange={onChange}
      />,
    );

    const from = screen.getByLabelText('조회 시작일');
    expect(from).toHaveAttribute('max', '2026-09-04');
    fireEvent.change(from, { target: { value: '2026-09-01' } });

    expect(onChange).toHaveBeenCalledWith(
      { ...filters, from: '2026-09-01', to: '2026-09-04' },
      { resetCursor: true },
    );
  });

  it('keeps an inverted audit range error next to both date fields', () => {
    render(
      <AdminConsoleFilters
        tab="audit"
        filters={{ ...filters, from: '2026-09-05', to: '2026-09-04' }}
        onChange={vi.fn()}
      />,
    );

    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('시작일은 종료일보다 늦을 수 없습니다');
    expect(screen.getByLabelText('조회 시작일')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText('조회 종료일')).toHaveAttribute(
      'aria-describedby',
      error.id,
    );
  });
});
