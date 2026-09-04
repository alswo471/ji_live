import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ModerationQueue } from '@/components/community/moderation-queue';
import type { ModerationQueueItem } from '@/lib/community/moderation-service';

const item: ModerationQueueItem = {
  id: '40000000-0000-4000-8000-000000000001',
  targetType: 'post',
  targetId: '20000000-0000-4000-8000-000000000001',
  actorLabel: '익명 사용자 #A82F',
  targetTitle: '시장 질문',
  targetBody: '검토가 필요한 게시글입니다.',
  targetStatus: 'hidden',
  reason: 'spam',
  detail: '반복 광고입니다.',
  createdAt: '2026-09-03T04:00:00.000Z',
};

describe('ModerationQueue', () => {
  it('shows the report context without reporter identity', () => {
    const { container } = render(
      <ModerationQueue
        items={[
          {
            ...item,
            email: 'reporter@example.com',
            ipAddress: '198.51.100.42',
            reporterId: '50000000-0000-4000-8000-000000000001',
            abuseKey: 'private-abuse-key',
            secret: 'private-secret',
          } as ModerationQueueItem,
        ]}
        loading={false}
        onAction={async () => undefined}
      />,
    );

    expect(screen.getByText('시장 질문')).toBeInTheDocument();
    expect(screen.getByText('검토가 필요한 게시글입니다.')).toHaveClass(
      'break-words',
    );
    expect(screen.getByText('반복 광고입니다.')).toHaveClass('break-words');
    expect(screen.queryByText(/신고자 ID/)).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain(item.id);
    expect(container.innerHTML).not.toContain(item.targetId);
    expect(container).not.toHaveTextContent('reporter@example.com');
    expect(container).not.toHaveTextContent('198.51.100.42');
    expect(container).not.toHaveTextContent('private-abuse-key');
    expect(container).not.toHaveTextContent('private-secret');
  });

  it('requires a reason and a keyboard confirmation before delete queueing', async () => {
    const user = userEvent.setup();
    const actions: unknown[] = [];
    render(
      <ModerationQueue
        items={[item]}
        loading={false}
        onAction={async (action) => {
          actions.push(action);
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: '삭제 대기' }));
    expect(screen.getByRole('alert')).toHaveTextContent('관리 사유를 5자 이상');

    fireEvent.change(screen.getByLabelText('관리 사유'), {
      target: { value: '반복 광고 영구 삭제' },
    });
    await user.click(screen.getByRole('button', { name: '삭제 대기' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      '삭제 후 1년 동안 복구할 수 있으며 이후 영구 파기됩니다.',
    );
    await waitFor(() =>
      expect(dialog).toContainElement(document.activeElement as HTMLElement),
    );
    expect(actions).toHaveLength(0);

    const confirm = screen.getByRole('button', { name: '삭제 대기 확정' });
    confirm.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(actions).toHaveLength(1));
    expect(actions[0]).toMatchObject({
      type: 'delete',
      targetType: 'post',
      targetId: item.targetId,
      reason: '반복 광고 영구 삭제',
    });
  });

  it('requests a restriction by content target without a user UUID', async () => {
    const actions: unknown[] = [];
    render(
      <ModerationQueue
        items={[item]}
        loading={false}
        onAction={async (action) => {
          actions.push(action);
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText('관리 사유'), {
      target: { value: '반복적인 운영정책 위반' },
    });
    fireEvent.click(screen.getByRole('button', { name: '작성 제한' }));
    fireEvent.click(screen.getByRole('button', { name: '제한 확정' }));

    await waitFor(() => expect(actions).toHaveLength(1));
    expect(actions[0]).toMatchObject({
      type: 'restrict',
      targetType: 'post',
      targetId: item.targetId,
      reason: '반복적인 운영정책 위반',
      until: expect.any(String),
    });
    expect(actions[0]).not.toHaveProperty('userId');
    expect(actions[0]).not.toHaveProperty('targetAuthorId');
  });
});
