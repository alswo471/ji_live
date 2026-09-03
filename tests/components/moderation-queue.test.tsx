import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModerationQueue } from '@/components/community/moderation-queue';
import type { ModerationQueueItem } from '@/lib/community/moderation-service';

const item: ModerationQueueItem = {
  id: '40000000-0000-4000-8000-000000000001',
  targetType: 'post',
  targetId: '20000000-0000-4000-8000-000000000001',
  targetAuthorId: '30000000-0000-4000-8000-000000000001',
  targetTitle: '시장 질문',
  targetBody: '검토가 필요한 게시글입니다.',
  targetStatus: 'hidden',
  reason: 'spam',
  detail: '반복 광고입니다.',
  createdAt: '2026-09-03T04:00:00.000Z',
};

describe('ModerationQueue', () => {
  it('shows the report context without reporter identity', () => {
    render(
      <ModerationQueue
        items={[item]}
        loading={false}
        onAction={async () => undefined}
      />,
    );

    expect(screen.getByText('시장 질문')).toBeInTheDocument();
    expect(screen.getByText('반복 광고입니다.')).toBeInTheDocument();
    expect(screen.queryByText(/신고자 ID/)).not.toBeInTheDocument();
  });

  it('requires a reason and a second confirmation before delete', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(screen.getByRole('alert')).toHaveTextContent('관리 사유를 5자 이상');

    fireEvent.change(screen.getByLabelText('관리 사유'), {
      target: { value: '반복 광고 영구 삭제' },
    });
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(screen.getByText('이 콘텐츠를 삭제할까요?')).toBeInTheDocument();
    expect(actions).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: '삭제 확정' }));
    await waitFor(() => expect(actions).toHaveLength(1));
    expect(actions[0]).toMatchObject({
      type: 'delete',
      targetType: 'post',
      targetId: item.targetId,
      reason: '반복 광고 영구 삭제',
    });
  });
});
