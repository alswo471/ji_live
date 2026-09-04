import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminSanctionList } from '@/components/community/admin-sanction-list';
import type { AdminSanctionItem } from '@/lib/community/admin-console-service';

const active: AdminSanctionItem = {
  sanctionId: '60000000-0000-4000-8000-000000000001',
  actorLabel: '익명 사용자 #C31D',
  reason: '반복적인 운영정책 위반',
  startsAt: '2026-09-04T05:00:00.000Z',
  endsAt: '2026-09-11T05:00:00.000Z',
  revokedAt: null,
  state: 'active',
};

describe('AdminSanctionList', () => {
  it('shows textual states and exposes an action only for active sanctions', () => {
    render(
      <AdminSanctionList
        items={[
          active,
          {
            ...active,
            sanctionId: '60000000-0000-4000-8000-000000000002',
            actorLabel: '익명 사용자 #E74A',
            state: 'ended',
            revokedAt: '2026-09-05T05:00:00.000Z',
          },
        ]}
        onAction={async () => undefined}
      />,
    );

    expect(screen.getByText('활성')).toBeInTheDocument();
    expect(screen.getByText('종료')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '제재 해제' })).toHaveLength(
      1,
    );
    expect(screen.getAllByText('종료 시각')).toHaveLength(2);
  });

  it('requires a reason and sends only the sanction action boundary', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(<AdminSanctionList items={[active]} onAction={onAction} />);

    fireEvent.click(screen.getByRole('button', { name: '제재 해제' }));
    expect(screen.getByRole('alert')).toHaveTextContent('5자 이상');

    fireEvent.change(screen.getByLabelText('제재 해제 사유'), {
      target: { value: '운영 검토 후 제한 해제' },
    });
    fireEvent.click(screen.getByRole('button', { name: '제재 해제' }));

    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(onAction).toHaveBeenCalledWith({
      type: 'unrestrict',
      sanctionId: active.sanctionId,
      reason: '운영 검토 후 제한 해제',
    });
  });

  it('keeps the form keyboard reachable and the item visible on failure', async () => {
    const user = userEvent.setup();
    render(
      <AdminSanctionList
        items={[active]}
        onAction={async () => {
          throw new Error('private provider detail');
        }}
      />,
    );

    await user.tab();
    expect(screen.getByLabelText('제재 해제 사유')).toHaveFocus();
    await user.type(
      screen.getByLabelText('제재 해제 사유'),
      '제재 해제 검토 완료',
    );
    await user.click(screen.getByRole('button', { name: '제재 해제' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '제재를 해제하지 못했습니다',
    );
    expect(screen.getByText('익명 사용자 #C31D')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('private provider detail');
  });

  it('does not render UUID, email, IP, reporter or secret fields', () => {
    const privateFixture = {
      ...active,
      userId: '70000000-0000-4000-8000-000000000001',
      email: 'person@example.com',
      ipAddress: '203.0.113.7',
      reporter: 'private-reporter',
      abuseKey: 'private-abuse-key',
      secret: 'private-secret',
    } as AdminSanctionItem;
    render(
      <AdminSanctionList
        items={[privateFixture]}
        onAction={async () => undefined}
      />,
    );

    expect(document.body.innerHTML).not.toContain(active.sanctionId);
    expect(document.body).not.toHaveTextContent('person@example.com');
    expect(document.body).not.toHaveTextContent('203.0.113.7');
    expect(document.body).not.toHaveTextContent('private-reporter');
    expect(document.body).not.toHaveTextContent('private-abuse-key');
    expect(document.body).not.toHaveTextContent('private-secret');
  });
});
