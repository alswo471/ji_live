'use client';

import { useId, useState } from 'react';
import { Ban, CircleOff, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { AdminSanctionItem } from '@/lib/community/admin-console-service';
import type { ModerationAction } from '@/lib/community/moderation-service';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '시각 확인 불가';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function SanctionCard({
  item,
  onAction,
}: {
  item: AdminSanctionItem;
  onAction: (action: ModerationAction) => Promise<void>;
}) {
  const fieldId = useId();
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function release() {
    const normalizedReason = reason.trim();
    if (Array.from(normalizedReason).length < 5) {
      setError('제재 해제 사유를 5자 이상 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onAction({
        type: 'unrestrict',
        sanctionId: item.sanctionId,
        reason: normalizedReason,
      });
    } catch {
      setError('제재를 해제하지 못했습니다. 기존 목록은 유지됩니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="grid min-w-0 gap-5 rounded-2xl border bg-card p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
              item.state === 'active'
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {item.state === 'active' ? (
              <ShieldCheck aria-hidden="true" className="size-3.5" />
            ) : (
              <CircleOff aria-hidden="true" className="size-3.5" />
            )}
            {item.state === 'active' ? '활성' : '종료'}
          </span>
          <span className="text-sm font-bold">{item.actorLabel}</span>
        </div>
        <div className="mt-4 rounded-xl bg-muted/60 p-4">
          <p className="text-xs font-semibold text-muted-foreground">
            제한 사유
          </p>
          <p className="mt-1 break-words text-sm leading-6">{item.reason}</p>
        </div>
        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-muted-foreground">시작 시각</dt>
            <dd className="mt-1 font-medium">{formatDate(item.startsAt)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-muted-foreground">종료 시각</dt>
            <dd className="mt-1 font-medium">{formatDate(item.endsAt)}</dd>
          </div>
        </dl>
        {item.revokedAt && (
          <p className="mt-3 text-xs text-muted-foreground">
            운영자 해제 시각 {formatDate(item.revokedAt)}
          </p>
        )}
      </div>

      {item.state === 'active' && (
        <div className="min-w-0 rounded-xl border bg-background/60 p-4 lg:self-start">
          <label htmlFor={fieldId} className="text-sm font-semibold">
            제재 해제 사유
          </label>
          <Textarea
            id={fieldId}
            maxLength={500}
            value={reason}
            disabled={submitting}
            aria-invalid={Boolean(error)}
            aria-describedby={`${helpId}${error ? ` ${errorId}` : ''}`}
            onChange={(event) => setReason(event.target.value)}
            className="mt-2 min-h-24"
          />
          <p id={helpId} className="mt-1 text-xs text-muted-foreground">
            5~500자 · 해제 조치는 운영 로그에 기록됩니다.
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
            variant="outline"
            className="mt-4 min-h-11 w-full"
            disabled={submitting}
            onClick={() => void release()}
          >
            <Ban aria-hidden="true" />
            {submitting ? '해제 중…' : '제재 해제'}
          </Button>
        </div>
      )}
    </article>
  );
}

export function AdminSanctionList({
  items,
  loading = false,
  onAction,
  onLoadMore,
}: {
  items: AdminSanctionItem[];
  loading?: boolean;
  onAction: (action: ModerationAction) => Promise<void>;
  onLoadMore?: () => void;
}) {
  if (loading && items.length === 0) {
    return (
      <div className="rounded-2xl border bg-card px-5 py-16 text-center text-sm text-muted-foreground">
        제재 목록을 불러오고 있습니다…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border bg-card px-5 py-16 text-center text-sm text-muted-foreground">
        조건에 맞는 제재가 없습니다.
      </div>
    );
  }
  return (
    <div className="min-w-0 space-y-4" aria-busy={loading}>
      {items.map((item) => (
        <SanctionCard key={item.sanctionId} item={item} onAction={onAction} />
      ))}
      {onLoadMore && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          disabled={loading}
          onClick={onLoadMore}
        >
          {loading ? '불러오는 중…' : '제재 더 보기'}
        </Button>
      )}
    </div>
  );
}
