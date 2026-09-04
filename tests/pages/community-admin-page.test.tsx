import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CommunityAdminPage from '@/app/admin/community/page';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOtp: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@/lib/community/supabase', () => ({
  getBrowserSupabase: () => ({ auth }),
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
      targetAuthorId: '40000000-0000-0000-0000-000000000001',
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

describe('CommunityAdminPage', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_COMMUNITY_ENABLED', 'true');
    auth.getSession.mockResolvedValue({ data: { session } });
    auth.onAuthStateChange.mockImplementation((callback) => {
      queueMicrotask(() => {
        callback('INITIAL_SESSION', session);
        callback('SIGNED_IN', {
          ...session,
          access_token: 'refreshed-admin-token',
        });
      });
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('does not let an older failed load overwrite a newer successful queue', async () => {
    let requestCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        requestCount += 1;
        if (requestCount === 1) {
          return new Promise<Response>((resolve) => {
            setTimeout(
              () =>
                resolve(
                  new Response(null, {
                    status: 503,
                  }),
                ),
              40,
            );
          });
        }
        return Promise.resolve(Response.json(page));
      }),
    );

    render(<CommunityAdminPage />);

    expect(
      await screen.findByText('[테스트] Community E2E 검증'),
    ).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
