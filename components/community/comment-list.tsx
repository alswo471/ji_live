import type { CommunityComment } from '@/lib/community/types';
import { Button } from '@/components/ui/button';

export function CommentList({
  comments,
  onDelete,
}: {
  comments: CommunityComment[];
  onDelete: (id: string) => void;
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
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{comment.authorName}</p>
            {comment.canDelete && (
              <Button
                variant="ghost"
                className="min-h-11"
                onClick={() => onDelete(comment.id)}
              >
                삭제
              </Button>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6">
            {comment.body}
          </p>
        </article>
      ))}
    </div>
  );
}
