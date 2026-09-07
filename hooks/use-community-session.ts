'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBrowserSupabase } from '@/lib/community/supabase';

type CommunitySessionStatus =
  | 'loading'
  | 'anonymous'
  | 'creating'
  | 'ready'
  | 'error';

export interface CommunitySessionState {
  status: CommunitySessionStatus;
  accessToken: string | null;
  error: string | null;
  getAccessToken: () => Promise<string | null>;
  ensureSession: (captchaToken: string) => Promise<string>;
  invalidateSession: () => Promise<void>;
}

const SESSION_ERROR = '익명 세션을 준비하지 못했습니다.';
const SESSION_EXPIRED_ERROR =
  '익명 세션이 만료되었습니다. 다시 시도하면 새 세션을 준비합니다.';

export function useCommunitySession(): CommunitySessionState {
  const [status, setStatus] = useState<CommunitySessionStatus>('loading');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const pendingRef = useRef<Promise<string> | null>(null);

  const acceptToken = useCallback((token: string | null) => {
    tokenRef.current = token;
    setAccessToken(token);
    setError(null);
    setStatus(token ? 'ready' : 'anonymous');
  }, []);

  useEffect(() => {
    let active = true;
    let authEventSeen = false;
    const client = getBrowserSupabase();
    const { data: subscriptionData } = client.auth.onAuthStateChange(
      (event, authSession) => {
        if (!active) return;
        authEventSeen = true;
        const token = authSession?.access_token ?? null;
        tokenRef.current = token;
        setAccessToken(token);
        if (token) {
          setError(null);
          setStatus('ready');
        } else {
          setError(event === 'SIGNED_OUT' ? SESSION_EXPIRED_ERROR : null);
          setStatus('anonymous');
        }
      },
    );
    void Promise.resolve()
      .then(() => client.auth.getSession())
      .then(({ data, error: sessionError }) => {
        if (!active || authEventSeen) return;
        const token = data.session?.access_token ?? null;
        if (sessionError) {
          setError(SESSION_ERROR);
          setStatus('error');
          return;
        }
        acceptToken(token);
      })
      .catch(() => {
        if (!active) return;
        setError(SESSION_ERROR);
        setStatus('error');
      });
    return () => {
      active = false;
      subscriptionData.subscription.unsubscribe();
    };
  }, [acceptToken]);

  const getAccessToken = useCallback(async () => {
    try {
      const { data, error: sessionError } =
        await getBrowserSupabase().auth.getSession();
      if (sessionError) throw sessionError;
      const token = data.session?.access_token ?? null;
      acceptToken(token);
      return token;
    } catch {
      tokenRef.current = null;
      setAccessToken(null);
      setError(SESSION_ERROR);
      setStatus('error');
      throw new Error(SESSION_ERROR);
    }
  }, [acceptToken]);

  const ensureSession = useCallback(async (captchaToken: string) => {
    if (pendingRef.current) return pendingRef.current;

    const pending = getAccessToken()
      .then(async (currentToken) => {
        if (currentToken) return currentToken;
        setStatus('creating');
        setError(null);
        const { data, error: signInError } = await getBrowserSupabase()
          .auth.signInAnonymously({ options: { captchaToken } });
        const token = data.session?.access_token ?? null;
        if (signInError || !token) throw new Error(SESSION_ERROR);
        acceptToken(token);
        return token;
      })
      .catch(() => {
        setError(SESSION_ERROR);
        setStatus('error');
        throw new Error(SESSION_ERROR);
      })
      .finally(() => {
        pendingRef.current = null;
      });
    pendingRef.current = pending;
    return pending;
  }, [acceptToken, getAccessToken]);

  const invalidateSession = useCallback(async () => {
    tokenRef.current = null;
    pendingRef.current = null;
    setAccessToken(null);
    setStatus('anonymous');
    setError(SESSION_EXPIRED_ERROR);
    try {
      await getBrowserSupabase().auth.signOut({ scope: 'local' });
    } catch {
      // Local state is already cleared; provider details must stay private.
    }
  }, []);

  return {
    status,
    accessToken,
    error,
    getAccessToken,
    ensureSession,
    invalidateSession,
  };
}
