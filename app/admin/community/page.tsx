'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { AdminLogin } from '@/components/community/admin-login';
import { ModerationQueue } from '@/components/community/moderation-queue';
import {
  TurnstileChallenge,
  type TurnstileChallengeHandle,
} from '@/components/community/turnstile-challenge';
import { SiteHeader } from '@/components/site/site-header';
import { Button } from '@/components/ui/button';
import { getBrowserSupabase } from '@/lib/community/supabase';
import type {
  ModerationAction,
  ModerationPage,
  ModerationQueueItem,
} from '@/lib/community/moderation-service';

export default function CommunityAdminPage() {
  const enabled = process.env.NEXT_PUBLIC_COMMUNITY_ENABLED === 'true';
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(enabled);
  const [items, setItems] = useState<ModerationQueueItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const challengeRef = useRef<TurnstileChallengeHandle>(null);
  const loadRequestRef = useRef(0);
  const loadedSessionTokenRef = useRef<string | null>(null);

  const load = useCallback(
    async (token: string, cursor: string | null = null) => {
      const requestId = ++loadRequestRef.current;
      setLoading(true);
      setError(null);
      try {
        const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
        const response = await fetch(`/api/admin/community/reports${query}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('moderation load failed');
        const page = (await response.json()) as ModerationPage;
        if (requestId !== loadRequestRef.current) return;
        setItems((current) =>
          cursor ? [...current, ...page.items] : page.items,
        );
        setNextCursor(page.nextCursor);
      } catch {
        if (requestId !== loadRequestRef.current) return;
        setError(
          '신고 목록을 불러오지 못했습니다. 관리자 등록 상태를 확인해 주세요.',
        );
      } finally {
        if (requestId === loadRequestRef.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    const client = getBrowserSupabase();
    const handleSession = (
      session: {
        access_token: string;
        user: { is_anonymous?: boolean };
      } | null,
    ) => {
      const token = session?.user.is_anonymous
        ? null
        : (session?.access_token ?? null);
      setAccessToken(token);
      setCheckingSession(false);
      if (!token) {
        loadedSessionTokenRef.current = null;
        return;
      }
      if (loadedSessionTokenRef.current === token) return;
      loadedSessionTokenRef.current = token;
      void load(token);
    };
    void client.auth
      .getSession()
      .then(({ data }) => handleSession(data.session));
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });
    return () => data.subscription.unsubscribe();
  }, [enabled, load]);

  async function applyAction(action: ModerationAction) {
    if (!accessToken) throw new Error('admin session missing');
    const response = await fetch('/api/admin/community/actions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(action),
    });
    if (!response.ok) throw new Error('moderation action failed');
    await load(accessToken);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,var(--brand-soft),transparent_32%)] opacity-60" />
      <div className="relative mx-auto min-h-screen w-full max-w-[1440px] border-x bg-background/80">
        <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-xl">
          <SiteHeader current="community" />
        </header>
        <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
          {!enabled ? (
            <div className="rounded-2xl border bg-card px-6 py-16 text-center">
              Community 관리 기능이 비활성화되어 있습니다.
            </div>
          ) : checkingSession ? (
            <div className="rounded-2xl border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
              관리자 session을 확인하고 있습니다…
            </div>
          ) : !accessToken ? (
            <>
              <AdminLogin
                onRequestCaptcha={async () => {
                  if (!challengeRef.current)
                    throw new Error('captcha challenge unavailable');
                  return challengeRef.current.execute();
                }}
                onRequestSignInLink={async (email, captchaToken) => {
                  const { error: authError } =
                    await getBrowserSupabase().auth.signInWithOtp({
                      email,
                      options: {
                        shouldCreateUser: false,
                        captchaToken,
                        emailRedirectTo: `${window.location.origin}/admin/community`,
                      },
                    });
                  if (authError) throw new Error('sign-in link request failed');
                }}
              />
              <div className="mx-auto mt-4 max-w-md">
                <TurnstileChallenge ref={challengeRef} />
              </div>
            </>
          ) : (
            <>
              <section className="mb-8 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-xs font-bold tracking-[.16em] text-primary">
                    <ShieldCheck aria-hidden="true" className="size-4" />{' '}
                    MODERATION
                  </p>
                  <h1 className="mt-2 text-3xl font-black tracking-[-.05em] sm:text-5xl">
                    신고 검토
                  </h1>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    신고자 정보는 표시하지 않으며 모든 운영 조치는 audit log에
                    남습니다.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => void getBrowserSupabase().auth.signOut()}
                >
                  관리자 로그아웃
                </Button>
              </section>
              {error && (
                <p
                  role="alert"
                  className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
                >
                  {error}
                </p>
              )}
              <ModerationQueue
                items={items}
                loading={loading}
                onAction={applyAction}
                onLoadMore={
                  nextCursor && accessToken
                    ? () => void load(accessToken, nextCursor)
                    : undefined
                }
              />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
