'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Ban, CheckCircle2, Eye, EyeOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type {
  ModerationAction,
  ModerationQueueItem,
} from '@/lib/community/moderation-service';

const REASON_LABELS = {
  privacy: '개인정보 노출',
  illegal: '불법 콘텐츠',
  copyright: '저작권 침해',
  harassment: '욕설·혐오·괴롭힘',
  spam: '도배·광고',
  financial_solicitation: '투자 유도·금전 요구',
  other: '기타',
} as const;

const STATUS_LABELS = {
  visible: '공개',
  hidden: '숨김',
  deleted: '삭제 대기',
} as const;

function ModerationCard({
  item,
  onAction,
}: {
  item: ModerationQueueItem;
  onAction: (action: ModerationAction) => Promise<void>;
}) {
  const fieldId = useId();
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  const confirmationTitleId = `${fieldId}-confirmation-title`;
  const confirmationDescriptionId = `${fieldId}-confirmation-description`;
  const restrictionId = `${fieldId}-restriction`;
  const [reason, setReason] = useState('');
  const [restrictionDays, setRestrictionDays] = useState('1');
  const [confirmation, setConfirmation] = useState<
    'delete' | 'restrict' | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const confirmationButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmation) confirmationButtonRef.current?.focus();
  }, [confirmation]);

  async function execute(action: ModerationAction) {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await onAction(action);
      setSuccess('관리 조치를 반영했습니다.');
      setConfirmation(null);
    } catch {
      setError('관리 조치를 반영하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  function prepare(type: 'hide' | 'restore' | 'delete' | 'restrict') {
    const normalizedReason = reason.trim();
    if (Array.from(normalizedReason).length < 5) {
      setError('관리 사유를 5자 이상 입력해 주세요.');
      return;
    }
    setError(null);
    if (type === 'delete' || type === 'restrict') {
      setConfirmation(type);
      return;
    }
    void execute({
      type,
      targetType: item.targetType,
      targetId: item.targetId,
      reason: normalizedReason,
    });
  }

  function confirmAction() {
    const normalizedReason = reason.trim();
    if (confirmation === 'delete') {
      void execute({
        type: 'delete',
        targetType: item.targetType,
        targetId: item.targetId,
        reason: normalizedReason,
      });
    } else if (confirmation === 'restrict') {
      const until = new Date(
        Date.now() + Number(restrictionDays) * 24 * 60 * 60 * 1000,
      ).toISOString();
      void execute({
        type: 'restrict',
        targetType: item.targetType,
        targetId: item.targetId,
        until,
        reason: normalizedReason,
      });
    }
  }

  return (
    <article className="min-w-0 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-destructive">
            {REASON_LABELS[item.reason]}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
            {item.targetType === 'post' ? '게시글' : '댓글'} ·{' '}
            {STATUS_LABELS[item.targetStatus]}
          </span>
        </div>
        <time
          dateTime={item.createdAt}
          className="text-xs text-muted-foreground"
        >
          {new Intl.DateTimeFormat('ko-KR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date(item.createdAt))}
        </time>
      </div>
      {item.targetTitle && (
        <h2 className="mt-4 break-words text-lg font-bold tracking-tight">
          {item.targetTitle}
        </h2>
      )}
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
        {item.targetBody}
      </p>
      {item.detail && (
        <div className="mt-4 rounded-xl bg-muted/70 p-3 text-sm">
          <p className="text-xs font-bold text-muted-foreground">신고 내용</p>
          <p className="mt-1 break-words leading-6">{item.detail}</p>
        </div>
      )}

      <div className="mt-5">
        <label htmlFor={fieldId} className="text-sm font-semibold">
          관리 사유
        </label>
        <Textarea
          id={fieldId}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={`${helpId}${error ? ` ${errorId}` : ''}`}
          className="mt-2 min-h-20"
        />
        <p id={helpId} className="mt-1 text-xs text-muted-foreground">
          5~500자 · 모든 조치는 audit log에 기록됩니다.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {item.targetStatus === 'hidden' ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={submitting}
            onClick={() => prepare('restore')}
          >
            <Eye aria-hidden="true" /> 복구
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={submitting}
            onClick={() => prepare('hide')}
          >
            <EyeOff aria-hidden="true" /> 숨김
          </Button>
        )}
        <Button
          type="button"
          variant="destructive"
          className="min-h-11"
          disabled={submitting}
          onClick={() => prepare('delete')}
        >
          <Trash2 aria-hidden="true" /> 삭제 대기
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={submitting}
          onClick={() => prepare('restrict')}
        >
          <Ban aria-hidden="true" /> 작성 제한
        </Button>
      </div>

      {confirmation && (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-labelledby={confirmationTitleId}
          aria-describedby={
            confirmation === 'delete' ? confirmationDescriptionId : undefined
          }
          className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <p id={confirmationTitleId} className="font-bold">
            {confirmation === 'delete'
              ? '이 콘텐츠를 삭제 대기로 전환할까요?'
              : '이 사용자의 작성을 제한할까요?'}
          </p>
          {confirmation === 'delete' && (
            <p
              id={confirmationDescriptionId}
              className="mt-2 text-sm leading-6 text-muted-foreground"
            >
              삭제 후 1년 동안 복구할 수 있으며 이후 영구 파기됩니다.
            </p>
          )}
          {confirmation === 'restrict' && (
            <div className="mt-3">
              <label htmlFor={restrictionId} className="text-sm font-semibold">
                제한 기간
              </label>
              <select
                id={restrictionId}
                value={restrictionDays}
                onChange={(event) => setRestrictionDays(event.target.value)}
                className="ml-3 min-h-11 rounded-lg border bg-background px-3 text-sm"
              >
                <option value="1">24시간</option>
                <option value="7">7일</option>
                <option value="30">30일</option>
              </select>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              ref={confirmationButtonRef}
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={submitting}
              onClick={confirmAction}
            >
              {confirmation === 'delete' ? '삭제 대기 확정' : '제한 확정'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={submitting}
              onClick={() => setConfirmation(null)}
            >
              취소
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p id={errorId} role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary">
          <CheckCircle2 aria-hidden="true" className="size-4" /> {success}
        </p>
      )}
    </article>
  );
}

export function ModerationQueue({
  items,
  loading,
  onAction,
  onLoadMore,
}: {
  items: ModerationQueueItem[];
  loading: boolean;
  onAction: (action: ModerationAction) => Promise<void>;
  onLoadMore?: () => void;
}) {
  if (loading && items.length === 0) {
    return (
      <div className="rounded-2xl border bg-card px-5 py-16 text-center text-sm text-muted-foreground">
        신고 목록을 불러오고 있습니다…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border bg-card px-5 py-16 text-center text-sm text-muted-foreground">
        검토할 신고가 없습니다.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <ModerationCard key={item.id} item={item} onAction={onAction} />
      ))}
      {onLoadMore && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          disabled={loading}
          onClick={onLoadMore}
        >
          {loading ? '불러오는 중…' : '신고 더 보기'}
        </Button>
      )}
    </div>
  );
}
