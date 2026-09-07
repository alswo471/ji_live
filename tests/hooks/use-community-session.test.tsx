import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const signInAnonymously = vi.fn();
const onAuthStateChange = vi.fn();
const signOut = vi.fn();

vi.mock('@/lib/community/supabase', () => ({
  getBrowserSupabase: () => ({
    auth: { getSession, signInAnonymously, onAuthStateChange, signOut },
  }),
}));

import { useCommunitySession } from '@/hooks/use-community-session';

describe('useCommunitySession', () => {
  beforeEach(() => {
    getSession.mockReset();
    signInAnonymously.mockReset();
    onAuthStateChange.mockReset();
    signOut.mockReset();
    onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    signOut.mockResolvedValue({ error: null });
  });

  it('reuses an existing anonymous session', async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: 'existing-token' } },
      error: null,
    });
    const { result } = renderHook(() => useCommunitySession());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.accessToken).toBe('existing-token');
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('creates one anonymous account with the supplied captcha token', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    signInAnonymously.mockResolvedValue({
      data: { session: { access_token: 'new-token' } },
      error: null,
    });
    const { result, rerender } = renderHook(() => useCommunitySession());
    await waitFor(() => expect(result.current.status).toBe('anonymous'));

    let token = '';
    await act(async () => {
      token = await result.current.ensureSession('captcha-token');
    });
    rerender();

    expect(token).toBe('new-token');
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    expect(signInAnonymously).toHaveBeenCalledWith({
      options: { captchaToken: 'captcha-token' },
    });
  });

  it('exposes a safe error when session creation fails', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    signInAnonymously.mockResolvedValue({
      data: { session: null },
      error: { message: 'provider detail' },
    });
    const { result } = renderHook(() => useCommunitySession());
    await waitFor(() => expect(result.current.status).toBe('anonymous'));

    let failure: unknown;
    await act(async () => {
      try {
        await result.current.ensureSession('captcha-token');
      } catch (error) {
        failure = error;
      }
    });
    expect(failure).toEqual(new Error('익명 세션을 준비하지 못했습니다.'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('익명 세션을 준비하지 못했습니다.');
    expect(result.current.error).not.toContain('provider detail');
  });

  it('follows token refresh events without creating another anonymous account', async () => {
    let authCallback:
      | ((event: string, session: { access_token: string } | null) => void)
      | undefined;
    getSession.mockResolvedValue({
      data: { session: { access_token: 'initial-token' } },
      error: null,
    });
    onAuthStateChange.mockImplementation((callback) => {
      authCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    const { result } = renderHook(() => useCommunitySession());
    await waitFor(() => expect(result.current.accessToken).toBe('initial-token'));

    act(() => {
      authCallback?.('TOKEN_REFRESHED', { access_token: 'refreshed-token' });
    });

    expect(result.current.accessToken).toBe('refreshed-token');
    expect(result.current.status).toBe('ready');
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('reads the current session before a write and recovers after expiry once', async () => {
    getSession
      .mockResolvedValueOnce({
        data: { session: { access_token: 'initial-token' } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { session: { access_token: 'latest-token' } },
        error: null,
      })
      .mockResolvedValueOnce({ data: { session: null }, error: null });
    signInAnonymously.mockResolvedValue({
      data: { session: { access_token: 'recovered-token' } },
      error: null,
    });
    const { result } = renderHook(() => useCommunitySession());
    await waitFor(() => expect(result.current.accessToken).toBe('initial-token'));

    await expect(result.current.getAccessToken()).resolves.toBe('latest-token');
    await act(async () => {
      await result.current.invalidateSession();
    });
    expect(result.current.accessToken).toBeNull();
    expect(result.current.error).toContain('세션이 만료');

    const [first, second] = await act(async () =>
      Promise.all([
        result.current.ensureSession('captcha-token'),
        result.current.ensureSession('captcha-token'),
      ]),
    );
    expect(first).toBe('recovered-token');
    expect(second).toBe('recovered-token');
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });
});
