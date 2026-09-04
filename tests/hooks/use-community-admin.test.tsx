import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCommunityAdmin,
  type AdminConsoleFilters,
} from '@/hooks/use-community-admin';
import type { AdminTab } from '@/lib/community/admin-console-service';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock('@/lib/community/supabase', () => ({
  getBrowserSupabase: () => ({ auth }),
}));

const session = {
  access_token: 'admin-token',
  user: { is_anonymous: false },
};

const filters: AdminConsoleFilters = {
  targetType: 'all',
  deletionSource: 'all',
  sanctionState: 'active',
  action: 'all',
  from: '',
  to: '',
  query: '',
};

const reportItem = {
  id: '10000000-0000-4000-8000-000000000001',
  targetType: 'post' as const,
  targetId: '20000000-0000-4000-8000-000000000001',
  actorLabel: '익명 사용자 #A82F',
  targetTitle: '신고된 글',
  targetBody: '검토가 필요한 내용',
  targetStatus: 'visible' as const,
  reason: 'spam' as const,
  detail: '반복 광고',
  createdAt: '2026-09-04T05:00:00.000Z',
};

const trashItem = {
  targetType: 'post' as const,
  targetId: '30000000-0000-4000-8000-000000000001',
  actorLabel: '익명 사용자 #B19C',
  authorName: '푸른고래',
  title: '삭제된 글',
  body: '복구 검토 내용',
  status: 'deleted' as const,
  deletionSource: 'author' as const,
  deletedAt: '2026-09-04T05:00:00.000Z',
  purgeAt: '2027-09-04T05:00:00.000Z',
  createdAt: '2026-09-03T05:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function urlOf(input: RequestInfo | URL) {
  return typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

describe('useCommunityAdmin', () => {
  beforeEach(() => {
    auth.getSession.mockReset();
    auth.onAuthStateChange.mockReset();
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads one summary and one initial list for duplicate session events with the same token', async () => {
    auth.onAuthStateChange.mockImplementation((callback) => {
      queueMicrotask(() => callback('INITIAL_SESSION', session));
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = urlOf(input);
      return Promise.resolve(
        url.includes('/summary')
          ? Response.json({ reports: 1, hidden: 2, trash: 3, sanctions: 4 })
          : Response.json({ items: [reportItem], nextCursor: null }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCommunityAdmin('reports', filters));

    await waitFor(() => expect(result.current.items).toEqual([reportItem]));
    expect(result.current.summary).toEqual({
      reports: 1,
      hidden: 2,
      trash: 3,
      sanctions: 4,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not let an older failed session load overwrite the latest successful list', async () => {
    const older = deferred<Response>();
    let sessionCallback:
      | ((event: string, value: typeof session) => void)
      | undefined;
    auth.getSession.mockResolvedValue({
      data: { session: { ...session, access_token: 'older-token' } },
      error: null,
    });
    auth.onAuthStateChange.mockImplementation((callback) => {
      sessionCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = urlOf(input);
        if (url.includes('/summary')) {
          return Promise.resolve(
            Response.json({ reports: 1, hidden: 0, trash: 0, sanctions: 0 }),
          );
        }
        const authorization = (init?.headers as Record<string, string>)
          ?.authorization;
        return authorization === 'Bearer older-token'
          ? older.promise
          : Promise.resolve(
              Response.json({ items: [reportItem], nextCursor: null }),
            );
      }),
    );

    const { result } = renderHook(() => useCommunityAdmin('reports', filters));
    await waitFor(() => expect(sessionCallback).toBeDefined());
    await act(async () => {
      sessionCallback?.('SIGNED_IN', {
        ...session,
        access_token: 'latest-token',
      });
    });
    await waitFor(() => expect(result.current.items).toEqual([reportItem]));

    older.resolve(new Response(null, { status: 503 }));
    await act(async () => {
      await older.promise;
    });

    expect(result.current.error).toBeNull();
    expect(result.current.items).toEqual([reportItem]);
  });

  it('ignores a previous tab response after moving to trash', async () => {
    const reports = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = urlOf(input);
        if (url.includes('/summary')) {
          return Promise.resolve(
            Response.json({ reports: 1, hidden: 0, trash: 1, sanctions: 0 }),
          );
        }
        if (url.includes('/reports')) return reports.promise;
        return Promise.resolve(
          Response.json({ items: [trashItem], nextCursor: null }),
        );
      }),
    );

    const { result, rerender } = renderHook(
      ({ tab }: { tab: AdminTab }) => useCommunityAdmin(tab, filters),
      { initialProps: { tab: 'reports' as AdminTab } },
    );
    rerender({ tab: 'trash' });

    await waitFor(() => expect(result.current.items).toEqual([trashItem]));
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('status=deleted'),
      expect.objectContaining({ cache: 'no-store' }),
    );

    reports.resolve(Response.json({ items: [reportItem], nextCursor: null }));
    await act(async () => {
      await reports.promise;
    });
    expect(result.current.items).toEqual([trashItem]);
  });

  it('refreshes the active list and summary after a successful action', async () => {
    let contentLoads = 0;
    let summaryLoads = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(input);
      if (url.includes('/actions')) {
        expect(init?.method).toBe('POST');
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url.includes('/summary')) {
        summaryLoads += 1;
        return Promise.resolve(
          Response.json({
            reports: 0,
            hidden: contentLoads > 0 ? 0 : 1,
            trash: 0,
            sanctions: 0,
          }),
        );
      }
      contentLoads += 1;
      return Promise.resolve(
        Response.json({
          items: contentLoads === 1 ? [{ ...trashItem, status: 'hidden' }] : [],
          nextCursor: null,
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCommunityAdmin('hidden', filters));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await result.current.applyAction({
        type: 'restore',
        targetType: 'post',
        targetId: trashItem.targetId,
        reason: '숨김 오조치 복구',
      });
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.summary?.hidden).toBe(0);
    expect(contentLoads).toBe(2);
    expect(summaryLoads).toBe(2);
  });

  it('refreshes the latest tab and filters when they change during an action', async () => {
    const pendingAction = deferred<Response>();
    const listUrls: string[] = [];
    let hiddenLoads = 0;
    let trashLoads = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes('/actions')) return pendingAction.promise;
      if (url.includes('/summary')) {
        return Promise.resolve(
          Response.json({ reports: 0, hidden: 1, trash: 1, sanctions: 0 }),
        );
      }
      listUrls.push(url);
      if (url.includes('status=hidden')) {
        hiddenLoads += 1;
        return Promise.resolve(
          Response.json({
            items: [
              {
                ...trashItem,
                status: 'hidden',
                deletionSource: null,
                deletedAt: null,
                purgeAt: null,
              },
            ],
            nextCursor: null,
          }),
        );
      }
      trashLoads += 1;
      return Promise.resolve(
        Response.json({ items: [trashItem], nextCursor: null }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ tab, values }: { tab: AdminTab; values: AdminConsoleFilters }) =>
        useCommunityAdmin(tab, values),
      {
        initialProps: {
          tab: 'hidden' as AdminTab,
          values: filters,
        },
      },
    );
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    let actionPromise!: Promise<void>;
    act(() => {
      actionPromise = result.current.applyAction({
        type: 'restore',
        targetType: 'post',
        targetId: trashItem.targetId,
        reason: '숨김 오조치 복구',
      });
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/community/actions',
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    rerender({
      tab: 'trash',
      values: {
        ...filters,
        deletionSource: 'author',
        query: '복구 검토',
      },
    });
    await waitFor(() =>
      expect(result.current.items[0]).toMatchObject({ status: 'deleted' }),
    );

    pendingAction.resolve(new Response(null, { status: 204 }));
    await act(async () => {
      await actionPromise;
    });

    await waitFor(() => expect(trashLoads).toBe(2));
    expect(hiddenLoads).toBe(1);
    expect(listUrls.at(-1)).toContain(
      'status=deleted&deletionSource=author&query=%EB%B3%B5%EA%B5%AC+%EA%B2%80%ED%86%A0',
    );
    expect(result.current.items[0]).toMatchObject({ status: 'deleted' });
    expect(result.current.loading).toBe(false);
  });

  it('reloads the summary and current list together after a summary failure', async () => {
    let summaryLoads = 0;
    let listLoads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = urlOf(input);
        if (url.includes('/summary')) {
          summaryLoads += 1;
          return summaryLoads === 1
            ? Promise.resolve(new Response(null, { status: 503 }))
            : Promise.resolve(
                Response.json({
                  reports: 2,
                  hidden: 1,
                  trash: 0,
                  sanctions: 0,
                }),
              );
        }
        listLoads += 1;
        return Promise.resolve(
          Response.json({ items: [reportItem], nextCursor: null }),
        );
      }),
    );

    const { result } = renderHook(() => useCommunityAdmin('reports', filters));
    await waitFor(() => expect(result.current.error).toContain('운영 요약'));
    expect(result.current.items).toEqual([reportItem]);

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.summary).toEqual({
      reports: 2,
      hidden: 1,
      trash: 0,
      sanctions: 0,
    });
    expect(summaryLoads).toBe(2);
    expect(listLoads).toBe(2);
    expect(result.current.error).toBeNull();
  });

  it('keeps the previous list and surfaces a safe conflict when an action fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = urlOf(input);
        if (url.includes('/actions')) {
          return Promise.resolve(
            Response.json(
              { error: 'private provider detail', code: 'state_conflict' },
              { status: 409 },
            ),
          );
        }
        if (url.includes('/summary')) {
          return Promise.resolve(
            Response.json({ reports: 0, hidden: 1, trash: 0, sanctions: 0 }),
          );
        }
        return Promise.resolve(
          Response.json({
            items: [{ ...trashItem, status: 'hidden' }],
            nextCursor: null,
          }),
        );
      }),
    );

    const { result } = renderHook(() => useCommunityAdmin('hidden', filters));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await expect(
        result.current.applyAction({
          type: 'restore',
          targetType: 'post',
          targetId: trashItem.targetId,
          reason: '숨김 오조치 복구',
        }),
      ).rejects.toThrow('이미 처리된 항목');
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.error).toContain('이미 처리된 항목');
    expect(result.current.error).not.toContain('private provider detail');
  });

  it('keeps the current tab list when a changed filter fails to load', async () => {
    let listLoads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = urlOf(input);
        if (url.includes('/summary')) {
          return Promise.resolve(
            Response.json({ reports: 0, hidden: 1, trash: 0, sanctions: 0 }),
          );
        }
        listLoads += 1;
        return listLoads === 1
          ? Promise.resolve(
              Response.json({
                items: [{ ...trashItem, status: 'hidden' }],
                nextCursor: null,
              }),
            )
          : Promise.resolve(new Response(null, { status: 503 }));
      }),
    );

    const { result, rerender } = renderHook(
      ({ values }: { values: AdminConsoleFilters }) =>
        useCommunityAdmin('hidden', values),
      { initialProps: { values: filters } },
    );
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    rerender({ values: { ...filters, query: '새 검색어' } });

    await waitFor(() => expect(result.current.error).toContain('기존 목록'));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({ body: '복구 검토 내용' });
  });

  it('sends the selected audit date range in the list request', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = urlOf(input);
      return Promise.resolve(
        url.includes('/summary')
          ? Response.json({ reports: 0, hidden: 0, trash: 0, sanctions: 0 })
          : Response.json({ items: [], nextCursor: null }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() =>
      useCommunityAdmin('audit', {
        ...filters,
        from: '2026-09-01',
        to: '2026-09-04',
      }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('from=2026-09-01&to=2026-09-04'),
        expect.objectContaining({ cache: 'no-store' }),
      ),
    );
  });

  it('appends a cursor page without removing the current items', async () => {
    const secondReport = {
      ...reportItem,
      id: '10000000-0000-4000-8000-000000000002',
      targetId: '20000000-0000-4000-8000-000000000002',
      targetTitle: '두 번째 신고',
    };
    let listLoads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = urlOf(input);
        if (url.includes('/summary')) {
          return Promise.resolve(
            Response.json({ reports: 2, hidden: 0, trash: 0, sanctions: 0 }),
          );
        }
        listLoads += 1;
        return Promise.resolve(
          Response.json(
            listLoads === 1
              ? { items: [reportItem], nextCursor: 'next-page' }
              : { items: [secondReport], nextCursor: null },
          ),
        );
      }),
    );

    const { result } = renderHook(() => useCommunityAdmin('reports', filters));
    await waitFor(() => expect(result.current.nextCursor).toBe('next-page'));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.items).toEqual([reportItem, secondReport]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('cursor=next-page'),
      expect.anything(),
    );
  });
});
