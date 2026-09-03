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
  ensureSession: (captchaToken: string) => Promise<string>;
}

const SESSION_ERROR = '익명 세션을 준비하지 못했습니다.';

export function useCommunitySession(): CommunitySessionState {
  const [status, setStatus] = useState<CommunitySessionStatus>('loading');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const pendingRef = useRef<Promise<string> | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => getBrowserSupabase().auth.getSession())
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        const token = data.session?.access_token ?? null;
        if (sessionError) {
          setError(SESSION_ERROR);
          setStatus('error');
          return;
        }
        tokenRef.current = token;
        setAccessToken(token);
        setStatus(token ? 'ready' : 'anonymous');
      })
      .catch(() => {
        if (!active) return;
        setError(SESSION_ERROR);
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, []);

  const ensureSession = useCallback(async (captchaToken: string) => {
    if (tokenRef.current) return tokenRef.current;
    if (pendingRef.current) return pendingRef.current;

    setStatus('creating');
    setError(null);
    const pending = getBrowserSupabase()
      .auth.signInAnonymously({ options: { captchaToken } })
      .then(({ data, error: signInError }) => {
        const token = data.session?.access_token ?? null;
        if (signInError || !token) throw new Error(SESSION_ERROR);
        tokenRef.current = token;
        setAccessToken(token);
        setStatus('ready');
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
  }, []);

  return { status, accessToken, error, ensureSession };
}
