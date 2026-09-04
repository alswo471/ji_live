'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { getBrowserSupabase } from '@/lib/community/supabase';
import type {
  AdminAuditItem,
  AdminContentItem,
  AdminPage,
  AdminSanctionItem,
  AdminSummary,
  AdminTab,
} from '@/lib/community/admin-console-service';
import type {
  ModerationAction,
  ModerationQueueItem,
} from '@/lib/community/moderation-service';

export interface AdminConsoleFilters {
  targetType: 'all' | 'post' | 'comment';
  deletionSource: 'all' | 'author' | 'admin';
  sanctionState: 'active' | 'ended';
  action: 'all' | 'hide' | 'restore' | 'delete' | 'restrict' | 'unrestrict';
  from?: string;
  to?: string;
  query: string;
}

export type CommunityAdminItem =
  | ModerationQueueItem
  | AdminContentItem
  | AdminSanctionItem
  | AdminAuditItem;

interface RenderedListContext {
  key: string;
  token: string;
  tab: AdminTab;
}

interface ListRequestContext extends RenderedListContext {
  filters: AdminConsoleFilters;
}

const SESSION_ERROR =
  '관리자 세션을 확인하지 못했습니다. 다시 로그인해 주세요.';
const SUMMARY_ERROR =
  '운영 요약을 불러오지 못했습니다. 기존 목록은 유지됩니다.';
const LIST_ERROR = '관리 목록을 불러오지 못했습니다. 기존 목록은 유지됩니다.';

function safeQuery(value: string) {
  return Array.from(value).slice(0, 100).join('');
}

function listUrl(
  tab: AdminTab,
  filters: AdminConsoleFilters,
  cursor: string | null,
) {
  const params = new URLSearchParams();
  let pathname = '/api/admin/community/reports';

  if (tab === 'hidden' || tab === 'trash') {
    pathname = '/api/admin/community/content';
    params.set('status', tab === 'hidden' ? 'hidden' : 'deleted');
    if (filters.targetType !== 'all') {
      params.set('targetType', filters.targetType);
    }
    if (tab === 'trash' && filters.deletionSource !== 'all') {
      params.set('deletionSource', filters.deletionSource);
    }
    const query = safeQuery(filters.query).trim();
    if (query) params.set('query', query);
  } else if (tab === 'sanctions') {
    pathname = '/api/admin/community/sanctions';
    params.set('state', filters.sanctionState);
  } else if (tab === 'audit') {
    pathname = '/api/admin/community/audit';
    if (filters.action !== 'all') params.set('action', filters.action);
    if (filters.targetType !== 'all') {
      params.set('targetType', filters.targetType);
    }
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    const query = safeQuery(filters.query).trim();
    if (query) params.set('query', query);
  }

  if (cursor) params.set('cursor', cursor);
  const queryString = params.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

function filterKey(filters: AdminConsoleFilters) {
  return [
    filters.targetType,
    filters.deletionSource,
    filters.sanctionState,
    filters.action,
    filters.from ?? '',
    filters.to ?? '',
    safeQuery(filters.query),
  ].join('\u0000');
}

function actionFailure(status: number) {
  if (status === 401 || status === 403) {
    return '관리자 세션이 만료되었거나 접근 권한이 없습니다. 다시 로그인해 주세요.';
  }
  if (status === 404) {
    return '관리 대상을 찾을 수 없습니다. 목록을 새로고침해 주세요.';
  }
  if (status === 409) {
    return '이미 처리된 항목입니다. 현재 목록을 새로고침해 주세요.';
  }
  return '관리 조치를 반영하지 못했습니다. 기존 목록은 유지됩니다.';
}

function isPage(value: unknown): value is AdminPage<CommunityAdminItem> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    Array.isArray(row.items) &&
    (typeof row.nextCursor === 'string' || row.nextCursor === null)
  );
}

function isSummary(value: unknown): value is AdminSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return ['reports', 'hidden', 'trash', 'sanctions'].every(
    (key) => typeof row[key] === 'number' && Number.isFinite(row[key]),
  );
}

