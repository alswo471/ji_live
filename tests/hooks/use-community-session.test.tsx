import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const signInAnonymously = vi.fn();

vi.mock('@/lib/community/supabase', () => ({
  getBrowserSupabase: () => ({ auth: { getSession, signInAnonymously } }),
}));

import { useCommunitySession } from '@/hooks/use-community-session';

describe('useCommunitySession', () => {
  beforeEach(() => {
    getSession.mockReset();
    signInAnonymously.mockReset();
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
});
