'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { useRouter } from 'vinext/shims/navigation';
import { PostForm } from '@/components/community/post-form';
import {
  TurnstileChallenge,
  type TurnstileChallengeHandle,
} from '@/components/community/turnstile-challenge';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { useCommunitySession } from '@/hooks/use-community-session';
import { communityWrite } from '@/lib/community/browser-api';
import { useCommunityPostKindPermission } from '@/hooks/use-community-post-kind-permission';

function CommunityWriteForm() {
  const router = useRouter();
  const session = useCommunitySession();
  const permission = useCommunityPostKindPermission(session.accessToken);
  const challengeRef = useRef<TurnstileChallengeHandle>(null);

  return (
    <div className="mt-4 space-y-4">
      <p className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-950 dark:text-amber-100">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        페이지를 떠나면 작성 중인 내용이 사라집니다.
      </p>
      <PostForm
        canManageKind={permission.canManage}
        onSubmit={async (input) => {
          if (!challengeRef.current) throw new Error();
          const result =
            input.kind !== undefined
              ? await permission.write(
                  '/api/admin/community/posts',
                  'POST',
                  input,
                  session.getAccessToken,
                )
              : await communityWrite(
                  '/api/community/posts',
                  'POST',
                  input,
                  session,
                  challengeRef.current,
                );
          if (
            !result ||
            typeof result !== 'object' ||
            typeof (result as { id?: unknown }).id !== 'string'
          )
            throw new Error();
          router.push(`/community/${(result as { id: string }).id}`);
        }}
      />
      {permission.status === 'unavailable' && (
        <output className="block text-sm text-muted-foreground">
          공지·필독 작성 연결을 확인하지 못했습니다. 일반 글은 작성할 수
          있습니다.
        </output>
      )}
      <div className="rounded-2xl border bg-card p-4">
        <TurnstileChallenge ref={challengeRef} />
        {session.error ? (
          <p role="alert" className="text-sm text-destructive">
            {session.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function CommunityWritePage() {
  const enabled = process.env.NEXT_PUBLIC_COMMUNITY_ENABLED === 'true';

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto min-h-screen w-full max-w-[1440px] border-x bg-background">
        <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-xl">
          <SiteHeader current="community" />
        </header>
        <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
          <Link
            href="/community"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-bold text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowLeft aria-hidden="true" /> 작성 취소
          </Link>
          {!enabled ? (
            <p className="mt-8 rounded-2xl border bg-card px-6 py-16 text-center">
              커뮤니티를 준비하고 있습니다.
            </p>
          ) : (
            <CommunityWriteForm />
          )}
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}
