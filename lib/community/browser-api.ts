import type { CommunitySessionState } from '@/hooks/use-community-session';
import type { TurnstileChallengeHandle } from '@/components/community/turnstile-challenge';

export async function communityWrite(
  url: string,
  method: 'POST' | 'DELETE',
  body: unknown,
  session: CommunitySessionState,
  challenge: TurnstileChallengeHandle,
) {
  const currentToken = await session.getAccessToken();
  const accessToken =
    currentToken ?? (await session.ensureSession(await challenge.execute()));
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
    'x-turnstile-token': await challenge.execute(),
  };
  if (method === 'POST') {
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401) {
    await session.invalidateSession();
    throw new Error('익명 세션이 만료되었습니다. 다시 시도해 주세요.');
  }
  if (!response.ok) throw new Error('community write failed');
  return response.status === 204 ? null : (response.json() as Promise<unknown>);
}
