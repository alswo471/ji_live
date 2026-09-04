import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminAuditList } from '@/components/community/admin-audit-list';
import type { AdminAuditItem } from '@/lib/community/admin-console-service';

const item: AdminAuditItem = {
  id: '80000000-0000-4000-8000-000000000001',
  action: 'restore',
  targetType: 'post',
  targetId: '90000000-0000-4000-8000-000000000001',
  actorLabel: '익명 사용자 #F52B',
  targetTitle: '복구한 게시글',
  targetBody: '운영 검토 후 복구된 내용입니다.',
  reason: '오조치 확인 후 복구',
  createdAt: '2026-09-04T05:00:00.000Z',
};

describe('AdminAuditList', () => {
  it('renders action, target, reason and time as a read-only log', () => {
    render(<AdminAuditList items={[item]} />);

    expect(screen.getByText('복구')).toBeInTheDocument();
    expect(screen.getByText('게시글')).toBeInTheDocument();
    expect(screen.getByText('복구한 게시글')).toBeInTheDocument();
    expect(screen.getByText('오조치 확인 후 복구')).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('never renders raw UUID, email, IP, reporter, abuse key or secret fields', () => {
    const privateFixture = {
      ...item,
      adminId: 'a0000000-0000-4000-8000-000000000001',
      email: 'admin@example.com',
      ipAddress: '192.0.2.15',
      reporter: 'private-reporter',
      abuseKey: 'private-abuse-key',
      secret: 'private-secret',
    } as AdminAuditItem;
    render(<AdminAuditList items={[privateFixture]} />);

    expect(document.body.innerHTML).not.toContain(item.id);
    expect(document.body.innerHTML).not.toContain(item.targetId);
    expect(document.body).not.toHaveTextContent('admin@example.com');
    expect(document.body).not.toHaveTextContent('192.0.2.15');
    expect(document.body).not.toHaveTextContent('private-reporter');
    expect(document.body).not.toHaveTextContent('private-abuse-key');
    expect(document.body).not.toHaveTextContent('private-secret');
    expect(document.body).not.toHaveTextContent('신고자');
  });
});
