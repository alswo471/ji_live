import { afterEach, describe, expect, it, vi } from 'vitest';
import { communityWrite } from '@/lib/community/browser-api';
import type { CommunitySessionState } from '@/hooks/use-community-session';
import type { TurnstileChallengeHandle } from '@/components/community/turnstile-challenge';

function session(
  overrides: Partial<CommunitySessionState> = {},
): CommunitySessionState {
  return {
    status: 'ready',
    accessToken: 'stale-token',
    error: null,
    getAccessToken: vi.fn().mockResolvedValue('refreshed-token'),
    ensureSession: vi.fn().mockResolvedValue('new-token'),
    invalidateSession: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function challenge(): TurnstileChallengeHandle {
  return { execute: vi.fn().mockResolvedValue('challenge-token') };
}

describe('communityWrite', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the current refreshed token and one write challenge', async () => {
    const auth = session();
    const human = challenge();
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: 'post' }));
    vi.stubGlobal('fetch', fetchMock);

    await communityWrite(
      '/api/community/posts',
      'POST',
      { body: '내용' },
      auth,
      human,
    );

    expect(auth.getAccessToken).toHaveBeenCalledTimes(1);
    expect(auth.ensureSession).not.toHaveBeenCalled();
    expect(human.execute).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/community/posts',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer refreshed-token',
          'x-turnstile-token': 'challenge-token',
        }),
      }),
    );
  });

  it('guards deletion with Turnstile and clears a server-rejected session', async () => {
    const auth = session();
    const human = challenge();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );

    await expect(
      communityWrite(
        '/api/community/posts/post-id',
        'DELETE',
        null,
        auth,
        human,
      ),
    ).rejects.toThrow('익명 세션이 만료되었습니다. 다시 시도해 주세요.');

    expect(fetch).toHaveBeenCalledWith(
      '/api/community/posts/post-id',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer refreshed-token',
          'x-turnstile-token': 'challenge-token',
        }),
      }),
    );
    expect(auth.invalidateSession).toHaveBeenCalledTimes(1);
  });
});
