import Link from 'next/link';
import { ExternalLink, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CommunityPostSummary } from '@/lib/community/types';

type FeedState = 'loading' | 'ready' | 'empty' | 'error';

export function CommunityFeed({
  state,
  items,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  state: FeedState;
  items: CommunityPostSummary[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (state !== 'ready') {
    const messages = {
      loading: '게시글을 불러오고 있습니다…',
      empty: '아직 게시글이 없습니다.',
      error: '게시글을 불러오지 못했습니다.',
    } as const;
    return (
      <div className="rounded-2xl border bg-card px-5 py-16 text-center text-sm text-muted-foreground">
        {messages[state]}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-3 text-xs font-semibold text-muted-foreground">
        <span>게시글</span>
        <span>최신순</span>
      </div>
      {items.map((post) => (
        <article
          key={post.id}
          className="border-b p-5 transition-colors last:border-b-0 hover:bg-muted/30"
        >
          <Link
            href={`/community/${post.id}`}
            className="block min-h-11 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <h3 className="break-words text-base font-semibold tracking-tight">
              {post.title}
            </h3>
            <p className="mt-1 line-clamp-1 break-all text-sm leading-6 text-muted-foreground">
              {post.excerpt}
            </p>
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span>{post.authorName}</span>
            <time dateTime={post.createdAt}>
              {new Intl.DateTimeFormat('ko-KR', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(post.createdAt))}
            </time>
            <span className="inline-flex items-center gap-1">
              <MessageCircle aria-hidden="true" className="size-3.5" />
              댓글 {post.commentCount}
            </span>
            {post.linkUrl && (
              <span className="inline-flex min-w-0 items-center gap-1 break-all">
                <ExternalLink aria-hidden="true" className="size-3.5" />
                {new URL(post.linkUrl).hostname}
              </span>
            )}
          </div>
        </article>
      ))}
      {hasMore && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full rounded-none border-0"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? '불러오는 중…' : '게시글 더 보기'}
        </Button>
      )}
    </div>
  );
}
