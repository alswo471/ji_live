import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminContentList } from '@/components/community/admin-content-list';
import type { AdminContentItem } from '@/lib/community/admin-console-service';

const authorDeleted: AdminContentItem = {
  targetType: 'post',
  targetId: '20000000-0000-4000-8000-000000000001',
  actorLabel: '익명 사용자 #A82F',
  authorName: '푸른고래',
  title: '작성자가 삭제한 글',
  body: '복구 여부를 확인할 내용입니다.',
  status: 'deleted',
  deletionSource: 'author',
  deletedAt: '2026-09-04T05:00:00.000Z',
  purgeAt: '2027-09-04T05:00:00.000Z',
  hiddenSource: null,
  hiddenReason: null,
  hiddenAt: null,
  createdAt: '2026-09-03T05:00:00.000Z',
};

describe('AdminContentList', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('requires a warning and keyboard confirmation for author-deleted content', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(<AdminContentList items={[authorDeleted]} onAction={onAction} />);

    await user.type(
      screen.getByLabelText('관리 사유'),
      '작성자 요청을 확인한 복구 처리',
    );
    await user.click(screen.getByRole('button', { name: '복구' }));

    expect(
      await screen.findByText(/작성자가 직접 삭제한 콘텐츠/),
    ).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();

    const confirm = screen.getByRole('button', { name: '복구 확정' });
    confirm.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(onAction).toHaveBeenCalledWith({
      type: 'restore',
      targetType: 'post',
      targetId: authorDeleted.targetId,
      reason: '작성자 요청을 확인한 복구 처리',
    });
  });

  it.each([
    {
      label: '관리자 삭제',
      item: { ...authorDeleted, deletionSource: 'admin' as const },
    },
    {
      label: '숨김',
      item: {
        ...authorDeleted,
        status: 'hidden' as const,
        deletionSource: null,
        deletedAt: null,
        purgeAt: null,
      },
    },
  ])('restores $label content after one reasoned action', async ({ item }) => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(<AdminContentList items={[item]} onAction={onAction} />);

    fireEvent.change(screen.getByLabelText('관리 사유'), {
      target: { value: '운영 검토를 마친 복구' },
    });
    fireEvent.click(screen.getByRole('button', { name: '복구' }));

    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('keeps validation next to the reason field', () => {
    render(
      <AdminContentList
        items={[authorDeleted]}
        onAction={async () => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText('관리 사유'), {
      target: { value: '짧음' },
    });
    fireEvent.click(screen.getByRole('button', { name: '복구' }));

    const reason = screen.getByLabelText('관리 사유');
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('5자 이상');
    expect(reason).toHaveAttribute('aria-invalid', 'true');
    expect(reason.getAttribute('aria-describedby')).toContain(error.id);
  });

  it('shows the purge date and remaining whole days with textual state', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T05:00:00.000Z'));
    render(
      <AdminContentList
        items={[
          {
            ...authorDeleted,
            purgeAt: '2026-09-14T05:00:00.000Z',
          },
        ]}
        onAction={async () => undefined}
      />,
    );

    expect(screen.getByText('사용자 삭제')).toBeInTheDocument();
    expect(screen.getByText(/영구 파기까지 10일 남음/)).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveClass(
      'grid',
      'min-w-0',
      'bg-card',
      'lg:grid-cols-[minmax(0,1fr)_20rem]',
    );
  });

  it('shows the source, reason, and action time for hidden content', () => {
    render(
      <AdminContentList
        items={[
          {
            ...authorDeleted,
            status: 'hidden',
            deletionSource: null,
            deletedAt: null,
            purgeAt: null,
            hiddenSource: 'automatic',
            hiddenReason: '서로 다른 네트워크의 신고 10건',
            hiddenAt: '2026-09-04T06:00:00.000Z',
          },
        ]}
        onAction={async () => undefined}
      />,
    );

    expect(screen.getByText('자동 숨김')).toBeInTheDocument();
    expect(screen.getByText('숨김 사유')).toBeInTheDocument();
    expect(screen.getByText('서로 다른 네트워크의 신고 10건')).toBeInTheDocument();
    expect(screen.getByText('숨김 시각')).toBeInTheDocument();
  });

  it('does not render raw identifiers or private transport fields', () => {
    const privateFixture = {
      ...authorDeleted,
      email: 'reporter@example.com',
      ipAddress: '198.51.100.42',
      reporterId: '50000000-0000-4000-8000-000000000001',
      abuseKey: 'private-abuse-key',
      secret: 'private-secret',
    } as AdminContentItem;
    render(
      <AdminContentList
        items={[privateFixture]}
        onAction={async () => undefined}
      />,
    );

    expect(document.body.innerHTML).not.toContain(authorDeleted.targetId);
    expect(document.body).not.toHaveTextContent('reporter@example.com');
    expect(document.body).not.toHaveTextContent('198.51.100.42');
    expect(document.body).not.toHaveTextContent('private-abuse-key');
    expect(document.body).not.toHaveTextContent('private-secret');
    expect(document.body).not.toHaveTextContent('신고자');
  });

  it('surfaces an async failure without removing the existing item', async () => {
    render(
      <AdminContentList
        items={[authorDeleted]}
        onAction={async () => {
          throw new Error('provider detail');
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText('관리 사유'), {
      target: { value: '관리 복구 사유 확인' },
    });
    fireEvent.click(screen.getByRole('button', { name: '복구' }));
    fireEvent.click(await screen.findByRole('button', { name: '복구 확정' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '복구하지 못했습니다',
    );
    expect(screen.getByText('작성자가 삭제한 글')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('provider detail');
  });
});
