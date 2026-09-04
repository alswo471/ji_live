import { Ban, EyeOff, RotateCcw, Trash2, Undo2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type {
  AdminAuditAction,
  AdminAuditItem,
} from '@/lib/community/admin-console-service';

const ACTION_DETAILS: Record<
  AdminAuditAction,
  { label: string; icon: typeof EyeOff }
> = {
  hide: { label: '숨김', icon: EyeOff },
  restore: { label: '복구', icon: RotateCcw },
  delete: { label: '삭제 대기', icon: Trash2 },
  restrict: { label: '활동 제한', icon: Ban },
  unrestrict: { label: '제한 해제', icon: Undo2 },
};

const TARGET_LABELS: Record<AdminAuditItem['targetType'], string> = {
  post: '게시글',
  comment: '댓글',
  user: '사용자',
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function AdminAuditList({
  items,
  loading = false,
  onLoadMore,
}: {
  items: AdminAuditItem[];
  loading?: boolean;
  onLoadMore?: () => void;
}) {
  if (!items.length && loading) {
    return (
      <div
        aria-live="polite"
        className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground"
      >
        운영 로그를 불러오는 중입니다.
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        조건에 맞는 운영 로그가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="grid min-w-0 gap-4 lg:grid-cols-2">
        {items.map((item) => {
          const action = ACTION_DETAILS[item.action];
          const ActionIcon = action.icon;

          return (
            <li
              key={item.id}
              className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <ActionIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-primary"
                  />
                  <p className="truncate font-medium text-card-foreground">
                    {action.label}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                  {TARGET_LABELS[item.targetType]}
                </span>
              </div>

              <div className="mt-3 min-w-0 space-y-2 text-sm">
                {item.targetTitle ? (
                  <p className="break-words font-medium text-card-foreground">
                    {item.targetTitle}
                  </p>
                ) : null}
                {item.targetBody ? (
                  <p className="line-clamp-3 break-words text-muted-foreground">
                    {item.targetBody}
                  </p>
                ) : null}
                <dl className="grid min-w-0 gap-2 border-t border-border pt-3 text-muted-foreground">
                  {item.actorLabel ? (
                    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
                      <dt>처리자</dt>
                      <dd className="break-words text-card-foreground">
                        {item.actorLabel}
                      </dd>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
                    <dt>처리 사유</dt>
                    <dd className="break-words text-card-foreground">
                      {item.reason}
                    </dd>
                  </div>
                  <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
                    <dt>처리 시각</dt>
                    <dd className="break-words text-card-foreground">
                      <time dateTime={item.createdAt}>
                        {formatDateTime(item.createdAt)}
                      </time>
                    </dd>
                  </div>
                </dl>
              </div>
            </li>
          );
        })}
      </ul>

      {onLoadMore ? (
        <div className="flex justify-center">
          <Button
            disabled={loading}
            onClick={onLoadMore}
            type="button"
            variant="outline"
          >
            {loading ? '불러오는 중…' : '더 보기'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
