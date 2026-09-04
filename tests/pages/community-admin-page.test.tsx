import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminRedirectPage from '@/app/admin/page';
import CommunityAdminPage from '@/app/admin/community/page';
import { SiteHeader } from '@/components/site/site-header';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOtp: vi.fn(),
  signOut: vi.fn(),
}));

const navigation = vi.hoisted(() => ({
  redirect: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@/lib/community/supabase', () => ({
  getBrowserSupabase: () => ({ auth }),
}));

vi.mock('vinext/shims/navigation', () => ({
  redirect: navigation.redirect,
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.searchParams,
}));

const session = {
  access_token: 'admin-token',
  user: { id: '10000000-0000-0000-0000-000000000001', is_anonymous: false },
};

const page = {
  items: [
    {
      id: '20000000-0000-0000-0000-000000000001',
      targetType: 'post',
      targetId: '30000000-0000-0000-0000-000000000001',
      targetTitle: '[테스트] Community E2E 검증',
      targetBody: '신고된 테스트 게시글입니다.',
      targetStatus: 'visible',
      reason: 'other',
      detail: '신고 접수와 관리자 검토 흐름을 확인합니다.',
      createdAt: '2026-09-04T04:35:06.049Z',
    },
  ],
  nextCursor: null,
};

function urlOf(input: RequestInfo | URL) {
  return typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

describe('CommunityAdminPage', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_COMMUNITY_ENABLED', 'true');
    navigation.redirect.mockReset();
    navigation.replace.mockReset();
    navigation.searchParams = new URLSearchParams();
    auth.getSession.mockResolvedValue({ data: { session } });
    auth.onAuthStateChange.mockImplementation(() => {
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('redirects the short admin path to the community console', () => {
    AdminRedirectPage();

    expect(navigation.redirect).toHaveBeenCalledWith('/admin/community');
  });

  it('renders five deep-link tabs and defaults unknown tabs to reports', async () => {
    navigation.searchParams = new URLSearchParams('tab=unexpected');
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = urlOf(input);
        if (url.includes('/summary')) {
          return Promise.resolve(
            Response.json({ reports: 1, hidden: 2, trash: 3, sanctions: 4 }),
          );
        }
        return Promise.resolve(Response.json(page));
      }),
    );

    render(<CommunityAdminPage />);

    expect(
      await screen.findByRole('tab', { name: '신고 대기' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '삭제 대기' })).toHaveAttribute(
      'href',
      '/admin/community?tab=trash',
    );
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.getByRole('main')).toHaveClass(
      'overflow-x-clip',
      'bg-background',
      'text-foreground',
    );
    expect(
      await screen.findByRole('link', { name: /신고 대기 1건/ }),
    ).toHaveAttribute('href', '/admin/community?tab=reports');
    expect(
      screen.getByRole('link', { name: /숨김 콘텐츠 2건/ }),
    ).toHaveAttribute('href', '/admin/community?tab=hidden');
  });

  it('keeps the public site header free of an admin entry point', () => {
    render(<SiteHeader current="community" />);

    expect(
      screen.queryByRole('link', { name: /관리자|관리 콘솔/ }),
    ).not.toBeInTheDocument();
  });

  it('stores current filters in the URL when a filter changes', async () => {
    navigation.searchParams = new URLSearchParams(
      'tab=hidden&targetType=comment&query=%EC%B4%88%EA%B8%B0',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        if (urlOf(input).includes('/summary')) {
          return Promise.resolve(
            Response.json({ reports: 1, hidden: 2, trash: 3, sanctions: 4 }),
          );
        }
        return Promise.resolve(
          Response.json({
            items: [
              {
                targetType: 'comment',
                targetId: '30000000-0000-0000-0000-000000000002',
                actorLabel: '익명 사용자 #A82F',
                authorName: '테스터',
                title: null,
                body: '숨김 댓글',
                status: 'hidden',
                deletionSource: null,
                deletedAt: null,
                purgeAt: null,
                createdAt: '2026-09-04T04:35:06.049Z',
              },
            ],
            nextCursor: null,
          }),
        );
      }),
    );

    render(<CommunityAdminPage />);

    const search = await screen.findByRole('searchbox', {
      name: '숨김 콘텐츠 검색',
    });
    expect(screen.getByLabelText('대상 유형')).toHaveValue('comment');
    expect(search).toHaveValue('초기');

    fireEvent.change(search, { target: { value: '정책 위반' } });

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        '/admin/community?tab=hidden&targetType=comment&query=%EC%A0%95%EC%B1%85+%EC%9C%84%EB%B0%98',
      ),
    );
  });

  it('restores audit dates from the URL and writes date changes back', async () => {
    navigation.searchParams = new URLSearchParams(
      'tab=audit&from=2026-09-01&to=2026-09-04',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          urlOf(input).includes('/summary')
            ? Response.json({ reports: 0, hidden: 0, trash: 0, sanctions: 0 })
            : Response.json({ items: [], nextCursor: null }),
        ),
      ),
    );

    render(<CommunityAdminPage />);

    const from = await screen.findByLabelText('조회 시작일');
    const to = screen.getByLabelText('조회 종료일');
    expect(from).toHaveValue('2026-09-01');
    expect(to).toHaveValue('2026-09-04');

    fireEvent.change(to, { target: { value: '2026-09-07' } });

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        '/admin/community?tab=audit&from=2026-09-01&to=2026-09-07',
      ),
    );
  });
});
