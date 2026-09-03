'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { CommentForm } from '@/components/community/comment-form';
import { CommentList } from '@/components/community/comment-list';
import { ReportDialog } from '@/components/community/report-dialog';
import {
  TurnstileChallenge,
  type TurnstileChallengeHandle,
} from '@/components/community/turnstile-challenge';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { Button } from '@/components/ui/button';
import { useCommunitySession } from '@/hooks/use-community-session';
import { communityWrite } from '@/lib/community/browser-api';
import type {
  CommentInput,
  CommentPage,
  CommunityComment,
  CommunityPostDetail,
  ReportInput,
} from '@/lib/community/types';

export default function CommunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [post, setPost] = useState<CommunityPostDetail | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const session = useCommunitySession();
  const challengeRef = useRef<TurnstileChallengeHandle>(null);

  const reload = useCallback(
    async (targetId = id) => {
      if (!targetId) return;
      setState('loading');
      try {
        const headers = session.accessToken
          ? { authorization: `Bearer ${session.accessToken}` }
          : undefined;
        const [postResponse, commentResponse] = await Promise.all([
          fetch(`/api/community/posts/${targetId}`, {
            headers,
            cache: 'no-store',
          }),
          fetch(`/api/community/posts/${targetId}/comments`, {
            headers,
            cache: 'no-store',
          }),
        ]);
        if (!postResponse.ok || !commentResponse.ok) throw new Error();
        setPost((await postResponse.json()) as CommunityPostDetail);
        setComments(((await commentResponse.json()) as CommentPage).items);
        setState('ready');
      } catch {
        setState('error');
      }
    },
    [id, session.accessToken],
  );
  useEffect(() => {
    queueMicrotask(() => void reload(id));
  }, [id, reload]);

  async function write(url: string, body: CommentInput | ReportInput) {
    if (!challengeRef.current) throw new Error();
    await communityWrite(url, 'POST', body, session, challengeRef.current);
    await reload();
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,var(--brand-soft),transparent_32%)] opacity-60" />
      <div className="relative mx-auto min-h-screen w-full max-w-[1440px] border-x bg-background/80">
        <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-xl">
          <SiteHeader current="community" />
        </header>
        <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
          <Link
            href="/community"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-bold text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowLeft aria-hidden="true" /> 커뮤니티
          </Link>
          {state === 'loading' && (
            <p className="py-16 text-center text-muted-foreground">
              게시글을 불러오는 중…
            </p>
          )}
          {state === 'error' && (
            <p role="alert" className="py-16 text-center text-destructive">
              게시글을 불러오지 못했습니다.
            </p>
          )}
          {state === 'ready' && post && (
            <>
              <article className="mt-4 rounded-2xl border bg-card p-5 sm:p-7">
                <p className="text-xs text-muted-foreground">
                  {post.authorName}
                </p>
                <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                  {post.title}
                </h1>
                <p className="mt-6 whitespace-pre-wrap text-sm leading-7 sm:text-base">
                  {post.body}
                </p>
                {post.linkUrl && (
                  <a
                    href={post.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-bold text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <ExternalLink aria-hidden="true" />
                    {new URL(post.linkUrl).hostname}
                  </a>
                )}
                <div className="mt-5 flex justify-end gap-2">
                  {post.canDelete && (
                    <Button
                      variant="destructive"
                      className="min-h-11"
                      onClick={async () => {
                        if (!challengeRef.current) return;
                        await communityWrite(
                          `/api/community/posts/${id}`,
                          'DELETE',
                          null,
                          session,
                          challengeRef.current,
                        );
                        location.href = '/community';
                      }}
                    >
                      삭제
                    </Button>
                  )}
                  <ReportDialog
                    targetType="post"
                    targetId={id}
                    onSubmit={(input) => write('/api/community/reports', input)}
                  />
                </div>
              </article>
              <section className="mt-6 rounded-2xl border bg-card p-5 sm:p-7">
                <h2 className="text-lg font-black">댓글 {comments.length}</h2>
                <div className="mt-5">
                  <CommentForm
                    onSubmit={(input) =>
                      write(`/api/community/posts/${id}/comments`, input)
                    }
                  />
                  <CommentList
                    comments={comments}
                    onDelete={(commentId) => {
                      void (async () => {
                        if (!challengeRef.current) return;
                        await communityWrite(
                          `/api/community/comments/${commentId}`,
                          'DELETE',
                          null,
                          session,
                          challengeRef.current,
                        );
                        await reload();
                      })();
                    }}
                  />
                </div>
              </section>
              <div className="mt-3 rounded-2xl border bg-card p-4">
                <TurnstileChallenge ref={challengeRef} />
              </div>
            </>
          )}
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}
