'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

type PermissionStatus = 'pending' | 'ready' | 'denied' | 'unavailable';
const ERROR =
  '관리자 권한과 연결 상태를 다시 확인해 주세요. 작성 내용은 유지됩니다.';

export function useCommunityPostKindPermission(accessToken: string | null) {
  const [result, setResult] = useState<{
    token: string;
    status: PermissionStatus;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentToken = useRef(accessToken);
  const allowedToken = useRef<string | null>(null);
  useLayoutEffect(() => {
    currentToken.current = accessToken;
    allowedToken.current = null;
  }, [accessToken]);
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    void fetch('/api/admin/community/posts', {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403)
          return 'denied' as const;
        if (!response.ok) return 'unavailable' as const;
        const body: unknown = await response.json();
        const value = body as { canManage?: unknown; ready?: unknown } | null;
        return value?.canManage === true && value.ready === true
          ? ('ready' as const)
          : ('unavailable' as const);
      })
      .catch(() => 'unavailable' as const)
      .then((status) => {
        if (!active || currentToken.current !== accessToken) return;
        allowedToken.current = status === 'ready' ? accessToken : null;
        setResult({ token: accessToken, status });
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  const write = useCallback(
    async (
      url: string,
      method: 'POST' | 'PATCH',
      body: unknown,
      getAccessToken: () => Promise<string | null>,
    ) => {
      const approved = allowedToken.current;
      const token = await getAccessToken();
      if (!token || token !== approved || token !== currentToken.current)
        throw new Error(ERROR);
      const response = await fetch(url, {
        method,
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (token !== currentToken.current) throw new Error(ERROR);
      if (response.status === 401 || response.status === 403) {
        allowedToken.current = null;
        setError(ERROR);
        setResult({ token, status: 'denied' });
      }
      if (!response.ok) throw new Error(ERROR);
      const saved: unknown = await response.json();
      if (token !== currentToken.current) throw new Error(ERROR);
      return saved;
    },
    [],
  );
  const status: PermissionStatus = !accessToken
    ? 'denied'
    : result?.token === accessToken
      ? result.status
      : 'pending';
  return { status, canManage: status === 'ready', error, write };
}
