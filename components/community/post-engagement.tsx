'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  TurnstileChallenge,
  type TurnstileChallengeHandle,
} from '@/components/community/turnstile-challenge';
import { useCommunitySession } from '@/hooks/use-community-session';
import { communityWrite } from '@/lib/community/browser-api';
import type { CommunityEngagement } from '@/lib/community/types';

function isCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseEngagement(value: unknown): CommunityEngagement {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error();
  const result = value as Record<string, unknown>;
  if (
    !isCounter(result.viewCount) ||
    !isCounter(result.recommendationCount) ||
    typeof result.recommended !== 'boolean' ||
    typeof result.canRecommend !== 'boolean'
  ) {
    throw new Error();
  }
  return result as unknown as CommunityEngagement;
}

export function PostEngagement({
  postId,
  initialViewCount,
  initialRecommendationCount,
}: {
  postId: string;
  initialViewCount: number | null;
  initialRecommendationCount: number | null;
}) {
  const session = useCommunitySession();
  const sessionRef = useRef(session);
  const accessTokenRef = useRef(session.accessToken);
  const challengeRef = useRef<TurnstileChallengeHandle>(null);
  const viewedPostRef = useRef<string | null>(null);
  const [engagement, setEngagement] = useState<CommunityEngagement | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [viewError, setViewError] = useState(false);
  const [recommendError, setRecommendError] = useState(false);
  const [recommendPending, setRecommendPending] = useState(false);

  useEffect(() => {
    sessionRef.current = session;
    accessTokenRef.current = session.accessToken;
  }, [session]);

  const recordView = useCallback(async () => {
    if (viewedPostRef.current === postId || !challengeRef.current) return;
    viewedPostRef.current = postId;
    setViewError(false);
    try {
      setEngagement(
        parseEngagement(
          await communityWrite(
            `/api/community/posts/${postId}/engagement`,
            'POST',
            { action: 'view' },
            sessionRef.current,
            challengeRef.current,
          ),
        ),
      );
    } catch {
      setViewError(true);
    }
  }, [postId]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch(
        `/api/community/posts/${postId}/engagement`,
        {
          headers: accessTokenRef.current
            ? { authorization: `Bearer ${accessTokenRef.current}` }
            : undefined,
          cache: 'no-store',
        },
      );
      if (!response.ok) throw new Error();
      setEngagement(parseEngagement(await response.json()));
      await recordView();
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [postId, recordView]);

  useEffect(() => {
    viewedPostRef.current = null;
    queueMicrotask(() => void load());
  }, [load, postId]);

  async function recommend() {
    if (!engagement?.canRecommend || recommendPending || !challengeRef.current)
      return;
    const desired = !engagement.recommended;
    setRecommendPending(true);
    setRecommendError(false);
    try {
      setEngagement(
        parseEngagement(
          await communityWrite(
            `/api/community/posts/${postId}/engagement`,
            'POST',
            { action: 'recommend', recommended: desired },
            sessionRef.current,
            challengeRef.current,
          ),
        ),
      );
    } catch {
      setRecommendError(true);
    } finally {
      setRecommendPending(false);
    }
  }

  const viewCount = engagement?.viewCount ?? initialViewCount;
  const recommendationCount =
    engagement?.recommendationCount ?? initialRecommendationCount;

  return (
    <section aria-label="게시글 집계" className="mt-5 border-t pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm tabular-nums text-muted-foreground">
          조회 {viewCount ?? '—'}
        </span>
        <Button
          type="button"
          variant={engagement?.recommended ? 'default' : 'outline'}
          className="min-h-11 min-w-28"
          aria-pressed={engagement?.recommended ?? false}
          aria-busy={recommendPending}
          disabled={!engagement?.canRecommend || recommendPending}
          onClick={() => void recommend()}
        >
          <ThumbsUp aria-hidden="true" />
          {engagement?.recommended ? '추천 취소' : '추천'}{' '}
          {recommendationCount ?? '—'}
        </Button>
      </div>
      {loading ? (
        <p className="mt-2 text-xs text-muted-foreground">
          집계 정보를 불러오는 중…
        </p>
      ) : null}
      {loadError ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-destructive">
          <p role="alert">추천 수를 불러오지 못했습니다.</p>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => void load()}
          >
            집계 다시 불러오기
          </Button>
        </div>
      ) : null}
      {viewError ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <p>조회를 반영하지 못했습니다.</p>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => {
              viewedPostRef.current = null;
              void recordView();
            }}
          >
            조회 다시 반영하기
          </Button>
        </div>
      ) : null}
      {recommendError ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          추천을 반영하지 못했습니다. 다시 시도해 주세요.
        </p>
      ) : null}
      <TurnstileChallenge ref={challengeRef} />
    </section>
  );
}