export function useCommunityAdmin(tab: AdminTab, filters: AdminConsoleFilters) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [items, setItems] = useState<CommunityAdminItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingListKey, setLoadingListKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attemptedListKey, setAttemptedListKey] = useState<string | null>(null);
  const [renderedListContext, setRenderedListContext] =
    useState<RenderedListContext | null>(null);
  const tokenRef = useRef<string | null>(null);
  const listRequestSequencesRef = useRef(new Map<string, number>());
  const summaryRequestRef = useRef(0);
  const autoListKeyRef = useRef<string | null>(null);
  const summaryTokenRef = useRef<string | null>(null);
  const selectedFilterKey = filterKey(filters);
  const selectedListKey = accessToken
    ? `${accessToken}\u0000${tab}\u0000${selectedFilterKey}`
    : null;
  const currentListContextRef = useRef<ListRequestContext | null>(null);

  useLayoutEffect(() => {
    currentListContextRef.current =
      accessToken && selectedListKey
        ? { key: selectedListKey, token: accessToken, tab, filters }
        : null;
  }, [accessToken, filters, selectedListKey, tab]);

  useEffect(() => {
    let active = true;
    let authEventSeen = false;
    const client = getBrowserSupabase();

    const acceptSession = (
      session: {
        access_token: string;
        user: { is_anonymous?: boolean };
      } | null,
    ) => {
      if (!active) return;
      const token = session?.user.is_anonymous
        ? null
        : (session?.access_token ?? null);
      setCheckingSession(false);
      if (tokenRef.current === token) return;
      tokenRef.current = token;
      setAccessToken(token);
      setError(null);
      if (!token) {
        listRequestSequencesRef.current.clear();
        summaryRequestRef.current += 1;
        autoListKeyRef.current = null;
        summaryTokenRef.current = null;
        setSummary(null);
        setItems([]);
        setNextCursor(null);
        setLoadingListKey(null);
        setAttemptedListKey(null);
        setRenderedListContext(null);
      }
    };

    const { data } = client.auth.onAuthStateChange((_event, authSession) => {
      authEventSeen = true;
      acceptSession(authSession);
    });
    void client.auth
      .getSession()
      .then(({ data: sessionData, error: sessionError }) => {
        if (sessionError) throw sessionError;
        if (!authEventSeen) acceptSession(sessionData.session);
      })
      .catch(() => {
        if (!active || authEventSeen) return;
        setCheckingSession(false);
        setError(SESSION_ERROR);
      });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const loadSummary = useCallback(async (token: string) => {
    const requestId = ++summaryRequestRef.current;
    try {
      const response = await fetch('/api/admin/community/summary', {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('summary load failed');
      const value: unknown = await response.json();
      if (!isSummary(value)) throw new Error('invalid summary');
      if (requestId !== summaryRequestRef.current || tokenRef.current !== token)
        return;
      setSummary(value);
    } catch {
      if (requestId !== summaryRequestRef.current || tokenRef.current !== token)
        return;
      setError(SUMMARY_ERROR);
    }
  }, []);

  const requestList = useCallback(
    async (context: ListRequestContext, cursor: string | null = null) => {
      const { key: requestKey, token, tab: requestTab } = context;
      const requestId =
        (listRequestSequencesRef.current.get(requestKey) ?? 0) + 1;
      listRequestSequencesRef.current.set(requestKey, requestId);
      const append = cursor !== null;
      if (currentListContextRef.current?.key === requestKey) {
        setLoadingListKey(requestKey);
        setError(null);
        setAttemptedListKey(requestKey);
      }
      try {
        const response = await fetch(
          listUrl(requestTab, context.filters, cursor),
          {
            headers: { authorization: `Bearer ${token}` },
            cache: 'no-store',
          },
        );
        if (!response.ok) throw new Error('list load failed');
        const value: unknown = await response.json();
        if (!isPage(value)) throw new Error('invalid list page');
        if (
          requestId !== listRequestSequencesRef.current.get(requestKey) ||
          currentListContextRef.current?.key !== requestKey ||
          tokenRef.current !== token
        ) {
          return;
        }
        setRenderedListContext({ key: requestKey, token, tab: requestTab });
        setItems((current) =>
          append ? [...current, ...value.items] : value.items,
        );
        setNextCursor(value.nextCursor);
      } catch {
        if (
          requestId !== listRequestSequencesRef.current.get(requestKey) ||
          currentListContextRef.current?.key !== requestKey ||
          tokenRef.current !== token
        ) {
          return;
        }
        setError(LIST_ERROR);
      } finally {
        if (requestId === listRequestSequencesRef.current.get(requestKey)) {
          setLoadingListKey((current) =>
            current === requestKey ? null : current,
          );
        }
      }
    },
    [],
  );

  const loadList = useCallback(
    async (cursor: string | null = null) => {
      const context = currentListContextRef.current;
      if (!context) return;
      await requestList(context, cursor);
    },
    [requestList],
  );

  useEffect(() => {
    if (!accessToken || !selectedListKey) return;
    if (autoListKeyRef.current === selectedListKey) return;
    autoListKeyRef.current = selectedListKey;
    void loadList();
  }, [accessToken, loadList, selectedListKey]);

  useEffect(() => {
    if (!accessToken || summaryTokenRef.current === accessToken) return;
    summaryTokenRef.current = accessToken;
    void loadSummary(accessToken);
  }, [accessToken, loadSummary]);

  const reload = useCallback(async () => {
    const context = currentListContextRef.current;
    if (!context) return;
    await Promise.all([requestList(context), loadSummary(context.token)]);
  }, [loadSummary, requestList]);

  const visibleNextCursor =
    renderedListContext?.key === selectedListKey ? nextCursor : null;
  const visibleLoading =
    loadingListKey === selectedListKey ||
    Boolean(
      accessToken && selectedListKey && attemptedListKey !== selectedListKey,
    );

  const loadMore = useCallback(async () => {
    if (!visibleNextCursor || visibleLoading) return;
    await loadList(visibleNextCursor);
  }, [loadList, visibleLoading, visibleNextCursor]);

  const applyAction = useCallback(
    async (action: ModerationAction) => {
      const token = accessToken;
      if (!token) {
        const message = actionFailure(401);
        setError(message);
        throw new Error(message);
      }
      try {
        const response = await fetch('/api/admin/community/actions', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
          body: JSON.stringify(action),
        });
        if (!response.ok) {
          throw new Error(actionFailure(response.status));
        }
      } catch (failure) {
        const message =
          failure instanceof Error &&
          failure.message !== 'Failed to fetch' &&
          failure.message !== 'fetch failed'
            ? failure.message
            : actionFailure(503);
        setError(message);
        throw new Error(message);
      }
      setError(null);
      const context = currentListContextRef.current;
      if (!context) return;
      await Promise.all([requestList(context), loadSummary(context.token)]);
    },
    [accessToken, loadSummary, requestList],
  );

  const visibleItems =
    renderedListContext?.token === accessToken &&
    renderedListContext.tab === tab
      ? items
      : [];

  return {
    accessToken,
    checkingSession,
    summary,
    items: visibleItems,
    nextCursor: visibleNextCursor,
    loading: visibleLoading,
    error,
    reload,
    loadMore,
    applyAction,
  };
}
