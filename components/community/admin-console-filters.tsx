'use client';

import { useId } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import type { AdminConsoleFilters as FilterValues } from '@/hooks/use-community-admin';
import type { AdminTab } from '@/lib/community/admin-console-service';

export function AdminConsoleFilters({
  tab,
  filters,
  onChange,
}: {
  tab: AdminTab;
  filters: FilterValues;
  onChange: (filters: FilterValues, options: { resetCursor: true }) => void;
}) {
  const fieldId = useId();
  if (tab === 'reports') return null;

  const showsTargetType =
    tab === 'hidden' || tab === 'trash' || tab === 'audit';
  const showsSearch = tab === 'hidden' || tab === 'trash' || tab === 'audit';
  const invalidAuditPeriod = Boolean(
    tab === 'audit' &&
      filters.from &&
      filters.to &&
      filters.from > filters.to,
  );
  const auditPeriodErrorId = `${fieldId}-audit-period-error`;
  const searchLabel =
    tab === 'hidden'
      ? '숨김 콘텐츠 검색'
      : tab === 'trash'
        ? '삭제 대기 검색'
        : '운영 로그 검색';

  function update(patch: Partial<FilterValues>) {
    onChange({ ...filters, ...patch }, { resetCursor: true });
  }

  return (
    <section
      aria-label="현재 목록 필터"
      className="rounded-2xl border bg-card/60 p-4"
    >
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <SlidersHorizontal aria-hidden="true" className="size-4" />
        목록 필터
      </h2>
      <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {showsTargetType && (
          <div className="min-w-0 space-y-1.5">
            <label
              htmlFor="admin-target-type"
              className="text-sm font-semibold"
            >
              대상 유형
            </label>
            <NativeSelect
              id="admin-target-type"
              className="w-full [&_select]:min-h-11"
              value={filters.targetType}
              onChange={(event) =>
                update({
                  targetType: event.target.value as FilterValues['targetType'],
                })
              }
            >
              <NativeSelectOption value="all">전체 대상</NativeSelectOption>
              <NativeSelectOption value="post">게시글</NativeSelectOption>
              <NativeSelectOption value="comment">댓글</NativeSelectOption>
              {tab === 'audit' ? (
                <NativeSelectOption value="user">사용자</NativeSelectOption>
              ) : null}
            </NativeSelect>
          </div>
        )}

        {(tab === 'trash' || tab === 'audit') && (
          <div className="min-w-0 space-y-1.5">
            <label
              htmlFor="admin-deletion-source"
              className="text-sm font-semibold"
            >
              삭제 주체
            </label>
            <NativeSelect
              id="admin-deletion-source"
              className="w-full [&_select]:min-h-11"
              value={filters.deletionSource}
              onChange={(event) =>
                update({
                  deletionSource: event.target
                    .value as FilterValues['deletionSource'],
                })
              }
            >
              <NativeSelectOption value="all">전체 삭제</NativeSelectOption>
              <NativeSelectOption value="author">
                사용자 삭제
              </NativeSelectOption>
              <NativeSelectOption value="admin">관리자 삭제</NativeSelectOption>
            </NativeSelect>
          </div>
        )}

        {tab === 'sanctions' && (
          <div className="min-w-0 space-y-1.5">
            <label
              htmlFor="admin-sanction-state"
              className="text-sm font-semibold"
            >
              제재 상태
            </label>
            <NativeSelect
              id="admin-sanction-state"
              className="w-full [&_select]:min-h-11"
              value={filters.sanctionState}
              onChange={(event) =>
                update({
                  sanctionState: event.target
                    .value as FilterValues['sanctionState'],
                })
              }
            >
              <NativeSelectOption value="active">활성 제재</NativeSelectOption>
              <NativeSelectOption value="ended">종료된 제재</NativeSelectOption>
            </NativeSelect>
          </div>
        )}

        {tab === 'audit' && (
          <div className="min-w-0 space-y-1.5">
            <label
              htmlFor="admin-audit-action"
              className="text-sm font-semibold"
            >
              조치 유형
            </label>
            <NativeSelect
              id="admin-audit-action"
              className="w-full [&_select]:min-h-11"
              value={filters.action}
              onChange={(event) =>
                update({ action: event.target.value as FilterValues['action'] })
              }
            >
              <NativeSelectOption value="all">전체 조치</NativeSelectOption>
              <NativeSelectOption value="hide">숨김</NativeSelectOption>
              <NativeSelectOption value="restore">복구</NativeSelectOption>
              <NativeSelectOption value="delete">삭제 대기</NativeSelectOption>
              <NativeSelectOption value="dismiss">신고 기각</NativeSelectOption>
              <NativeSelectOption value="restrict">
                작성 제한
              </NativeSelectOption>
              <NativeSelectOption value="unrestrict">
                제한 해제
              </NativeSelectOption>
            </NativeSelect>
          </div>
        )}

        {tab === 'audit' && (
          <fieldset className="min-w-0 sm:col-span-2">
            <legend className="text-sm font-semibold">조회 기간</legend>
            <div className="mt-1.5 grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <label htmlFor="admin-audit-from" className="text-sm font-semibold">
                  조회 시작일
                </label>
                <Input
                  id="admin-audit-from"
                  type="date"
                  value={filters.from ?? ''}
                  max={filters.to || undefined}
                  aria-invalid={invalidAuditPeriod}
                  aria-describedby={
                    invalidAuditPeriod ? auditPeriodErrorId : undefined
                  }
                  onChange={(event) => update({ from: event.target.value })}
                  className="min-h-11"
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <label htmlFor="admin-audit-to" className="text-sm font-semibold">
                  조회 종료일
                </label>
                <Input
                  id="admin-audit-to"
                  type="date"
                  value={filters.to ?? ''}
                  min={filters.from || undefined}
                  aria-invalid={invalidAuditPeriod}
                  aria-describedby={
                    invalidAuditPeriod ? auditPeriodErrorId : undefined
                  }
                  onChange={(event) => update({ to: event.target.value })}
                  className="min-h-11"
                />
              </div>
            </div>
            {invalidAuditPeriod && (
              <p
                id={auditPeriodErrorId}
                role="alert"
                className="mt-2 text-sm text-destructive"
              >
                시작일은 종료일보다 늦을 수 없습니다.
              </p>
            )}
          </fieldset>
        )}

        {showsSearch && (
          <div className="min-w-0 space-y-1.5 lg:col-span-2">
            <label htmlFor="admin-query" className="text-sm font-semibold">
              {searchLabel}
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="admin-query"
                type="search"
                maxLength={100}
                autoComplete="off"
                value={filters.query}
                onChange={(event) =>
                  update({
                    query: Array.from(event.target.value)
                      .slice(0, 100)
                      .join(''),
                  })
                }
                className="min-h-11 pl-10"
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
