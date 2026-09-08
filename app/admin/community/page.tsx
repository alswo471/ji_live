'use client';

import { useMemo, useRef, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'vinext/shims/navigation';

import { AdminAuditList } from '@/components/community/admin-audit-list';
import { AdminConsoleFilters } from '@/components/community/admin-console-filters';
import { AdminConsoleNav } from '@/components/community/admin-console-nav';
import { AdminContentList } from '@/components/community/admin-content-list';
import { AdminLogin } from '@/components/community/admin-login';
import { AdminSanctionList } from '@/components/community/admin-sanction-list';
import { AdminSummary } from '@/components/community/admin-summary';
import { ModerationQueue } from '@/components/community/moderation-queue';
import {
  TurnstileChallenge,
  type TurnstileChallengeHandle,
} from '@/components/community/turnstile-challenge';
import { SiteHeader } from '@/components/site/site-header';
import { SiteFooter } from '@/components/site/site-footer';
import { Button } from '@/components/ui/button';
import {
  type AdminConsoleFilters as FilterValues,
  useCommunityAdmin,
} from '@/hooks/use-community-admin';
import type {
  AdminAuditItem,
  AdminContentItem,
  AdminSanctionItem,
  AdminTab,
} from '@/lib/community/admin-console-service';
import { getBrowserSupabase } from '@/lib/community/supabase';
import type { ModerationQueueItem } from '@/lib/community/moderation-service';

const TABS: AdminTab[] = ['reports', 'hidden', 'trash', 'sanctions', 'audit'];
const CONTENT_TARGET_TYPES: FilterValues['targetType'][] = [
  'all',
  'post',
  'comment',
];
const AUDIT_TARGET_TYPES: FilterValues['targetType'][] = [
  ...CONTENT_TARGET_TYPES,
  'user',
];
const DELETION_SOURCES: FilterValues['deletionSource'][] = [
  'all',
  'author',
  'admin',
];
const SANCTION_STATES: FilterValues['sanctionState'][] = ['active', 'ended'];
const AUDIT_ACTIONS: FilterValues['action'][] = [
  'all',
  'hide',
  'restore',
  'delete',
  'dismiss',
  'restrict',
  'unrestrict',
];

function allowedValue<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return value !== null && allowed.includes(value as T)
    ? (value as T)
    : fallback;
}

function selectedTab(value: string | null): AdminTab {
  return allowedValue(value, TABS, 'reports');
}

function selectedDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : '';
}

function filtersFrom(params: URLSearchParams, tab: AdminTab): FilterValues {
  return {
    targetType: allowedValue(
      params.get('targetType'),
      tab === 'audit' ? AUDIT_TARGET_TYPES : CONTENT_TARGET_TYPES,
      'all',
    ),
    deletionSource: allowedValue(
      params.get('deletionSource'),
      DELETION_SOURCES,
      'all',
    ),
    sanctionState: allowedValue(
      params.get('sanctionState'),
      SANCTION_STATES,
      'active',
    ),
    action: allowedValue(params.get('action'), AUDIT_ACTIONS, 'all'),
    from: selectedDate(params.get('from')),
    to: selectedDate(params.get('to')),
    query: Array.from(params.get('query') ?? '')
      .slice(0, 100)
      .join(''),
  };
}

function filterUrl(tab: AdminTab, filters: FilterValues) {
  const params = new URLSearchParams({ tab });
  if (
    (tab === 'hidden' || tab === 'trash' || tab === 'audit') &&
    filters.targetType !== 'all'
  ) {
    params.set('targetType', filters.targetType);
  }
  if (
    (tab === 'trash' || tab === 'audit') &&
    filters.deletionSource !== 'all'
  ) {
    params.set('deletionSource', filters.deletionSource);
  }
  if (tab === 'sanctions' && filters.sanctionState !== 'active') {
    params.set('sanctionState', filters.sanctionState);
  }
  if (tab === 'audit' && filters.action !== 'all') {
    params.set('action', filters.action);
  }
  if (tab === 'audit' && filters.from) params.set('from', filters.from);
  if (tab === 'audit' && filters.to) params.set('to', filters.to);
  const query = Array.from(filters.query).slice(0, 100).join('').trim();
  if (query && (tab === 'hidden' || tab === 'trash' || tab === 'audit')) {
    params.set('query', query);
  }
  return `/admin/community?${params.toString()}`;
}

