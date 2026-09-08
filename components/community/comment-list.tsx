import type { CommunityComment, ReportInput } from '@/lib/community/types';
import { Button } from '@/components/ui/button';
import { ReportDialog } from './report-dialog';

export function CommentList({
  comments,
  onDelete,
  onReport,
}: {
  comments: CommunityComment[];
  onDelete: (id: string) => void;
  onReport: (input: ReportInput) => Promise<void>;
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold">{comment.authorName}</p>
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
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6">
            {comment.body}
          </p>
        </article>
      ))}
    </div>
  );
}
