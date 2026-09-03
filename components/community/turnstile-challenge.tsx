'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

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

let scriptPromise: Promise<void> | null = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Turnstile load failed'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export const TurnstileChallenge = forwardRef<TurnstileChallengeHandle>(
  function TurnstileChallenge(_, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetRef = useRef<string | null>(null);
    const tokenRef = useRef<string | null>(null);
    const waiterRef = useRef<((token: string) => void) | null>(null);

    useEffect(() => {
      let active = true;
      void loadTurnstile().then(() => {
        if (!active || !containerRef.current || !window.turnstile) return;
        const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
        if (!sitekey) return;
        widgetRef.current = window.turnstile.render(containerRef.current, {
          sitekey,
          callback: (token: string) => {
            tokenRef.current = token;
            waiterRef.current?.(token);
            waiterRef.current = null;
          },
          'expired-callback': () => {
            tokenRef.current = null;
          },
          'error-callback': () => {
            tokenRef.current = null;
          },
          theme: 'auto',
        });
      });
      return () => {
        active = false;
        if (widgetRef.current && window.turnstile)
          window.turnstile.remove(widgetRef.current);
      };
    }, []);

    useImperativeHandle(ref, () => ({
      execute: async () => {
        if (tokenRef.current) {
          const token = tokenRef.current;
          tokenRef.current = null;
          if (widgetRef.current) window.turnstile?.reset(widgetRef.current);
          return token;
        }
        return new Promise<string>((resolve) => {
          waiterRef.current = (token) => {
            tokenRef.current = null;
            if (widgetRef.current) window.turnstile?.reset(widgetRef.current);
            resolve(token);
          };
        });
      },
    }));

    return (
      <div className="min-h-[66px]" aria-label="사용자 확인">
        <div ref={containerRef} />
        <noscript>글을 작성하려면 JavaScript를 활성화해 주세요.</noscript>
      </div>
    );
  },
);
