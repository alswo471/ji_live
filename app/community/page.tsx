'use client';

import { useRef } from 'react';
import { MessagesSquare } from 'lucide-react';
import { CommunityFeed } from '@/components/community/community-feed';
import { PostForm } from '@/components/community/post-form';
import {
  TurnstileChallenge,
  type TurnstileChallengeHandle,
} from '@/components/community/turnstile-challenge';
import { SiteHeader } from '@/components/site/site-header';
import { SiteFooter } from '@/components/site/site-footer';
import { useCommunityPosts } from '@/hooks/use-community-posts';
import { useCommunitySession } from '@/hooks/use-community-session';
import { communityWrite } from '@/lib/community/browser-api';

export default function CommunityPage() {
  const posts = useCommunityPosts();
  const session = useCommunitySession();
  const challengeRef = useRef<TurnstileChallengeHandle>(null);
  const enabled = process.env.NEXT_PUBLIC_COMMUNITY_ENABLED === 'true';

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,var(--brand-soft),transparent_32%)] opacity-60" />
      <div className="relative mx-auto min-h-screen w-full max-w-[1440px] border-x bg-background/80">
        <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-xl">
          <SiteHeader current="community" />
        </header>
        <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
          <section className="mb-8">
            <p className="flex items-center gap-2 text-xs font-bold tracking-[.16em] text-primary">
              <MessagesSquare aria-hidden="true" className="size-4" /> MARKET
              COMMUNITY
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-.05em] sm:text-5xl">
              시장을 같이 읽는 곳
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              시장 정보와 의견을 익명으로 나누세요. 개인정보·불법 콘텐츠·금전
              요구는 금지됩니다.
            </p>
          </section>
          {!enabled ? (
            <div className="rounded-2xl border bg-card px-6 py-16 text-center">
              <h2 className="font-bold">커뮤니티를 준비하고 있습니다.</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                안전 검증을 마친 후 공개합니다.
              </p>
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
              <section aria-label="최신 게시글">
                <CommunityFeed
                  state={posts.state}
                  items={posts.items}
                  hasMore={posts.hasMore}
                  loadingMore={posts.loadingMore}
                  onLoadMore={() => void posts.loadMore()}
                />
              </section>
              <aside className="lg:sticky lg:top-24">
                <PostForm
                  onSubmit={async (input) => {
                    if (!challengeRef.current)
                      throw new Error('challenge unavailable');
                    await communityWrite(
                      '/api/community/posts',
                      'POST',
                      input,
                      session,
                      challengeRef.current,
                    );
                    await posts.reload();
                  }}
                />
                <div className="mt-3 rounded-2xl border bg-card p-4">
                  <TurnstileChallenge ref={challengeRef} />
                  {session.error && (
                    <p role="alert" className="text-sm text-destructive">
                      {session.error}
                    </p>
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}
