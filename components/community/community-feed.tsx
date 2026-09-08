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
      <div className="hidden grid-cols-[minmax(0,1fr)_10rem_8rem_4rem_4rem] items-center gap-4 border-b bg-muted/40 px-5 py-3 text-center text-xs font-semibold text-muted-foreground md:grid">
        <span className="text-left">제목</span>
        <span>작성자</span>
        <span>작성일</span>
        <span>조회</span>
        <span>추천</span>
      </div>
      {items.map((post) => (
        <article
          key={post.id}
          className="grid gap-2 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/30 sm:px-5 md:grid-cols-[minmax(0,1fr)_10rem_8rem_4rem_4rem] md:items-center md:gap-4"
        >
          <Link
            href={`/community/${post.id}`}
            className="block min-h-11 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <h3 className="break-all text-base font-semibold tracking-tight">
              {post.title}
              <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium tabular-nums text-primary">
                <MessageCircle aria-hidden="true" className="size-3.5" />
                <span className="sr-only">댓글 </span>
                {post.commentCount}
              </span>
            </h3>
            <p className="mt-1 line-clamp-1 break-all text-xs leading-5 text-muted-foreground">
              {post.excerpt}
            </p>
            {post.linkUrl ? (
              <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ExternalLink aria-hidden="true" className="size-3.5" />
                {new URL(post.linkUrl).hostname}
              </span>
            ) : null}
          </Link>
          <div className="grid grid-cols-2 items-center gap-x-4 gap-y-2 text-xs text-muted-foreground md:contents md:text-center">
            <span className="truncate md:block">{post.authorName}</span>
            <time
              className="text-right md:text-center"
              dateTime={post.createdAt}
            >
              {new Intl.DateTimeFormat('ko-KR', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(post.createdAt))}
            </time>
            <span>
              <span className="md:hidden">조회 </span>
              <span className="tabular-nums">{post.viewCount ?? '—'}</span>
            </span>
            <span className="text-right md:text-center">
              <span className="md:hidden">추천 </span>
              <span className="tabular-nums">
                {post.recommendationCount ?? '—'}
              </span>
            </span>
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
