import type { CommunityComment, ReportInput } from '@/lib/community/types';
import type { ReactNode } from 'react';
import { formatCommunityDate } from '@/lib/community/post-kind';
import { Button } from '@/components/ui/button';
import { ReportDialog } from './report-dialog';

export function CommentList({
  comments,
  onDelete,
  onReport,
  renderReplies,
}: {
  comments: CommunityComment[];
  onDelete: (id: string) => void;
  onReport: (input: ReportInput) => Promise<void>;
  renderReplies?: (comment: CommunityComment) => ReactNode;
}) {
  if (!comments.length)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        첫 댓글을 남겨 보세요.
      </p>
    );
  return (
    <div className="divide-y">
      {comments.map((comment) => (
        <article key={comment.id} className="py-4">
          {!comment.unavailable && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-sm font-semibold">{comment.authorName}</p>
                <time
                  dateTime={comment.createdAt}
                  className="text-xs text-muted-foreground"
                >
                  {formatCommunityDate(comment.createdAt)}
                </time>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1">
                {comment.canDelete && (
                  <Button
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => onDelete(comment.id)}
                  >
                    삭제
                  </Button>
                )}
                <ReportDialog
                  targetType="comment"
                  targetId={comment.id}
                  onSubmit={onReport}
                />
              </div>
            </div>
          )}
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6">
            {comment.unavailable
              ? '삭제·숨김 처리된 댓글입니다.'
              : comment.body}
          </p>
          {renderReplies?.(comment)}
        </article>
      ))}
    </div>
  );
}
