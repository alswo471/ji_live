import type { CommunitySessionState } from '@/hooks/use-community-session';
import type { TurnstileChallengeHandle } from '@/components/community/turnstile-challenge';

export async function communityWrite(
  url: string,
  method: 'POST' | 'DELETE',
  body: unknown,
  session: CommunitySessionState,
  challenge: TurnstileChallengeHandle,
) {
  const accessToken =
    session.accessToken ??
    (await session.ensureSession(await challenge.execute()));
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
  };
  if (method === 'POST') {
    headers['content-type'] = 'application/json';
    headers['x-turnstile-token'] = await challenge.execute();
  }
  const response = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error('community write failed');
  return response.status === 204 ? null : (response.json() as Promise<unknown>);
}
