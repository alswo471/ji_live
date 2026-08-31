const TOSS_API_URL = 'https://openapi.tossinvest.com';

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

let tokenCache: { accessToken: string; expiresAt: number } | null = null;
let tokenRequest: Promise<string> | null = null;

function credentials() {
  const clientId = process.env.TOSS_INVEST_CLIENT_ID;
  const clientSecret = process.env.TOSS_INVEST_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('토스증권 API 환경변수가 설정되지 않았습니다.');
  }

  return { clientId, clientSecret };
}

async function getAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  if (tokenRequest) return tokenRequest;

  tokenRequest = requestAccessToken();
  try {
    return await tokenRequest;
  } finally {
    tokenRequest = null;
  }
}

async function requestAccessToken() {
  const { clientId, clientSecret } = credentials();
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  const response = await fetch(`${TOSS_API_URL}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });

  if (!response.ok) {
    const digest = async (value: string) => {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
      return Array.from(new Uint8Array(bytes)).slice(0, 4).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    };
    console.error(`Toss credential check: idLength=${clientId.length}, secretLength=${clientSecret.length}, idHash=${await digest(clientId)}, secretHash=${await digest(clientSecret)}`);
    throw new Error(`토스증권 인증에 실패했습니다. (${response.status})`);
  }

  const token = (await response.json()) as TokenResponse;
  tokenCache = {
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
  return tokenCache.accessToken;
}

export async function fetchToss<T>(path: string, headers?: HeadersInit, canRetry = true): Promise<T> {
  const accessToken = await getAccessToken();
  const requestHeaders = new Headers(headers);
  requestHeaders.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${TOSS_API_URL}${path}`, {
    headers: requestHeaders,
    cache: 'no-store',
  });

  if (response.status === 401 && canRetry) {
    tokenCache = null;
    return fetchToss<T>(path, headers, false);
  }

  if (!response.ok) {
    throw new Error(`토스증권 API 요청에 실패했습니다. (${response.status})`);
  }

  return response.json() as Promise<T>;
}
