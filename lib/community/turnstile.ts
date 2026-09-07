import { getCommunityServerConfig } from './config';

const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type TurnstileVerificationOptions = {
  fetcher?: typeof fetch;
  secretKey?: string;
  timeoutMs?: number;
};

function isSuccessfulTurnstileResponse(
  value: unknown,
): value is { success: true } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    value.success === true
  );
}

export async function verifyTurnstile(
  token: string,
  remoteIp?: string,
  options: TurnstileVerificationOptions = {},
): Promise<boolean> {
  const responseToken = token.trim();
  if (!responseToken || responseToken.length > 2048) return false;

  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 3000;
  const secretKey =
    options.secretKey ?? getCommunityServerConfig().turnstileSecretKey;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = new FormData();
    body.set('secret', secretKey);
    body.set('response', responseToken);
    if (remoteIp?.trim()) body.set('remoteip', remoteIp.trim());

    const response = await fetcher(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body,
      signal: controller.signal,
    });
    if (!response.ok) return false;

    return isSuccessfulTurnstileResponse(await response.json());
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
