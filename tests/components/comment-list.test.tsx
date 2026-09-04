import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommentList } from '@/components/community/comment-list';
import type { CommunityComment, ReportInput } from '@/lib/community/types';

const comment: CommunityComment = {
  id: '40000000-0000-4000-8000-000000000001',
  postId: '30000000-0000-4000-8000-000000000001',
  authorName: '차분한-고양이-0001',
  body: '검토가 필요한 댓글입니다.',
  createdAt: '2026-09-04T05:00:00.000Z',
  canDelete: true,
};

describe('CommentList', () => {
  it('keeps owner deletion and reports each comment through the shared dialog', async () => {
    const onDelete = vi.fn();
    const onReport = vi.fn<(input: ReportInput) => Promise<void>>()
      .mockResolvedValue(undefined);
    render(
      <CommentList
        comments={[comment]}
        onDelete={onDelete}
        onReport={onReport}
      />,
    );

    const article = screen.getByRole('article');
    expect(within(article).getByRole('button', { name: '삭제' })).toBeVisible();
    fireEvent.click(within(article).getByRole('button', { name: '신고' }));
    fireEvent.change(await screen.findByLabelText('신고 사유'), {
      target: { value: 'spam' },
    });
    fireEvent.click(screen.getByRole('button', { name: '신고하기' }));

    expect(onReport).toHaveBeenCalledWith({
      targetType: 'comment',
      targetId: comment.id,
      reason: 'spam',
      detail: '',
    });
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('keeps comment actions usable in a wrapping responsive row', () => {
    render(
      <CommentList
        comments={[comment]}
        onDelete={() => undefined}
        onReport={async () => undefined}
      />,
    );

    expect(screen.getByText(comment.authorName).parentElement).toHaveClass(
      'flex-wrap',
    );
  });
});
