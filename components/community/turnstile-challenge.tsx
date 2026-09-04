'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface TurnstileChallengeHandle {
  execute: () => Promise<string>;
}

type ChallengeStatus = 'loading' | 'ready' | 'error';
type Waiter = {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const EXECUTE_TIMEOUT_MS = 15_000;
const UNAVAILABLE_MESSAGE =
  '사용자 확인을 완료하지 못했습니다. 다시 시도해 주세요.';

let scriptPromise: Promise<void> | null = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  const script = document.createElement('script');
  script.src =
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true;
  script.defer = true;
  scriptPromise = new Promise<void>((resolve, reject) => {
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error('Turnstile load failed'));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
}

export const TurnstileChallenge = forwardRef<TurnstileChallengeHandle>(
  function TurnstileChallenge(_, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetRef = useRef<string | null>(null);
    const tokenRef = useRef<string | null>(null);
    const waitersRef = useRef(new Map<number, Waiter>());
    const waiterIdRef = useRef(0);
    const activeRef = useRef(false);
    const [attempt, setAttempt] = useState(0);
    const [status, setStatus] = useState<ChallengeStatus>('loading');
    const [message, setMessage] = useState<string | null>(null);

    function rejectWaiters(error: Error) {
      for (const waiter of waitersRef.current.values()) {
        clearTimeout(waiter.timeout);
        waiter.reject(error);
      }
      waitersRef.current.clear();
    }

    function fail(
      nextMessage = UNAVAILABLE_MESSAGE,
      errorMessage = 'Turnstile unavailable',
    ) {
      tokenRef.current = null;
      rejectWaiters(new Error(errorMessage));
      if (!activeRef.current) return;
      setMessage(nextMessage);
      setStatus('error');
    }

    function resetWidget() {
      if (widgetRef.current) window.turnstile?.reset(widgetRef.current);
    }

    useEffect(() => {
      let active = true;
      activeRef.current = true;
      tokenRef.current = null;

      void loadTurnstile()
        .then(() => {
          if (!active || !containerRef.current) return;
          const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
          if (!sitekey || !window.turnstile) {
            fail();
            return;
          }
          widgetRef.current = window.turnstile.render(containerRef.current, {
            sitekey,
            callback: (token: string) => {
              if (!active || !token) {
                fail();
                return;
              }
              const first = waitersRef.current.entries().next().value as
                | [number, Waiter]
                | undefined;
              if (!first) {
                tokenRef.current = token;
                return;
              }
              const [id, waiter] = first;
              waitersRef.current.delete(id);
              clearTimeout(waiter.timeout);
              waiter.resolve(token);
              resetWidget();
            },
            'expired-callback': () => fail(),
            'error-callback': () => fail(),
            'timeout-callback': () =>
              fail(
                '사용자 확인 시간이 초과되었습니다. 다시 시도해 주세요.',
                'Turnstile timeout',
              ),
            theme: 'auto',
          });
          setStatus('ready');
        })
        .catch(() => {
          if (!active) return;
          fail('사용자 확인을 불러오지 못했습니다. 다시 시도해 주세요.');
        });

      return () => {
        active = false;
        activeRef.current = false;
        tokenRef.current = null;
        rejectWaiters(new Error('Turnstile unavailable'));
        if (widgetRef.current && window.turnstile) {
          window.turnstile.remove(widgetRef.current);
        }
        widgetRef.current = null;
      };
    }, [attempt]);

    useImperativeHandle(
      ref,
      () => ({
        execute: () => {
          if (status === 'error') {
            return Promise.reject(new Error('Turnstile unavailable'));
          }
          if (tokenRef.current) {
            const token = tokenRef.current;
            tokenRef.current = null;
            resetWidget();
            return Promise.resolve(token);
          }
          return new Promise<string>((resolve, reject) => {
            const id = ++waiterIdRef.current;
            const timeout = setTimeout(() => {
              if (!waitersRef.current.has(id)) return;
              fail(
                '사용자 확인 시간이 초과되었습니다. 다시 시도해 주세요.',
                'Turnstile timeout',
              );
            }, EXECUTE_TIMEOUT_MS);
            waitersRef.current.set(id, { resolve, reject, timeout });
          });
        },
      }),
      [status],
    );

    return (
      <div className="min-h-[66px]" aria-label="사용자 확인">
        <div ref={containerRef} />
        {status === 'loading' ? (
          <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">
            사용자 확인을 준비하고 있습니다…
          </p>
        ) : null}
        {status === 'ready' ? (
          <p className="sr-only">사용자 확인 준비됨</p>
        ) : null}
        {status === 'error' ? (
          <div className="mt-2 space-y-2">
            <p role="alert" className="text-sm text-destructive">
              {message ?? UNAVAILABLE_MESSAGE}
            </p>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setStatus('loading');
                setMessage(null);
                setAttempt((current) => current + 1);
              }}
            >
              <RotateCcw aria-hidden="true" /> 사용자 확인 다시 시도
            </Button>
          </div>
        ) : null}
        <noscript>글을 작성하려면 JavaScript를 활성화해 주세요.</noscript>
      </div>
    );
  },
);
