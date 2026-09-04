import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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

    const deleteTrigger = screen.getByRole('button', { name: '삭제 대기' });
    await user.click(deleteTrigger);
    expect(screen.getByRole('alert')).toHaveTextContent('관리 사유를 5자 이상');

    fireEvent.change(screen.getByLabelText('관리 사유'), {
      target: { value: '반복 광고 영구 삭제' },
    });
    await user.click(deleteTrigger);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(
      document.querySelector('[data-slot="alert-dialog-overlay"]'),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      '삭제 후 1년 동안 복구할 수 있으며 이후 영구 파기됩니다.',
    );
    const cancel = screen.getByRole('button', { name: '취소' });
    await waitFor(() => expect(cancel).toHaveFocus());
    expect(actions).toHaveLength(0);

    const confirm = screen.getByRole('button', { name: '삭제 대기 확정' });
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(actions).toHaveLength(1));
    expect(actions[0]).toMatchObject({
      type: 'delete',
      reportId: item.id,
      targetType: 'post',
      targetId: item.targetId,
      reason: '반복 광고 영구 삭제',
    });
  });

  it('returns focus to the delete trigger when keyboard dismissal closes the dialog', async () => {
    const user = userEvent.setup();
    render(
      <ModerationQueue
        items={[item]}
        loading={false}
        onAction={async () => undefined}
      />,
    );

    await user.type(screen.getByLabelText('관리 사유'), '삭제 사유 재확인');
    const deleteTrigger = screen.getByRole('button', { name: '삭제 대기' });
    await user.click(deleteTrigger);
    await screen.findByRole('alertdialog');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '취소' })).toHaveFocus(),
    );

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(deleteTrigger).toHaveFocus();
  });

  it('requests a restriction by content target without a user UUID', async () => {
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

    fireEvent.change(screen.getByLabelText('관리 사유'), {
      target: { value: '반복적인 운영정책 위반' },
    });
    await user.click(screen.getByRole('button', { name: '작성 제한' }));
    const duration = await screen.findByRole('combobox', { name: '제한 기간' });
    await waitFor(() => expect(duration).toHaveFocus());
    await user.selectOptions(duration, '7');
    await user.tab();
    expect(screen.getByRole('button', { name: '제한 확정' })).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(actions).toHaveLength(1));
    expect(actions[0]).toMatchObject({
      type: 'restrict',
      reportId: item.id,
      targetType: 'post',
      targetId: item.targetId,
      reason: '반복적인 운영정책 위반',
      until: expect.any(String),
    });
    expect(actions[0]).not.toHaveProperty('userId');
    expect(actions[0]).not.toHaveProperty('targetAuthorId');
  });

  it('dismisses an unfounded report on visible content without punitive action', async () => {
    const user = userEvent.setup();
    const actions: unknown[] = [];
    render(
      <ModerationQueue
        items={[{ ...item, targetStatus: 'visible' }]}
        loading={false}
        onAction={async (action) => {
          actions.push(action);
        }}
      />,
    );

    await user.type(
      screen.getByLabelText('관리 사유'),
      '운영정책 위반 근거가 확인되지 않음',
    );
    await user.click(screen.getByRole('button', { name: '신고 기각' }));

    await waitFor(() => expect(actions).toHaveLength(1));
    expect(actions[0]).toEqual({
      type: 'dismiss',
      reportId: item.id,
      targetType: item.targetType,
      targetId: item.targetId,
      reason: '운영정책 위반 근거가 확인되지 않음',
    });
  });

  it('accepts an accessible custom restriction date and normalizes it to ISO', async () => {
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

    await user.type(screen.getByLabelText('관리 사유'), '직접 지정한 제한 기간 적용');
    await user.click(screen.getByRole('button', { name: '작성 제한' }));
    await user.selectOptions(
      await screen.findByRole('combobox', { name: '제한 기간' }),
      'custom',
    );
    const customUntil = screen.getByLabelText('제한 종료 시각');
    expect(customUntil).toHaveAttribute('type', 'datetime-local');
    await user.type(customUntil, '2099-01-02T03:04');
    await user.click(screen.getByRole('button', { name: '제한 확정' }));

    await waitFor(() => expect(actions).toHaveLength(1));
    expect(actions[0]).toMatchObject({
      type: 'restrict',
      reportId: item.id,
      until: new Date('2099-01-02T03:04').toISOString(),
    });
  });

  it('keeps the dialog open and explains a missing custom restriction date', async () => {
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

    await user.type(screen.getByLabelText('관리 사유'), '직접 지정한 제한 기간 적용');
    await user.click(screen.getByRole('button', { name: '작성 제한' }));
    await user.selectOptions(
      await screen.findByRole('combobox', { name: '제한 기간' }),
      'custom',
    );
    await user.click(screen.getByRole('button', { name: '제한 확정' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '현재보다 이후인 제한 종료 시각을 입력해 주세요.',
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(actions).toHaveLength(0);
  });

  it('keeps a rejected restriction dialog usable with one in-dialog error and preserved inputs', async () => {
    const user = userEvent.setup();
    render(
      <ModerationQueue
        items={[item]}
        loading={false}
        onAction={async () => {
          throw new Error('provider detail');
        }}
      />,
    );

    const reason = screen.getByLabelText('관리 사유');
    await user.type(reason, '반복적인 운영정책 위반');
    await user.click(screen.getByRole('button', { name: '작성 제한' }));
    const dialog = await screen.findByRole('alertdialog');
    const duration = within(dialog).getByRole('combobox', {
      name: '제한 기간',
    });
    await user.selectOptions(duration, '7');
    await user.tab();
    const confirm = within(dialog).getByRole('button', { name: '제한 확정' });
    expect(confirm).toHaveFocus();

    await user.keyboard('{Enter}');

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(
      '관리 조치를 반영하지 못했습니다. 다시 시도해 주세요.',
    );
    expect(screen.getByRole('alertdialog')).toBe(dialog);
    expect(reason).toHaveValue('반복적인 운영정책 위반');
    expect(duration).toHaveValue('7');
    expect(confirm).toHaveAttribute('aria-describedby', alert.id);
    expect(
      screen.getAllByText(
        '관리 조치를 반영하지 못했습니다. 다시 시도해 주세요.',
      ),
    ).toHaveLength(1);
    await waitFor(() => expect(confirm).toHaveFocus());
    await user.tab();
    expect(within(dialog).getByRole('button', { name: '취소' })).toHaveFocus();
  });
});
