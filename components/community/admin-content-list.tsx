'use client';

import { useId, useState } from 'react';
import {
  AlertTriangle,
  Eye,
  EyeOff,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { AdminContentItem } from '@/lib/community/admin-console-service';
import type { ModerationAction } from '@/lib/community/moderation-service';

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDate(value: string | null) {
  if (!value) return '시각 정보 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '시각 확인 불가';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function remainingDays(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.ceil((timestamp - Date.now()) / DAY_MS));
}

function ContentCard({
  item,
  onAction,
}: {
  item: AdminContentItem;
  onAction: (action: ModerationAction) => Promise<void>;
}) {
  const fieldId = useId();
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const purgeDays = item.purgeAt ? remainingDays(item.purgeAt) : null;

  async function execute(normalizedReason: string) {
    setSubmitting(true);
    setError(null);
    try {
      await onAction({
        type: 'restore',
        targetType: item.targetType,
        targetId: item.targetId,
        reason: normalizedReason,
      });
    } catch {
      setError('콘텐츠를 복구하지 못했습니다. 기존 목록은 유지됩니다.');
    } finally {
      setSubmitting(false);
    }
  }

  function requestRestore() {
    const normalizedReason = reason.trim();
    if (Array.from(normalizedReason).length < 5) {
      setError('관리 사유를 5자 이상 입력해 주세요.');
      return;
    }
    setError(null);
    if (item.status === 'deleted' && item.deletionSource === 'author') {
      setConfirming(true);
      return;
    }
    void execute(normalizedReason);
  }

  function confirmRestore() {
    const normalizedReason = reason.trim();
    setConfirming(false);
    void execute(normalizedReason);
  }

  return (
    <article className="grid min-w-0 gap-5 rounded-2xl border bg-card p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
            {item.status === 'hidden' ? (
              <EyeOff aria-hidden="true" className="size-3.5" />
            ) : (
              <Trash2 aria-hidden="true" className="size-3.5" />
            )}
            {item.status === 'hidden' ? '숨김' : '삭제 대기'}
          </span>
          <span className="rounded-full border px-2.5 py-1 text-foreground">
            {item.targetType === 'post' ? '게시글' : '댓글'}
          </span>
          {item.deletionSource && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-destructive">
              {item.deletionSource === 'author' ? (
                <UserRound aria-hidden="true" className="size-3.5" />
              ) : (
                <ShieldCheck aria-hidden="true" className="size-3.5" />
              )}
              {item.deletionSource === 'author' ? '사용자 삭제' : '관리자 삭제'}
            </span>
          )}
        </div>

        {item.title && (
          <h2 className="mt-4 break-words text-lg font-bold tracking-tight">
            {item.title}
          </h2>
        )}
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
          {item.body}
        </p>
        <dl className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-foreground">작성자</dt>
            <dd className="mt-1 break-words">
              {item.authorName} · {item.actorLabel}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">
              {item.status === 'deleted' ? '삭제 시각' : '작성 시각'}
            </dt>
            <dd className="mt-1">
              {formatDate(
                item.status === 'deleted' ? item.deletedAt : item.createdAt,
              )}
            </dd>
          </div>
        </dl>
        {item.purgeAt && (
          <p className="mt-4 inline-flex flex-wrap items-center gap-1.5 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive">
            <AlertTriangle aria-hidden="true" className="size-4" />
            영구 파기 예정 {formatDate(item.purgeAt)}
            {purgeDays !== null && ` · 영구 파기까지 ${purgeDays}일 남음`}
          </p>
        )}
      </div>

      <div className="min-w-0 rounded-xl border bg-background/60 p-4 lg:self-start">
        <label htmlFor={fieldId} className="text-sm font-semibold">
          관리 사유
        </label>
        <Textarea
          id={fieldId}
          value={reason}
          maxLength={500}
          disabled={submitting}
          aria-invalid={Boolean(error)}
          aria-describedby={`${helpId}${error ? ` ${errorId}` : ''}`}
          onChange={(event) => setReason(event.target.value)}
          className="mt-2 min-h-24"
        />
        <p id={helpId} className="mt-1 text-xs text-muted-foreground">
          5~500자 · 복구 조치는 운영 로그에 기록됩니다.
        </p>
        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <Button
          type="button"
          className="mt-4 min-h-11 w-full"
          disabled={submitting}
          onClick={requestRestore}
        >
          <Eye aria-hidden="true" />
          {submitting ? '복구 중…' : '복구'}
        </Button>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>작성자 삭제 콘텐츠 복구</AlertDialogTitle>
            <AlertDialogDescription>
              작성자가 직접 삭제한 콘텐츠이며 복구하면 커뮤니티에 다시
              공개됩니다. 작성자 의사와 운영 필요성을 확인한 경우에만
              진행하세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>취소</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={submitting}
              onClick={confirmRestore}
            >
              복구 확정
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}

export function AdminContentList({
  items,
  loading = false,
  onAction,
  onLoadMore,
}: {
  items: AdminContentItem[];
  loading?: boolean;
  onAction: (action: ModerationAction) => Promise<void>;
  onLoadMore?: () => void;
}) {
  if (loading && items.length === 0) {
    return (
      <div className="rounded-2xl border bg-card px-5 py-16 text-center text-sm text-muted-foreground">
        콘텐츠 목록을 불러오고 있습니다…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border bg-card px-5 py-16 text-center text-sm text-muted-foreground">
        조건에 맞는 콘텐츠가 없습니다.
      </div>
    );
  }
  return (
    <div className="min-w-0 space-y-4" aria-busy={loading}>
      {items.map((item) => (
        <ContentCard
          key={`${item.targetType}:${item.targetId}`}
          item={item}
          onAction={onAction}
        />
      ))}
      {onLoadMore && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          disabled={loading}
          onClick={onLoadMore}
        >
          {loading ? '불러오는 중…' : '콘텐츠 더 보기'}
        </Button>
      )}
    </div>
  );
}
