'use client';

import Link from 'next/link';
import { PenLine, ShieldCheck } from 'lucide-react';
import { CommunityFeed } from '@/components/community/community-feed';
import { SiteHeader } from '@/components/site/site-header';
import { SiteFooter } from '@/components/site/site-footer';
import { useCommunityPosts } from '@/hooks/use-community-posts';

export default function CommunityPage() {
  const posts = useCommunityPosts();
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
            <div>
              <section aria-label="최신 게시글">
                <CommunityFeed
                  state={posts.state}
                  items={posts.items}
                  hasMore={posts.hasMore}
                  loadingMore={posts.loadingMore}
                  onLoadMore={() => void posts.loadMore()}
                />
              </section>
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
