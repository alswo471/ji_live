'use client';

import Link from 'next/link';
import {
  PenLine,
  ShieldCheck,
  List,
  Megaphone,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';
import { useSearchParams } from 'vinext/shims/navigation';
import { CommunityFeed } from '@/components/community/community-feed';
import { SiteHeader } from '@/components/site/site-header';
import { SiteFooter } from '@/components/site/site-footer';
import { useCommunityPosts } from '@/hooks/use-community-posts';
import {
  communityFeeds,
  isCommunityFeed,
  type CommunityFeedKind,
} from '@/lib/community/feed';

const feedIcons = { all: List, notices: Megaphone, popular: TrendingUp };

function CommunityPostList({ feed }: { feed: CommunityFeedKind }) {
  const posts = useCommunityPosts(feed);
  return (
    <section className="min-w-0 flex-1" aria-label={communityFeeds[feed].label}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{communityFeeds[feed].label}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {communityFeeds[feed].description}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void posts.reload()}
          disabled={posts.state === 'loading'}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          새로고침
        </button>
      </div>
      <CommunityFeed
        state={posts.state}
        items={posts.items}
        hasMore={posts.hasMore}
        loadingMore={posts.loadingMore}
        onLoadMore={() => void posts.loadMore()}
      />
      {posts.loadMoreError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          다음 글을 불러오지 못했습니다. 더 보기를 눌러 다시 시도해 주세요.
        </p>
      )}
    </section>
  );
}

export default function CommunityPage() {
  const search = useSearchParams();
  const requestedFeed = search.get('feed');
  const feed = isCommunityFeed(requestedFeed) ? requestedFeed : 'all';
  const enabled = process.env.NEXT_PUBLIC_COMMUNITY_ENABLED === 'true';

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto min-h-screen w-full max-w-[1440px] border-x bg-background">
        <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-xl">
          <SiteHeader current="community" />
        </header>
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          <section className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">커뮤니티</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                시장 이야기와 궁금한 점을 익명으로 나누세요.
              </p>
            </div>
            {enabled && (
              <Link
                href="/community/write"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <PenLine aria-hidden="true" className="size-4" />
                글쓰기
              </Link>
            )}
          </section>
          {!enabled ? (
            <div className="rounded-2xl border bg-card px-6 py-16 text-center">
              <h2 className="font-bold">커뮤니티를 준비하고 있습니다.</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                안전 검증을 마친 후 공개합니다.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6 lg:flex-row">
              <nav
                aria-label="커뮤니티 게시판"
                className="grid grid-cols-3 gap-1 rounded-xl border bg-card p-1 lg:flex lg:w-40 lg:shrink-0 lg:flex-col lg:self-start lg:p-2"
              >
                {(Object.keys(communityFeeds) as CommunityFeedKind[]).map(
                  (item) => {
                    const Icon = feedIcons[item];
                    return (
                      <Link
                        key={item}
                        href={
                          item === 'all'
                            ? '/community'
                            : `/community?feed=${item}`
                        }
                        aria-current={feed === item ? 'page' : undefined}
                        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring lg:justify-start ${feed === item ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                      >
                        <Icon aria-hidden="true" className="size-4 shrink-0" />
                        {communityFeeds[item].label}
                      </Link>
                    );
                  },
                )}
              </nav>
              <CommunityPostList key={feed} feed={feed} />
            </div>
          )}
          <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-primary"
              />
              <div>
                <h2 className="text-sm font-semibold">함께 지키는 커뮤니티</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  개인정보·불법 콘텐츠·금전 요구는 금지됩니다. 문제가 있는 글은
                  신고해 주세요.
                </p>
              </div>
            </div>
            <Link
              href="/legal/community-guidelines"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              운영정책 보기
            </Link>
          </section>
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}
