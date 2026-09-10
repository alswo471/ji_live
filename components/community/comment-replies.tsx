'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type {
  CommentInput,
  CommentPage,
  CommunityComment,
  ReportInput,
} from '@/lib/community/types';
import { CommentForm } from './comment-form';
import { CommentList } from './comment-list';

interface CommentRepliesProps {
  isAdmin?: boolean;
  comment: CommunityComment;
  accessToken?: string | null;
  refreshVersion?: number;
  onSubmit: (input: CommentInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReport: (input: ReportInput) => Promise<void>;
}

export function CommentReplies(props: CommentRepliesProps) {
  // Remount only when the thread or actor changes, so another actor never inherits old ownership UI/drafts.
  return (
    <ReplyThread
      key={`${props.comment.postId}:${props.comment.id}:${props.accessToken ?? ''}`}
      {...props}
    />
  );
}

function ReplyThread({
  comment,
  accessToken,
  refreshVersion = 0,
  onSubmit,
  onDelete,
  onReport,
  isAdmin = false,
}: CommentRepliesProps) {
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [items, setItems] = useState<CommunityComment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const pendingRef = useRef(false);
  const regionId = useId();
  const invalidate = useCallback(() => {
    ++requestRef.current;
    pendingRef.current = false;
  }, []);

  const load = useCallback(
    async (nextCursor: string | null = null) => {
      if (nextCursor && pendingRef.current) return;
      const request = ++requestRef.current;
      pendingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ parentCommentId: comment.id });
        if (nextCursor) query.set('cursor', nextCursor);
        const response = await fetch(
          `/api/community/posts/${comment.postId}/comments?${query}`,
          {
            headers: accessToken
              ? { authorization: `Bearer ${accessToken}` }
              : undefined,
            cache: 'no-store',
          },
        );
        if (!response.ok) throw new Error();
        const page = (await response.json()) as CommentPage;
        if (page.repliesEnabled !== true) throw new Error();
        if (request !== requestRef.current) return;
        setItems((current) =>
          nextCursor
            ? [
                ...current,
                ...page.items.filter(
                  (item) =>
                    !current.some((existing) => existing.id === item.id),
                ),
              ]
            : page.items,
        );
        setCursor(page.nextCursor);
      } catch {
        if (request === requestRef.current)
          setError('답글을 불러오지 못했습니다. 다시 시도해 주세요.');
      } finally {
        if (request === requestRef.current) {
          pendingRef.current = false;
          setLoading(false);
        }
      }
    },
    [accessToken, comment.id, comment.postId],
  );

  useEffect(() => {
    let active = true;
    if (open)
      queueMicrotask(() => {
        if (active) void load();
      });
    return () => {
      active = false;
      invalidate();
    };
  }, [open, refreshVersion, load, invalidate]);

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1">
        {!comment.unavailable && (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            aria-expanded={open && composing}
            aria-controls={regionId}
            onClick={() => {
              setOpen(true);
              setComposing(true);
            }}
          >
            답글 쓰기
          </Button>
        )}
        {((comment.replyCount ?? 0) > 0 || open) && (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 text-muted-foreground"
            aria-expanded={open}
            aria-controls={regionId}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? '답글 접기' : `답글 ${comment.replyCount}개 보기`}
          </Button>
        )}
      </div>
      {open && (
        <div id={regionId} className="ml-3 border-l-2 pl-4 sm:ml-5">
          {items.length > 0 && (
            <CommentList
              comments={items}
              onDelete={(id) => void onDelete(id)}
              onReport={onReport}
              isAdmin={isAdmin}
            />
          )}
          {loading && (
            <output className="block py-2 text-sm text-muted-foreground">
              답글 불러오는 중…
            </output>
          )}
          {error && (
            <p role="alert" className="py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {cursor ? (
            <Button
              type="button"
              variant="outline"
              className="my-2 min-h-11"
              disabled={loading}
              onClick={() => void load(cursor)}
            >
              답글 더 보기
            </Button>
          ) : (
            error && (
              <Button
                type="button"
                variant="outline"
                className="my-2 min-h-11"
                disabled={loading}
                onClick={() => void load()}
              >
                답글 다시 불러오기
              </Button>
            )
          )}
          {composing && !comment.unavailable && (
            <div className="py-3">
              <CommentForm
                label="답글"
                submitLabel="답글 올리기"
                onSubmit={(input) =>
                  onSubmit({ ...input, parentCommentId: comment.id })
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