function AdminConsole() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? '';
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const tab = selectedTab(params.get('tab'));
  const filters = useMemo(() => filtersFrom(params, tab), [params, tab]);
  const admin = useCommunityAdmin(tab, filters);
  const challengeRef = useRef<TurnstileChallengeHandle>(null);
  const [sessionActionError, setSessionActionError] = useState<string | null>(
    null,
  );
  const visibleError = admin.error ?? sessionActionError;

  function updateFilters(nextFilters: FilterValues) {
    router.replace(filterUrl(tab, nextFilters));
  }

  function panel() {
    const onLoadMore = admin.nextCursor
      ? () => void admin.loadMore()
      : undefined;

    if (tab === 'reports') {
      return (
        <ModerationQueue
          items={admin.items as ModerationQueueItem[]}
          loading={admin.loading}
          onAction={admin.applyAction}
          onLoadMore={onLoadMore}
        />
      );
    }
    if (tab === 'hidden' || tab === 'trash') {
      return (
        <AdminContentList
          items={admin.items as AdminContentItem[]}
          loading={admin.loading}
          onAction={admin.applyAction}
          onLoadMore={onLoadMore}
        />
      );
    }
    if (tab === 'sanctions') {
      return (
        <AdminSanctionList
          items={admin.items as AdminSanctionItem[]}
          loading={admin.loading}
          onAction={admin.applyAction}
          onLoadMore={onLoadMore}
        />
      );
    }
    return (
      <AdminAuditList
        items={admin.items as AdminAuditItem[]}
        loading={admin.loading}
        onLoadMore={onLoadMore}
      />
    );
  }

  if (admin.checkingSession) {
    return (
      <div className="rounded-2xl border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
        관리자 session을 확인하고 있습니다…
      </div>
    );
  }

  if (!admin.accessToken) {
    return (
      <>
        {visibleError ? (
          <p
            role="alert"
            className="mx-auto mb-4 max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {visibleError}
          </p>
        ) : null}
        <AdminLogin
          onRequestCaptcha={async () => {
            if (!challengeRef.current) {
              throw new Error('captcha challenge unavailable');
            }
            return challengeRef.current.execute();
          }}
          onRequestSignInLink={async (email, captchaToken) => {
            const { error } = await getBrowserSupabase().auth.signInWithOtp({
              email,
              options: {
                shouldCreateUser: false,
                captchaToken,
                emailRedirectTo: `${window.location.origin}/admin/community`,
              },
            });
            if (error) throw new Error('sign-in link request failed');
          }}
        />
        <div className="mx-auto mt-4 max-w-md">
          <TurnstileChallenge ref={challengeRef} />
        </div>
      </>
    );
  }

  return (
    <>
      <section className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold tracking-[.16em] text-primary">
            <ShieldCheck aria-hidden="true" className="size-4" /> OPERATIONS
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            Community 운영 콘솔
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            개인 식별 정보 없이 신고, 콘텐츠, 제재와 운영 이력을 검토합니다.
            모든 조치는 운영 로그에 기록됩니다.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => {
            setSessionActionError(null);
            void getBrowserSupabase()
              .auth.signOut()
              .then(({ error }) => {
                if (error) throw error;
              })
              .catch(() => {
                setSessionActionError(
                  '로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.',
                );
              });
          }}
        >
          관리자 로그아웃
        </Button>
      </section>

      <div className="space-y-4">
        <AdminSummary summary={admin.summary} />
        <AdminConsoleNav tab={tab} />
        <AdminConsoleFilters
          tab={tab}
          filters={filters}
          onChange={(nextFilters) => updateFilters(nextFilters)}
        />

        {visibleError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            <p>{visibleError}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={admin.loading}
              onClick={() => void admin.reload()}
            >
              <RefreshCw aria-hidden="true" /> 다시 불러오기
            </Button>
          </div>
        ) : null}

        <section
          id={`admin-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`admin-tab-${tab}`}
          className="min-w-0"
        >
          {panel()}
        </section>
      </div>
    </>
  );
}

export default function CommunityAdminPage() {
  const enabled = process.env.NEXT_PUBLIC_COMMUNITY_ENABLED === 'true';

  return (
    <main className="min-h-screen overflow-x-clip bg-background text-foreground">
      <div className="mx-auto min-h-screen w-full max-w-[1440px] border-x bg-background">
        <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-xl">
          <SiteHeader current="community" />
        </header>
        <div className="mx-auto min-w-0 max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
          {enabled ? (
            <AdminConsole />
          ) : (
            <div className="rounded-2xl border bg-card px-6 py-16 text-center">
              Community 관리 기능이 비활성화되어 있습니다.
            </div>
          )}
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}
